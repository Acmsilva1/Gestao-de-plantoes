import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, CalendarDays, ShieldCheck, Lock, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ManagerDashboard from '../components/Manager/Dashboard';
import ManagerAccess from '../components/Manager/AccessControl';
import CalendarPage from './CalendarPage';
import { readApiResponse } from '../utils/api';

const ManagerProfileModal = ({ manager, onClose, onUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        nome: manager.nome || '',
        usuario: manager.usuario || '',
        senha: manager.senha || ''
    });

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch(`/api/manager/perfil/${manager.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await readApiResponse(response);

            if (!response.ok) throw new Error(data.error || 'Falha ao atualizar perfil.');

            onUpdate(data.manager);
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
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10 ring-1 ring-sky-500/20 shadow-[0_0_20px_rgba(14,165,233,0.1)]">
                        <UserCog size={32} className="text-sky-400" />
                    </div>
                    <h3 className="text-2xl font-black text-white">Meu Perfil Adm</h3>
                    <p className="text-sm text-slate-400 mt-2">Gerencie suas credenciais de acesso ao painel.</p>
                </div>

                {error && (
                    <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSave} className="grid gap-5">
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Nome de Exibição</label>
                        <input
                            type="text"
                            value={formData.nome}
                            onChange={e => setFormData({ ...formData, nome: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400 transition"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Usuário de Login</label>
                        <input
                            type="text"
                            value={formData.usuario}
                            onChange={e => setFormData({ ...formData, usuario: e.target.value })}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400 transition"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Senha Privada</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={formData.senha}
                                onChange={e => setFormData({ ...formData, senha: e.target.value })}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400 transition font-mono pr-12"
                                required
                            />
                            <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-2xl bg-sky-500 py-4 text-sm font-black text-slate-950 transition hover:bg-sky-400 disabled:opacity-50 shadow-lg shadow-sky-950/20"
                        >
                            {loading ? 'Salvando...' : 'Salvar Dados'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl bg-slate-800 py-4 text-sm font-bold text-slate-300 transition hover:bg-slate-700"
                        >
                            Voltar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function ManagerView() {
    const { session, logout } = useAuth();
    const location = useLocation();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showPasswordSuggestion, setShowPasswordSuggestion] = useState(false);

    useEffect(() => {
        if (session?.senha === '12345' && !localStorage.getItem(`hide_manager_pass_suggest_${session.id}`)) {
            setShowPasswordSuggestion(true);
        }
    }, [session?.id, session?.senha]);

    return (
        <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.15),_transparent_40%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] text-slate-100">
            {/* Suggestion Banner */}
            {showPasswordSuggestion && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-sky-500/90 py-2.5 px-10 flex items-center justify-between text-slate-950 animate-in slide-in-from-top duration-300 backdrop-blur-sm">
                    <p className="text-sm font-black flex items-center gap-2">
                        <ShieldCheck size={18} />
                        Sua conta de gestor ainda usa a senha padrão. Recomendamos alterá-la imediatamente para segurança do sistema.
                    </p>
                    <div className="flex items-center gap-6">
                        <button onClick={() => { setShowProfileModal(true); setShowPasswordSuggestion(false); }} className="text-xs font-black uppercase underline hover:no-underline">Mudar Senha</button>
                        <button onClick={() => { setShowPasswordSuggestion(false); localStorage.setItem(`hide_manager_pass_suggest_${session.id}`, 'true'); }} className="text-xs font-bold opacity-60">Mais tarde</button>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <aside className="w-64 flex flex-col border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-2xl shadow-slate-950/40">
                <div className="mb-10">
                    <p className="mb-2 text-xs uppercase tracking-[0.3em] text-sky-400/80">GESTÃO DE PLANTÕES</p>
                    <h1 className="text-2xl font-black tracking-tight text-white">Central do Gestor</h1>
                </div>

                <nav className="flex-1 flex flex-col gap-3">
                    <NavLink
                        to="/gestor/dashboard"
                        className={({ isActive }) => 
                            `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                                isActive 
                                    ? 'bg-sky-500/10 text-sky-300 border border-sky-400/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                            }`
                        }
                    >
                        <LayoutDashboard size={18} />
                        Dashboards
                    </NavLink>
                    
                    <NavLink
                        to="/gestor/acessos"
                        className={({ isActive }) => 
                            `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                                isActive 
                                    ? 'bg-sky-500/10 text-sky-300 border border-sky-400/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                            }`
                        }
                    >
                        <Users size={18} />
                        Controle de Acessos
                    </NavLink>

                    <NavLink
                        to="/gestor/calendario"
                        className={({ isActive }) => 
                            `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                                isActive 
                                    ? 'bg-sky-500/10 text-sky-300 border border-sky-400/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                            }`
                        }
                    >
                        <CalendarDays size={18} />
                        Calendário
                    </NavLink>
                </nav>

            </aside>

            {/* Main Content Area */}
            <main className="flex flex-1 flex-col overflow-y-auto">
                <header className="sticky top-0 z-20 flex items-center justify-end border-b border-slate-800 bg-slate-900/60 px-10 py-5 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowProfileModal(true)}
                            className="group flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-5 py-3 transition hover:bg-sky-500/20 text-right shadow-lg shadow-sky-950/30"
                        >
                            <div className="rounded-full bg-sky-500/20 p-2 group-hover:bg-sky-500/30 transition">
                                <UserCog size={18} className="text-sky-400" />
                            </div>
                            <div>
                                <div className="text-sm font-black text-white">{session.nome}</div>
                                <div className="text-[10px] uppercase tracking-widest text-sky-300/70">{session.perfil || 'GESTOR_MASTER'}</div>
                            </div>
                        </button>
                        
                        <button
                            onClick={logout}
                            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 font-bold text-slate-200 transition hover:bg-slate-800"
                        >
                            <LogOut size={18} />
                            Sair
                        </button>
                    </div>
                </header>

                <div className="p-10">
                    <div className="mx-auto max-w-6xl">
                        <Routes>
                            <Route path="dashboard" element={<ManagerDashboard />} />
                            <Route path="acessos" element={<ManagerAccess />} />
                            <Route path="calendario" element={<CalendarPage />} />
                            <Route path="*" element={<Navigate to="dashboard" replace />} />
                        </Routes>
                    </div>
                </div>
            </main>

            {/* Profile Modal */}
            {showProfileModal && (
                <ManagerProfileModal 
                    manager={session} 
                    onClose={() => setShowProfileModal(false)}
                    onUpdate={(updated) => {
                        setShowProfileModal(false);
                        window.location.reload(); // Brutal session update
                    }}
                />
            )}
        </div>
    );
}
