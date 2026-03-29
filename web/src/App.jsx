import React, { useEffect, useState } from 'react';

export default function App() {
    const [plantoes, setPlantoes] = useState([]);

    useEffect(() => {
        // Conecta no DirecionadorService
        fetch('/api/vagas') 
            .then(res => res.json())
            .then(data => setPlantoes(data))
            .catch(err => console.error("Falha no Maestro:", err));
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
            <header className="mb-8 border-b border-slate-800 pb-4">
                <h1 className="text-2xl font-bold text-green-400">Maestro | Escala Nacional</h1>
                <p className="text-slate-400 text-sm">Bem-vindo, Dr. André</p>
            </header>

            <main className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plantoes.map(p => (
                    <div key={p.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl hover:border-green-500 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                            <span className="bg-green-500/10 text-green-500 text-xs font-bold px-2 py-1 rounded">DISPONÍVEL</span>
                            <span className="text-slate-500 text-xs">{p.data}</span>
                        </div>
                        <h2 className="text-lg font-semibold">{p.local}</h2>
                        <p className="text-slate-400 mb-6 capitalize">{p.turno}</p>
                        
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{p.vagas} vagas restantes</span>
                            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-transform active:scale-95">
                                Aceitar Plantão
                            </button>
                        </div>
                    </div>
                ))}
            </main>
        </div>
    );
}
