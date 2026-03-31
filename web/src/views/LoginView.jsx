import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FALLBACK_MEDICO_PROFILES, GESTOR_PROFILES } from '../devTestProfiles.js';

const parseJson = async (response) => {
    const raw = await response.text();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

export default function LoginView() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('medico');

    const [medicoList, setMedicoList] = useState(FALLBACK_MEDICO_PROFILES);
    const [medicoId, setMedicoId] = useState(FALLBACK_MEDICO_PROFILES[0]?.id ?? '');
    const [managerList, setManagerList] = useState(GESTOR_PROFILES);
    const [gestorId, setGestorId] = useState(GESTOR_PROFILES[0]?.id ?? '');

    const [loadingMedicos, setLoadingMedicos] = useState(true);
    const [loadingManagers, setLoadingManagers] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoadingMedicos(true);
            setError('');
            try {
                const response = await fetch('/api/medicos');
                const data = await parseJson(response);

                if (cancelled) return;

                if (response.ok && Array.isArray(data) && data.length > 0) {
                    setMedicoList(data);
                    setMedicoId(data[0].id);
                } else {
                    setMedicoList(FALLBACK_MEDICO_PROFILES);
                    setMedicoId(FALLBACK_MEDICO_PROFILES[0]?.id ?? '');
                    if (!response.ok && data?.error) {
                        setError(`API médicos: ${data.error}. Usando perfis locais.`);
                    }
                }
            } catch {
                if (!cancelled) {
                    setMedicoList(FALLBACK_MEDICO_PROFILES);
                    setMedicoId(FALLBACK_MEDICO_PROFILES[0]?.id ?? '');
                    setError('Não foi possível carregar médicos da API. Usando perfis locais.');
                }
            } finally {
                if (!cancelled) setLoadingMedicos(false);
                if (!cancelled) {
                    try {
                        const notice = window.sessionStorage.getItem('login-notice');
                        if (notice) {
                            window.sessionStorage.removeItem('login-notice');
                            setError((prev) => prev || notice);
                        }
                    } catch {
                        /* ignore */
                    }
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingManagers(true);
            try {
                const response = await fetch('/api/manager/perfis');
                const data = await parseJson(response);
                if (cancelled) return;
                if (response.ok && Array.isArray(data) && data.length > 0) {
                    setManagerList(data);
                    setGestorId(data[0].id);
                } else {
                    setManagerList(GESTOR_PROFILES);
                    setGestorId(GESTOR_PROFILES[0]?.id ?? '');
                }
            } catch {
                if (!cancelled) {
                    setManagerList(GESTOR_PROFILES);
                    setGestorId(GESTOR_PROFILES[0]?.id ?? '');
                }
            } finally {
                if (!cancelled) setLoadingManagers(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const enterMedico = () => {
        const profile = medicoList.find((p) => p.id === medicoId) ?? medicoList[0];
        if (!profile) {
            setError('Nenhum perfil de médico disponível.');
            return;
        }
        login({ ...profile, crm: profile.crm }, false);
        navigate('/medico');
    };

    const enterGestor = () => {
        const profile = managerList.find((p) => p.id === gestorId) ?? managerList[0];
        if (!profile) {
            setError('Nenhum perfil de gestor configurado em devTestProfiles.js (GESTOR_PROFILES).');
            return;
        }
        login({ ...profile }, true);
        navigate('/gestor');
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] px-6 py-10 text-slate-100">
            <header className="mb-10 text-center">
                <p className="mb-3 text-sm uppercase tracking-[0.35em] text-emerald-300/70">GESTÃO DE PLANTÕES</p>
                <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">Central de Acessos</h1>
                <p className="mx-auto mt-4 max-w-lg text-base text-slate-300">Escolha o perfil e abra o módulo. Não há senha nesta versão.</p>
            </header>

            <div className="w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/75 p-8 shadow-2xl shadow-slate-950/40">
                <div className="mb-8 flex rounded-2xl bg-slate-950 p-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('medico')}
                        className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
                            activeTab === 'medico'
                                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        Médico
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('gestor')}
                        className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
                            activeTab === 'gestor'
                                ? 'border border-sky-500/30 bg-sky-500/10 text-sky-400'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        Gestor
                    </button>
                </div>

                {error && (
                    <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div>
                )}

                {activeTab === 'medico' && (
                    <div className="grid gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Perfil do médico</label>
                            <select
                                value={medicoId}
                                onChange={(e) => setMedicoId(e.target.value)}
                                disabled={loadingMedicos || medicoList.length === 0}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400 disabled:opacity-50"
                            >
                                {medicoList.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome} — {p.crm} ({p.especialidade})
                                    </option>
                                ))}
                            </select>
                            {loadingMedicos && <p className="mt-2 text-xs text-slate-500">Carregando lista…</p>}
                        </div>
                        <button
                            type="button"
                            onClick={enterMedico}
                            disabled={loadingMedicos || medicoList.length === 0}
                            className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            Acessar Plantões
                        </button>
                        <p className="text-center text-xs text-slate-500">
                            Lista vem da API quando existir; senão use <code className="text-slate-400">FALLBACK_MEDICO_PROFILES</code> em{' '}
                            <code className="text-slate-400">web/src/devTestProfiles.js</code>.
                        </p>
                    </div>
                )}

                {activeTab === 'gestor' && (
                    <div className="grid gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Perfil do gestor</label>
                            <select
                                value={gestorId}
                                onChange={(e) => setGestorId(e.target.value)}
                                disabled={loadingManagers || managerList.length === 0}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400"
                            >
                                {managerList.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome} ({p.unidadeNome || p.usuario})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={enterGestor}
                            disabled={loadingManagers || managerList.length === 0}
                            className="rounded-2xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-300"
                        >
                            Acessar Painel Gerencial
                        </button>
                        <p className="text-center text-xs text-slate-500">
                            Edite gestores em <code className="text-slate-400">GESTOR_PROFILES</code> em <code className="text-slate-400">devTestProfiles.js</code>.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
