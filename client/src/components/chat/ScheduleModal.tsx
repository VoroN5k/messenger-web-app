'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, X, Send, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    onConfirm: (scheduledAt: Date) => void;
    onClose:   () => void;
}

const QUICK_OPTIONS = [
    { label: 'Через 30 хв',  mins: 30    },
    { label: 'Через 1 год',  mins: 60    },
    { label: 'Через 3 год',  mins: 180   },
    { label: 'Завтра вранці', mins: null, fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: 'Завтра ввечері',mins: null, fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); return d; } },
];

const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const DAYS_UA   = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDateTime(d: Date): string {
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} о ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleModal({ onConfirm, onClose }: Props) {
    const now     = new Date();
    const [mode,  setMode]    = useState<'quick' | 'custom'>('quick');
    const [viewMonth, setViewMonth] = useState(now.getMonth());
    const [viewYear,  setViewYear]  = useState(now.getFullYear());
    const [selDay,    setSelDay]    = useState<number | null>(null);
    const [selHour,   setSelHour]   = useState(now.getHours() + 1 > 23 ? 9 : now.getHours() + 1);
    const [selMin,    setSelMin]    = useState(0);
    const [error,     setError]     = useState('');

    // Close on Escape
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const handleQuick = (opt: typeof QUICK_OPTIONS[0]) => {
        let date: Date;
        if (opt.fn) { date = opt.fn(); }
        else        { date = new Date(Date.now() + opt.mins! * 60_000); }
        onConfirm(date);
    };

    // Calendar grid
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const offset   = (firstDay === 0 ? 6 : firstDay - 1); // Mon-based
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const handleDayClick = (day: number) => {
        const d = new Date(viewYear, viewMonth, day);
        if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return; // past
        setSelDay(day); setError('');
    };

    const handleConfirmCustom = () => {
        if (!selDay) { setError('Оберіть дату'); return; }
        const scheduled = new Date(viewYear, viewMonth, selDay, selHour, selMin, 0, 0);
        if (scheduled <= new Date()) { setError('Час повинен бути в майбутньому'); return; }
        onConfirm(scheduled);
    };

    const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

    const todayD = now.getDate(), todayM = now.getMonth(), todayY = now.getFullYear();

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 dark:border-slate-700 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-violet-500" />
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Відкласти повідомлення</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-all">
                        <X size={15} />
                    </button>
                </div>

                {/* Mode tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-700">
                    {(['quick','custom'] as const).map(m => (
                        <button key={m} onClick={() => setMode(m)}
                                className={`flex-1 py-2.5 text-xs font-semibold transition-colors cursor-pointer
                                    ${mode === m ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 -mb-px' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                            {m === 'quick' ? '⚡ Швидко' : '🗓 Своя дата'}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {mode === 'quick' ? (
                        /* Quick options */
                        <div className="grid grid-cols-2 gap-2">
                            {QUICK_OPTIONS.map(opt => (
                                <button key={opt.label} onClick={() => handleQuick(opt)}
                                        className="flex flex-col items-start px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all cursor-pointer text-left group">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-violet-700 dark:group-hover:text-violet-300">{opt.label}</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">
                                        {opt.mins ? formatDateTime(new Date(Date.now() + opt.mins * 60_000)) : opt.fn ? formatDateTime(opt.fn()) : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        /* Custom date picker */
                        <div className="space-y-4">
                            {/* Month nav */}
                            <div className="flex items-center justify-between">
                                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-500 dark:text-slate-400 transition-colors">
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    {MONTHS_UA[viewMonth]} {viewYear}
                                </span>
                                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-500 dark:text-slate-400 transition-colors">
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            {/* Day names */}
                            <div className="grid grid-cols-7 gap-1">
                                {DAYS_UA.map(d => (
                                    <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
                                ))}
                            </div>

                            {/* Days grid */}
                            <div className="grid grid-cols-7 gap-1">
                                {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
                                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                    const isPast = new Date(viewYear, viewMonth, day) < new Date(todayY, todayM, todayD);
                                    const isToday = day === todayD && viewMonth === todayM && viewYear === todayY;
                                    const isSel   = day === selDay && viewMonth === now.getMonth() || day === selDay;
                                    return (
                                        <button key={day} onClick={() => handleDayClick(day)} disabled={isPast}
                                                className={`aspect-square rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed
                                                    ${isSel   ? 'bg-violet-500 text-white'
                                                    : isToday ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 font-bold'
                                                        :           'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Time picker */}
                            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                                <Clock size={15} className="text-slate-400 shrink-0" />
                                <div className="flex items-center gap-2 flex-1">
                                    <select value={selHour} onChange={e => setSelHour(Number(e.target.value))}
                                            className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer">
                                        {Array.from({ length: 24 }, (_, i) => (
                                            <option key={i} value={i}>{pad(i)}</option>
                                        ))}
                                    </select>
                                    <span className="text-slate-400 font-bold text-lg">:</span>
                                    <select value={selMin} onChange={e => setSelMin(Number(e.target.value))}
                                            className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer">
                                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                                            <option key={m} value={m}>{pad(m)}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Preview */}
                            {selDay && (
                                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-900/40 rounded-xl px-3 py-2 text-sm text-violet-700 dark:text-violet-300 text-center">
                                    📅 {formatDateTime(new Date(viewYear, viewMonth, selDay, selHour, selMin))}
                                </div>
                            )}

                            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

                            <button onClick={handleConfirmCustom}
                                    className="w-full bg-violet-500 hover:bg-violet-600 text-white font-semibold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2">
                                <Send size={14} />
                                Запланувати
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}