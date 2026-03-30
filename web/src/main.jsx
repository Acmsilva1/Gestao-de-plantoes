import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

const PWA_VERSION = 'gestao-de-plantoes-v6';
const PWA_RESET_KEY = 'gestao-de-plantoes-pwa-version';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        const resetLegacyPwa = async () => {
            const appliedVersion = window.localStorage.getItem(PWA_RESET_KEY);

            if (appliedVersion === PWA_VERSION) {
                return false;
            }

            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));

            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)));

            window.localStorage.setItem(PWA_RESET_KEY, PWA_VERSION);
            return true;
        };

        resetLegacyPwa()
            .then((didReset) => {
                if (didReset) {
                    window.location.reload();
                    return null;
                }

                return navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`, { updateViaCache: 'none' });
            })
            .then(registration => {
                if (!registration) return;

                registration.update();

                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }

                registration.addEventListener('updatefound', () => {
                    const installingWorker = registration.installing;

                    if (!installingWorker) return;

                    installingWorker.addEventListener('statechange', () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                });

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                }, { once: true });
            })
            .catch(error => {
                console.error('Falha ao registrar o service worker:', error);
            });
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
