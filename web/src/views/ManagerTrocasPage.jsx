import React, { useEffect, useState } from 'react';
import { readApiResponse } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo'
});

const formatDisplayDate = (dateString) =>
    fullDateFormatter.format(new Date(`${dateString}T12:00:00-03:00`)).replace(/\//g, '-');

const formatDisplayDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return '-';
    return dateTimeFormatter.format(parsed).replace(',', '');
};

const statusLabel = (tipoEvento, status) => {
    if (tipoEvento === 'ASSUMIR_VAGO') return 'Assumiu turno vago';
    if (status === 'APROVADO') return 'Troca efetivada';
    if (status === 'RECUSADO_COLEGA') return 'Recusada pelo colega';
    return status || '-';
};

export default function ManagerTrocasPage() {
    const { session } = useAuth();
    const gestorId = session?.id || '';
    const [units, setUnits] = useState([]);
    const [unitId, setUnitId] = useState('');
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
            const r = await fetch(`/api/manager/trocas-pendentes${q}`);
            const data = await readApiResponse(r);
            if (!r.ok) throw new Error(data.error || data.details || 'Nao foi possivel carregar.');
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

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white">Trocas e ciencia</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">
                        Feed de ciencia do gestor. As trocas entre medicos e os assumir de turno vago sao processados automaticamente.
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
                    <p className="text-lg font-bold text-slate-400">Nenhum evento para ciencia</p>
                    <p className="mt-2 text-sm text-slate-600">Quando houver trocas ou assumir de vago, os detalhes aparecerao aqui.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/30">
                    <table className="min-w-[980px] w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                <th className="px-5 py-4">Tipo</th>
                                <th className="px-5 py-4">Data</th>
                                <th className="px-5 py-4">Turno</th>
                                <th className="px-5 py-4">Unidade</th>
                                <th className="px-5 py-4">Detalhes</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4">Atualizado em</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {pedidos.map((p) => {
                                const unidadeNome = p.unidades?.nome || '-';
                                const ehTroca = p.tipo_evento === 'TROCA';
                                const badgeClass = ehTroca
                                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
                                return (
                                    <tr key={`${p.tipo_evento}-${p.id}`} className="transition-colors hover:bg-slate-800/20">
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-black uppercase ${badgeClass}`}>
                                                {ehTroca ? 'Troca' : 'Assumir vago'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 font-mono text-sm text-sky-300">{formatDisplayDate(p.data_plantao)}</td>
                                        <td className="px-5 py-4 text-sm font-semibold text-slate-100">{p.turno || '-'}</td>
                                        <td className="px-5 py-4 text-sm text-slate-300">{unidadeNome}</td>
                                        <td className="px-5 py-4 text-sm text-slate-300">
                                            {ehTroca ? (
                                                <>
                                                    <div>
                                                        <span className="font-semibold text-white">{p.solicitante?.nome || '-'}</span> {'->'}{' '}
                                                        <span className="font-semibold text-white">{p.alvo?.nome || '-'}</span>
                                                    </div>
                                                    {p.data_plantao_oferecida ? (
                                                        <div className="mt-1 text-[10px] font-bold text-amber-300">
                                                            Oferta: {formatDisplayDate(p.data_plantao_oferecida)} ({p.turno_oferecido})
                                                        </div>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <div>
                                                    Medico: <span className="font-semibold text-white">{p.solicitante?.nome || '-'}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-200">{statusLabel(p.tipo_evento, p.status)}</td>
                                        <td className="px-5 py-4 text-xs text-slate-400">{formatDisplayDateTime(p.data_evento || p.updated_at || p.created_at)}</td>
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
