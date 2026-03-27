'use client';

import { useEffect, useRef } from 'react';
import { X, ShieldCheck } from 'lucide-react';

interface TosModalProps {
    onClose: () => void;
}

export function TosModal({ onClose }: TosModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === overlayRef.current) onClose(); }}
        >
            <div
                className="w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
                style={{
                    background: 'rgba(10,7,25,0.97)',
                    border: '1px solid rgba(109,40,217,0.35)',
                    backdropFilter: 'blur(24px)',
                    boxShadow: '0 0 80px rgba(109,40,217,0.2)',
                    maxHeight: '85vh',
                }}
            >
                {/* Top accent line */}
                <div className="h-px w-full shrink-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.6), transparent)' }} />

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(109,40,217,0.15)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(109,40,217,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}>
                            <ShieldCheck size={15} style={{ color: 'rgba(196,181,253,0.9)' }} />
                        </div>
                        <div>
                            <p className="text-[10px] font-mono tracking-[0.25em] uppercase" style={{ color: 'rgba(139,92,246,0.6)' }}>// legal</p>
                            <h2 className="text-sm font-bold text-white">Умови використання та Конфіденційність</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors" style={{ color: 'rgba(148,163,184,0.5)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(248,113,113,0.9)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,0.5)'}>
                        <X size={15} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-[12px] leading-relaxed font-mono" style={{ color: 'rgba(148,163,184,0.75)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(109,40,217,0.3) transparent' }}>
                    <Section title="1. ПРИЙНЯТТЯ УМОВ">
                        Використовуючи Vesper Messenger («Сервіс»), ви погоджуєтесь з цими Умовами
                        використання та Політикою конфіденційності. Якщо ви не погоджуєтесь — будь
                        ласка, не використовуйте Сервіс.
                    </Section>

                    <Section title="2. ZERO-KNOWLEDGE АРХІТЕКТУРА">
                        Сервіс побудовано на принципах Zero-Knowledge. Ваші приватні ключі генеруються
                        виключно на вашому пристрої та <Highlight>ніколи не передаються</Highlight> на
                        сервер у відкритому вигляді. Адміністрація технічно не має доступу до змісту
                        ваших повідомлень.
                    </Section>

                    <Section title="3. ВІДПОВІДАЛЬНІСТЬ КОРИСТУВАЧА">
                        <ul className="space-y-1.5 mt-1">
                            {[
                                'Ви несете повну відповідальність за збереження Recovery PIN.',
                                'Втрата Recovery PIN означає незворотну втрату доступу до зашифрованої переписки.',
                                'Забороняється використовувати Сервіс для незаконної діяльності.',
                                'Забороняється розповсюджувати шкідливий контент, спам або матеріали, що порушують права третіх осіб.',
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span style={{ color: 'rgba(109,40,217,0.7)' }}>⬡</span> {item}
                                </li>
                            ))}
                        </ul>
                    </Section>

                    <Section title="4. ЗБІР ДАНИХ (GDPR / DSGVO)">
                        Ми збираємо мінімально необхідні дані для роботи Сервісу:
                        <ul className="space-y-1.5 mt-2">
                            {[
                                ['Email-адреса', 'для підтвердження акаунту та відновлення доступу'],
                                ['IP-адреса та User-Agent', 'для захисту від несанкціонованого доступу'],
                                ['Зашифровані повідомлення', 'зберігаються на серверах у нечитабельному вигляді'],
                                ['Публічний ключ', 'для забезпечення E2E шифрування між учасниками'],
                            ].map(([key, val], i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span style={{ color: 'rgba(109,40,217,0.7)' }}>⬡</span>
                                    <span><Highlight>{key}</Highlight> — {val}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-2">Ваші дані <Highlight>не продаються</Highlight> третім особам. Ви маєте право
                            вимагати видалення акаунту разом з усіма пов'язаними даними.</p>
                    </Section>

                    <Section title="5. ВИДАЛЕННЯ ДАНИХ">
                        Ви можете видалити акаунт у будь-який момент через розділ Налаштування → Акаунт.
                        Після видалення всі ваші дані видаляються з серверів протягом 30 діб згідно з
                        вимогами GDPR (ст. 17 «Право на забуття»).
                    </Section>

                    <Section title="6. ОБМЕЖЕННЯ ВІДПОВІДАЛЬНОСТІ">
                        Сервіс надається «як є» без жодних гарантій. Адміністрація не несе
                        відповідальності за втрату даних внаслідок втрати Recovery PIN, апаратних збоїв
                        або форс-мажорних обставин. Використання Сервісу здійснюється на ваш власний ризик.
                    </Section>

                    <Section title="7. ЗМІНИ УМОВ">
                        Ми залишаємо за собою право змінювати ці Умови. Про суттєві зміни ми
                        повідомляємо не менш ніж за 30 днів. Продовження використання Сервісу після
                        набрання чинності змінами означає вашу згоду з ними.
                    </Section>

                    <Section title="8. КОНТАКТИ">
                        З питань щодо обробки персональних даних або видалення акаунту звертайтесь:
                        <span className="block mt-1" style={{ color: 'rgba(139,92,246,0.8)' }}>privacy@vespermsg.app</span>
                    </Section>

                    <div className="pt-3 border-t text-[10px]" style={{ borderColor: 'rgba(109,40,217,0.15)', color: 'rgba(100,116,139,0.5)' }}>
                        Редакція від 28.03.2026 · Версія 1.0
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 shrink-0" style={{ borderTop: '1px solid rgba(109,40,217,0.15)' }}>
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-xl text-xs font-mono tracking-widest uppercase text-white transition-all"
                        style={{
                            background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                            border: '1px solid rgba(139,92,246,0.45)',
                            boxShadow: '0 0 20px rgba(109,40,217,0.2)',
                        }}
                    >
                        Зрозуміло
                    </button>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'rgba(139,92,246,0.7)' }}>{title}</p>
            <div style={{ color: 'rgba(148,163,184,0.75)' }}>{children}</div>
        </div>
    );
}

function Highlight({ children }: { children: React.ReactNode }) {
    return <span style={{ color: 'rgba(196,181,253,0.9)', fontWeight: 600 }}>{children}</span>;
}