import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/context/AuthContext';
import DateRangePicker from '../../../shared/components/DateRangePicker';
import { UserCog, LogOut, Lock, Download, Search, Users, FileText } from 'lucide-react';

const AdminProfileModal = ({ admin, onClose, onUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        nome: admin.nome || '',
        usuario: admin.usuario || '',
        senha: admin.senha || ''
    });

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`/api/admin/perfil/${admin.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Falha ao atualizar perfil.');
            onUpdate(data.admin);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-lg" onClick={onClose}>
            <div className="w-full max-w-md rounded-[2.5rem] border border-slate-700 bg-slate-900 p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10 ring-1 ring-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                        <UserCog size={32} className="text-purple-400" />
                    </div>
                    <h3 className="text-2xl font-black text-white tracking-tight">Meu Perfil Adm</h3>
                    <p className="text-sm text-slate-400 mt-2">Gerencie suas credenciais de faturamento.</p>
                </div>
                {error && (
                    <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 text-center">{error}</div>
                )}
                <form onSubmit={handleSave} className="grid gap-5">
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Nome de Exibição</label>
                        <input type="text" value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-400 transition" required />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Usuário de Login</label>
                        <input type="text" value={formData.usuario} onChange={e => setFormData({ ...formData, usuario: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-400 transition" required />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Senha Privada</label>
                        <div className="relative">
                            <input type="text" value={formData.senha} onChange={e => setFormData({ ...formData, senha: e.target.value })}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-400 transition font-mono pr-12" required />
                            <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button type="submit" disabled={loading}
                            className="rounded-2xl bg-purple-500 py-4 text-sm font-black text-white transition hover:bg-purple-400 disabled:opacity-50 shadow-lg shadow-purple-950/20">
                            {loading ? 'Salvando...' : 'Salvar Dados'}
                        </button>
                        <button type="button" onClick={onClose}
                            className="rounded-2xl bg-slate-800 py-4 text-sm font-bold text-slate-300 transition hover:bg-slate-700">
                            Voltar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function AdminView() {
    const { session, logout } = useAuth();
    const [reportType, setReportType] = useState('productivity');
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        unidadeId: '',
        medicoId: ''
    });

    // Produtividade: apenas summary agregado (sem linhas brutas na tela)
    const [summary, setSummary] = useState(null);
    // Outros relatórios: dados brutos (volume menor)
    const [rawData, setRawData] = useState([]);

    const [loading, setLoading] = useState(false);
    const [units, setUnits] = useState([]);
    const [doctors, setDoctors] = useState([]);

    useEffect(() => {
        fetch('/api/admin/units')
            .then(res => res.json())
            .then(data => setUnits(Array.isArray(data) ? data : []))
            .catch(() => setUnits([]));
    }, []);

    useEffect(() => {
        const query = filters.unidadeId ? `?unidadeId=${filters.unidadeId}` : '';
        fetch(`/api/admin/doctors${query}`)
            .then(res => res.json())
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setDoctors(list);
                if (filters.medicoId && !list.find(d => d.id === filters.medicoId)) {
                    setFilters(prev => ({ ...prev, medicoId: '' }));
                }
            })
            .catch(() => setDoctors([]));
    }, [filters.unidadeId]);

    const fetchReport = async () => {
        setLoading(true);
        setSummary(null);
        setRawData([]);
        try {
            const query = new URLSearchParams(filters).toString();
            if (reportType === 'productivity') {
                const response = await fetch(`/api/admin/reports/productivity/summary?${query}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Erro ao buscar resumo.');
                setSummary(result);
            } else {
                const endpoint = reportType === 'exchanges' ? 'exchanges' : 'cancellations';
                const response = await fetch(`/api/admin/reports/${endpoint}?${query}`);
                const result = await response.json();
                setRawData(Array.isArray(result) ? result : []);
            }
        } catch (error) {
            console.error('Erro ao buscar relatorio:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRangeChange = (start, end) => {
        setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
    };

    const downloadReport = async (format) => {
        const query = new URLSearchParams({ ...filters, format }).toString();
        const endpoint = reportType === 'productivity' ? 'productivity'
            : reportType === 'exchanges' ? 'exchanges' : 'cancellations';

        const reportNames = {
            productivity: { csv: 'relatorio_produtividade.csv', html: 'relatorio_produtividade.html' },
            exchanges:    { csv: 'relatorio_trocas.csv',        html: 'relatorio_trocas.html' },
            cancellations:{ csv: 'relatorio_cancelamentos.csv', html: 'relatorio_cancelamentos.html' }
        };
        const filename = reportNames[reportType]?.[format] || `relatorio.${format}`;
        const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/html;charset=utf-8';

        try {
            const response = await fetch(`/api/admin/reports/${endpoint}?${query}`);
            if (!response.ok) throw new Error('Falha ao gerar arquivo.');
            const blob = await response.blob();
            const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Erro ao baixar relatório:', err);
        }
    };

    const isProductivity = reportType === 'productivity';
    const hasResults = isProductivity ? !!summary : rawData.length > 0;

    return (
        <div className="app-shell-bg app-shell-bg--admin min-h-screen text-slate-100 font-sans">
            <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/45 px-6 py-4 backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="app-hero-title app-hero-title--compact uppercase tracking-tight text-white">Módulo Administrativo</h1>
                            <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Relatórios e Faturamento</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowProfileModal(true)}
                            className="group flex items-center gap-3 rounded-2xl border border-purple-400/20 bg-purple-500/10 px-4 py-2.5 text-left transition hover:bg-purple-500/20 shadow-lg shadow-purple-950/30">
                            <div className="rounded-full bg-purple-500/20 p-2 group-hover:bg-purple-500/30 transition">
                                <UserCog size={18} className="text-purple-400" />
                            </div>
                            <div>
                                <div className="text-sm font-black text-white leading-tight">{session.nome}</div>
                                <div className="text-[10px] uppercase tracking-widest text-purple-300/70">ADMINISTRATIVO</div>
                            </div>
                        </button>
                        <button onClick={logout}
                            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4 font-bold text-slate-200 transition hover:bg-slate-800" title="Sair">
                            <LogOut size={18} />
                            <span className="hidden sm:inline">Sair</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-6 space-y-6">

                {/* Painel de Filtros */}
                <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Período</label>
                            <DateRangePicker startDate={filters.startDate} endDate={filters.endDate} onRangeChange={handleRangeChange} />
                        </div>
                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Unidade</label>
                            <select value={filters.unidadeId} onChange={e => setFilters({ ...filters, unidadeId: e.target.value })}
                                className="w-full h-[52px] bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition">
                                <option value="">Todas as Unidades</option>
                                {Array.isArray(units) && units.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Médico</label>
                            <select value={filters.medicoId} onChange={e => setFilters({ ...filters, medicoId: e.target.value })}
                                className="w-full h-[52px] bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition">
                                <option value="">Todos os Médicos</option>
                                {Array.isArray(doctors) && doctors.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
                            {[
                                { id: 'productivity', label: 'Produtividade' },
                                { id: 'exchanges', label: 'Trocas' },
                                { id: 'cancellations', label: 'Cancelamentos' }
                            ].map(btn => (
                                <button key={btn.id}
                                    onClick={() => { setReportType(btn.id); setSummary(null); setRawData([]); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tight transition ${reportType === btn.id ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-slate-500 hover:text-slate-200'}`}>
                                    {btn.label}
                                </button>
                            ))}
                        </div>

                        <button onClick={fetchReport} disabled={loading}
                            className="flex items-center gap-2 px-8 py-3 bg-white text-slate-950 rounded-2xl text-sm font-black uppercase hover:bg-purple-100 transition disabled:opacity-50">
                            <Search size={16} />
                            {loading ? 'Processando...' : 'Pesquisar'}
                        </button>
                    </div>
                </section>

                {/* Resultados */}
                {hasResults && (
                    <section className="space-y-6 animate-in fade-in duration-300">

                        {/* PRODUTIVIDADE: Summary-First */}
                        {isProductivity && summary && (
                            <>
                                {/* Cards de métricas */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 flex items-center gap-4">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-800">
                                            <FileText size={22} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Registros Encontrados</p>
                                            <p className="text-3xl font-black text-white tabular-nums">{summary.totalRegistros.toLocaleString('pt-BR')}</p>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 flex items-center gap-4">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-800">
                                            <Users size={22} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profissionais Ativos</p>
                                            <p className="text-3xl font-black text-white tabular-nums">{summary.porMedico.length}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Barra de download */}
                                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-3">
                                    <p className="mr-2 text-xs font-bold text-slate-500 uppercase tracking-widest">Exportar dados completos:</p>
                                    <button onClick={() => downloadReport('csv')}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition">
                                        <Download size={14} /> EXCEL (CSV)
                                    </button>
                                    <button onClick={() => downloadReport('html')}
                                        className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl text-xs font-bold hover:bg-sky-500/20 transition">
                                        <Download size={14} /> HTML
                                    </button>
                                </div>

                                {/* Tabela consolidada por médico */}
                                <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
                                    <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3">
                                        <Users size={16} className="text-purple-400" />
                                        <h2 className="text-sm font-black uppercase tracking-widest text-purple-400">Consolidado por Profissional</h2>
                                        <span className="ml-auto text-xs text-slate-600 font-semibold">
                                            {summary.porMedico.length} profissional(is) — ordenado por horas ↓
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-950/60">
                                                <tr>
                                                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                                                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Médico</th>
                                                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">CRM</th>
                                                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Unidade(s)</th>
                                                    <th className="px-6 py-3 text-[10px] font-black text-purple-400 uppercase tracking-widest text-right">Total Horas</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60">
                                                {summary.porMedico.map((row, i) => (
                                                    <tr key={i} className="hover:bg-slate-800/30 transition">
                                                        <td className="px-6 py-3 text-xs text-slate-600 font-bold">{i + 1}</td>
                                                        <td className="px-6 py-3 text-sm font-bold text-white">{row.medico}</td>
                                                        <td className="px-6 py-3 text-sm text-slate-400 font-mono">{row.crm}</td>
                                                        <td className="px-6 py-3 text-xs text-slate-400 max-w-[200px] truncate" title={row.unidades}>{row.unidades}</td>
                                                        <td className="px-6 py-3 text-right">
                                                            <span className="inline-block rounded-xl bg-purple-500/10 px-3 py-1 text-sm font-black text-purple-300 tabular-nums">
                                                                {row.horas}h
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* TROCAS / CANCELAMENTOS: tabela bruta (volume menor) */}
                        {!isProductivity && rawData.length > 0 && (
                            <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
                                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                                    <h2 className="text-sm font-black uppercase tracking-widest text-purple-400">Dados Processados</h2>
                                    <div className="flex gap-3">
                                        <button onClick={() => downloadReport('csv')}
                                            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition">
                                            <Download size={14} /> EXCEL (CSV)
                                        </button>
                                        <button onClick={() => downloadReport('html')}
                                            className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl text-xs font-bold hover:bg-sky-500/20 transition">
                                            <Download size={14} /> HTML
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-950/50">
                                            <tr>
                                                {Object.keys(rawData[0]).map(k => (
                                                    <th key={k} className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{k}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {rawData.map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-800/30 transition">
                                                    {Object.values(row).map((v, j) => (
                                                        <td key={j} className="px-6 py-4 text-sm text-slate-300 font-medium">{v}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* Estado vazio */}
                {!hasResults && !loading && (
                    <section className="rounded-3xl border border-slate-800 bg-slate-900/40 py-20 text-center">
                        <Search size={36} className="mx-auto mb-4 text-slate-700" />
                        <p className="text-slate-500 text-sm">
                            Defina os filtros e clique em <strong className="text-slate-400">Pesquisar</strong> para visualizar os dados.
                        </p>
                        <p className="mt-2 text-slate-600 text-xs">
                            Para produtividade, volumes altos são exibidos apenas no arquivo exportado para não sobrecarregar a tela.
                        </p>
                    </section>
                )}
            </main>

            {showProfileModal && (
                <AdminProfileModal admin={session} onClose={() => setShowProfileModal(false)}
                    onUpdate={() => { setShowProfileModal(false); window.location.reload(); }} />
            )}
        </div>
    );
}
