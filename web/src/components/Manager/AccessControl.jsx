import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Users, CheckCircle, Search, Save, AlertTriangle } from 'lucide-react';

export default function ManagerAccessControl() {
    const { session } = useAuth();
    
    const [doctors, setDoctors] = useState([]);
    const [units, setUnits] = useState([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    
    // Lista de IDs das unidades atualmente "checadas" para o médico selecionado
    const [checkedUnits, setCheckedUnits] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [modal, setModal] = useState(null); // Para sucesso ou erro

    const fetchData = async () => {
        setLoading(true);
        try {
            const [resDocs, resUnits] = await Promise.all([
                fetch('/api/manager/medicos'),
                fetch('/api/manager/unidades')
            ]);
            
            const docsData = await resDocs.json();
            const unitsData = await resUnits.json();
            
            if (!resDocs.ok) throw new Error(docsData.error || 'Erro ao carregar médicos');
            if (!resUnits.ok) throw new Error(unitsData.error || 'Erro ao carregar unidades');
            
            setDoctors(docsData);
            setUnits(unitsData);
            
            // Se já havia um médico selecionado, atualizamos as checkboxes dele
            if (selectedDoctorId) {
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
        fetchData();
    }, []);

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
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar acessos');
            
            setModal({ type: 'success', title: 'Sucesso', message: 'Permissões do médico foram atualizadas!' });
            
            // Recarrega os dados em background para manter consistência
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
                <p className="mt-2 text-sm text-slate-400">Gerencie em quais unidades cada médico pode visualizar e selecionar plantões.</p>
            </div>

            {loading && doctors.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent"></div>
                </div>
            ) : (
                <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] xl:grid-cols-[350px_1fr]">
                    {/* Painel de Seleção */}
                    <div className="flex flex-col gap-6 rounded-[2rem] border border-slate-800 bg-slate-900/75 p-6 shadow-2xl">
                        <div>
                            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-300">
                                <Search size={16} className="text-sky-400" />
                                Escolha o Médico
                            </label>
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
                        </div>

                        {selectedDoctor && (
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                                <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">Unidade Fixa Base</div>
                                <div className="font-semibold text-sky-200">{selectedDoctor.unidadeFixaNome || 'Não informada'}</div>
                                <div className="mt-3 text-xs uppercase tracking-widest text-slate-500 mb-1">Especialidade</div>
                                <div className="text-sm text-slate-300">{selectedDoctor.especialidade}</div>
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

                        <div className={`grid gap-4 sm:grid-cols-2 md:grid-cols-3 transition-opacity ${!selectedDoctorId ? 'opacity-30 pointer-events-none' : ''}`}>
                            {units.map(unit => {
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
