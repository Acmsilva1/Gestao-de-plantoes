import React, { useEffect, useState } from 'react';
import ManagerCalendar from '../components/Manager/ManagerCalendar';

export default function CalendarPage() {
    const [units, setUnits] = useState([]);

    useEffect(() => {
        fetch('/api/manager/unidades')
            .then(r => r.ok ? r.json() : [])
            .then(setUnits)
            .catch(() => {});
    }, []);

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8">
                <h2 className="text-3xl font-black text-white">Calendário de Plantões</h2>
                <p className="mt-2 text-sm text-slate-400">
                    Visualize a grade de vagas de cada unidade — selecione a unidade e o mês desejado.
                </p>
            </div>
            <ManagerCalendar units={units} />
        </div>
    );
}
