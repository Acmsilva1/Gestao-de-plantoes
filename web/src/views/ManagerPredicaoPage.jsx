import React, { useEffect, useMemo, useState } from 'react';
import { 
    AlertCircle, 
    BrainCircuit, 
    CalendarDays, 
    Download, 
    Filter, 
    MapPinned, 
    RefreshCcw, 
    TrendingUp, 
    X,
    Zap
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

const cardClass =
    'overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[linear-gradient(150deg,rgba(15,23,42,0.95),rgba(2,6,23,0.92))] p-6 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.9)]';

const metricClass = 'rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-4 backdrop-blur-sm';

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
            <p className="mb-1 font-black text-white">{label || 'Detalhes'}</p>
            {payload.map((item) => (
                <div key={item.dataKey} className="flex items-center gap-2 text-slate-300">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}:</span>
                    <span className="font-black text-white">{item.value}</span>
                </div>
            ))}
        </div>
    );
};

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
    if (!value) return 'Ainda não executado';
    return new Date(value).toLocaleString('pt-BR');
};

const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
const areSameIds = (left = [], right = []) =>
    left.length === right.length && left.every((value, index) => String(value) === String(right[index]));

export default function ManagerPredicaoPage({ embedded = false, sharedFilters = null }) {
    const { session } = useAuth();
    const isMaster = Boolean(session?.isMaster || session?.perfil === 'GESTOR_MASTER');
    const useSharedFilters = Boolean(embedded && sharedFilters);
    const [units, setUnits] = useState([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
    const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
    const [loading, setLoading] = useState(true);
    const [recalculating, setRecalculating] = useState(false);
    const [isStabilityModalOpen, setIsStabilityModalOpen] = useState(false);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({
        unidade: '',
        regional: '',
        turno: 'TOTAL'
    });
    const [data, setData] = useState({
        summary: {
            totalDemand: 0,
            totalRows: 0,
            totalDays: 0,
            averageDemandPerRow: 0,
            peakDay: null,
            topUnit: null,
            confidenceCounts: { Alta: 0, Media: 0, Baixa: 0 },
            diagnostics: { lowSampleRows: 0, highVolatilityRows: 0, avgConfidenceScore: 0 }
        },
        filters: {
            unidades: [],
            regionais: [],
            turnos: []
        },
        rows: [],
        generatedAt: null
    });
    const monthOptions = useMemo(
        () => [
            { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
            { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
            { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
            { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
            { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
            { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
        ],
        []
    );
    const yearOptions = useMemo(() => {
        const current = new Date().getFullYear();
        const arr = [];
        for (let y = current - 2; y <= current + 2; y += 1) arr.push(String(y));
        return arr;
    }, []);

    useEffect(() => {
        if (!useSharedFilters) return;
        const unitIds = (sharedFilters?.unitIds || []).map((id) => String(id)).filter(Boolean);
        setSelectedMonth(sharedFilters?.month || selectedMonth);
        setSelectedYear(sharedFilters?.year || selectedYear);
        setSelectedUnitIds(unitIds);
        setFilters((current) => ({
            ...current,
            regional: sharedFilters?.regional || '',
            turno: sharedFilters?.turno || 'TOTAL',
            unidade: unitIds.length === 1 ? String(unitIds[0]) : ''
        }));
    }, [useSharedFilters, sharedFilters?.month, sharedFilters?.year, sharedFilters?.regional, sharedFilters?.turno, sharedFilters?.unitIds]);

    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        params.set('gestorId', session?.id || '');
        if (selectedUnitIds.length > 0) params.set('unidadeIds', selectedUnitIds.join(','));
        else if (filters.unidade) params.set('unidade', filters.unidade);
        if (filters.regional) params.set('regional', filters.regional);
        if (filters.turno && filters.turno !== 'TOTAL') params.set('turno', filters.turno.toLowerCase());
        return params.toString();
    }, [filters.regional, filters.turno, filters.unidade, selectedUnitIds, session?.id]);

    const selectedUnitNames = useMemo(
        () => units.filter((u) => selectedUnitIds.includes(String(u.id))).map((u) => u.nome),
        [units, selectedUnitIds]
    );

    const visibleUnits = useMemo(() => {
        const selectedRegional = String(filters.regional || '').trim();
        if (!selectedRegional) return units;

        const unidadesPorRegional = data?.filters?.unidadesPorRegional || {};
        const regionalKey = Object.keys(unidadesPorRegional).find((key) => normalizeText(key) === normalizeText(selectedRegional));
        const allowedUnitNames = new Set((unidadesPorRegional[regionalKey] || []).map((name) => normalizeText(name)));
        if (!allowedUnitNames.size) return [];

        return (units || []).filter((u) => allowedUnitNames.has(normalizeText(u.nome)));
    }, [units, filters.regional, data?.filters?.unidadesPorRegional]);

    useEffect(() => {
        if (useSharedFilters) return;
        const visibleIds = new Set((visibleUnits || []).map((u) => String(u.id)));
        setSelectedUnitIds((current) => {
            if (filters.unidade) {
                const next = visibleIds.has(String(filters.unidade)) ? [String(filters.unidade)] : [];
                return areSameIds(current, next) ? current : next;
            }
            if (!filters.regional) {
                const allIds = (units || []).map((u) => String(u.id));
                return areSameIds(current, allIds) ? current : allIds;
            }
            const kept = current.filter((id) => visibleIds.has(String(id)));
            const next = kept.length > 0 ? kept : (visibleUnits || []).map((u) => String(u.id));
            return areSameIds(current, next) ? current : next;
        });
    }, [visibleUnits, filters.regional, filters.unidade, units, useSharedFilters]);

    useEffect(() => {
        if (useSharedFilters) return;
        if (!filters.unidade) return;
        const existsInVisible = (visibleUnits || []).some((u) => String(u.id) === String(filters.unidade));
        if (!existsInVisible) {
            setFilters((current) => ({ ...current, unidade: '' }));
        }
    }, [filters.unidade, visibleUnits, useSharedFilters]);

    const displayedRows = useMemo(() => {
        if (filters.turno !== 'TOTAL') {
            return data.rows;
        }

        const grouped = data.rows.reduce((accumulator, row) => {
            const current = accumulator.get(row.dataPrevista) || {
                dataPrevista: row.dataPrevista,
                dataLabel: row.dataLabel,
                demandaEstimada: 0,
                faixaMin: 0,
                faixaMax: 0,
                confianca: 'Alta'
            };

            current.demandaEstimada += Number(row.demandaEstimada) || 0;
            current.faixaMin += Number(row.faixaMin) || 0;
            current.faixaMax += Number(row.faixaMax) || 0;

            const rowConf = String(row.confianca || '').toLowerCase();
            if (rowConf === 'baixa' || rowConf === 'b') {
                current.confianca = 'Baixa';
            } else if ((rowConf === 'media' || rowConf === 'Media' || rowConf.startsWith('m')) && current.confianca !== 'Baixa') {
                current.confianca = 'Media';
            }

            accumulator.set(row.dataPrevista, current);
            return accumulator;
        }, new Map());

        return Array.from(grouped.values()).sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
    }, [data.rows, filters.turno]);

    const scopedRows = useMemo(
        () =>
            displayedRows.filter((row) => {
                const rowMonth = row.dataPrevista?.slice(5, 7);
                const rowYear = row.dataPrevista?.slice(0, 4);
                return rowMonth === selectedMonth && rowYear === selectedYear;
            }),
        [displayedRows, selectedMonth, selectedYear]
    );

    const chartDataByQuinzena = useMemo(() => {
        const baseRows = scopedRows.map((row) => {
            const date = new Date(`${row.dataPrevista}T12:00:00-03:00`);
            const day = Number(row.dataPrevista.slice(8, 10));
            return {
                ...row,
                day,
                chartLabel: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            };
        });

        return {
            q1: baseRows.filter((row) => row.day >= 1 && row.day <= 15),
            q2: baseRows.filter((row) => row.day >= 16)
        };
    }, [scopedRows]);

    const fetchPrediction = async () => {
        const response = await fetch(`/api/manager/predição-analítica?${queryString}`);
        const payload = await readApiResponse(response);
        if (!response.ok) throw new Error(payload.error || payload.details || 'Falha ao carregar predição analítica.');
        setData(payload);
    };

    const handleDownloadHtmlReport = () => {
        if (!scopedRows.length) return;

        const generatedLabel = formatDateTime(data.generatedAt);
        const turnoLabel = filters.turno || 'TOTAL';
        const unidadeLabel = selectedUnitNames.length ? selectedUnitNames.join(' | ') : (filters.unidade || 'Todas as unidades');
        const regionalLabel = filters.regional || 'Todas as regionais';
        const rowsHtml = scopedRows
            .map(
                (row) => `
                    <tr class="border-b border-slate-100">
                        <td class="px-5 py-4">
                            <div class="font-black text-slate-900">${escapeHtml(row.dataLabel)}</div>
                            <div class="text-xs font-medium text-slate-400">${escapeHtml(row.dataPrevista)}</div>
                        </td>
                        <td class="px-5 py-4 font-bold text-slate-700">${escapeHtml(filters.turno === 'TOTAL' ? 'Rede consolidada' : row.unidade)}</td>
                        <td class="px-5 py-4 text-slate-500">${escapeHtml(filters.turno === 'TOTAL' ? `${unidadeLabel} / ${regionalLabel}` : row.regional)}</td>
                        <td class="px-5 py-4">
                            <span class="inline-flex rounded-full bg-sky-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">
                                ${escapeHtml(filters.turno === 'TOTAL' ? 'TOTAL' : row.turno)}
                            </span>
                        </td>
                        <td class="px-5 py-4 text-center">
                            <span class="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
                                row.confianca === 'Alta'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : row.confianca === 'Media'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-rose-100 text-rose-700'
                            }">
                                ${escapeHtml(row.confianca)}
                            </span>
                            <div class="mt-2 max-w-[16rem] text-[10px] leading-4 text-slate-400">${escapeHtml(row.motivoConfianca || '-')}</div>
                        </td>
                        <td class="px-5 py-4 text-center font-black text-slate-800">${escapeHtml(row.scoreConfianca)}</td>
                        <td class="px-5 py-4 text-center font-bold text-slate-600">${escapeHtml(row.amostraHistorica)}</td>
                        <td class="px-5 py-4 text-center font-bold text-slate-600">${escapeHtml(row.volatilidadeRelativa)}</td>
                        <td class="px-5 py-4 text-right font-bold text-slate-700">${escapeHtml(`${row.faixaMin} - ${row.faixaMax}`)}</td>
                        <td class="px-5 py-4 text-right text-lg font-black text-emerald-700">${escapeHtml(row.demandaEstimada)}</td>
                    </tr>
                `
            )
            .join('');

        const htmlReport = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatorio de Predicao Analitica</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-100 p-8 text-slate-900 antialiased lg:p-16">
    <div class="mx-auto max-w-7xl">
        <header class="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#020617_0%,#0f172a_48%,#0b3b5e_100%)] px-8 py-10 text-white shadow-2xl">
            <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div class="text-[11px] font-black uppercase tracking-[0.45em] text-sky-300">Gestor Master</div>
                    <h1 class="mt-3 text-4xl font-black tracking-tight lg:text-5xl">Predicao Analitica</h1>
                    <p class="mt-3 max-w-3xl text-sm text-slate-300">
                        Relatorio gerado a partir da visao atual do módulo, respeitando unidade, regional e turno selecionados.
                    </p>
                </div>
                <div class="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-4 text-right">
                    <div class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Gerado em</div>
                    <div class="mt-2 text-lg font-black">${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
                    <div class="mt-2 text-xs text-slate-400">Ultima execucao do modelo: ${escapeHtml(generatedLabel)}</div>
                </div>
            </div>
        </header>

        <section class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Demanda total</div>
                <div class="mt-3 text-4xl font-black text-sky-700">${escapeHtml(data.summary.totalDemand)}</div>
            </div>
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Linhas exibidas</div>
                <div class="mt-3 text-4xl font-black text-emerald-700">${escapeHtml(scopedRows.length)}</div>
            </div>
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Dias projetados</div>
                <div class="mt-3 text-4xl font-black text-fuchsia-700">${escapeHtml(data.summary.totalDays)}</div>
            </div>
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Score medio</div>
                <div class="mt-3 text-4xl font-black text-amber-600">${escapeHtml(data.summary.diagnostics?.avgConfidenceScore || 0)}</div>
            </div>
        </section>

        <section class="mt-8 rounded-[1.75rem] bg-white p-6 shadow-lg">
            <div class="grid gap-4 md:grid-cols-4">
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Unidade</div>
                    <div class="mt-2 text-sm font-black text-slate-800">${escapeHtml(unidadeLabel)}</div>
                </div>
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Regional</div>
                    <div class="mt-2 text-sm font-black text-slate-800">${escapeHtml(regionalLabel)}</div>
                </div>
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Turno</div>
                    <div class="mt-2 text-sm font-black text-slate-800">${escapeHtml(turnoLabel)}</div>
                </div>
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Pico previsto</div>
                    <div class="mt-2 text-sm font-black text-slate-800">${escapeHtml(data.summary.peakDay?.label || '-')}</div>
                </div>
            </div>
        </section>

        <section class="mt-8 overflow-hidden rounded-[1.75rem] bg-white shadow-lg">
            <div class="border-b border-slate-100 px-6 py-5">
                <h2 class="text-2xl font-black tracking-tight text-slate-900">Tabela da previsao</h2>
                <p class="mt-1 text-sm text-slate-500">
                    ${escapeHtml(
                        filters.turno === 'TOTAL'
                            ? 'Visao consolidada por dia com base no filtro atual.'
                            : 'Detalhamento do turno selecionado no módulo de predição.'
                    )}
                </p>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-[1220px] w-full text-left text-sm">
                    <thead class="bg-slate-900 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                        <tr>
                            <th class="px-5 py-4">Data</th>
                            <th class="px-5 py-4">${escapeHtml(filters.turno === 'TOTAL' ? 'Escopo' : 'Unidade')}</th>
                            <th class="px-5 py-4">${escapeHtml(filters.turno === 'TOTAL' ? 'Filtro aplicado' : 'Regional')}</th>
                            <th class="px-5 py-4">Turno</th>
                            <th class="px-5 py-4 text-center">Confianca</th>
                            <th class="px-5 py-4 text-center">Score</th>
                            <th class="px-5 py-4 text-center">Amostra</th>
                            <th class="px-5 py-4 text-center">Volat.</th>
                            <th class="px-5 py-4 text-right">Faixa</th>
                            <th class="px-5 py-4 text-right">Demanda</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </section>
    </div>
</body>
</html>
        `;

        const blob = new Blob([htmlReport], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PREDICAO_ANALITICA_${turnoLabel}_${new Date().getTime()}.html`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const toggleSelectedUnit = (unitId) => {
        setFilters((current) => (current.unidade ? { ...current, unidade: '' } : current));
        setSelectedUnitIds((current) =>
            current.includes(String(unitId)) ? current.filter((id) => id !== String(unitId)) : [...current, String(unitId)]
        );
    };

    useEffect(() => {
        if (!session?.id || !isMaster) return;
        let cancelled = false;

        (async () => {
            try {
                const response = await fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(session.id)}`);
                const payload = await readApiResponse(response);
                if (!cancelled && response.ok) {
                    const list = Array.isArray(payload) ? payload : [];
                    setUnits(list);
                    if (selectedUnitIds.length === 0) {
                        setSelectedUnitIds(list.map((u) => String(u.id)));
                    }
                }
            } catch {
                if (!cancelled) setUnits([]);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [session?.id, isMaster]);

    useEffect(() => {
        if (!session?.id || !isMaster) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const response = await fetch(`/api/manager/predição-analítica?${queryString}`);
                const payload = await readApiResponse(response);
                if (!response.ok) throw new Error(payload.error || payload.details || 'Falha ao carregar predição analítica.');
                if (!cancelled) setData(payload);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [queryString, session?.id, isMaster]);

    const handleRecalculate = async () => {
        setRecalculating(true);
        setError('');
        try {
            const response = await fetch('/api/manager/predição-analítica/recalcular', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gestorId: session.id })
            });
            const payload = await readApiResponse(response);
            if (!response.ok) throw new Error(payload.error || payload.details || 'Falha ao recalcular a previsão.');
            await fetchPrediction();
        } catch (err) {
            setError(err.message);
        } finally {
            setRecalculating(false);
        }
    };

    if (!isMaster) {
        return (
            <div className="rounded-[2rem] border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">
                Este módulo é exclusivo do gestor master.
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.24),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(34,197,94,0.18),transparent_35%),linear-gradient(160deg,#020617_0%,#0f172a_55%,#111827_100%)] p-6">
                <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-sky-300/80">Monitoramento</p>
                        <h2 className="mt-2 flex items-center gap-3 text-3xl font-black text-white md:text-4xl">
                            <BrainCircuit className="text-sky-300" size={34} />
                            Análise Preditiva
                        </h2>
                        <p className="mt-3 text-sm text-slate-300">
                            Utilização padrão do painel com foco em projeção de demanda e estabilidade por período.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
                            <div className="font-black uppercase tracking-widest text-slate-500">Última execução</div>
                            <div className="mt-1 text-sm font-bold text-white">{formatDateTime(data.generatedAt)}</div>
                        </div>
                        <button
                            type="button"
                            onClick={handleDownloadHtmlReport}
                            disabled={!scopedRows.length || loading}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-black text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Download size={16} />
                            Baixar HTML
                        </button>
                        <button
                            type="button"
                            onClick={handleRecalculate}
                            disabled={recalculating}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCcw size={16} className={recalculating ? 'animate-spin' : ''} />
                            {recalculating ? 'Recalculando...' : 'Recalcular'}
                        </button>
                    </div>
                </div>

                {!useSharedFilters ? (
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Mês</label>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 py-3 px-4 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                        >
                            {monthOptions.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Ano</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 py-3 px-4 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                        >
                            {yearOptions.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Unidade</label>
                        <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 py-3 px-4 text-sm font-black text-sky-200">
                            Multiunidades ({selectedUnitIds.length || units.length})
                        </div>
                    </div>
                </div>
                ) : null}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Demanda total</p>
                    <p className="mt-1 text-2xl font-black text-sky-300">{data.summary.totalDemand}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Linhas previstas</p>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{data.summary.totalRows}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Dias projetados</p>
                    <p className="mt-1 text-2xl font-black text-fuchsia-300">{data.summary.totalDays}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Média por linha</p>
                    <p className="mt-1 text-2xl font-black text-amber-300">{data.summary.averageDemandPerRow}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Pico previsto</p>
                    <p className="mt-1 text-lg font-black text-white">{data.summary.peakDay?.label || '-'}</p>
                    <p className="text-xs text-slate-400">{data.summary.peakDay ? `${data.summary.peakDay.demand} atendimentos` : 'Sem dados'}</p>
                </div>
                <div 
                    onClick={() => setIsStabilityModalOpen(true)}
                    className={`${metricClass} cursor-pointer group transition-all duration-300 hover:scale-[1.02] hover:border-sky-500/50 hover:shadow-[0_0_20px_-10px_rgba(14,165,233,0.3)]`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Confiança</p>
                        <AlertCircle size={12} className="text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="mt-1 text-sm font-black text-white">
                        A {data.summary.confidenceCounts?.Alta || 0} | M {data.summary.confidenceCounts?.Media || 0} | <span className="text-rose-400">B {data.summary.confidenceCounts?.Baixa || 0}</span>
                    </p>
                    <p className="text-xs text-slate-400">distribuição simples da estabilidade</p>
                    <p className="mt-1 text-[9px] font-black uppercase text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver diagnóstico </p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Amostra baixa</p>
                    <p className="mt-1 text-2xl font-black text-rose-300">{data.summary.diagnostics?.lowSampleRows || 0}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Alta volatilidade</p>
                    <p className="mt-1 text-2xl font-black text-amber-300">{data.summary.diagnostics?.highVolatilityRows || 0}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Score médio</p>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{data.summary.diagnostics?.avgConfidenceScore || 0}</p>
                </div>
            </section>

            {!useSharedFilters ? (
            <section className={cardClass}>
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-black text-white">
                            <Filter size={18} className="text-sky-400" />
                            Filtros da previsão
                        </h3>
                        <p className="mt-1 text-sm text-slate-400">A visão padrão é consolidada da rede, com recortes por unidade, regional e turno.</p>
                    </div>
                    <div className="text-sm text-slate-400">
                        Unidade com maior volume: <span className="font-black text-white">{data.summary.topUnit?.unidade || '-'}</span>
                    </div>
                </div>

                <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <MapPinned size={12} className="text-sky-400" />
                            Comparação por unidades
                        </label>
                        <div className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300">
                            {selectedUnitIds.length || visibleUnits.length} selecionada(s)
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {visibleUnits.map((u) => {
                            const active = selectedUnitIds.includes(String(u.id));
                            return (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => toggleSelectedUnit(u.id)}
                                    className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-tight transition ${
                                        active
                                            ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                                            : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                                    }`}
                                >
                                    {u.nome}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div>
                        <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <TrendingUp size={12} className="text-emerald-400" />
                            Regional
                        </label>
                        <select
                            value={filters.regional}
                            onChange={(event) => setFilters((current) => ({ ...current, regional: event.target.value }))}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                        >
                            <option value="">Todas as regionais</option>
                            {data.filters.regionais.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <MapPinned size={12} className="text-sky-400" />
                            Unidade
                        </label>
                        <select
                            value={filters.unidade}
                            onChange={(event) => {
                                const nextUnitId = event.target.value;
                                setFilters((current) => ({ ...current, unidade: nextUnitId }));
                                if (nextUnitId) setSelectedUnitIds([String(nextUnitId)]);
                            }}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                        >
                            <option value="">Todas as unidades</option>
                            {visibleUnits.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                    {unit.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <CalendarDays size={12} className="text-amber-400" />
                            Turno
                        </label>
                        <select
                            value={filters.turno}
                            onChange={(event) => setFilters((current) => ({ ...current, turno: event.target.value }))}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-400"
                        >
                            <option value="TOTAL">TOTAL</option>
                            <option value="MANHA">MANHA</option>
                            <option value="TARDE">TARDE</option>
                            <option value="NOITE">NOITE</option>
                            <option value="MADRUGADA">MADRUGADA</option>
                        </select>
                    </div>
                </div>
            </section>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
                <section className={cardClass}>
                    <div className="mb-4 flex items-center gap-2 text-white">
                        <TrendingUp size={18} className="text-sky-400" />
                        <h3 className="text-lg font-black">Previsão por dia - 1ª quinzena</h3>
                    </div>
                    <p className="mb-4 text-sm text-slate-400">
                        Colunas interativas da visão atual do filtro, com os números previstos visíveis acima de cada barra.
                    </p>
                    <div className="h-[22rem]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartDataByQuinzena.q1} margin={{ top: 18, right: 10, left: 4, bottom: 24 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="chartLabel"
                                    stroke="#94a3b8"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    interval={0}
                                    tickMargin={8}
                                />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend />
                                <Bar dataKey="demandaEstimada" fill="#38bdf8" name="Demanda prevista" radius={[8, 8, 0, 0]}>
                                    <LabelList dataKey="demandaEstimada" position="top" fill="#bae6fd" fontSize={11} fontWeight={800} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {chartDataByQuinzena.q1.length === 0 ? (
                        <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-slate-500">
                            Sem dados previstos para a 1ª quinzena com os filtros atuais.
                        </p>
                    ) : null}
                </section>

                <section className={cardClass}>
                    <div className="mb-4 flex items-center gap-2 text-white">
                        <TrendingUp size={18} className="text-emerald-400" />
                        <h3 className="text-lg font-black">Previsão por dia - 2ª quinzena</h3>
                    </div>
                    <p className="mb-4 text-sm text-slate-400">
                        Comparativo da segunda metade do período previsto, acompanhando o mesmo recorte da tabela.
                    </p>
                    <div className="h-[22rem]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartDataByQuinzena.q2} margin={{ top: 18, right: 10, left: 4, bottom: 24 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="chartLabel"
                                    stroke="#94a3b8"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    interval={0}
                                    tickMargin={8}
                                />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend />
                                <Bar dataKey="demandaEstimada" fill="#34d399" name="Demanda prevista" radius={[8, 8, 0, 0]}>
                                    <LabelList dataKey="demandaEstimada" position="top" fill="#bbf7d0" fontSize={11} fontWeight={800} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {chartDataByQuinzena.q2.length === 0 ? (
                        <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-slate-500">
                            Sem dados previstos para a 2ª quinzena com os filtros atuais.
                        </p>
                    ) : null}
                </section>
            </section>

            {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

            <section className={cardClass}>
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-white">Tabela da previsão para 30 dias</h3>
                        <p className="text-sm text-slate-400">
                            {filters.turno === 'TOTAL'
                                ? 'Visão inicial consolidada por dia. Use o filtro de turno para ver o detalhamento.'
                                : 'Detalhamento do turno selecionado com dados persistidos em `dados_predição`.'}
                        </p>
                    </div>
                    <div className="text-sm text-slate-400">{scopedRows.length} linhas exibidas</div>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                    </div>
                ) : scopedRows.length === 0 ? (
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/30 px-4 py-12 text-center text-slate-500">
                        Nenhum dado de predição disponível para os filtros selecionados.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-[1.5rem] border border-slate-800 bg-slate-950/20">
                        <table className="min-w-[1260px] w-full text-left text-sm">
                            <thead className="bg-slate-900/60 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th className="px-5 py-4">Data</th>
                                    <th className="px-5 py-4">{filters.turno === 'TOTAL' ? 'Escopo' : 'Unidade'}</th>
                                    <th className="px-5 py-4">{filters.turno === 'TOTAL' ? 'Filtro aplicado' : 'Regional'}</th>
                                    <th className="px-5 py-4">Turno</th>
                                    <th className="px-5 py-4 text-center">Confiança</th>
                                    <th className="px-5 py-4 text-center">Score</th>
                                    <th className="px-5 py-4 text-center">Amostra</th>
                                    <th className="px-5 py-4 text-center">Volat.</th>
                                    <th className="px-5 py-4 text-right">Faixa</th>
                                    <th className="px-5 py-4 text-right">Demanda estimada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {scopedRows.map((row) => (
                                    <tr key={`${row.dataPrevista}-${row.unidade || 'total'}-${row.turno || 'TOTAL'}`} className="hover:bg-slate-800/20 transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="font-black text-white">{row.dataLabel}</div>
                                            <div className="text-xs text-slate-500">{row.dataPrevista}</div>
                                        </td>
                                        <td className="px-5 py-4 font-bold text-slate-200">
                                            {filters.turno === 'TOTAL' ? 'Rede consolidada' : row.unidade}
                                        </td>
                                        <td className="px-5 py-4 text-slate-400">
                                            {filters.turno === 'TOTAL'
                                                ? [filters.unidade || 'Todas unidades', filters.regional || 'Todas regionais'].join(' / ')
                                                : row.regional}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-sky-300">
                                                {filters.turno === 'TOTAL' ? 'TOTAL' : row.turno}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span
                                                className={`inline-flex rounded-xl border px-3 py-1 text-xs font-black ${
                                                    row.confianca === 'Alta'
                                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                                        : row.confianca === 'Media'
                                                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                                                        : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                                                }`}
                                            >
                                                {row.confianca}
                                            </span>
                                            <div className="mt-1 max-w-[16rem] text-[10px] leading-4 text-slate-500">{row.motivoConfianca}</div>
                                        </td>
                                        <td className="px-5 py-4 text-center font-black text-white">{row.scoreConfianca}</td>
                                        <td className="px-5 py-4 text-center text-slate-300">{row.amostraHistorica}</td>
                                        <td className="px-5 py-4 text-center text-slate-300">{row.volatilidadeRelativa}</td>
                                        <td className="px-5 py-4 text-right text-sm font-bold text-slate-300">
                                            {row.faixaMin} - {row.faixaMax}
                                        </td>
                                        <td className="px-5 py-4 text-right text-lg font-black text-emerald-300">{row.demandaEstimada}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Modal de Diagnóstico de Estabilidade (Baixa Confiança - B) */}
            {isStabilityModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all animate-in fade-in duration-300">
                    <div 
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
                        onClick={() => setIsStabilityModalOpen(false)} 
                    />
                    <div className={cardClass + " relative w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl border-slate-700 ring-1 ring-sky-500/20"}>
                        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-5">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400">
                                    <AlertCircle size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Diagnóstico de Estabilidade</h3>
                                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">Detalhamento dos pontos de atenção (Baixa Confiança)</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsStabilityModalOpen(false)}
                                className="h-10 w-10 rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-6">
                            <div className="grid gap-4">
                                {scopedRows.filter(r => {
                                    const c = String(r.confianca || '').trim().toLowerCase();
                                    return !['alta', 'media', 'Media'].includes(c);
                                }).length === 0 ? (
                                    <div className="text-center py-12 bg-slate-900/40 rounded-[2rem] border border-slate-800 text-slate-500 font-bold">
                                        Nenhum alerta de instabilidade detectado na visão atual.
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/20">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-900/80 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-slate-800">
                                                <tr>
                                                    <th className="px-6 py-4">Data / Local</th>
                                                    <th className="px-6 py-4">Localização/Turno</th>
                                                    <th className="px-6 py-4">Diagnóstico do Robo</th>
                                                    <th className="px-6 py-4 text-right">Certeza</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {scopedRows.filter(r => {
                                                    const c = String(r.confianca || '').trim().toLowerCase();
                                                    return !['alta', 'media', 'Media'].includes(c);
                                                }).map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-rose-500/5 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="font-black text-white uppercase tracking-tight">{row.dataLabel}</div>
                                                            <div className="text-[10px] text-slate-500">{row.dataPrevista}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="font-bold text-slate-300 uppercase text-xs">{row.unidade || 'Rede'}</div>
                                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">{row.turno || 'TOTAL'}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-rose-200/80 text-xs leading-relaxed italic border-l-2 border-rose-500/30 pl-3">
                                                                "{row.motivoConfianca || 'Sazonalidade extrema ou variabilidade histórica detectada.'}"
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="text-lg font-black text-rose-400 tracking-tighter">{row.scoreConfianca || (row.confianca === 'Baixa' ? 40 : 65)}%</div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-rose-500/5 rounded-2xl p-4 border border-rose-500/10 flex items-start gap-4">
                            <div className="h-8 w-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 flex-shrink-0 animate-pulse">
                                <Zap size={16} />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-rose-200 uppercase tracking-widest mb-1">Ação Sugerida</h4>
                                <p className="text-xs text-rose-200/60 leading-relaxed">
                                    Para estes dias marcados com <span className="font-black text-rose-400">estabilidade baixa</span>, o robô sugere manter uma margem de segurança de profissionais de sobreaviso, pois houve comportamento atípico no histórico.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}




