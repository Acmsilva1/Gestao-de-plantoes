import React from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ManagerDashboard from '../components/Manager/Dashboard';
import ManagerAccess from '../components/Manager/AccessControl';

export default function ManagerView() {
    const { session, logout } = useAuth();
    const location = useLocation();

    return (
        <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.15),_transparent_40%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] text-slate-100">
            {/* Sidebar */}
            <aside className="w-64 flex flex-col border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-2xl shadow-slate-950/40">
                <div className="mb-10">
                    <p className="mb-2 text-xs uppercase tracking-[0.3em] text-sky-400/80">Maestro OS</p>
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
                </nav>

            </aside>

            {/* Main Content Area */}
            <main className="flex flex-1 flex-col overflow-y-auto">
                <header className="sticky top-0 z-20 flex items-center justify-end border-b border-slate-800 bg-slate-900/60 px-10 py-5 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-5 py-3 text-right text-sm text-sky-100 shadow-lg shadow-sky-950/30">
                            <div className="font-bold">{session.nome}</div>
                            <div className="mt-1 text-xs uppercase tracking-widest text-sky-300/70">{session.perfil || 'GESTOR_MASTER'}</div>
                        </div>
                        
                        <button
                            onClick={logout}
                            className="flex h-[72px] items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-5 font-bold text-slate-200 transition hover:bg-slate-800"
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
                            <Route path="*" element={<Navigate to="dashboard" replace />} />
                        </Routes>
                    </div>
                </div>
            </main>
        </div>
    );
}
