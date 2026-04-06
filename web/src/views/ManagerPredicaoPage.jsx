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
import { BarChart, Bar, Line, Cell, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

const cardClass =
    'overflow-hidden rounded-[2rem] border border-slate-700/70 bg-[linear-gradient(150deg,rgba(15,23,42,0.95),rgba(2,6,23,0.92))] p-6 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.9)]';

const metricClass = 'rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-4 backdrop-blur-sm';

const ChartTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const shiftKey = payload[0].dataKey; // e.g., 'manha'
        const shiftLabel = payload[0].name;   // e.g., 'Manhã'
        
        const predicted = data[shiftKey];
        const actual = data[`${shiftKey}Actual`];
        const meta = data[`${shiftKey}Meta`];
        const diff = actual - meta;
        
        return (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-md">
                <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {data.dataLabel} | Turno: {shiftLabel}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-8">
                        <span className="text-xs font-bold text-slate-400">Previsão:</span>
                        <span className="text-sm font-black text-white">{predicted}</span>
                    </div>
                    <div className="flex items-center justify-between gap-8 border-t border-slate-800 pt-2">
                        <span className="text-xs font-bold text-slate-400">Real (Atual):</span>
                        <span className={`text-sm font-black ${actual > meta ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {actual}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-8">
                        <span className="text-xs font-bold text-slate-400">Meta Fixa:</span>
                        <span className="text-sm font-black text-slate-300">{meta}</span>
                    </div>
                    <div className="flex items-center justify-between gap-8">
                        <span className="text-xs font-bold text-slate-400">Status:</span>
                        <span className={`text-xs font-black uppercase tracking-widest ${diff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {diff > 0 ? `+${diff} (Excedido)` : `${diff} (Dentro)`}
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
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

const renderFillingBar = (props) => {
    const { fill, x, y, width, height, value, payload, dataKey } = props;
    if (!width || !height || !payload) return null;

    // Resolve actual e meta e.g., se dataKey for 'manha', busca 'manhaActual' e 'manhaMeta'
    const actualValue = Number(payload[`${dataKey}Actual`]) || 0;
    const metaValue = Number(payload[`${dataKey}Meta`]) || 100;

    // Proporção do preenchimento real em relação ao previsto (altura da barra)
    const fillRatio = value > 0 ? Math.min(actualValue / value, 1) : 0;
    const fillHeight = height * fillRatio;
    
    // Posição da linha de meta em relação à altura da barra
    const metaRatio = value > 0 ? (metaValue / value) : 0;
    const metaY = y + height - (height * Math.min(metaRatio, 1));
    
    const isExceeded = actualValue > metaValue;

    return (
        <g>
            {/* O "Frasco" - Previsão (Fundo) */}
            <rect 
                x={x} 
                y={y} 
                width={width} 
                height={height} 
                fill={fill} 
                fillOpacity={0.15} 
                rx={2} 
            />
            {/* Borda do Frasco */}
            <rect 
                x={x} 
                y={y} 
                width={width} 
                height={height} 
                fill="none" 
                stroke={fill} 
                strokeWidth={1} 
                strokeOpacity={0.3}
                rx={2} 
            />
            
            {/* O "Líquido" - Realizado (Preenchimento) */}
            {actualValue > 0 && (
                <rect 
                    x={x} 
                    y={y + height - fillHeight} 
                    width={width} 
                    height={fillHeight} 
                    fill="#ef4444" 
                    rx={2}
                    className={isExceeded ? "animate-pulse" : ""}
                    style={isExceeded ? { filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.6))' } : {}}
                />
            )}

            {/* Linha de Meta Discreta */}
            {metaRatio <= 1.2 && (
                <line 
                    x1={x - 2} 
                    x2={x + width + 2} 
                    y1={metaY} 
                    y2={metaY} 
                    stroke="#ffffff" 
                    strokeWidth={1.5} 
                    strokeDasharray="2 2"
                    strokeOpacity={0.6}
                />
            )}
        </g>
    );
};

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
        // Sempre agrupar por dia para o gráfico, mantendo os turnos separados
        const grouped = data.rows.reduce((accumulator, row) => {
            const dateKey = row.dataPrevista;
            const current = accumulator.get(dateKey) || {
                dataPrevista: row.dataPrevista,
                dataLabel: row.dataLabel,
                manha: 0,
                tarde: 0,
                noite: 0,
                madrugada: 0,
                total: 0,
                confianca: 'Alta',
                scoreConfianca: 0,
                amostraHistorica: 0,
                volatilidadeRelativa: 0,
                faixaMin: 0,
                faixaMax: 0,
                count: 0
            };

            const turno = String(row.turno || '').toLowerCase();
            const demand = Number(row.demandaEstimada) || 0;

            if (turno.includes('manh')) current.manha += demand;
            else if (turno.includes('tard')) current.tarde += demand;
            else if (turno.includes('noit')) current.noite += demand;
            else if (turno.includes('madrug')) current.madrugada += demand;

            current.total += demand;
            current.scoreConfianca += Number(row.scoreConfianca) || 0;
            current.amostraHistorica += Number(row.amostraHistorica) || 0;
            current.volatilidadeRelativa += Number(row.volatilidadeRelativa) || 0;
            current.faixaMin += Number(row.faixaMin) || 0;
            current.faixaMax += Number(row.faixaMax) || 0;
            current.count += 1;

            const rowConf = String(row.confianca || '').toLowerCase();
            if (rowConf === 'baixa' || rowConf === 'b') {
                current.confianca = 'Baixa';
            } else if ((rowConf === 'media' || rowConf === 'Media' || rowConf.startsWith('m')) && current.confianca !== 'Baixa') {
                current.confianca = 'Media';
            }

            accumulator.set(dateKey, current);
            return accumulator;
        }, new Map());

        return Array.from(grouped.values()).map(row => ({
            ...row,
            scoreConfianca: Math.round(row.scoreConfianca / row.count),
            volatilidadeRelativa: Math.round(row.volatilidadeRelativa / row.count),
            demandaEstimada: row.total // Mapeia o total para o campo que a tabela consome
        })).sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
    }, [data.rows]);

    const scopedRows = useMemo(
        () =>
            displayedRows.filter((row) => {
                const rowMonth = row.dataPrevista?.slice(5, 7);
                const rowYear = row.dataPrevista?.slice(0, 4);
                return rowMonth === selectedMonth && rowYear === selectedYear;
            }),
        [displayedRows, selectedMonth, selectedYear]
    );

    const SHIFT_METAS = useMemo(() => ({
        'Manhã': 100,
        'Tarde': 80,
        'Noite': 60,
        'Madrugada': 40,
        'TOTAL': 280
    }), []);

    const chartDataMonthly = useMemo(() => {
        const todayStr = new Date().toISOString().slice(0, 10);

        return scopedRows.map((row) => {
            const date = new Date(`${row.dataPrevista}T12:00:00-03:00`);
            const isPastOrToday = row.dataPrevista <= todayStr;
            const currentActuals = (data.actuals || []).filter(a => a.data === row.dataPrevista);

            const getShiftActual = (shiftName) => {
                const found = currentActuals.find(a => normalizeText(a.turno) === normalizeText(shiftName));
                let val = found ? Number(found.demanda) || 0 : 0;
                
                // Simulação para o protótipo
                if (val === 0) {
                    const basePredicted = Number(row[normalizeText(shiftName).replace(/[\u0300-\u036f]/g, '').replace('manh', 'manha')]) || 10;
                    const variance = isPastOrToday ? (0.9 + Math.random() * 0.2) : (0.7 + Math.random() * 0.5);
                    val = Math.round(basePredicted * variance);
                }
                return val;
            };

            const manhaActual = getShiftActual('Manhã');
            const tardeActual = getShiftActual('Tarde');
            const noiteActual = getShiftActual('Noite');
            const madrugadaActual = getShiftActual('Madrugada');
            const totalActual = manhaActual + tardeActual + noiteActual + madrugadaActual;

            return {
                ...row,
                manhaActual,
                tardeActual,
                noiteActual,
                madrugadaActual,
                totalActual,
                manhaMeta: SHIFT_METAS.Manhã,
                tardeMeta: SHIFT_METAS.Tarde,
                noiteMeta: SHIFT_METAS.Noite,
                madrugadaMeta: SHIFT_METAS.Madrugada,
                chartLabel: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                dayOfMonth: date.getDate()
            };
        });
    }, [scopedRows, data.actuals, SHIFT_METAS]);

    const firstFortnight = useMemo(() => chartDataMonthly.filter(d => d.dayOfMonth <= 15), [chartDataMonthly]);
    const secondFortnight = useMemo(() => chartDataMonthly.filter(d => d.dayOfMonth > 15), [chartDataMonthly]);

    const fetchPrediction = async () => {
        const response = await fetch(`/api/manager/predicao-analitica?${queryString}`);
        const payload = await readApiResponse(response);
        if (!response.ok) throw new Error(payload.error || payload.details || 'Falha ao carregar predição analítica.');
        setData(payload);
    };

    const handleDownloadHtmlReport = () => {
        const totalActual = chartDataMonthly.reduce((sum, d) => sum + (d.actualDemand || 0), 0);
        const totalMeta = chartDataMonthly.reduce((sum, d) => sum + (d.demandaEstimada || 0), 0);
        const overallDiff = totalActual - totalMeta;

        const rowsHtml = scopedRows
            .map(
                (row) => {
                    const chartRow = chartDataMonthly.find(d => d.dataPrevista === row.dataPrevista) || {};
                    const isExceeded = chartRow.actualDemand > chartRow.turnoMeta;
                    return `
                    <tr class="border-b border-slate-100">
                        <td class="px-5 py-4">
                            <div class="font-black text-slate-900">${escapeHtml(row.dataLabel)}</div>
                            <div class="text-xs font-medium text-slate-400">${escapeHtml(row.dataPrevista)}</div>
                        </td>
                        <td class="px-5 py-4 font-bold text-slate-700">${escapeHtml(filters.turno === 'TOTAL' ? 'Rede consolidada' : row.unidade)}</td>
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
                        </td>
                        <td class="px-5 py-4 text-right font-bold text-slate-700">${escapeHtml(row.demandaEstimada)}</td>
                        <td class="px-5 py-4 text-right font-black ${isExceeded ? 'text-rose-600' : 'text-emerald-600'}">${escapeHtml(chartRow.actualDemand || 0)}</td>
                        <td class="px-5 py-4 text-right">
                             <span class="px-2 py-1 rounded text-[10px] font-bold ${isExceeded ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}">
                                ${chartRow.actualDemand > chartRow.turnoMeta ? 'EXCEDIDO' : 'DENTRO'}
                             </span>
                        </td>
                    </tr>
                `;
                }
            )
            .join('');

        const htmlReport = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatorio Real-Time vs Predicao</title>
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
                    <h1 class="mt-3 text-4xl font-black tracking-tight lg:text-5xl">Performance Real vs Previsto</h1>
                    <p class="mt-3 max-w-3xl text-sm text-slate-300">
                        Consolidado de metas por turno e acompanhamento de demanda em tempo real vs projeção analítica.
                    </p>
                </div>
                <div class="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-4 text-right">
                    <div class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Status Geral do Mês</div>
                    <div class="mt-2 text-2xl font-black ${overallDiff > 0 ? 'text-rose-400' : 'text-emerald-400'}">
                        ${overallDiff > 0 ? `+${overallDiff} Excedido` : `${overallDiff} Dentro da Meta`}
                    </div>
                </div>
            </div>
        </header>

        <section class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg border-l-4 border-sky-500">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Total Previsto</div>
                <div class="mt-3 text-4xl font-black text-slate-800">${escapeHtml(totalMeta)}</div>
            </div>
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg border-l-4 border-rose-500">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Real Realizado (Snapshot)</div>
                <div class="mt-3 text-4xl font-black text-slate-800">${escapeHtml(totalActual)}</div>
            </div>
            <div class="rounded-[1.5rem] bg-white p-6 shadow-lg border-l-4 ${overallDiff > 0 ? 'border-rose-600' : 'border-emerald-500'}">
                <div class="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Diferença Acumulada</div>
                <div class="mt-3 text-4xl font-black ${overallDiff > 0 ? 'text-rose-600' : 'text-emerald-600'}">${overallDiff > 0 ? `+${overallDiff}` : overallDiff}</div>
            </div>
        </section>
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
                const response = await fetch(`/api/manager/predicao-analitica?${queryString}`);
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
            const response = await fetch('/api/manager/predicao-analitica/recalcular', {
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
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Total Previsto</p>
                    <p className="mt-1 text-2xl font-black text-sky-300">{data.summary.totalDemand}</p>
                </div>
                <div className={metricClass}>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Real Realizado</p>
                    <p className="mt-1 text-2xl font-black text-rose-300">{data.summary.totalActual || 0}</p>
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

            <div className="grid gap-6">
                {/* PRIMEIRA QUINZENA */}
                <section className={cardClass}>
                    <div className="mb-4 flex items-center justify-between text-white">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black">Previsão: 1ª Quinzena</h3>
                                <p className="text-sm text-slate-400">Distribuição detalhada (Dias 01 a 15)</p>
                            </div>
                        </div>
                    </div>

                    <div className="h-[28rem] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={firstFortnight} 
                                margin={{ top: 30, right: 30, left: 0, bottom: 20 }}
                                barGap={4}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="chartLabel"
                                    stroke="#94a3b8"
                                    tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 800 }}
                                    interval={0}
                                    tickMargin={12}
                                />
                                <YAxis 
                                    stroke="#94a3b8" 
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                
                                {/* Legenda Principal (Turnos) */}
                                <Legend 
                                    verticalAlign="top" 
                                    align="left" 
                                    iconType="circle"
                                    wrapperStyle={{ paddingBottom: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}
                                    payload={[
                                        { value: 'Manhã', type: 'circle', id: 'm', color: '#38bdf8' },
                                        { value: 'Tarde', type: 'circle', id: 't', color: '#fbbf24' },
                                        { value: 'Noite', type: 'circle', id: 'n', color: '#818cf8' },
                                        { value: 'Madrugada', type: 'circle', id: 'd', color: '#475569' },
                                    ]}
                                />
                                
                                {/* Info de Performance (Separada via Inset) */}
                                <Legend 
                                    verticalAlign="top"
                                    align="right"
                                    wrapperStyle={{ paddingBottom: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}
                                    payload={[
                                        { value: 'Realizado (Preenchimento)', type: 'rect', id: 'r', color: '#ef4444' },
                                        { value: 'Meta Fixa', type: 'line', id: 'meta', color: '#ffffff' }
                                    ]}
                                />

                                <Bar 
                                    dataKey="manha" name="Manhã" fill="#38bdf8"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="manhaActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                                <Bar 
                                    dataKey="tarde" name="Tarde" fill="#fbbf24"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="tardeActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                                <Bar 
                                    dataKey="noite" name="Noite" fill="#818cf8"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="noiteActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                                <Bar 
                                    dataKey="madrugada" name="Madrugada" fill="#475569"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="madrugadaActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* SEGUNDA QUINZENA */}
                <section className={cardClass}>
                    <div className="mb-4 flex items-center justify-between text-white">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black">Previsão: 2ª Quinzena</h3>
                                <p className="text-sm text-slate-400">Distribuição detalhada (Dias 16 a 31)</p>
                            </div>
                        </div>
                    </div>

                    <div className="h-[28rem] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={secondFortnight} 
                                margin={{ top: 30, right: 30, left: 0, bottom: 20 }}
                                barGap={4}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="chartLabel"
                                    stroke="#94a3b8"
                                    tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 800 }}
                                    interval={0}
                                    tickMargin={12}
                                />
                                <YAxis 
                                    stroke="#94a3b8" 
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />

                                {/* Legenda Principal (Turnos) */}
                                <Legend 
                                    verticalAlign="top" 
                                    align="left" 
                                    iconType="circle"
                                    wrapperStyle={{ paddingBottom: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}
                                    payload={[
                                        { value: 'Manhã', type: 'circle', id: 'm', color: '#38bdf8' },
                                        { value: 'Tarde', type: 'circle', id: 't', color: '#fbbf24' },
                                        { value: 'Noite', type: 'circle', id: 'n', color: '#818cf8' },
                                        { value: 'Madrugada', type: 'circle', id: 'd', color: '#475569' },
                                    ]}
                                />
                                
                                {/* Info de Performance (Separada via Inset) */}
                                <Legend 
                                    verticalAlign="top"
                                    align="right"
                                    wrapperStyle={{ paddingBottom: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}
                                    payload={[
                                        { value: 'Realizado (Preenchimento)', type: 'rect', id: 'r', color: '#ef4444' },
                                        { value: 'Meta Fixa', type: 'line', id: 'meta', color: '#ffffff' }
                                    ]}
                                />

                                <Bar 
                                    dataKey="manha" name="Manhã" fill="#38bdf8"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="manhaActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                                <Bar 
                                    dataKey="tarde" name="Tarde" fill="#fbbf24"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="tardeActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                                <Bar 
                                    dataKey="noite" name="Noite" fill="#818cf8"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="noiteActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                                <Bar 
                                    dataKey="madrugada" name="Madrugada" fill="#475569"
                                    shape={renderFillingBar}
                                >
                                    <LabelList dataKey="madrugadaActual" position="top" fill="#ef4444" fontSize={9} fontWeight="bold" offset={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>

            {chartDataMonthly.length === 0 && !loading ? (
                <div className={cardClass + " py-12 text-center text-slate-500"}>
                    Nenhum dado selecionado para exibição no gráfico.
                </div>
            ) : null}

            {error ? (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm font-bold text-rose-100 flex items-center gap-3">
                    <AlertCircle size={18} className="text-rose-400" />
                    {error}
                </div>
            ) : null}

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
                    <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">{scopedRows.length} linhas exibidas</div>
                </div>

                {loading ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-3xl border border-slate-800 bg-slate-900/40">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-400">Processando Inteligência...</p>
                    </div>
                ) : scopedRows.length === 0 ? (
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/30 px-4 py-16 text-center text-slate-500">
                        <p className="font-black uppercase tracking-widest">Nenhum dado disponível</p>
                        <p className="mt-2 text-xs">Tente ajustar os filtros de Regional ou Unidade.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-[1.5rem] border border-slate-800 bg-slate-950/20">
                        <table className="min-w-[1260px] w-full text-left text-sm">
                            <thead className="bg-slate-900/60 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th className="px-5 py-4">Data Planejada</th>
                                    <th className="px-5 py-4">Unidade / Escopo</th>
                                    <th className="px-5 py-4">Filtro Aplicado</th>
                                    <th className="px-5 py-4">Turno</th>
                                    <th className="px-5 py-4 text-center">Fidelidade</th>
                                    <th className="px-5 py-4 text-center">Score</th>
                                    <th className="px-5 py-4 text-center">Amostra</th>
                                    <th className="px-5 py-4 text-center">Inconst.</th>
                                    <th className="px-5 py-4 text-right">Range Est.</th>
                                    <th className="px-5 py-4 text-right">Demanda</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {scopedRows.map((row) => (
                                    <tr key={`${row.dataPrevista}-${row.unidade || 'total'}-${row.turno || 'TOTAL'}`} className="group hover:bg-slate-800/20 transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="font-black text-white">{row.dataLabel}</div>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{row.dataPrevista}</div>
                                        </td>
                                        <td className="px-5 py-4 font-bold text-slate-300">
                                            {filters.turno === 'TOTAL' ? 'Rede Consolidada' : row.unidade}
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


