import React, { useCallback, useEffect, useState } from 'react';
import { LayoutTemplate, Plus, Trash2, X, Save, Edit3, Check } from 'lucide-react';
import { readApiResponse } from '../models/api';
import { useAuth } from '../context/AuthContext';

const UNIT_SHIFT_ORDER = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function ManagerEscalaTemplatePage() {
    const { session } = useAuth();
    const gestorId = session?.id || '';
    
    const [units, setUnits] = useState([]);
    const [unitId, setUnitId] = useState('');
    
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [localSlots, setLocalSlots] = useState([]);
    
    // UI State
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const [doctors, setDoctors] = useState([]);
    const [doctorsLoading, setDoctorsLoading] = useState(false);
    
    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTplName, setNewTplName] = useState('');
    const [newTplType, setNewTplType] = useState('FIX_DIA'); // New categories
    const [selectedWeekdays, setSelectedWeekdays] = useState([1, 2, 3, 4, 5]); // Default Mon-Fri for FIX_DIA
    const [addSlotModal, setAddSlotModal] = useState(null); // { dia, turno }
    const [modalMedicoId, setModalMedicoId] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    // --- Data Fetching ---
    useEffect(() => {
        if (!gestorId) return;
        fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(gestorId)}`)
            .then(r => r.ok ? r.json() : [])
            .then(setUnits)
            .catch(() => setUnits([]));
    }, [gestorId]);

    useEffect(() => {
        if (!gestorId) return;
        setDoctorsLoading(true);
        const url = unitId 
            ? `/api/manager/medicos?gestorId=${encodeURIComponent(gestorId)}&unidadeId=${encodeURIComponent(unitId)}`
            : `/api/manager/medicos?gestorId=${encodeURIComponent(gestorId)}`;

        fetch(url)
            .then(readApiResponse)
            .then(data => setDoctors(Array.isArray(data) ? data : []))
            .catch(() => setDoctors([]))
            .finally(() => setDoctorsLoading(false));
    }, [gestorId, unitId]);

    const loadTemplates = useCallback(async () => {
        if (!unitId) {
            setTemplates([]);
            setSelectedTemplate(null);
            return;
        }
        setLoading(true);
        try {
            const r = await fetch(`/api/manager/templates?unidadeId=${unitId}&gestorId=${gestorId}`);
            const data = await readApiResponse(r);
            if (r.ok) {
                setTemplates(data || []);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [unitId, gestorId]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const loadActiveTemplate = async (templateId) => {
        if (!templateId) {
            setSelectedTemplate(null);
            setLocalSlots([]);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const r = await fetch(`/api/manager/templates/${templateId}?gestorId=${gestorId}`);
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || 'Erro ao carregar modelo.');
            setSelectedTemplate(data);
            setLocalSlots(data.slots || []);
            setSuccess('');
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRenameTemplate = async () => {
        if (!selectedTemplate || !renameValue.trim()) return;
        setSaving(true);
        setError('');
        try {
            const r = await fetch(`/api/manager/templates/${selectedTemplate.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gestorId, nome: renameValue.trim() })
            });
            if (!r.ok) throw new Error('Falha ao renomear modelo.');
            
            // Update local state
            setSelectedTemplate(prev => ({ ...prev, nome: renameValue.trim() }));
            setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? { ...t, nome: renameValue.trim() } : t));
            setIsRenaming(false);
            setSuccess('Modelo renomeado com sucesso!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    // --- Actions ---
    const handleCreateTemplate = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const payload = { 
                gestorId, 
                unidadeId: unitId, 
                nome: newTplName, 
                tipo: newTplType,
                // For FIX_DIA, we might want to store which weekdays are active.
                // We'll reuse dias_modelo or just save common format.
                dias_modelo: newTplType === 'FIX_SEMANA' ? 5 : 7 
            };
            
            const r = await fetch('/api/manager/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await readApiResponse(r);
            if (!r.ok) {
                const msg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Falha ao criar.');
                throw new Error(msg);
            }
            setIsCreateModalOpen(false);
            setNewTplName('');
            await loadTemplates();
            await loadActiveTemplate(data.id);
        } catch (e) {
            setError(e.message);
        }
    };

    const handleDeleteTemplate = async () => {
        if (!selectedTemplate) return;
        if (!window.confirm(`Tem certeza que deseja excluir o modelo "${selectedTemplate.nome}" permanentemente?`)) return;
        
        try {
            const r = await fetch(`/api/manager/templates/${selectedTemplate.id}?gestorId=${gestorId}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Falha ao excluir.');
            setSelectedTemplate(null);
            setLocalSlots([]);
            await loadTemplates();
            setError('');
            setSuccess('Modelo excluído com sucesso.');
        } catch (e) {
            setError(e.message);
        }
    };

    const handleSaveSlots = async () => {
        if (!selectedTemplate) return;
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            // Filter slots: If weekly 5-day, only keep Mon-Fri (1-5)
            const is5Dias = selectedTemplate.tipo === 'SEMANAL' && selectedTemplate.dias_modelo === 5;
            const filteredSlots = is5Dias ? localSlots.filter(s => s.dia >= 1 && s.dia <= 5) : localSlots;

            const r = await fetch(`/api/manager/templates/${selectedTemplate.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gestorId, slots: filteredSlots })
            });
            if (!r.ok) throw new Error('Falha ao salvar a escalação.');
            setSuccess('Modelo salvo com sucesso!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    // --- Grid Logic ---
    const confirmAddSlot = () => {
        if (!addSlotModal || !modalMedicoId) return;
        const doc = doctors.find(d => d.id === modalMedicoId);
        
        // Check local duplicate (same doctor, same shift, same day)
        const isDup = localSlots.some(s => s.dia === addSlotModal.dia && s.turno === addSlotModal.turno && s.medico_id === modalMedicoId);
        if (isDup) {
            alert('Esse médico já está locado neste turno do modelo!');
            return;
        }

        const newSlot = {
            dia: addSlotModal.dia,
            turno: addSlotModal.turno,
            medico_id: modalMedicoId,
            medicos: { nome: doc?.nome, especialidade: doc?.especialidade }
        };

        setLocalSlots(prev => [...prev, newSlot]);
        setAddSlotModal(null);
        setModalMedicoId('');
    };

    const removeSlotLocal = (indexToRemove) => {
        setLocalSlots(prev => prev.filter((_, i) => i !== indexToRemove));
    };

    // --- Render Helpers ---
    const renderGridDias = () => {
        if (!selectedTemplate) return null;
        
        const type = selectedTemplate.tipo;
        const isFixDia = type === 'FIX_DIA' || type === 'SEMANAL'; // Support legacy
        const isFixSemana = type === 'FIX_SEMANA';
        const isFixQuinzena = type === 'FIX_QUINZENA' || type === 'QUINZENAL';
        
        // Define which relative "days" we show in the template grid
        let displayDays = [];

        if (isFixSemana) {
            displayDays = [1, 2, 3, 4, 5]; // Mon to Fri
        } else if (isFixQuinzena) {
            for (let i = 1; i <= 15; i++) displayDays.push(i);
        } else if (isFixDia) {
            // For Fixed Days, we show the full week (or could filter to only ones with slots)
            displayDays = [0, 1, 2, 3, 4, 5, 6]; 
        } else {
            // Mensal or others
            for (let i = 1; i <= 31; i++) displayDays.push(i);
        }

        const cards = [];
        
        for (const d of displayDays) {
            const isWeekBased = isFixDia || isFixSemana;
            const title = isWeekBased ? WEEKDAYS[d] : `Dia ${d}`;
            
            cards.push(
                <div key={d} className="flex min-h-[14rem] flex-col rounded-2xl border border-slate-800 bg-slate-950/50 p-2">
                    <div className="mb-2 flex items-center justify-between gap-1 px-1">
                        <span className="text-xs font-black uppercase tracking-widest text-white">{title}</span>
                    </div>
                    
                    <div className="flex flex-1 flex-col gap-1">
                        {UNIT_SHIFT_ORDER.map(turno => {
                            const slotsForTurno = localSlots.filter(s => s.dia === d && s.turno === turno);
                            return (
                                <div key={turno} className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-1.5">
                                    <div className="mb-1 flex items-center justify-between gap-1">
                                        <span className="text-[10px] font-black uppercase text-slate-400">{turno}</span>
                                        <button
                                            type="button"
                                            onClick={() => { setAddSlotModal({ dia: d, turno }); setModalMedicoId(''); }}
                                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300"
                                        >
                                            +Add
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {slotsForTurno.length > 0 ? slotsForTurno.map((slot, idx) => {
                                            // Encontrar indice global pra deletar
                                            const globalIndex = localSlots.findIndex(s => s === slot);
                                            return (
                                                <div key={idx} className="flex items-center justify-between gap-1 rounded-lg bg-slate-800/50 px-2 py-1">
                                                    <span className="break-words text-[10px] font-semibold leading-tight text-slate-200">
                                                        {slot.medicos?.nome || 'Médico Desconhecido'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSlotLocal(globalIndex)}
                                                        className="shrink-0 text-[10px] font-black text-rose-400 hover:text-rose-300"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            );
                                        }) : (
                                            <p className="text-[10px] italic text-slate-600">Vazio</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        
        return (
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 ${displayDays.length <= 7 ? 'xl:grid-cols-7' : 'xl:grid-cols-8'}`}>
                {cards}
            </div>
        );
    };

    return (
        <div className="w-full max-w-none animate-in fade-in duration-500 pb-20">
            <div className="mb-8">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">CRIE SEU MODELO</p>
                <h2 className="text-3xl font-black text-white flex items-center gap-3">
                    <LayoutTemplate className="text-emerald-500" />
                    Modelos de Escala Personalizada
                </h2>
            </div>

            {error ? <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            {success ? <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">{success}</div> : null}

            {/* SELEÇÃO E CONTROLES */}
            <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-900/40 p-6 sm:flex-row sm:items-end">
                <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Unidade Base</label>
                    <select
                        value={unitId}
                        onChange={(e) => { setUnitId(e.target.value); setSelectedTemplate(null); }}
                        className="w-full min-w-[220px] rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-400"
                    >
                        <option value="">Selecione...</option>
                        {units.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                </div>

                {unitId && (
                    <div className="flex flex-1 flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Modelo Existente</label>
                            <select
                                value={selectedTemplate?.id || ''}
                                onChange={(e) => loadActiveTemplate(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-400"
                            >
                                <option value="">Novo ou nenhum...</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.nome} ({t.tipo})</option>)}
                            </select>
                        </div>
                        
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-600 bg-slate-800/40 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-400"
                        >
                            <Plus size={16} /> Criar Novo Modelo
                        </button>
                    </div>
                )}
            </div>

            {/* AREA DO MODELO ATIVO */}
            {selectedTemplate && (
                <div className="rounded-[2.5rem] border border-emerald-900/30 bg-slate-900/60 p-6 mt-8 shadow-2xl backdrop-blur-md">
                    <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${selectedTemplate.tipo === 'SEMANAL' ? 'bg-sky-500/20 text-sky-400' : selectedTemplate.tipo === 'QUINZENAL' ? 'bg-orange-500/20 text-orange-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                    {selectedTemplate.tipo}
                                </span>
                            </div>
                            {isRenaming ? (
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleRenameTemplate()}
                                        className="rounded-xl border border-emerald-500 bg-slate-950 px-4 py-2 text-xl font-black text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    />
                                    <button onClick={handleRenameTemplate} className="rounded-xl bg-emerald-500 p-2.5 text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400">
                                        <Check size={20} />
                                    </button>
                                    <button onClick={() => setIsRenaming(false)} className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white">
                                        <X size={20} />
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-2 flex items-center gap-3 group">
                                    <h3 className="text-3xl font-black text-white">{selectedTemplate.nome}</h3>
                                    <button
                                        onClick={() => { setRenameValue(selectedTemplate.nome); setIsRenaming(true); }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-slate-500 hover:text-emerald-400"
                                        title="Editar nome do modelo"
                                    >
                                        <Edit3 size={20} />
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-slate-500 mt-1">
                                {localSlots.length} slot(s) de plantonistas preenchidos no momento. As alterações aguardam salvamento.
                            </p>
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={handleDeleteTemplate}
                                className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-500 transition hover:bg-rose-500/20"
                            >
                                <Trash2 size={16} /> Excluir Modelo
                            </button>
                            <button
                                onClick={handleSaveSlots}
                                disabled={saving}
                                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:opacity-50"
                            >
                                <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Modelo'}
                            </button>
                        </div>
                    </div>

                    <div className="mt-8">
                        {renderGridDias()}
                    </div>
                </div>
            )}

            {/* MODALS */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-md">
                    <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900 p-8 shadow-2xl">
                        <h3 className="text-2xl font-black text-white mb-6">Novo Modelo</h3>
                        <form onSubmit={handleCreateTemplate} className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-400">Nome do Modelo (Ex: Inverno, Padrão)</label>
                                <input
                                    required
                                    type="text"
                                    value={newTplName}
                                    onChange={e => setNewTplName(e.target.value)}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <div className="mb-6">
                                <label className="mb-2 block text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo de Modelo Personalizado</label>
                                <div className="grid grid-cols-1 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setNewTplType('FIX_DIA')}
                                        className={`group relative flex flex-col items-start rounded-2xl border-2 p-4 text-left transition ${newTplType === 'FIX_DIA' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span className={`text-sm font-black ${newTplType === 'FIX_DIA' ? 'text-white' : 'text-slate-400'}`}>FIXO POR DIA(S)</span>
                                            <div className={`h-4 w-4 rounded-full border-2 ${newTplType === 'FIX_DIA' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-700'}`} />
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Escolha dias específicos da semana para repetir sempre.</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setNewTplType('FIX_SEMANA')}
                                        className={`group relative flex flex-col items-start rounded-2xl border-2 p-4 text-left transition ${newTplType === 'FIX_SEMANA' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span className={`text-sm font-black ${newTplType === 'FIX_SEMANA' ? 'text-white' : 'text-slate-400'}`}>FIXO POR SEMANA</span>
                                            <div className={`h-4 w-4 rounded-full border-2 ${newTplType === 'FIX_SEMANA' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-700'}`} />
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Escala de Segunda a Sexta (médicos fixos da semana).</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setNewTplType('FIX_QUINZENA')}
                                        className={`group relative flex flex-col items-start rounded-2xl border-2 p-4 text-left transition ${newTplType === 'FIX_QUINZENA' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span className={`text-sm font-black ${newTplType === 'FIX_QUINZENA' ? 'text-white' : 'text-slate-400'}`}>FIXO POR QUINZENA</span>
                                            <div className={`h-4 w-4 rounded-full border-2 ${newTplType === 'FIX_QUINZENA' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-700'}`} />
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Divisão automática: dias 01-15 e 16-31.</p>
                                    </button>
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 rounded-xl bg-slate-800 py-3 font-bold text-slate-300">Cancelar</button>
                                <button type="submit" className="flex-1 rounded-xl bg-emerald-500 py-3 font-black text-slate-950 hover:bg-emerald-400">Criar Template</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {addSlotModal && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 px-4 py-8 backdrop-blur-md">
                    <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-2xl">
                        <div className="mb-6 flex items-start justify-between">
                            <div>
                                <h3 className="text-xl font-black text-white">Escalar Médico</h3>
                                <p className="text-sm text-emerald-400 mt-1 font-bold">
                                    {selectedTemplate?.tipo === 'SEMANAL' ? WEEKDAYS[addSlotModal.dia] : `Dia ${addSlotModal.dia}`} · {addSlotModal.turno}
                                </p>
                            </div>
                            <button onClick={() => setAddSlotModal(null)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                        </div>
                        
                        <label className="mb-1.5 block text-xs font-bold text-slate-400">Plantonista</label>
                        <select
                            value={modalMedicoId}
                            onChange={(e) => setModalMedicoId(e.target.value)}
                            disabled={doctorsLoading}
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white focus:border-emerald-500 outline-none"
                        >
                            <option value="">{doctorsLoading ? 'Carregando...' : 'Selecione...'}</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.nome} - {d.especialidade || 'Geral'}</option>)}
                        </select>
                        
                        <button
                            disabled={!modalMedicoId}
                            onClick={confirmAddSlot}
                            className="w-full mt-6 rounded-xl bg-emerald-500 py-3 font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                        >
                            Adicionar ao Modelo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
