import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Stethoscope, UserRoundCheck, Phone, Users } from 'lucide-react';
import { readApiResponse } from '../utils/api';

const formatDateLabel = (dateString) =>
    new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(`${dateString}T12:00:00-03:00`));

const shiftOrder = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
const getInitialDate = () => new Date().toISOString().slice(0, 10);

export default function AgendaPage() {
    const [units, setUnits] = useState([]);
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [selectedDate, setSelectedDate] = useState(getInitialDate);
    const [agenda, setAgenda] = useState(null);
    const [loadingUnits, setLoadingUnits] = useState(true);
    const [loadingAgenda, setLoadingAgenda] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadUnits = async () => {
            setLoadingUnits(true);
            try {
                const response = await fetch('/api/manager/unidades');
                const data = await readApiResponse(response);

                if (!response.ok) throw new Error(data.error || 'Falha ao carregar unidades.');

                setUnits(data || []);
                if (!selectedUnitId && data?.[0]?.id) {
                    setSelectedUnitId(data[0].id);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoadingUnits(false);
            }
        };

        loadUnits();
    }, []);

    useEffect(() => {
        if (!selectedUnitId || !selectedDate) return;

        const loadAgenda = async () => {
            setLoadingAgenda(true);
            setError('');

            try {
                const response = await fetch(`/api/manager/agenda?unidadeId=${selectedUnitId}&date=${selectedDate}`);
                const data = await readApiResponse(response);

                if (!response.ok) throw new Error(data.error || 'Falha ao carregar agenda.');

                setAgenda(data);
            } catch (err) {
                setError(err.message);
                setAgenda(null);
            } finally {
                setLoadingAgenda(false);
            }
        };

        loadAgenda();
    }, [selectedUnitId, selectedDate]);

    const orderedShifts = useMemo(() => {
        const shifts = agenda?.shifts || [];
        return [...shifts].sort((left, right) => shiftOrder.indexOf(left.turno) - shiftOrder.indexOf(right.turno));
    }, [agenda]);

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8">
                <h2 className="text-3xl font-black text-white">Agenda de Plantões</h2>
                <p className="mt-2 text-sm text-slate-400">
                    Filtre por unidade e data para ver os turnos do dia e quais médicos já estão alocados em cada um.
                </p>
            </div>

            <section className="rounded-[2rem] border border-slate-800 bg-slate-900/75 p-4 shadow-2xl sm:p-6">
                <div className="grid gap-4 border-b border-slate-800 pb-6 md:grid-cols-2">
                    <div>
                        <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                            <MapPin size={14} className="text-sky-400" />
                            Unidade
                        </label>
                        <select
                            value={selectedUnitId}
                            onChange={(event) => setSelectedUnitId(event.target.value)}
                            disabled={loadingUnits}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400"
                        >
                            <option value="">{loadingUnits ? 'Carregando unidades...' : 'Selecione uma unidade'}</option>
                            {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                    {unit.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                            <CalendarDays size={14} className="text-emerald-400" />
                            Data
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(event) => setSelectedDate(event.target.value)}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                        />
                    </div>
                </div>

                <div className="mt-6">
                    {error && (
                        <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                            {error}
                        </div>
                    )}

                    {loadingAgenda ? (
                        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/30">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-950/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Filtro atual</p>
                                    <h3 className="mt-1 text-xl font-black text-white">{agenda?.unit?.nome || 'Unidade não selecionada'}</h3>
                                </div>
                                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300">
                                    {formatDateLabel(selectedDate)}
                                </div>
                            </div>

                            {orderedShifts.length === 0 ? (
                                <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/30 px-6 text-center">
                                    <Users size={34} className="mb-4 text-slate-600" />
                                    <p className="text-lg font-bold text-slate-300">Nenhum turno encontrado para esse filtro.</p>
                                    <p className="mt-2 text-sm text-slate-500">
                                        Ajuste a unidade ou a data, ou gere a previsão para preencher a disponibilidade.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-5 xl:grid-cols-2">
                                    {orderedShifts.map((shift) => (
                                        <article key={shift.id} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 shadow-xl shadow-slate-950/20">
                                            <div className="mb-4 flex items-start justify-between gap-3">
                                                <div>
                                                    <span className="inline-flex rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-sky-300">
                                                        {shift.turno}
                                                    </span>
                                                    <h4 className="mt-3 text-xl font-black text-white">{shift.local}</h4>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</div>
                                                    <div className="mt-1 text-sm font-bold text-slate-200">{shift.status}</div>
                                                </div>
                                            </div>

                                            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                                                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Vagas totais</div>
                                                    <div className="mt-2 text-2xl font-black text-white">{shift.vagasTotais}</div>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ocupadas</div>
                                                    <div className="mt-2 text-2xl font-black text-sky-300">{shift.vagasOcupadas}</div>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Disponíveis</div>
                                                    <div className="mt-2 text-2xl font-black text-emerald-300">{shift.vagasDisponiveis}</div>
                                                </div>
                                            </div>

                                            {shift.medicos.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-sm text-slate-400">
                                                    Nenhum médico alocado neste turno.
                                                </div>
                                            ) : (
                                                <div className="grid gap-3">
                                                    {shift.medicos.map((doctor) => (
                                                        <div key={doctor.agendamentoId} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 px-4 py-4">
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                <div>
                                                                    <div className="flex items-center gap-2 text-white">
                                                                        <UserRoundCheck size={16} className="text-emerald-400" />
                                                                        <span className="font-black">{doctor.nome}</span>
                                                                    </div>
                                                                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">CRM</div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-200">{doctor.crm || 'Não informado'}</div>
                                                                </div>

                                                                <div className="sm:text-right">
                                                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 sm:justify-end">
                                                                        <Stethoscope size={14} />
                                                                        Especialidade
                                                                    </div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-200">{doctor.especialidade || 'Não informada'}</div>
                                                                    <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 sm:justify-end">
                                                                        <Phone size={14} />
                                                                        Contato
                                                                    </div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-200">{doctor.telefone || 'Não informado'}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
