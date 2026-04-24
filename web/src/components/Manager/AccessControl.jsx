import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Users, CheckCircle, Search, Save, AlertTriangle } from 'lucide-react';
import { readApiResponse } from '../../models/api';

/** Valor do select "Consulta por unidade" para listar todas as unidades (só gestor master) */
const FILTER_TODAS_UNIDADES = '__ALL_UNITS__';

export default function ManagerAccessControl() {
    const { session } = useAuth();
    const isMaster = Boolean(session?.isMaster || session?.perfil === 'GESTOR_MASTER');
    
    const [doctors, setDoctors] = useState([]);
    const [units, setUnits] = useState([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    
    // Lista de IDs das unidades atualmente "checadas" para o médico selecionado
    const [checkedUnits, setCheckedUnits] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [modal, setModal] = useState(null); // Para sucesso ou erro
    
    const [selectedUnitIdFilter, setSelectedUnitIdFilter] = useState(''); // Estado para o filtro de médicos por unidade
    
    // Estados para Novo Médico
    const [isAdding, setIsAdding] = useState(false);
    const [newDoc, setNewDoc] = useState({
        nome: '',
        crm: '',
        especialidade: '',
        unidadeFixaId: '',
        telefone: ''
    });
    const gestorId = session?.id || '';

    const buildUsername = (fullName = '') => {
        const normalized = String(fullName || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z\s]/g, ' ')
            .trim()
            .toLowerCase();
        const parts = normalized.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '';
        if (parts.length === 1) return parts[0];
        return `${parts[0]}.${parts[parts.length - 1]}`;
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [resDocs, resUnits] = await Promise.all([
                fetch(`/api/manager/medicos?gestorId=${encodeURIComponent(gestorId)}`),
                fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(gestorId)}`)
            ]);
            
            // Safe-parse: evita crash em respostas vazias ou HTML de erro (Unexpected end of JSON input)
            const parseBody = async (res) => {
                const text = await res.text();
                try {
                    return text ? JSON.parse(text) : null;
                } catch {
                    return null;
                }
            };

            const docsData = await parseBody(resDocs);
            const unitsData = await parseBody(resUnits);
            
            if (!resDocs.ok) {
                const msg = docsData?.details 
                    ? `${docsData.error} (${docsData.details})` 
                    : docsData?.error || `Erro HTTP ${resDocs.status}`;
                throw new Error(msg);
            }
            if (!resUnits.ok) {
                const msg = unitsData?.details 
                    ? `${unitsData.error} (${unitsData.details})` 
                    : unitsData?.error || `Erro HTTP ${resUnits.status}`;
                throw new Error(msg);
            }
            
            setDoctors(docsData || []);
            setUnits(unitsData || []);
            
            // Se já havia um médico selecionado, atualizamos as checkboxes dele
            if (selectedDoctorId && docsData) {
                const doc = docsData.find(d => d.id === selectedDoctorId);
                if (doc) setCheckedUnits(doc.unidadesLiberadas || []);
            }
        } catch (err) {
            setModal({ type: 'error', title: 'Erro', message: err.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!gestorId) return;
        fetchData();
    }, [gestorId]);

    useEffect(() => {
        if (!isMaster && selectedUnitIdFilter === FILTER_TODAS_UNIDADES) {
            setSelectedUnitIdFilter('');
        }
    }, [isMaster, selectedUnitIdFilter]);

    const handleDoctorChange = (e) => {
        const docId = e.target.value;
        setSelectedDoctorId(docId);
        
        if (docId) {
            const doc = doctors.find(d => d.id === docId);
            setCheckedUnits(doc?.unidadesLiberadas || []);
        } else {
            setCheckedUnits([]);
        }
    };

    const toggleUnit = (unitId) => {
        setCheckedUnits(prev => 
            prev.includes(unitId)
                ? prev.filter(id => id !== unitId)
                : [...prev, unitId]
        );
    };

    const handleCreateDoctor = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const response = await fetch('/api/manager/medicos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newDoc, usuario: buildUsername(newDoc.nome), gestorId })
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || 'Falha ao cadastrar médico.');

            setModal({ type: 'success', title: 'Sucesso', message: 'Médico cadastrado com sucesso!' });
            setIsAdding(false);
            setNewDoc({ nome: '', crm: '', especialidade: '', unidadeFixaId: '', telefone: '' });
            fetchData();
        } catch (err) {
            setModal({ type: 'error', title: 'Falha', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDoctor = async () => {
        if (!selectedDoctorId) return;
        if (!confirm('TEM CERTEZA? Isso removerá o médico e todos os seus vínculos do sistema permanentemente.')) return;

        setSaving(true);
        try {
            const response = await fetch(`/api/manager/medicos/${selectedDoctorId}`, {
                method: 'DELETE',
                headers: { 'x-gestor-id': gestorId }
            });
            if (!response.ok) throw new Error('Falha ao excluir médico.');

            setModal({ type: 'success', title: 'Sucesso', message: 'Médico removido do sistema.' });
            setSelectedDoctorId('');
            fetchData();
        } catch (err) {
            setModal({ type: 'error', title: 'Falha', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!selectedDoctorId) return;
        setSaving(true);

        const docData = doctors.find(d => d.id === selectedDoctorId);

        try {
            const response = await fetch(`/api/manager/medicos/${selectedDoctorId}/perfil`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: docData.nome,
                    telefone: docData.telefone,
                    usuario: buildUsername(docData.nome),
                    unidadeFixaId: docData.unidadeFixaId,
                    gestorId
                })
            });

            if (!response.ok) throw new Error('Falha ao atualizar perfil do médico.');

            setModal({ type: 'success', title: 'Sucesso', message: 'Dados cadastrais do médico atualizados!' });
            fetchData(); 
        } catch (err) {
            setModal({ type: 'error', title: 'Falha', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (!selectedDoctorId) return;
        
        setSaving(true);
        try {
            const res = await fetch(`/api/manager/medicos/${selectedDoctorId}/acessos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidadesIds: checkedUnits,
                    gestorId: session.id
                })
            });

            // Safe-parse: evita crash em respostas vazias ou HTML de erro
            let data = {};
            try {
                const text = await res.text();
                if (text) data = JSON.parse(text);
            } catch {
                // body não era JSON válido
            }

            if (!res.ok) throw new Error(data.error || data.details || `Erro HTTP ${res.status}`);
            
            setModal({ type: 'success', title: 'Sucesso', message: 'Permissões do médico foram atualizadas!' });
            fetchData();
        } catch (err) {
            setModal({ type: 'error', title: 'Falha', message: err.message });
        } finally {
            setSaving(false);
        }
    };
    
    const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500 pb-10">
            <div className="mb-8">
                <h2 className="text-3xl font-black text-white">Controle de Acessos</h2>
            </div>

            {loading && doctors.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent"></div>
                </div>
            ) : (
                <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] xl:grid-cols-[350px_1fr]">
                    {/* Painel de Seleção */}
                    <div className="flex flex-col gap-6 rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                                <Search size={16} className="text-sky-400" />
                                Escolha o Médico
                            </label>
                            <button 
                                onClick={() => setIsAdding(!isAdding)}
                                className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${isAdding ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-sky-500/20 text-sky-300 border border-sky-400/20 hover:bg-sky-500/30'}`}
                            >
                                {isAdding ? 'Cancelar' : '+ Novo Médico'}
                            </button>
                        </div>

                        {isAdding ? (
                            <form onSubmit={handleCreateDoctor} className="space-y-4 rounded-3xl border border-sky-500/30 bg-sky-500/5 p-5 animate-in slide-in-from-top-2 duration-300">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 mb-2">Cadastro de Novo Médico</h4>
                                <input placeholder="Nome Completo" value={newDoc.nome} onChange={e => setNewDoc({...newDoc, nome: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500" required />
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input placeholder="CRM" value={newDoc.crm} onChange={e => setNewDoc({...newDoc, crm: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500" required />
                                    <input placeholder="Especialidade" value={newDoc.especialidade} onChange={e => setNewDoc({...newDoc, especialidade: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500" />
                                </div>
                                <select value={newDoc.unidadeFixaId} onChange={e => setNewDoc({...newDoc, unidadeFixaId: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500" required>
                                    <option value="">-- Unidade Fixa --</option>
                                    {units.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                </select>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input placeholder="Telefone" value={newDoc.telefone} onChange={e => setNewDoc({...newDoc, telefone: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500" />
                                    <input placeholder="Usuário (auto): primeiro.ultimo" value={buildUsername(newDoc.nome)} readOnly className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none" />
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Senha padrão inicial: <span className="font-mono text-slate-300">12345</span>. O médico altera no primeiro acesso.
                                </p>
                                <button type="submit" disabled={saving} className="w-full bg-sky-500 py-2.5 rounded-xl text-slate-950 text-xs font-black uppercase tracking-widest hover:bg-sky-400 transition disabled:opacity-50">
                                    {saving ? 'Salvando...' : 'Confirmar Cadastro'}
                                </button>
                            </form>
                        ) : (
                            <select
                                value={selectedDoctorId}
                                onChange={handleDoctorChange}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400"
                            >
                                <option value="">-- Selecione --</option>
                                {doctors.map(doc => (
                                    <option key={doc.id} value={doc.id}>
                                        {doc.nome} (CRM: {doc.crm})
                                    </option>
                                ))}
                            </select>
                        )}

                        {selectedDoctor && !isAdding && (
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">Unidade Fixa Base</div>
                                    <div className="font-semibold text-sky-200">{selectedDoctor.unidadeFixaNome || 'Não informada'}</div>
                                </div>
                                
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">Especialidade</div>
                                    <div className="text-sm text-slate-300">{selectedDoctor.especialidade}</div>
                                </div>

                                {checkedUnits.length > 0 && (
                                    <div>
                                        <div className="text-xs uppercase tracking-widest text-emerald-500/80 mb-2">Unidades Auxiliares (Liberadas)</div>
                                        <div className="flex flex-wrap gap-2">
                                            {checkedUnits.map(uId => {
                                                const unit = units.find(u => u.id === uId);
                                                return unit ? (
                                                    <span key={uId} className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">
                                                        {unit.nome}
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {!selectedDoctorId && (
                            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-slate-500">
                                <Users size={32} className="mb-3 opacity-50" />
                                <p className="text-xs">Selecione um médico acima para gerenciar os módulos de acesso.</p>
                            </div>
                        )}
                    </div>

                    {/* Módulos de Unidades */}
                    <div className="flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl min-h-[400px]">
                        <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white">Unidades Liberadas</h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    {selectedDoctorId 
                                        ? `Selecione as unidades que ${selectedDoctor?.nome} terá permissão para ver.`
                                        : 'Aguardando seleção de médico...'}
                                </p>
                            </div>
                            
                            {selectedDoctorId && (
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                                >
                                    {saving ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent"></div>
                                    ) : (
                                        <Save size={18} />
                                    )}
                                    Salvar Acessos
                                </button>
                            )}
                        </div>

                        {selectedDoctor && (
                            <div className="mb-8 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/5 p-6 shadow-lg shadow-emerald-950/20">
                                <div className="mb-4 flex items-center justify-between">
                                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 " />
                                        Edição Master de Perfil
                                    </h4>
                                    <button
                                        onClick={handleUpdateProfile}
                                        disabled={saving}
                                        className="text-[10px] font-black uppercase tracking-widest text-emerald-100 bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition disabled:opacity-50"
                                    >
                                        {saving ? 'Salvando...' : 'Salvar Dados Básicos'}
                                    </button>
                                </div>
                                
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Nome Completo</label>
                                        <input 
                                            type="text"
                                            value={selectedDoctor.nome || ''}
                                            onChange={(e) => {
                                                const newDoctors = doctors.map(d => d.id === selectedDoctor.id ? { ...d, nome: e.target.value } : d);
                                                setDoctors(newDoctors);
                                            }}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none transition"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Telefone</label>
                                        <input 
                                            type="text"
                                            value={selectedDoctor.telefone || ''}
                                            onChange={(e) => {
                                                const newDoctors = doctors.map(d => d.id === selectedDoctor.id ? { ...d, telefone: e.target.value } : d);
                                                setDoctors(newDoctors);
                                            }}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none transition"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Usuário</label>
                                        <input 
                                            type="text"
                                            value={selectedDoctor.usuario || buildUsername(selectedDoctor.nome)}
                                            readOnly
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none font-mono"
                                        />
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] text-slate-400">
                                    Senha padrão inicial do médico é <span className="font-mono text-slate-300">12345</span> e deve ser trocada no primeiro acesso.
                                </p>

                                {isMaster && (
                                    <div className="mt-4 space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Unidade Fixa (Master)</label>
                                        <select
                                            value={selectedDoctor.unidadeFixaId || ''}
                                            onChange={(e) => {
                                                const nextUnitId = e.target.value;
                                                const nextUnit = units.find((u) => u.id === nextUnitId);
                                                const newDoctors = doctors.map((d) =>
                                                    d.id === selectedDoctor.id
                                                        ? { ...d, unidadeFixaId: nextUnitId, unidadeFixaNome: nextUnit?.nome || '' }
                                                        : d
                                                );
                                                setDoctors(newDoctors);
                                            }}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none transition"
                                        >
                                            <option value="">-- Selecione a unidade --</option>
                                            {units.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button 
                                    onClick={handleDeleteDoctor}
                                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 py-3 text-[10px] font-black uppercase tracking-widest text-rose-400 transition hover:bg-rose-500/20"
                                >
                                    <AlertTriangle size={14} />
                                    Excluir Médico Definitivamente
                                </button>
                            </div>
                        )}

                        <div className={`grid gap-4 sm:grid-cols-2 md:grid-cols-3 transition-opacity ${!selectedDoctorId ? 'opacity-30 pointer-events-none' : ''}`}>
                            {units
                                .filter(unit => unit.id !== selectedDoctor?.unidadeFixaId)
                                .map(unit => {
                                    const isChecked = checkedUnits.includes(unit.id);
                                return (
                                    <label 
                                        key={unit.id}
                                        className={`group relative flex cursor-pointer flex-col rounded-2xl border p-4 transition-all ${
                                            isChecked 
                                                ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_4px_20px_rgba(16,185,129,0.1)]' 
                                                : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <span className={`font-semibold ${isChecked ? 'text-emerald-300' : 'text-slate-300 group-hover:text-white'}`}>
                                                {unit.nome}
                                            </span>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={isChecked}
                                                onChange={() => toggleUnit(unit.id)}
                                                disabled={!selectedDoctorId}
                                            />
                                            <div className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                                                isChecked ? 'border-emerald-400 bg-emerald-500 text-slate-900' : 'border-slate-600 bg-transparent'
                                            }`}>
                                                {isChecked && <CheckCircle size={14} className="stroke-[3]" />}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Seção de Consulta por Unidade (Tabela Inferior) */}
            <div className="mt-12 rounded-[2rem] border border-slate-800 bg-slate-900/75 p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-700 sm:p-8">
                <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h3 className="text-2xl font-black text-white">Consulta de Médicos por Unidade</h3>
                    </div>

                    <div className="w-full md:w-80">
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Filtrar por Unidade</label>
                        <select
                            value={selectedUnitIdFilter}
                            onChange={(e) => setSelectedUnitIdFilter(e.target.value)}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400"
                        >
                            <option value="">-- Selecione uma Unidade --</option>
                            {isMaster && (
                                <option value={FILTER_TODAS_UNIDADES}>Todos — todas as unidades</option>
                            )}
                            {units.map(u => (
                                <option key={u.id} value={u.id}>{u.nome}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {!selectedUnitIdFilter ? (
                    <div className="flex h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/30 text-slate-500">
                        <Search size={40} className="mb-4 opacity-20" />
                        <p className="text-sm">Selecione uma unidade acima para listar os médicos.</p>
                    </div>
                ) : isMaster && selectedUnitIdFilter === FILTER_TODAS_UNIDADES ? (
                    <div className="space-y-8">
                        {units.map((unit) => {
                            const porUnidade = doctors.filter(
                                (doc) =>
                                    doc.unidadeFixaId === unit.id ||
                                    (Array.isArray(doc.unidadesLiberadas) &&
                                        doc.unidadesLiberadas.includes(unit.id))
                            );
                            return (
                                <div
                                    key={unit.id}
                                    className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/50"
                                >
                                    <div className="border-b border-slate-800 bg-slate-900/90 px-6 py-3">
                                        <h4 className="text-sm font-black uppercase tracking-widest text-sky-400">
                                            {unit.nome}
                                        </h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[720px] w-full text-left text-sm">
                                            <thead>
                                                <tr className="bg-slate-900/80 text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800">
                                                    <th className="px-6 py-4">Médico</th>
                                                    <th className="px-6 py-4">CRM</th>
                                                    <th className="px-6 py-4">Especialidade</th>
                                                    <th className="px-6 py-4">Vínculo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50">
                                                {porUnidade.map((doc) => {
                                                    const isBase = doc.unidadeFixaId === unit.id;
                                                    return (
                                                        <tr
                                                            key={`${unit.id}-${doc.id}`}
                                                            className="group hover:bg-slate-800/30 transition-colors"
                                                        >
                                                            <td className="px-6 py-4 font-semibold text-white group-hover:text-sky-300 transition-colors">
                                                                {doc.nome}
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                                                                {doc.crm}
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-400">{doc.especialidade}</td>
                                                            <td className="px-6 py-4">
                                                                <span
                                                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                                                        isBase
                                                                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                                                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                                    }`}
                                                                >
                                                                    <div
                                                                        className={`h-1.5 w-1.5 rounded-full ${
                                                                            isBase ? 'bg-sky-400' : 'bg-emerald-400'
                                                                        }`}
                                                                    ></div>
                                                                    {isBase ? 'Base Fixa' : 'Auxiliar'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {porUnidade.length === 0 && (
                                            <div className="py-8 text-center text-sm text-slate-500 italic">
                                                Nenhum médico vinculado a esta unidade no momento.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/50">
                        <table className="min-w-[720px] w-full text-left text-sm">
                            <thead>
                                <tr className="bg-slate-900/80 text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800">
                                    <th className="px-6 py-4">Médico</th>
                                    <th className="px-6 py-4">CRM</th>
                                    <th className="px-6 py-4">Especialidade</th>
                                    <th className="px-6 py-4">Vínculo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {doctors
                                    .filter(doc => 
                                        doc.unidadeFixaId === selectedUnitIdFilter || 
                                        (Array.isArray(doc.unidadesLiberadas) && doc.unidadesLiberadas.includes(selectedUnitIdFilter))
                                    )
                                    .map(doc => {
                                        const isBase = doc.unidadeFixaId === selectedUnitIdFilter;
                                        return (
                                            <tr key={doc.id} className="group hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-white group-hover:text-sky-300 transition-colors">{doc.nome}</td>
                                                <td className="px-6 py-4 text-slate-300 font-mono text-xs">{doc.crm}</td>
                                                <td className="px-6 py-4 text-slate-400">{doc.especialidade}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                                        isBase 
                                                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' 
                                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                    }`}>
                                                        <div className={`h-1.5 w-1.5 rounded-full ${isBase ? 'bg-sky-400' : 'bg-emerald-400'}`}></div>
                                                        {isBase ? 'Base Fixa' : 'Auxiliar'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                        
                        {doctors.filter(doc => doc.unidadeFixaId === selectedUnitIdFilter || (Array.isArray(doc.unidadesLiberadas) && doc.unidadesLiberadas.includes(selectedUnitIdFilter))).length === 0 && (
                            <div className="py-12 text-center text-slate-500 italic">
                                Nenhum médico vinculado a esta unidade no momento.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal Popup */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" onClick={() => setModal(null)}>
                    <div className="w-full max-w-sm scale-100 rounded-[2rem] border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl shadow-slate-950/80 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                            modal.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                            {modal.type === 'success' ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
                        </div>
                        <h3 className="mb-2 text-2xl font-black text-white">{modal.title}</h3>
                        <p className="mb-6 text-sm leading-relaxed text-slate-300">{modal.message}</p>
                        <button
                            onClick={() => setModal(null)}
                            className={`w-full rounded-2xl px-4 py-3 text-sm font-bold transition-all ${
                                modal.type === 'success' 
                                    ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' 
                                    : 'bg-rose-500 text-rose-950 hover:bg-rose-400'
                            }`}
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

