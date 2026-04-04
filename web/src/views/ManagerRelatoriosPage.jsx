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
import { readApiResponse } from '../utils/api';

const MONTHS = [
    { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
];

const cardClass = 'overflow-hidden rounded-[2rem] border border-slate-700/70 bg-slate-900/40 p-6 shadow-xl backdrop-blur-sm';
const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
const areSameIds = (left = [], right = []) =>
    left.length === right.length && left.every((value, index) => String(value) === String(right[index]));

export default function ManagerRelatoriosPage() {
    const { session } = useAuth();
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

        const unidadesPorRegional = reportData?.filters?.unidadesPorRegional || {};
        const regionalKey = Object.keys(unidadesPorRegional).find((key) => normalizeText(key) === normalizeText(selectedRegionalValue));
        const allowedUnitNames = new Set((unidadesPorRegional[regionalKey] || []).map((name) => normalizeText(name)));
        if (!allowedUnitNames.size) return [];
        return (units || []).filter((u) => allowedUnitNames.has(normalizeText(u.nome)));
    }, [units, selectedRegional, reportData?.filters?.unidadesPorRegional]);

    const yearOptions = useMemo(() => {
        const current = new Date().getFullYear();
        const options = [];
        for (let y = current - 2; y <= current + 2; y++) options.push(String(y));
        return options;
    }, []);

    const fetchUnits = async () => {
        try {
            const resp = await fetch(`/api/manager/unidades?gestorId=${session.id}`);
            const data = await readApiResponse(resp);
            const unitList = Array.isArray(data) ? data : [];
            setUnits(unitList);
            if (session.isMaster && selectedUnitIds.length === 0) {
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

    useEffect(() => { fetchUnits(); }, []);
    useEffect(() => { fetchReport(); }, [selectedMonth, selectedYear, selectedUnit, selectedUnitIds, selectedRegional, selectedTurno]);

    const toggleSelectedUnit = (unitId) => {
        setSelectedUnitIds((current) => {
            const next = current.includes(String(unitId)) ? current.filter((id) => id !== String(unitId)) : [...current, String(unitId)];
            return areSameIds(current, next) ? current : next;
        });
    };

    useEffect(() => {
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
    }, [visibleUnits, session.isMaster, selectedRegional, units]);

    const handleGenerateProfessionalReport = () => {
        if (!reportData) return;

        const selectedNames = visibleUnits
            .filter((u) => selectedUnitIds.includes(String(u.id)))
            .map((u) => String(u.nome || '').toUpperCase())
            .filter(Boolean);
        const unitLabel = session.isMaster
            ? (selectedNames.length ? selectedNames.join(' | ') : 'CONSOLIDADO REDE')
            : (selectedUnit === 'all' ? 'CONSOLIDADO REDE' : units.find(u => String(u.id) === String(selectedUnit))?.nome?.toUpperCase());
        const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label?.toUpperCase();
        
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
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
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Control Panel */}
            <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-700/60 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.24),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(34,197,94,0.18),transparent_35%),linear-gradient(160deg,#020617_0%,#0f172a_55%,#111827_100%)] p-8 shadow-2xl backdrop-blur-md">
                <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-sky-300/80">Monitoramento</p>
                        <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Relatórios de Gestão</h1>
                        <p className="mt-2 text-sm text-slate-300">Utilização padrão do painel com finalidades diferentes por módulo.</p>
                        
                        {/* Tabs Navigation */}
                        <div className="mt-8 flex gap-2 rounded-2xl bg-slate-950/40 p-1.5 w-fit border border-slate-800">
                            <button
                                onClick={() => setActiveTab('efetividade')}
                                className={`flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-black transition-all ${
                                    activeTab === 'efetividade'
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <LineChart size={18} />
                                1. Efetividade
                            </button>
                            <button
                                onClick={() => setActiveTab('produtividade')}
                                className={`flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-black transition-all ${
                                    activeTab === 'produtividade'
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <Users size={18} />
                                2. Produtividade
                            </button>
                            <button
                                onClick={() => setActiveTab('cancelamentos')}
                                className={`flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-black transition-all ${
                                    activeTab === 'cancelamentos'
                                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <Ban size={18} />
                                3. Cancelamentos
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-4 lg:gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <CalendarDays size={12} className="text-blue-400" />
                                Período Referência
                            </label>
                            <div className="flex gap-2">
                                <select 
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500 transition"
                                >
                                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <select 
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500 transition"
                                >
                                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <Filter size={12} className="text-sky-400" />
                                Regional
                            </label>
                            <select
                                value={selectedRegional}
                                onChange={(e) => setSelectedRegional(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500 transition sm:min-w-[220px]"
                            >
                                <option value="">Todas as regionais</option>
                                {(reportData?.filters?.regionaisDisponiveis || []).map((regional) => (
                                    <option key={regional} value={regional}>
                                        {regional}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <CalendarDays size={12} className="text-amber-400" />
                                Turno
                            </label>
                            <select
                                value={selectedTurno}
                                onChange={(e) => setSelectedTurno(e.target.value)}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500 transition sm:min-w-[220px]"
                            >
                                <option value="ALL">Todos os turnos</option>
                                {(reportData?.filters?.turnosDisponiveis || []).map((turno) => (
                                    <option key={turno} value={turno}>
                                        {turno}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!session.isMaster ? (
                            <div className="w-full space-y-2 lg:w-64">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Unidade Foco</label>
                                <select
                                    value={selectedUnit}
                                    onChange={(e) => setSelectedUnit(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500 transition"
                                >
                                    {units.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                </select>
                            </div>
                        ) : null}
                        
                        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto lg:mb-0.5">
                            <button 
                                onClick={handleGenerateProfessionalReport}
                                className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 py-4 text-white transition hover:bg-blue-500 shadow-xl shadow-blue-900/30 ring-2 ring-blue-500/20 sm:w-auto"
                            >
                                <Zap size={18} className="text-orange-400" />
                                <span className="text-sm font-black uppercase tracking-tighter">Gerar Relatório</span>
                            </button>
                        </div>
                    </div>
                </div>

                {session.isMaster ? (
                    <div className="mt-6 rounded-2xl border border-slate-700/80 bg-slate-950/40 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Comparação multiunidade</div>
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
                ) : null}
            </div>

            {loading && (
                <div className="flex h-96 flex-col items-center justify-center rounded-[2.5rem] bg-slate-900/10 border border-slate-800/30 backdrop-blur-sm">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mb-4" />
                    <p className="text-slate-500 font-bold tracking-widest uppercase text-xs">Sincronizando Base Operacional...</p>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-5 rounded-[2.5rem] border border-rose-500/30 bg-rose-500/10 p-10 text-rose-200">
                    <AlertCircle size={32} />
                    <div>
                        <h3 className="text-xl font-black">Houve um problema</h3>
                        <p className="text-rose-100/70">{error}</p>
                    </div>
                </div>
            )}

            {!loading && !error && reportData && (
                <div className="space-y-6">
                    {activeTab === 'efetividade' && (
                        <div className="grid gap-6">
                            <section className={cardClass}>
                                <div className="mb-8 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-2xl bg-blue-500/10 p-2.5 text-blue-400">
                                            <BarChart3 size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Efetividade Operacional</h2>
                                            <p className="text-sm text-slate-400 uppercase font-bold tracking-widest">Consolidado de Ocupação de Escalas</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-[350px] mb-12">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={reportData.occupancyByUnit.slice(0, 15)} margin={{ top: 20, bottom: 20, left: 10, right: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                            <XAxis dataKey="unidade" stroke="#94a3b8" fontSize={9} angle={-30} textAnchor="end" height={60} interval={0} />
                                            <YAxis stroke="#94a3b8" fontSize={9} />
                                            <Tooltip 
                                                cursor={{fill: '#38bdf805'}}
                                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '16px' }}
                                                itemStyle={{ fontWeight: '800' }}
                                            />
                                            <Legend verticalAlign="top" height={40} iconType="circle" />
                                            <Bar dataKey="totalOcupadas" name="Ocupadas" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={20}>
                                                <LabelList dataKey="totalOcupadas" position="top" fill="#60a5fa" fontSize={9} fontWeights={900} />
                                            </Bar>
                                            <Bar dataKey="totalVazias" name="Vazias" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20}>
                                                <LabelList dataKey="totalVazias" position="top" fill="#fb923c" fontSize={9} fontWeight={900} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/20">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-900/60 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-slate-800">
                                            <tr>
                                                <th className="px-6 py-5">Unidade Hospitalar</th>
                                                <th className="px-6 py-5 text-center">Vagas Totais</th>
                                                <th className="px-6 py-5 text-center">Ocupadas</th>
                                                <th className="px-6 py-5 text-center">Vazias</th>
                                                <th className="px-6 py-5 text-right">Efetividade</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40">
                                            {reportData.occupancyByUnit.map((u, i) => (
                                                <tr key={i} className="hover:bg-slate-800/10 transition-colors">
                                                    <td className="px-6 py-4 font-black text-slate-200 uppercase tracking-tighter">{u.unidade}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-slate-500">{u.totalSlots}</td>
                                                    <td className="px-6 py-4 text-center text-blue-400 font-black">{u.totalOcupadas}</td>
                                                    <td className="px-6 py-4 text-center text-orange-400 font-black">{u.totalVazias}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black ${
                                                            u.percentual > 80 ? 'text-green-400' : 'text-orange-400'
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
                        <div className="grid gap-6">
                            <section className={cardClass}>
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="rounded-2xl bg-blue-500/10 p-2.5 text-blue-400">
                                        <TrendingUp size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Análise de Produtividade</h2>
                                        <p className="text-sm text-slate-400 uppercase font-bold tracking-widest">Ranking de Atendimentos por Médico</p>
                                    </div>
                                </div>

                                <div className="max-h-[600px] overflow-y-auto custom-scrollbar rounded-2xl border border-slate-800">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <tr>
                                                <th className="px-6 py-5">Médico / CRM</th>
                                                <th className="px-6 py-5">Unidade Hospitalar</th>
                                                <th className="px-6 py-5 text-center">Quantitativo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40 bg-slate-950/20">
                                            {reportData.doctorShifts.map((d, i) => (
                                                <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-black text-slate-200 uppercase tracking-tight text-xs">{d.medico}</div>
                                                        <div className="text-[10px] font-bold text-slate-500">CRM: {d.crm}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-400 font-bold uppercase text-[10px] tracking-widest">{d.unidade}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="text-3xl font-black text-blue-500 tracking-tighter">{d.total}</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className={cardClass}>
                                <div className="mb-6 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-2xl bg-orange-500/10 p-2.5 text-orange-400">
                                            <ArrowLeftRight size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Demandas Intermediadas</h2>
                                            <p className="text-sm text-slate-400 uppercase font-bold tracking-widest">Histórico de Trocas de Plantão</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/20">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-900/60 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                                            <tr>
                                                <th className="px-6 py-5">Hospital</th>
                                                <th className="px-6 py-5 text-center">Período</th>
                                                <th className="px-6 py-5">Movimentação</th>
                                                <th className="px-6 py-5 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40">
                                            {reportData.swapDemands.map((s, i) => (
                                                <tr key={i} className="hover:bg-slate-800/20">
                                                    <td className="px-6 py-4 font-black text-slate-300 uppercase text-xs tracking-tight">{s.unidade}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="font-bold text-white">{new Date(s.data).toLocaleDateString()}</div>
                                                        <div className="text-[10px] text-blue-400 uppercase font-black tracking-widest">{s.turno}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">Solic</span>
                                                                <span className="text-[11px] font-bold text-slate-400">{s.solicitante}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded">Alvo</span>
                                                                <span className="text-[11px] font-bold text-slate-400">{s.alvo}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-block rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-slate-900 text-slate-400 border border-slate-800">
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
                        <div className="grid gap-6">
                            <section className={cardClass}>
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="rounded-2xl bg-rose-500/10 p-2.5 text-rose-400">
                                        <Ban size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Cancelamentos de Plantão</h2>
                                        <p className="text-sm text-slate-400 uppercase font-bold tracking-widest">Pedidos de saída da escala no período</p>
                                    </div>
                                </div>

                                {(!reportData.cancelamentos || reportData.cancelamentos.length === 0) ? (
                                    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 py-12 text-center">
                                        <p className="text-slate-500 font-bold">Nenhum cancelamento registado neste período.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/20">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-900/60 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                                                <tr>
                                                    <th className="px-6 py-5">Médico</th>
                                                    <th className="px-6 py-5">Unidade</th>
                                                    <th className="px-6 py-5 text-center">Data</th>
                                                    <th className="px-6 py-5 text-center">Turno</th>
                                                    <th className="px-6 py-5 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {reportData.cancelamentos.map((c, i) => {
                                                    const statusColor = c.status === 'APROVADO'
                                                        ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                                        : c.status === 'RECUSADO'
                                                        ? 'text-slate-400 bg-slate-800 border-slate-700'
                                                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                                                    return (
                                                        <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="font-black text-slate-200 text-xs uppercase tracking-tight">{c.medico}</div>
                                                                <div className="text-[10px] font-bold text-slate-500">CRM: {c.crm}</div>
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest">{c.unidade}</td>
                                                            <td className="px-6 py-4 text-center font-mono text-sm text-slate-300">
                                                                {new Date(`${c.data}T12:00:00-03:00`).toLocaleDateString('pt-BR')}
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className="inline-flex rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-black uppercase text-slate-400">{c.turno}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className={`inline-block rounded-lg border px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${statusColor}`}>
                                                                    {c.status === 'PENDENTE' ? 'Pendente' : c.status === 'APROVADO' ? 'Aprovado' : 'Recusado'}
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



