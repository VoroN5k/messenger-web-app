// client/src/components/ui/CipherInput.tsx
'use client';
import { useState } from 'react';

export function CipherInput({
                                label, type = 'text', placeholder, error, icon, rightSlot, hint, ...rest
                            }: {
    label: string; type?: string; placeholder?: string;
    error?: string; icon?: React.ReactNode; rightSlot?: React.ReactNode; hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    const [focused, setFocused] = useState(false);

    return (
        <div className="space-y-1.5 w-full">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: 'rgba(139,92,246,0.7)' }}>
                    {label}
                </label>
                {hint && <span className="text-[9px] font-mono" style={{ color: 'rgba(100,116,139,0.5)' }}>{hint}</span>}
            </div>
            <div className="relative">
                <div className="absolute inset-0 rounded-lg transition-all duration-300" style={{
                    boxShadow: focused
                        ? '0 0 0 1px rgba(139,92,246,0.5), 0 0 20px rgba(109,40,217,0.1)'
                        : '0 0 0 1px rgba(109,40,217,0.2)',
                    background: focused ? 'rgba(109,40,217,0.08)' : 'transparent',
                    borderRadius: 8, pointerEvents: 'none',
                }} />
                {icon && (
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 transition-colors duration-300"
                         style={{ color: focused ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.4)' }}>
                        {icon}
                    </div>
                )}
                <input
                    type={type}
                    placeholder={placeholder}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    {...rest}
                    className="relative z-10 w-full bg-transparent rounded-lg py-3 text-sm font-mono outline-none"
                    style={{
                        paddingLeft: icon ? 40 : 14,
                        paddingRight: rightSlot ? 44 : 14,
                        color: 'rgba(226,232,240,0.9)',
                        caretColor: 'rgba(139,92,246,0.9)',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}
                />
                {rightSlot && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">{rightSlot}</div>
                )}
            </div>
            {error && <p className="text-[10px] font-mono mt-1" style={{ color: 'rgba(248,113,113,0.8)' }}>↳ {error}</p>}
        </div>
    );
}