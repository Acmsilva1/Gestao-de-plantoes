import React, { useState, useEffect, useMemo } from 'react';
import { 
    Users, 
    BarChart3, 
    ArrowLeftRight, 
    AlertCircle,
    FileCode,
    LineChart,
    ChevronRight,
    TrendingUp,
    FileText,
    Zap,
    CalendarDays,
    Ban,
    Filter
} from 'lucide-react';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Legend,
    LabelList
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../models/api';

const MONTHS = [
    { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
];
const cardClass = 'overflow-hidden rounded-[2rem] border border-slate-700/40 bg-[#1e2030]/60 p-8 shadow-2xl backdrop-blur-xl';
const areSameIds = (left = [], right = []) =>
    left.length === right.length && left.every((value, index) => String(value) === String(right[index]));

export default function ManagerRelatoriosPage({ embedded = false, sharedFilters = null }) {
    const { session } = useAuth();
    const useSharedFilters = Boolean(embedded && sharedFilters);
    const [activeTab, setActiveTab] = useState('efetividade'); 
    const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
    const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
    const [selectedUnit, setSelectedUnit] = useState(session.isMaster ? 'all' : session.unidade_id);
    const [selectedUnitIds, setSelectedUnitIds] = useState([]);
    const [selectedRegional, setSelectedRegional] = useState('');
    const [selectedTurno, setSelectedTurno] = useState('ALL');
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [reportData, setReportData] = useState(null);
    const resumoTopo = useMemo(() => {
        const rows = reportData?.occupancyByUnit || [];
        const totalSlots = rows.reduce((sum, r) => sum + (Number(r.totalSlots) || 0), 0);
        const totalOcupadas = rows.reduce((sum, r) => sum + (Number(r.totalOcupadas) || 0), 0);
        const totalVazias = rows.reduce((sum, r) => sum + (Number(r.totalVazias) || 0), 0);
        return { totalSlots, totalOcupadas, totalVazias };
    }, [reportData]);
    const visibleUnits = useMemo(() => {
        const selectedRegionalValue = String(selectedRegional || '').trim();
        if (!selectedRegionalValue) return units;

        const allow = reportData?.filters?.allowedUnidadeIdsForRegional;
        if (Array.isArray(allow) && allow.length > 0) {
            const set = new Set(allow.map(String));
            return (units || []).filter((u) => set.has(String(u.id)));
        }

        const unidadesPorRegional = reportData?.filters?.unidadesPorRegional || {};
        const norm = (v) =>
            String(v || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();
        const regionalKey = Object.keys(unidadesPorRegional).find((key) => norm(key) === norm(selectedRegionalValue));
        const allowedUnitNames = new Set((unidadesPorRegional[regionalKey] || []).map((name) => norm(name)));
        if (!allowedUnitNames.size) return [];
        return (units || []).filter((u) => allowedUnitNames.has(norm(u.nome)));
    }, [units, selectedRegional, reportData?.filters?.allowedUnidadeIdsForRegional, reportData?.filters?.unidadesPorRegional]);

    const yearOptions = useMemo(() => {
        const current = new Date().getFullYear();
        const options = [];
        for (let y = current - 2; y <= current + 2; y++) options.push(String(y));
        return options;
    }, []);

    const fetchUnits = async () => {
        try {
            const resp = await fetch(`/api/manager/unidades?gestorId=${encodeURIComponent(session.id)}`);
            const data = await readApiResponse(resp);
            const unitList = Array.isArray(data) ? data : [];
            setUnits(unitList);
            if (session.isMaster && !useSharedFilters && selectedUnitIds.length === 0) {
                setSelectedUnitIds(unitList.map((u) => String(u.id)));
            }
        } catch (err) {
            console.error('Erro ao buscar unidades:', err);
        }
    };

    const fetchReport = async () => {
        setLoading(true);
        setError('');
        try {
            const monthStr = `${selectedYear}-${selectedMonth}`;
            const params = new URLSearchParams();
            params.set('month', monthStr);
            params.set('gestorId', session.id);
            if (session.isMaster) {
                if (selectedUnitIds.length > 0) params.set('unidadeIds', selectedUnitIds.join(','));
                else params.set('unidadeId', 'all');
            } else {
                params.set('unidadeId', selectedUnit);
            }
            if (selectedRegional) params.set('regional', selectedRegional);
            if (selectedTurno && selectedTurno !== 'ALL') params.set('turno', selectedTurno);
            const url = `/api/manager/reports?${params.toString()}`;
            const resp = await fetch(url);
            const data = await readApiResponse(resp);
            if (!resp.ok) throw new Error(data.error || 'Falha ao buscar relatório');
            setReportData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const sharedUnitIdsKey = sharedFilters?.unitIds?.map?.((id) => String(id)).join(',') ?? '';

    useEffect(() => {
        if (!useSharedFilters || !sharedFilters) return;
        const unitIds = (sharedFilters.unitIds || []).map((id) => String(id)).filter(Boolean);
        if (sharedFilters.month) setSelectedMonth(sharedFilters.month);
        if (sharedFilters.year) setSelectedYear(sharedFilters.year);
        setSelectedRegional(sharedFilters.regional || '');
        setSelectedTurno(sharedFilters.turno && sharedFilters.turno !== 'TOTAL' ? sharedFilters.turno : 'ALL');
        setSelectedUnitIds((prev) => (areSameIds(prev, unitIds) ? prev : unitIds));
        if (unitIds[0]) setSelectedUnit((u) => (String(u) === String(unitIds[0]) ? u : unitIds[0]));
    }, [
        useSharedFilters,
        sharedFilters?.month,
        sharedFilters?.year,
        sharedFilters?.regional,
        sharedFilters?.turno,
        sharedUnitIdsKey
    ]);

    useEffect(() => {
        fetchUnits();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sessão estável na montagem
    }, []);

    useEffect(() => {
        fetchReport();
        // selectedUnitIds como join evita novo fetch só por nova referência de array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, selectedYear, selectedUnit, selectedUnitIds.join(','), selectedRegional, selectedTurno]);

    const toggleSelectedUnit = (unitId) => {
        setSelectedUnitIds((current) => {
            const next = current.includes(String(unitId)) ? current.filter((id) => id !== String(unitId)) : [...current, String(unitId)];
            return areSameIds(current, next) ? current : next;
        });
    };

    useEffect(() => {
        if (useSharedFilters) return;
        if (!session.isMaster) return;
        const allowedIds = new Set((visibleUnits || []).map((u) => String(u.id)));
        setSelectedUnitIds((current) => {
            if (!selectedRegional) {
                const allIds = (units || []).map((u) => String(u.id));
                    return areSameIds(current, allIds) ? current : allIds;
                }
            const kept = current.filter((id) => allowedIds.has(String(id)));
            const next = kept.length > 0 ? kept : (visibleUnits || []).map((u) => String(u.id));
            return areSameIds(current, next) ? current : next;
        });
    }, [visibleUnits, session.isMaster, selectedRegional, units, useSharedFilters]);

    const occupancyChartData = useMemo(() => {
        return reportData?.occupancyByUnit ? reportData.occupancyByUnit.slice(0, 15) : [];
    }, [reportData?.occupancyByUnit]);

    const handleGenerateProfessionalReport = () => {
        if (!reportData) return;

        const selectedNames = visibleUnits
            .filter((u) => selectedUnitIds.includes(String(u.id)))
            .map((u) => String(u.nome || '').toUpperCase())
            .filter(Boolean);
        const unitLabel = session.isMaster
            ? (selectedNames.length ? selectedNames.join(' | ') : 'CONSOLIDADO REDE')
            : (selectedUnit === 'all' ? 'CONSOLIDADO REDE' : units.find((u) => String(u.id) === String(selectedUnit))?.nome?.toUpperCase?.() || 'CONSOLIDADO REDE');
        const monthLabel = MONTHS.find(m => m.value === selectedMonth).label.toUpperCase();
        
        const occupancyRows = reportData.occupancyByUnit.map((u, idx) => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-4 px-6">
                    <div class="flex items-center gap-3">
                        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-900 text-[10px] font-black text-white">${idx + 1}</span>
                        <span class="font-black uppercase tracking-tight text-blue-900">${u.unidade}</span>
                    </div>
                </td>
                <td class="py-4 px-6 text-center font-bold text-slate-500">${u.totalSlots}</td>
                <td class="py-4 px-6 text-center font-black text-blue-600">${u.totalOcupadas}</td>
                <td class="py-4 px-6 text-center font-black text-orange-600">${u.totalVazias}</td>
                <td class="py-4 px-6 text-right">
                    <span class="inline-block rounded-full px-4 py-1 text-xs font-black uppercase tracking-tight ${u.percentual > 80 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}">
                        ${u.percentual}%
                    </span>
                </td>
            </tr>
        `).join('');

        const doctorRows = reportData.doctorShifts.map(d => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-4 px-6">
                    <div class="font-black uppercase tracking-tight text-blue-900">${d.medico}</div>
                    <div class="text-[10px] font-bold text-slate-400">CRM: ${d.crm}</div>
                </td>
                <td class="py-4 px-6 font-bold text-slate-600 uppercase text-xs">${d.unidade}</td>
                <td class="py-4 px-6 text-center font-black text-blue-600 text-xl tracking-tight">${d.total}</td>
            </tr>
        `).join('');

        const swapRows = reportData.swapDemands.map(s => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-4 px-6 font-black uppercase tracking-tight text-blue-900 text-xs">${s.unidade}</td>
                <td class="py-4 px-6">
                    <div class="font-black text-blue-600 uppercase text-xs">${new Date(s.data).toLocaleDateString()}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${s.turno}</div>
                </td>
                <td class="py-4 px-6">
                    <div class="flex items-center gap-2 text-xs">
                        <span class="font-black text-blue-900 uppercase">DE:</span> <span class="font-bold text-slate-500">${s.solicitante}</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs mt-1">
                        <span class="font-black text-blue-900 uppercase">PARA:</span> <span class="font-bold text-slate-500">${s.alvo}</span>
                    </div>
                </td>
                <td class="py-4 px-6 text-center">
                    <span class="rounded-lg bg-slate-100 border border-slate-200 px-3 py-1 text-[9px] font-black uppercase text-slate-600 tracking-widest">
                        ${s.status.replace(/_/g, ' ')}
                    </span>
                </td>
            </tr>
        `).join('');

        const htmlReport = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatórios de Gestão - André Standard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2family=Inter:wght@400;600;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-8 lg:p-20">
    <div class="max-w-5xl mx-auto">
        <!-- HEADER PADRÃO -->
        <header class="flex flex-col gap-8 md:flex-row md:items-end md:justify-between border-b-8 border-blue-900 pb-12 transition-all">
            <div>
                <div class="flex items-center gap-3 text-blue-600 mb-4 animate-pulse">
                    <i class="fas fa-microchip text-2xl"></i>
                    <span class="text-xs font-black uppercase tracking-[0.4em]">Gestão Operacional de TI</span>
                </div>
                <h1 class="text-6xl font-black uppercase tracking-tight text-blue-900 leading-none">Relatórios de Gestão</h1>
            </div>
            <div class="text-right">
                <div class="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Processamento de Dados</div>
                <div class="text-3xl font-black text-blue-900 tracking-tighter">${new Date().toLocaleDateString('pt-BR')}</div>
            </div>
        </header>

        <!-- INFO GRID -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 mb-20">
            <div class="bg-white p-8 rounded-2xl shadow-md border-l-8 border-blue-600">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Período Referência</div>
                <div class="text-2xl font-black text-blue-900 uppercase tracking-tight">${monthLabel} ${selectedYear}</div>
            </div>
            <div class="bg-white p-8 rounded-2xl shadow-md border-l-8 border-blue-600">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Parâmetro de Unidade</div>
                <div class="text-2xl font-black text-blue-900 uppercase tracking-tight">${unitLabel}</div>
            </div>
            <div class="bg-white p-8 rounded-2xl shadow-md border-l-8 border-green-500">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Relator Responsável</div>
                <div class="text-2xl font-black text-blue-900 uppercase tracking-tight">${session.nome.toUpperCase()}</div>
            </div>
        </div>

        <!-- 1. EFETIVIDADE -->
        <section class="mb-20">
            <div class="flex items-center gap-4 mb-10 border-l-8 border-blue-900 pl-6">
                <div class="h-14 w-14 rounded-2xl bg-blue-900 flex items-center justify-center text-white text-2xl">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div>
                    <h2 class="text-3xl font-black uppercase tracking-tight text-blue-900">Efetividade de Escala</h2>
                    <p class="text-sm font-bold text-slate-400 uppercase tracking-widest">Análise de Cobertura Hospitalar</p>
                </div>
            </div>
            <div class="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-blue-900 text-white text-[10px] font-black uppercase tracking-widest text-center">
                        <tr>
                            <th class="py-6 px-6 text-left">Unidade</th>
                            <th class="py-6 px-6">Slots</th>
                            <th class="py-6 px-6">Ocupadas</th>
                            <th class="py-6 px-6">Vazias</th>
                            <th class="py-6 px-6 text-right">Performance</th>
                        </tr>
                    </thead>
                    <tbody>${occupancyRows}</tbody>
                </table>
            </div>
        </section>

        <!-- 2. PRODUTIVIDADE -->
        <section class="mb-20">
            <div class="flex items-center gap-4 mb-10 border-l-8 border-blue-900 pl-6">
                <div class="h-14 w-14 rounded-2xl bg-blue-900 flex items-center justify-center text-white text-2xl">
                    <i class="fas fa-user-md"></i>
                </div>
                <div>
                    <h2 class="text-3xl font-black uppercase tracking-tight text-blue-900">Produtividade Médica</h2>
                    <p class="text-sm font-bold text-slate-400 uppercase tracking-widest">Engajamento de Profissionais na Rede</p>
                </div>
            </div>
            <div class="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-blue-900 text-white text-[10px] font-black uppercase tracking-widest">
                        <tr>
                            <th class="py-6 px-6">Profissional</th>
                            <th class="py-6 px-6">Unidade Foco</th>
                            <th class="py-6 px-6 text-center">Plantões Solicitados</th>
                        </tr>
                    </thead>
                    <tbody>${doctorRows}</tbody>
                </table>
            </div>
        </section>

        <!-- 3. DEMANDAS DE TROCA (TIMELINE STYLE) -->
        <section class="mb-20">
            <div class="flex items-center gap-4 mb-10 border-l-8 border-blue-900 pl-6">
                <div class="h-14 w-14 rounded-2xl bg-blue-900 flex items-center justify-center text-white text-2xl">
                    <i class="fas fa-exchange-alt"></i>
                </div>
                <div>
                    <h2 class="text-3xl font-black uppercase tracking-tight text-blue-900">Log de Intermediações</h2>
                    <p class="text-sm font-bold text-slate-400 uppercase tracking-widest">Controle de Trocas e Demandas</p>
                </div>
            </div>
            <div class="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-blue-900 text-white text-[10px] font-black uppercase tracking-widest">
                        <tr>
                            <th class="py-6 px-6">Hospital</th>
                            <th class="py-6 px-6">Período</th>
                            <th class="py-6 px-6">Movimentação Médica</th>
                            <th class="py-6 px-6 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>${swapRows}</tbody>
                </table>
            </div>
        </section>

        <!-- FOOTER SIMPLES -->
        <footer class="mt-20 border-t-2 border-slate-200 pt-8 text-center pb-20">
            <div class="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Fim do Relatório Operacional</div>
        </footer>
    </div>
</body>
</html>
        `;

        const blob = new Blob([htmlReport], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RELATORIO_GESTÃO_${selectedMonth}_${selectedYear}.html`;
        a.click();
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Control Panel */}
            <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-700/40 bg-[#262a41]/60 p-10 shadow-2xl backdrop-blur-xl">
                <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#2DE0B9]/5 blur-3xl" />
                
                <div className="flex flex-col gap-10 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-[#2DE0B9]">Inteligência Operacional</p>
                        <h1 className="mt-3 text-5xl font-black tracking-tight text-white sm:text-6xl">Relatórios de Gestão</h1>
                        <p className="mt-4 text-slate-400 font-medium max-w-xl">Análise profunda de produtividade, efetividade de escalas e log de cancelamentos por período.</p>
                        
                        {/* Tabs Navigation */}
                        <div className="mt-10 flex flex-wrap gap-2.5 rounded-2xl bg-[#1e2235]/60 p-2 w-fit border border-slate-700/60 shadow-inner">
                            <button
                                onClick={() => setActiveTab('efetividade')}
                                className={`flex items-center gap-3 rounded-xl px-7 py-3.5 text-sm font-black transition-all ${
                                    activeTab === 'efetividade'
                                        ? 'bg-[#2DE0B9] text-navy shadow-[0_8px_20px_-6px_rgba(45,224,185,0.4)]'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                }`}
                            >
                                <LineChart size={18} />
                                1. Efetividade
                            </button>
                            <button
                                onClick={() => setActiveTab('produtividade')}
                                className={`flex items-center gap-3 rounded-xl px-7 py-3.5 text-sm font-black transition-all ${
                                    activeTab === 'produtividade'
                                        ? 'bg-[#2DE0B9] text-navy shadow-[0_8px_20px_-6px_rgba(45,224,185,0.4)]'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                }`}
                            >
                                <Users size={18} />
                                2. Produtividade
                            </button>
                            <button
                                onClick={() => setActiveTab('cancelamentos')}
                                className={`flex items-center gap-3 rounded-xl px-7 py-3.5 text-sm font-black transition-all ${
                                    activeTab === 'cancelamentos'
                                        ? 'bg-[#E0B92D] text-navy shadow-[0_8px_20px_-6px_rgba(224,185,45,0.3)]'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                }`}
                            >
                                <Ban size={18} />
                                3. Cancelamentos
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-5">
                        <div className={useSharedFilters ? 'hidden' : 'space-y-3'}>
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <CalendarDays size={12} className="text-[#2DE0B9]" />
                                Mês / Ano
                            </label>
                            <div className="flex gap-2.5">
                                <select 
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="rounded-2xl border border-slate-700 bg-[#1e2235] px-5 py-3.5 text-sm font-bold text-white outline-none focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)] transition"
                                >
                                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <select 
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="rounded-2xl border border-slate-700 bg-[#1e2235] px-5 py-3.5 text-sm font-bold text-white outline-none focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)] transition"
                                >
                                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className={useSharedFilters ? 'hidden' : 'space-y-3'}>
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <Filter size={12} className="text-[#2DE0B9]" />
                                Regional
                            </label>
                            <select
                                value={selectedRegional}
                                onChange={(e) => setSelectedRegional(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-5 py-3.5 text-sm font-bold text-white outline-none focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)] transition sm:min-w-[220px]"
                            >
                                <option value="">Todas as regionais</option>
                                {(reportData?.filters?.regionaisDisponiveis || []).map((regional) => (
                                    <option key={regional} value={regional}>
                                        {regional}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={useSharedFilters ? 'hidden' : 'space-y-3'}>
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <Zap size={12} className="text-[#E0B92D]" />
                                Turno
                            </label>
                            <select
                                value={selectedTurno}
                                onChange={(e) => setSelectedTurno(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-5 py-3.5 text-sm font-bold text-white outline-none focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)] transition sm:min-w-[220px]"
                            >
                                <option value="ALL">Cada turno</option>
                                {(reportData?.filters?.turnosDisponiveis || []).map((turno) => (
                                    <option key={turno} value={turno}>
                                        {turno}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!session.isMaster && !useSharedFilters ? (
                            <div className="w-full space-y-3 lg:w-64">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Unidade Foco</label>
                                <select
                                    value={selectedUnit}
                                    onChange={(e) => setSelectedUnit(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-[#1e2235] px-5 py-3.5 text-sm font-bold text-white outline-none focus:border-[#2DE0B9] focus:shadow-[0_0_0_3px_rgba(45,224,185,0.1)] transition"
                                >
                                    {units.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                </select>
                            </div>
                        ) : null}
                        
                        <div className="flex w-full gap-3 sm:ml-auto sm:w-auto lg:mb-1">
                            <button 
                                onClick={handleGenerateProfessionalReport}
                                className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-[#2DE0B9] px-7 py-4 text-navy transition hover:opacity-90 shadow-xl shadow-[#2DE0B9]/20 font-black uppercase text-sm tracking-tight sm:w-auto"
                            >
                                <Zap size={18} />
                                <span>Gerar Relatório</span>
                            </button>
                        </div>
                    </div>
                </div>

                {session.isMaster && !useSharedFilters ? (
                    <div className="mt-8 rounded-[2rem] border border-slate-700/40 bg-[#1e2235]/60 p-6">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Comparação multiunidade</div>
                            <div className="rounded-full border border-[#2DE0B9]/30 bg-[#2DE0B9]/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#2DE0B9]">
                                {selectedUnitIds.length || visibleUnits.length} selecionada(s)
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            {visibleUnits.map((u) => {
                                const active = selectedUnitIds.includes(String(u.id));
                                return (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => toggleSelectedUnit(u.id)}
                                        className={`rounded-xl border px-4 py-2.5 text-[11px] font-black uppercase tracking-tight transition-all duration-300 ${
                                            active
                                                ? 'border-[#2DE0B9]/50 bg-[#2DE0B9]/20 text-[#2DE0B9] shadow-[0_4px_12px_-4px_rgba(45,224,185,0.3)]'
                                                : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                                        }`}
                                    >
                                        {u.nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>

            {loading && (
                <div className="flex h-96 flex-col items-center justify-center rounded-[3rem] bg-[#1e2030]/20 border border-slate-800/40 backdrop-blur-sm">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#2DE0B9] border-t-transparent mb-6" />
                    <p className="text-slate-500 font-bold tracking-widest uppercase text-xs">Sincronizando Base Operacional...</p>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-6 rounded-[3rem] border border-rose-500/30 bg-rose-500/10 p-12 text-rose-200">
                    <AlertCircle size={40} />
                    <div>
                        <h3 className="text-2xl font-black">Houve um problema de conexão</h3>
                        <p className="text-rose-100/70 mt-1 font-medium">{error}</p>
                    </div>
                </div>
            )}

            {!loading && !error && reportData && (
                <div className="space-y-8">
                    {activeTab === 'efetividade' && (
                        <div className="grid gap-8">
                            <section className={cardClass}>
                                <div className="mb-10 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="rounded-2xl bg-[#2DE0B9]/10 p-3 text-[#2DE0B9]">
                                            <BarChart3 size={28} />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black text-white uppercase tracking-tight">Efetividade Operacional</h2>
                                            <p className="text-sm text-slate-400 uppercase font-bold tracking-widest mt-1">Consolidado de Ocupação de Escalas</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-12 h-[400px] min-h-[300px] min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={occupancyChartData} margin={{ top: 20, bottom: 20, left: 10, right: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                                            <XAxis dataKey="unidade" stroke="#94a3b8" fontSize={10} angle={-30} textAnchor="end" height={80} interval={0} tick={{fontWeight: '700'}} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tick={{fontWeight: '700'}} />
                                            <Tooltip 
                                                cursor={{fill: '#2DE0B908'}}
                                                contentStyle={{ background: '#1e2235', border: '1px solid #334155', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                                                itemStyle={{ fontWeight: '900', fontSize: '12px' }}
                                            />
                                            <Legend verticalAlign="top" height={50} iconType="circle" wrapperStyle={{fontWeight: '900', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.1em'}} />
                                            <Bar dataKey="totalOcupadas" name="Ocupadas" fill="#2DE0B9" radius={[6, 6, 0, 0]} barSize={24}>
                                                <LabelList dataKey="totalOcupadas" position="top" fill="#2DE0B9" fontSize={10} fontWeight={900} />
                                            </Bar>
                                            <Bar dataKey="totalVazias" name="Vazias" fill="#E0B92D" radius={[6, 6, 0, 0]} barSize={24}>
                                                <LabelList dataKey="totalVazias" position="top" fill="#E0B92D" fontSize={10} fontWeight={900} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="overflow-hidden rounded-[2rem] border border-slate-700/60 bg-[#1e2235]/40 backdrop-blur-md">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-900/80 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 border-b border-slate-700/60">
                                            <tr>
                                                <th className="px-8 py-6">Unidade Hospitalar</th>
                                                <th className="px-8 py-6 text-center">Vagas Totais</th>
                                                <th className="px-8 py-6 text-center">Ocupadas</th>
                                                <th className="px-8 py-6 text-center">Vazias</th>
                                                <th className="px-8 py-6 text-right">Efetividade</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60">
                                            {reportData.occupancyByUnit.map((u, i) => (
                                                <tr key={i} className="hover:bg-white/[0.03] transition-colors group">
                                                    <td className="px-8 py-5 font-black text-slate-200 uppercase tracking-tight group-hover:text-[#2DE0B9] transition-colors">{u.unidade}</td>
                                                    <td className="px-8 py-5 text-center font-bold text-slate-500">{u.totalSlots}</td>
                                                    <td className="px-8 py-5 text-center text-[#2DE0B9] font-black">{u.totalOcupadas}</td>
                                                    <td className="px-8 py-5 text-center text-[#E0B92D] font-black">{u.totalVazias}</td>
                                                    <td className="px-8 py-5 text-right">
                                                        <span className={`inline-block px-4 py-1.5 rounded-xl text-xs font-black tracking-widest ${
                                                            u.percentual > 80 ? 'bg-[#2DE0B9]/15 text-[#2DE0B9]' : 'bg-[#E0B92D]/15 text-[#E0B92D]'
                                                        }`}>
                                                            {u.percentual}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'produtividade' && (
                        <div className="grid gap-8">
                            <section className={cardClass}>
                                <div className="mb-8 flex items-center gap-4">
                                    <div className="rounded-2xl bg-[#2DE0B9]/10 p-3 text-[#2DE0B9]">
                                        <TrendingUp size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Análise de Produtividade</h2>
                                        <p className="text-sm text-slate-400 uppercase font-bold tracking-widest mt-1">Ranking de Atendimentos por Médico</p>
                                    </div>
                                </div>

                                <div className="max-h-[600px] overflow-y-auto custom-scrollbar rounded-[2rem] border border-slate-700/60 bg-[#1e2235]/40">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <tr>
                                                <th className="px-8 py-6">Médico / CRM</th>
                                                <th className="px-8 py-6">Unidade Hospitalar</th>
                                                <th className="px-8 py-6 text-center">Quantitativo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40">
                                            {reportData.doctorShifts.map((d, i) => (
                                                <tr key={i} className="hover:bg-white/[0.03] transition-colors group">
                                                    <td className="px-8 py-5">
                                                        <div className="font-black text-slate-200 uppercase tracking-tight text-sm group-hover:text-[#2DE0B9] transition-colors">{d.medico}</div>
                                                        <div className="text-[10px] font-black text-slate-500 tracking-widest mt-0.5">CRM: {d.crm}</div>
                                                    </td>
                                                    <td className="px-8 py-5 text-slate-400 font-bold uppercase text-[10px] tracking-widest">{d.unidade}</td>
                                                    <td className="px-8 py-5 text-center">
                                                        <div className="text-4xl font-black text-[#2DE0B9] tracking-tighter drop-shadow-lg">{d.total}</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className={cardClass}>
                                <div className="mb-8 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="rounded-2xl bg-[#E0B92D]/10 p-3 text-[#E0B92D]">
                                            <ArrowLeftRight size={28} />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black text-white uppercase tracking-tight">Movimentações de Troca</h2>
                                            <p className="text-sm text-slate-400 uppercase font-bold tracking-widest mt-1">Histórico Detalhado Intermediado</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto rounded-[2rem] border border-slate-700/60 bg-[#1e2235]/40 backdrop-blur-md">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-700/60">
                                            <tr>
                                                <th className="px-8 py-6">Complexo Hospitalar</th>
                                                <th className="px-8 py-6 text-center">Data / Turno</th>
                                                <th className="px-8 py-6">Fluxo de Profissionais</th>
                                                <th className="px-8 py-6 text-center">Status Final</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40">
                                            {reportData.swapDemands.map((s, i) => (
                                                <tr key={i} className="hover:bg-white/[0.03] transition-colors group">
                                                    <td className="px-8 py-5 font-black text-slate-300 uppercase text-xs tracking-tight group-hover:text-[#2DE0B9] transition-colors">{s.unidade}</td>
                                                    <td className="px-8 py-5 text-center">
                                                        <div className="font-black text-white tracking-widest">{new Date(s.data).toLocaleDateString('pt-BR')}</div>
                                                        <div className="text-[10px] text-[#2DE0B9] uppercase font-black tracking-[0.2em] mt-1">{s.turno}</div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-[#2DE0B9]/15 text-[#2DE0B9] border border-[#2DE0B9]/30 rounded-md">Solicitante</span>
                                                                <span className="text-xs font-bold text-slate-400 tracking-tight">{s.solicitante}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-[#E0B92D]/15 text-[#E0B92D] border border-[#E0B92D]/30 rounded-md">Alvo Troca</span>
                                                                <span className="text-xs font-bold text-slate-400 tracking-tight">{s.alvo}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <span className="inline-block rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-slate-900/60 text-slate-400 border border-slate-700/60">
                                                            {s.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'cancelamentos' && (
                        <div className="grid gap-8">
                            <section className={cardClass}>
                                <div className="mb-8 flex items-center gap-4">
                                    <div className="rounded-2xl bg-rose-500/10 p-3 text-rose-400">
                                        <Ban size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Log de Cancelamentos</h2>
                                        <p className="text-sm text-slate-400 uppercase font-bold tracking-widest mt-1">Sinalização de interrupção de escala</p>
                                    </div>
                                </div>

                                {(!reportData.cancelamentos || reportData.cancelamentos.length === 0) ? (
                                    <div className="rounded-[2rem] border border-slate-700/40 bg-[#1e2235]/40 py-16 text-center backdrop-blur-md">
                                        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Nenhum cancelamento encontrado para este período.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-[2rem] border border-slate-700/60 bg-[#1e2235]/40">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-700/60">
                                                <tr>
                                                    <th className="px-8 py-6">Profissional</th>
                                                    <th className="px-8 py-6">Complexo</th>
                                                    <th className="px-8 py-6 text-center">Data / Horário</th>
                                                    <th className="px-8 py-6 text-center">Escopo</th>
                                                    <th className="px-8 py-6 text-center">Status Final</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {reportData.cancelamentos.map((c, i) => {
                                                    const statusColor = c.status === 'APROVADO'
                                                        ? 'text-rose-400 bg-rose-500/15 border-rose-500/30 shadow-[0_0_15px_-5px_rgba(244,63,94,0.3)]'
                                                        : c.status === 'RECUSADO'
                                                        ? 'text-slate-400 bg-white/5 border-white/10'
                                                        : 'text-[#E0B92D] bg-[#E0B92D]/15 border-[#E0B92D]/30';
                                                    return (
                                                        <tr key={i} className="hover:bg-white/[0.03] transition-colors group">
                                                            <td className="px-8 py-5">
                                                                <div className="font-black text-slate-200 text-sm uppercase tracking-tight group-hover:text-rose-400 transition-colors">{c.medico}</div>
                                                                <div className="text-[10px] font-black text-slate-500 tracking-[0.2em] mt-1">CRM: {c.crm}</div>
                                                            </td>
                                                            <td className="px-8 py-5 text-slate-400 font-bold text-[11px] uppercase tracking-widest leading-none">{c.unidade}</td>
                                                            <td className="px-8 py-5 text-center">
                                                                <div className="font-black text-slate-300 tracking-wider text-sm">{new Date(`${c.data}T12:00:00-03:00`).toLocaleDateString('pt-BR')}</div>
                                                            </td>
                                                            <td className="px-8 py-5 text-center">
                                                                <span className="text-[10px] font-black text-[#2DE0B9] uppercase px-3 py-1 bg-[#2DE0B9]/10 border border-[#2DE0B9]/20 rounded-md tracking-tighter">{c.turno}</span>
                                                            </td>
                                                            <td className="px-8 py-5 text-center">
                                                                <span className={`inline-block rounded-xl px-5 py-2 text-[10px] font-black uppercase tracking-widest border ${statusColor}`}>
                                                                    {c.status.replace(/_/g, ' ')}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
