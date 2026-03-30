import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
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
        }).catch(error => {
            console.error('Falha ao registrar o service worker:', error);
        });
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
