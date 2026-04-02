import React, { useState, useEffect, useRef } from 'react';

/**
 * DateRangePicker - Seletor de Período Customizado com Mini Mapa (Presets + Calendário)
 */
export default function DateRangePicker({ startDate, endDate, onRangeChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(new Date()); // Mês sendo exibido no calendário
    const dropdownRef = useRef(null);

    // Fecha ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const presets = [
        { label: 'Últimos 7 dias', getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 7);
            return { start, end };
        }},
        { label: 'Últimos 15 dias', getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 15);
            return { start, end };
        }},
        { label: 'Este Mês', getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { start, end };
        }},
        { label: 'Mês Passado', getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return { start, end };
        }}
    ];

    const handlePresetClick = (preset) => {
        const { start, end } = preset.getRange();
        onRangeChange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        setIsOpen(false);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    // Lógica do Calendário
    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const days = [];
        const totalDays = daysInMonth(year, month);
        const startOffset = firstDayOfMonth(year, month);

        // Espaços vazios do início
        for (let i = 0; i < startOffset; i++) {
            days.push(<div key={`blank-${i}`} className="h-8 w-8"></div>);
        }

        // Dias do mês
        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = dateStr === startDate || dateStr === endDate;
            const isInRange = dateStr > startDate && dateStr < endDate;

            days.push(
                <button
                    key={d}
                    onClick={() => handleDateClick(dateStr)}
                    className={`h-8 w-8 text-xs font-bold rounded-lg transition flex items-center justify-center
                        ${isSelected ? 'bg-purple-500 text-white shadow-lg' : ''}
                        ${isInRange ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-slate-800 text-slate-400'}
                    `}
                >
                    {d}
                </button>
            );
        }

        return days;
    };

    const handleDateClick = (dateStr) => {
        if (!startDate || (startDate && endDate)) {
            onRangeChange(dateStr, '');
        } else {
            if (dateStr < startDate) {
                onRangeChange(dateStr, startDate);
            } else {
                onRangeChange(startDate, dateStr);
            }
            setIsOpen(false);
        }
    };

    const moveMonth = (offset) => {
        const newDate = new Date(viewDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setViewDate(newDate);
    };

    const monthName = viewDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-[52px] bg-slate-950 border border-slate-700 rounded-xl px-4 flex items-center justify-between text-sm hover:border-purple-500 transition group"
            >
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-bold text-slate-200">{formatDate(startDate)}</span>
                    <span className="text-slate-500">-</span>
                    <span className="font-bold text-slate-200">{formatDate(endDate) || 'Selecionar'}</span>
                </div>
                <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 flex flex-col md:flex-row gap-6 animate-in fade-in zoom-in-95 duration-200">
                    {/* Presets */}
                    <div className="flex flex-col gap-1 border-r border-slate-800 pr-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-3">Atalhos</p>
                        {presets.map(p => (
                            <button
                                key={p.label}
                                onClick={() => handlePresetClick(p)}
                                className="px-3 py-2 text-xs text-left font-bold text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition"
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Calendário */}
                    <div>
                        <div className="flex items-center justify-between mb-4 px-1">
                            <p className="text-xs font-black uppercase text-slate-200 tracking-tight">{monthName}</p>
                            <div className="flex gap-1">
                                <button onClick={() => moveMonth(-1)} className="p-1 hover:bg-slate-800 rounded-md text-slate-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg></button>
                                <button onClick={() => moveMonth(1)} className="p-1 hover:bg-slate-800 rounded-md text-slate-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="h-8 w-8 flex items-center justify-center text-[10px] font-black text-slate-600 uppercase">{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {renderCalendar()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
