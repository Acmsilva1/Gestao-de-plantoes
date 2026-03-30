import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { readApiResponse } from '../utils/api';

export default function LoginView() {
    const { login } = useAuth();
    const navigate = useNavigate();
    
    const [activeTab, setActiveTab] = useState('medico'); // 'medico' ou 'gestor'
    
    const [crm, setCrm] = useState('');
    const [senhaMedico, setSenhaMedico] = useState('');
    
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    
    const [pendingDoctor, setPendingDoctor] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    
    const [loggingIn, setLoggingIn] = useState(false);
    const [error, setError] = useState('');

    const handleLoginMedico = async (e) => {
        e.preventDefault();
        setLoggingIn(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crm, senha: senhaMedico })
            });
            const data = await readApiResponse(response);

            if (!response.ok) throw new Error(data.error || 'Falha no login de médico.');

            setPendingDoctor(data.doctor);
            setShowConfirmation(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoggingIn(false);
        }
    };

    const confirmLoginMedico = () => {
        if (!pendingDoctor) return;
        
        const sessionInfo = {
            ...pendingDoctor,
            crm
        };

        login(sessionInfo, false); // isManager = false
        navigate('/medico');
    };

    const handleLoginGestor = async (e) => {
        e.preventDefault();
        setLoggingIn(true);
        setError('');

        try {
            const response = await fetch('/api/manager/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, senha })
            });
            const data = await readApiResponse(response);

            if (!response.ok) throw new Error(data.error || 'Falha no login de gestor.');

            const sessionInfo = {
                id: data.manager.id,
                nome: data.manager.nome,
                usuario: data.manager.usuario,
                perfil: data.manager.perfis?.nome || 'GESTOR'
            };

            login(sessionInfo, true); // isManager = true
            navigate('/gestor');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoggingIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] px-6 py-10 text-slate-100 flex flex-col items-center justify-center">
            <header className="mb-10 text-center">
                <p className="mb-3 text-sm uppercase tracking-[0.35em] text-emerald-300/70">Maestro</p>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Central de Acessos</h1>
                <p className="mt-4 max-w-lg mx-auto text-base text-slate-300">Escolha seu perfil para entrar no sistema operacional.</p>
            </header>

            <div className="w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/75 p-8 shadow-2xl shadow-slate-950/40">
                {/* Tabs */}
                <div className="flex bg-slate-950 p-1 rounded-2xl mb-8">
                    <button 
                        type="button"
                        onClick={() => setActiveTab('medico')}
                        className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
                            activeTab === 'medico' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        Sou Médico
                    </button>
                    <button 
                        type="button"
                        onClick={() => setActiveTab('gestor')}
                        className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
                            activeTab === 'gestor' 
                                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        Sou Gestor
                    </button>
                </div>

                {error && (
                    <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {error}
                    </div>
                )}

                {/* Form Médico */}
                {activeTab === 'medico' && (
                    <form className="grid gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300" onSubmit={handleLoginMedico}>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Senha</label>
                            <input
                                type="password"
                                value={senhaMedico}
                                onChange={(e) => setSenhaMedico(e.target.value)}
                                placeholder="Sua senha de acesso"
                                required
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-200">CRM</label>
                            <input
                                type="text"
                                value={crm}
                                onChange={(e) => setCrm(e.target.value)}
                                placeholder="12345-ES"
                                required
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loggingIn || !crm || !senhaMedico}
                            className="mt-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 shadow-lg shadow-emerald-500/20"
                        >
                            {loggingIn ? 'Entrando...' : 'Acessar Plantões'}
                        </button>
                        
                        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                            <p className="text-xs text-slate-500">Credenciais: CRM e senha padrão é 12345</p>
                        </div>
                    </form>
                )}

                {/* Form Gestor */}
                {activeTab === 'gestor' && (
                    <form className="grid gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300" onSubmit={handleLoginGestor}>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Usuário</label>
                            <input
                                type="text"
                                value={usuario}
                                onChange={(e) => setUsuario(e.target.value)}
                                placeholder="andre.silva"
                                required
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Senha</label>
                            <input
                                type="password"
                                value={senha}
                                onChange={(e) => setSenha(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loggingIn || !usuario || !senha}
                            className="mt-2 rounded-2xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 shadow-lg shadow-sky-500/20"
                        >
                            {loggingIn ? 'Entrando...' : 'Acessar Painel Gerencial'}
                        </button>

                        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                            <p className="text-xs text-slate-500">Credenciais de Teste: andre.silva / 12345</p>
                        </div>
                    </form>
                )}
            </div>

            {/* Modal de Confirmação Médico */}
            {showConfirmation && pendingDoctor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur-md">
                    <div className="w-full max-w-sm rounded-[2.5rem] border border-emerald-500/30 bg-slate-900 p-8 shadow-2xl text-center animate-in zoom-in duration-300">
                        <div className="mb-6 flex justify-center">
                            <div className="rounded-full bg-emerald-500/10 p-5 ring-1 ring-emerald-500/20">
                                <svg className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Bem-vindo, Dr(a).</h2>
                        <p className="text-2xl font-black text-emerald-400 mb-6">{pendingDoctor.nome}</p>
                        <p className="text-sm text-slate-400 mb-8">Confirmamos que este é o seu perfil de acesso?</p>
                        
                        <div className="grid gap-3">
                            <button
                                onClick={confirmLoginMedico}
                                className="w-full rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                            >
                                Sim, Acessar Perfil
                            </button>
                            <button
                                onClick={() => { setShowConfirmation(false); setPendingDoctor(null); }}
                                className="w-full rounded-2xl bg-slate-800 px-6 py-3 text-sm font-bold text-slate-300 transition hover:bg-slate-700"
                            >
                                Não, Voltar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
