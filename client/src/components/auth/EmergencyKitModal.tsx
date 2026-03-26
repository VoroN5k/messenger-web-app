'use client';

import { useState } from 'react';
import { Copy, Download, AlertTriangle, ShieldCheck, Check } from 'lucide-react';

interface EmergencyKitModalProps {
    pin: string;
    email: string;
    onComplete: () => void;
}

export function EmergencyKitModal({ pin, email, onComplete }: EmergencyKitModalProps) {
    const [copied, setCopied] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    const [isChecked, setIsChecked] = useState(false);

    // Функція генерації та завантаження "Аварійного файлу"
    const handleDownload = () => {
        const content = `
==================================================
        VESPER - EMERGENCY RECOVERY KIT
==================================================
УВАГА: НЕ ЗБЕРІГАЙТЕ ЦЕЙ ФАЙЛ У НЕЗАШИФРОВАНОМУ ВИГЛЯДІ В ХМАРІ!
НАЙКРАЩЕ - РОЗДРУКУЙТЕ АБО ДОДАЙТЕ В МЕНЕДЖЕР ПАРОЛІВ, А ФАЙЛ ВИДАЛІТЬ.

Акаунт: ${email}
RECOVERY PIN: ${pin}

* Цей PIN-код захищає ваші наскрізні (E2E) ключі шифрування.
* Ніхто, навіть розробники сервера, не знає цей PIN.
* Втрата PIN-коду = назавжди втрачений доступ до історії повідомлень.
==================================================
        `.trim();

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'VesperMsg_Recovery_Kit.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setDownloaded(true);
    };

    // Функція копіювання в буфер обміну
    const handleCopy = () => {
        navigator.clipboard.writeText(pin);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#06040f]/90 backdrop-blur-md animate-in fade-in duration-500">
            <div className="w-full max-w-md bg-[#0a0714] border border-amber-500/30 rounded-2xl shadow-[0_0_80px_rgba(245,158,11,0.15)] overflow-hidden">

                {/* Header (Увага) */}
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-5 flex items-start gap-4">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={26} />
                    <div>
                        <h2 className="text-amber-500 font-bold text-lg tracking-wider uppercase font-mono">
                            Збережіть ваш PIN
                        </h2>
                        <p className="text-amber-500/80 text-xs mt-1.5 font-mono leading-relaxed">
                            Якщо ви втратите цей код, ми <b>ніколи не зможемо</b> відновити історію ваших чатів.
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* PIN Display */}
                    <div className="bg-[#05030f] border border-violet-500/20 rounded-xl p-5 flex flex-col items-center justify-center gap-2">
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em]">Ваш Recovery PIN</span>
                        <div className="font-mono text-3xl tracking-[0.3em] text-white font-bold drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]">
                            {pin}
                        </div>
                    </div>

                    {/* Дії: Копіювати або Завантажити */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleCopy}
                            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                                copied
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : 'bg-violet-500/5 border-violet-500/20 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/40'
                            }`}
                        >
                            {copied ? <Check size={24} /> : <Copy size={24} />}
                            <span className="text-[10px] font-mono tracking-widest uppercase">
                                {copied ? 'Скопійовано' : 'В буфер'}
                            </span>
                        </button>

                        <button
                            onClick={handleDownload}
                            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                                downloaded
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : 'bg-violet-500/5 border-violet-500/20 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/40'
                            }`}
                        >
                            {downloaded ? <Check size={24} /> : <Download size={24} />}
                            <span className="text-[10px] font-mono tracking-widest uppercase">
                                {downloaded ? 'Завантажено' : 'Файл .txt'}
                            </span>
                        </button>
                    </div>

                    {/* Обов'язковий Checkbox */}
                    <label className="flex items-start gap-3 cursor-pointer group bg-slate-900/30 p-4 rounded-xl border border-slate-800 hover:border-violet-500/30 transition-colors">
                        <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => setIsChecked(e.target.checked)}
                                className="peer appearance-none w-5 h-5 border-2 border-slate-600 rounded bg-transparent checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer"
                            />
                            <Check size={14} strokeWidth={3} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono leading-relaxed group-hover:text-slate-300 transition-colors">
                            Я підтверджую, що надійно зберіг PIN-код. Я розумію, що його неможливо відновити через службу підтримки.
                        </span>
                    </label>

                    {/* Proceed Button */}
                    <button
                        disabled={!isChecked}
                        onClick={onComplete}
                        className="w-full py-4 rounded-xl font-mono text-xs uppercase tracking-widest text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{
                            background: isChecked
                                ? 'linear-gradient(135deg, rgba(16,185,129,0.9) 0%, rgba(5,150,105,0.9) 100%)' // Зелений градієнт успіху
                                : 'rgba(30,41,59,0.5)',
                            boxShadow: isChecked ? '0 0 25px rgba(16,185,129,0.3)' : 'none',
                            border: isChecked ? '1px solid rgba(52,211,153,0.5)' : '1px solid rgba(71,85,105,0.5)'
                        }}
                    >
                        {isChecked ? <ShieldCheck size={16} /> : null}
                        Завершити налаштування
                    </button>
                </div>
            </div>
        </div>
    );
}