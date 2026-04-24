import React, { useEffect, useMemo, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

const DISMISS_KEY = 'gestao-de-plantoes-pwa-install-dismissed';

const isIosDevice = () => {
    const userAgent = window.navigator.userAgent;
    const platform = window.navigator.platform;
    const maxTouchPoints = window.navigator.maxTouchPoints || 0;

    return /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
};

const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) || isIosDevice();

const isStandaloneMode = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function PwaInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [installed, setInstalled] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const mobile = useMemo(() => (typeof window !== 'undefined' ? isMobileDevice() : false), []);
    const ios = useMemo(() => (typeof window !== 'undefined' ? isIosDevice() : false), []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');
        setInstalled(isStandaloneMode());

        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault();
            setDeferredPrompt(event);
        };

        const handleAppInstalled = () => {
            setInstalled(true);
            setDeferredPrompt(null);
            window.localStorage.removeItem(DISMISS_KEY);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const closePrompt = () => {
        setDismissed(true);
        window.localStorage.setItem(DISMISS_KEY, 'true');
    };

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;

        if (result.outcome !== 'accepted') {
            setDeferredPrompt(null);
        }
    };

    if (!mobile || installed || dismissed) {
        return null;
    }

    return (
        <div className="fixed inset-x-4 bottom-4 z-[90] md:hidden">
            <div className="rounded-[2rem] border border-emerald-400/25 bg-slate-950/95 p-4 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.6)] backdrop-blur-xl">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
                            {ios ? <Share2 size={20} /> : <Download size={20} />}
                        </div>
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-300/80">Instalar app</p>
                            <h3 className="text-lg font-black text-white">Abrir como aplicativo no celular</h3>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={closePrompt}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                        aria-label="Fechar sugestão de instalação"
                    >
                        <X size={18} />
                    </button>
                </div>

                {ios ? (
                    <>
                        <p className="text-sm leading-6 text-slate-300">
                            No iPhone/iPad, toque em <span className="font-bold text-white">Compartilhar</span> e depois em{' '}
                            <span className="font-bold text-white">Adicionar à Tela de Início</span>.
                        </p>
                        <button
                            type="button"
                            onClick={closePrompt}
                            className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
                        >
                            Entendi
                        </button>
                    </>
                ) : (
                    <>
                        <p className="text-sm leading-6 text-slate-300">
                            {deferredPrompt
                                ? 'Instale o GESTÃO DE PLANTÕES para abrir em tela cheia, com atalho no celular e experiência de app.'
                                : 'Se o botão de instalar ainda não aparecer, aguarde alguns segundos ou abra o menu do navegador e escolha instalar app.'}
                        </p>
                        <button
                            type="button"
                            onClick={handleInstall}
                            disabled={!deferredPrompt}
                            title={!deferredPrompt ? 'Aguardando liberação do navegador para instalação' : 'Instalar aplicativo'}
                            className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            {deferredPrompt ? 'Instalar aplicativo' : 'Preparando instalação...'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
