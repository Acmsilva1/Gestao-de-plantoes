import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginView() {
    const { login } = useAuth();
    const navigate = useNavigate();
    
    const [activeTab, setActiveTab] = useState('medico'); // 'medico' ou 'gestor'
    
    const [nome, setNome] = useState('');
    const [crm, setCrm] = useState('');
    
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    
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
                body: JSON.stringify({ nome, crm })
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Falha no login de médico.');

            const sessionInfo = {
                ...data.doctor,
                nome: data.doctor.nome,
                crm
            };

            login(sessionInfo, false); // isManager = false
            navigate('/medico');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoggingIn(false);
        }
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
            const data = await response.json();

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
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Nome</label>
                            <input
                                type="text"
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                placeholder="Dr. André Martins"
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
                            disabled={loggingIn || !nome || !crm}
                            className="mt-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 shadow-lg shadow-emerald-500/20"
                        >
                            {loggingIn ? 'Entrando...' : 'Acessar Plantões'}
                        </button>
                        
                        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                            <p className="text-xs text-slate-500">Credenciais de Teste: (nome e CRM de algum médico na base)</p>
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
        </div>
    );
}
