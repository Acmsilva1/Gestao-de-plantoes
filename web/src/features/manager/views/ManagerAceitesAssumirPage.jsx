import React, { useEffect, useState } from 'react';
import { readApiResponse } from '../../../shared/models/api';
import { useAuth } from '../../../shared/context/AuthContext';

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
});

const formatDisplayDate = (dateString) =>
    fullDateFormatter.format(new Date(`${dateString}T12:00:00-03:00`)).replace(/\//g, '-');

export default function ManagerAceitesAssumirPage() {
    const { session } = useAuth();
    const gestorId = session?.id || '';
    const [units, setUnits] = useState([]);
    const [unitId, setUnitId] = useState('');
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        if (!gestorId) return;
        fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(gestorId)}`)
            .then((r) => (r.ok ? r.json() : []))
            .then(setUnits)
            .catch(() => setUnits([]));
    }, [gestorId]);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const q = unitId
                ? `?unidadeId=${encodeURIComponent(unitId)}&gestorId=${encodeURIComponent(gestorId)}`
                : `?gestorId=${encodeURIComponent(gestorId)}`;
            const r = await fetch(`/api/manager/assumir-pendentes${q}`);
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Não foi possível carregar.');
            setPedidos(data.pedidos || []);
        } catch (e) {
            setError(e.message);
            setPedidos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!gestorId) return;
        load();
    }, [unitId, gestorId]);

    const decidir = async (pedidoId, aprovar) => {
        setBusyId(pedidoId);
        setError('');
        try {
            const r = await fetch(`/api/manager/assumir/${pedidoId}/decidir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aprovar, gestorId })
            });
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Operacao falhou.');
            await load();
            window.dispatchEvent(new Event('manager-pending-refresh'));
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white">Aceites — assumir vago</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">
                        Médicos pediram assumir turnos sem plantonista na escala. A sua decisão autoriza ou recusa o registo na escala (sem troca de
                        colega).
                    </p>
                </div>
                {units.length > 0 ? (
                    <div className="shrink-0">
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Unidade</label>
                        <select
                            value={unitId}
                            onChange={(e) => setUnitId(e.target.value)}
                            className="min-w-[200px] rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-sky-400"
                        >
                            <option value="">Todas</option>
                            {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
            </div>

            {error ? (
                <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
            ) : null}

            {loading ? (
                <p className="text-sm text-slate-500">A carregar...</p>
            ) : pedidos.length === 0 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-950/40 px-6 py-16 text-center">
                    <p className="text-lg font-bold text-slate-400">Nenhum pedido de assumir vago pendente</p>
                    <p className="mt-2 text-sm text-slate-600">Quando um médico solicitar assumir um turno vazio, o pedido aparecerá aqui.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/30">
                    <table className="min-w-[640px] w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                <th className="px-5 py-4">Data</th>
                                <th className="px-5 py-4">Turno</th>
                                <th className="px-5 py-4">Unidade</th>
                                <th className="px-5 py-4">Médico solicitante</th>
                                <th className="px-5 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {pedidos.map((p) => {
                                const unidadeNome = p.unidades?.nome || '—';
                                const sol = p.solicitante?.nome || '—';
                                const busy = busyId === p.id;
                                return (
                                    <tr key={p.id} className="transition-colors hover:bg-slate-800/20">
                                        <td className="px-5 py-4 font-mono text-sm text-sky-300">{formatDisplayDate(p.data_plantao)}</td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-400">
                                                {p.turno}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-300">{unidadeNome}</td>
                                        <td className="px-5 py-4 text-sm font-semibold text-white">{sol}</td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => decidir(p.id, true)}
                                                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                                >
                                                    {busy ? '...' : 'Aprovar'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => decidir(p.id, false)}
                                                    className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                                                >
                                                    Recusar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
