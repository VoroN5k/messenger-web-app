'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/context/ThemeProvider';
import { Avatar } from '@/src/components/chat/Avatar';
import { LanguageSwitcher } from '@/src/components/ui/LanguageSwitcher';
import api from '@/src/lib/axios';
import {
    ArrowLeft, Moon, Sun,
    Bell, Lock, UserCircle, Palette,
    ChevronRight, Check, Eye, EyeOff,
    Loader2, KeyRound, Languages,
    Monitor, Smartphone, Globe, Laptop,
    LogOut, Trash2, AlertTriangle, X,
    Wifi, Clock, RefreshCw, ShieldCheck, RotateCcw,
} from 'lucide-react';
import { TwoFactorSection } from "@/src/components/settings/TwoFactorSection";
import { deletePrivateKey } from '@/src/lib/crypto';

type ThemeOption = 'light' | 'dark';

// ── Session type ──────────────────────────────────────────────────────────────
interface Session {
    id:         number;
    userAgent:  string | null;
    ipAddress:  string | null;
    createdAt:  string;
    expiresAt:  string;
    isCurrent?: boolean;
}

// ── Device icon helper ────────────────────────────────────────────────────────
function DeviceIcon({ ua, size = 16 }: { ua: string | null; size?: number }) {
    const s = (ua ?? '').toLowerCase();
    if (/iphone|android|mobile/i.test(s))  return <Smartphone size={size} />;
    if (/ipad|tablet/i.test(s))            return <Laptop      size={size} />;
    return <Monitor size={size} />;
}

function parseUA(ua: string | null): { browser: string; os: string } {
    if (!ua) return { browser: 'Невідомий браузер', os: 'Невідома ОС' };
    const s = ua;

    let browser = 'Браузер';
    if (/Edg\//i.test(s))     browser = 'Microsoft Edge';
    else if (/OPR\//i.test(s)) browser = 'Opera';
    else if (/Chrome\//i.test(s)) browser = 'Chrome';
    else if (/Firefox\//i.test(s)) browser = 'Firefox';
    else if (/Safari\//i.test(s)) browser = 'Safari';

    let os = 'ОС';
    if (/Windows NT 10/i.test(s)) os = 'Windows 10/11';
    else if (/Windows/i.test(s))  os = 'Windows';
    else if (/iPhone/i.test(s))   os = 'iPhone';
    else if (/iPad/i.test(s))     os = 'iPad';
    else if (/Android/i.test(s))  os = 'Android';
    else if (/Mac OS X/i.test(s)) os = 'macOS';
    else if (/Linux/i.test(s))    os = 'Linux';

    return { browser, os };
}

function formatSessionDate(dateStr: string): string {
    const d   = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000)       return 'щойно';
    if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)} хв тому`;
    if (diff < 86_400_000)   return `сьогодні о ${d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
    if (diff < 172_800_000)  return `вчора о ${d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function SettingsPage() {
    const router   = useRouter();
    const { user } = useAuthStore();
    const { theme, setTheme } = useTheme();
    const locale = useLocale();

    return (
        <div className="h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors duration-200 overflow-hidden">

            {/* Header (Скляний ефект як у чаті) */}
            <header className="h-[60px] shrink-0 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center px-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
                <button
                    onClick={() => router.push('/chat')}
                    className="p-2 -ml-2 mr-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="font-semibold text-slate-800 dark:text-slate-100 text-lg">
                    Налаштування
                </h1>
            </header>

            {/* Головний контент (скролиться) */}
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-2xl mx-auto w-full py-8 px-4 space-y-8">

                    {/* Profile card (Центрована) */}
                    {user && (
                        <div className="flex flex-col items-center text-center space-y-3 pb-2">
                            <div className="relative">
                                <Avatar user={user} size="xl" />
                                {user.statusEmoji && (
                                    <span className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 border-2 border-white dark:border-slate-800 rounded-full text-xl shadow-sm w-8 h-8 flex items-center justify-center">
                                        {user.statusEmoji}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.nickname}</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{user.email}</p>
                            </div>
                        </div>
                    )}

                    {/* Статус */}
                    <Section title="Ваш статус" icon={<span className="text-[13px]">😊</span>}>
                        <EmojiStatusForm />
                    </Section>

                    {/* Мова */}
                    <Section title="Мова інтерфейсу" icon={<Languages size={15} />}>
                        <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                            <div>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Мова / Language</p>
                                <p className="text-[13px] text-slate-500 mt-0.5">
                                    {locale === 'uk' ? 'Зараз: Українська' : 'Current: English'}
                                </p>
                            </div>
                            <LanguageSwitcher currentLocale={locale} className="px-3 py-1.5 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" />
                        </div>
                    </Section>

                    {/* Вигляд */}
                    <Section title="Вигляд" icon={<Palette size={15} />}>
                        <div className="p-4">
                            <div className="grid grid-cols-2 gap-4">
                                <ThemeCard value="light" current={theme} label="Світла" icon={<Sun size={18} />}   preview={<LightPreview />} onSelect={setTheme} />
                                <ThemeCard value="dark"  current={theme} label="Темна"  icon={<Moon size={18} />}  preview={<DarkPreview />}  onSelect={setTheme} />
                            </div>
                        </div>
                    </Section>

                    {/* Безпека */}
                    <Section title="Безпека" icon={<Lock size={15} />}>
                        <ChangePasswordForm />
                        <ResetRecoveryPinRow />
                        <ResetLocalKeyRow />
                    </Section>

                    {/* 2FA */}
                    <Section title="Двофакторна аутентифікація" icon={<ShieldCheck size={15} />}>
                        <TwoFactorSection />
                    </Section>

                    {/* Пристрої */}
                    <Section title="Активні пристрої" icon={<Monitor size={15} />}>
                        <ActiveDevicesSection />
                    </Section>

                    {/* Сповіщення */}
                    <Section title="Сповіщення" icon={<Bell size={15} />}>
                        <ComingSoonItem label="Push-сповіщення" />
                        <ComingSoonItem label="Звуки" last />
                    </Section>

                    {/* Акаунт */}
                    <Section title="Акаунт" icon={<UserCircle size={15} />}>
                        <ComingSoonItem label="Змінити нікнейм" />
                        <ComingSoonItem label="Email та підтвердження" />
                        <DeleteAccountSection />
                    </Section>

                    <p className="text-center text-xs text-slate-400 dark:text-slate-500 pb-8">
                        © 2026 My Messenger App · v1.0.0
                    </p>
                </div>
            </main>
        </div>
    );
}

// =============================================================================
// ACTIVE DEVICES SECTION
// =============================================================================
function ActiveDevicesSection() {
    const [sessions,      setSessions]      = useState<Session[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [terminatingId, setTerminatingId] = useState<number | null>(null);
    const [terminatingAll,setTerminatingAll]= useState(false);
    const [error,         setError]         = useState('');
    const router = useRouter();

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get<Session[]>('/auth/sessions');
            const sorted = [...res.data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const marked = sorted.map((s, i) => ({ ...s, isCurrent: i === 0 }));
            setSessions(marked);
        } catch { setError('Не вдалося завантажити сесії'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    const terminateSession = async (id: number) => {
        setTerminatingId(id);
        try {
            await api.delete(`/auth/sessions/${id}`);
            setSessions(prev => prev.filter(s => s.id !== id));
        } catch { setError('Не вдалося завершити сесію'); }
        finally { setTerminatingId(null); }
    };

    const terminateAll = async () => {
        setTerminatingAll(true);
        try {
            await api.post('/auth/logout-all');
            useAuthStore.getState().logout();
            localStorage.removeItem('auth-storage');
            router.push('/auth/login');
        } catch { setError('Не вдалося завершити всі сесії'); setTerminatingAll(false); }
    };

    if (loading) {
        return (
            <div className="p-4 space-y-3">
                {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full w-1/2" />
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-1/3" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const currentSession = sessions.find(s => s.isCurrent);
    const otherSessions  = sessions.filter(s => !s.isCurrent);

    return (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {error && <p className="px-4 py-3 text-[13px] text-red-500 bg-red-50/50 dark:bg-red-900/10">{error}</p>}

            {currentSession && (
                <div className="px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <p className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Wifi size={12} /> Поточний пристрій
                    </p>
                    <SessionRow session={currentSession} isCurrent />
                </div>
            )}

            {otherSessions.length > 0 && (
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Globe size={12} /> Інші сесії · {otherSessions.length}
                        </p>
                        <button onClick={terminateAll} disabled={terminatingAll}
                                className="text-[12px] font-medium text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors">
                            {terminatingAll ? 'Завершення...' : 'Завершити всі'}
                        </button>
                    </div>
                    <div className="space-y-1">
                        {otherSessions.map(session => (
                            <div key={session.id} className="flex items-center gap-3 group hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 -mx-2 rounded-xl transition-colors">
                                <div className="flex-1 min-w-0">
                                    <SessionRow session={session} />
                                </div>
                                <button onClick={() => terminateSession(session.id)} disabled={terminatingId === session.id}
                                        className="shrink-0 p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
                                    {terminatingId === session.id ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SessionRow({ session, isCurrent }: { session: Session; isCurrent?: boolean }) {
    const { browser, os } = parseUA(session.userAgent);
    return (
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                ${isCurrent ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                <DeviceIcon ua={session.userAgent} size={20} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate">{browser} · {os}</p>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-slate-500 dark:text-slate-400 flex-wrap">
                    {session.ipAddress && <span className="font-mono text-[11px]">{session.ipAddress}</span>}
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {formatSessionDate(session.createdAt)}</span>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// DELETE ACCOUNT & RECOVERY PIN
// =============================================================================
function DeleteAccountSection() {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <div className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group" onClick={() => setShowModal(true)}>
                <div>
                    <p className="text-sm font-medium text-red-500 group-hover:text-red-600 transition-colors">Видалити акаунт</p>
                    <p className="text-[13px] text-slate-500 mt-0.5">Всі дані та чати будуть назавжди стерті</p>
                </div>
                <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-red-400 transition-colors" />
            </div>
            {showModal && <DeleteAccountModal onClose={() => setShowModal(false)} />}
        </>
    );
}

function ResetRecoveryPinRow() {
    return (
        <a href="/auth/setup-recovery?reset=true" className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group border-t border-slate-100 dark:border-slate-800">
            <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Скинути Recovery PIN</p>
                <p className="text-[13px] text-slate-500 mt-0.5">Потрібно для розшифровки повідомлень на нових пристроях</p>
            </div>
            <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-violet-500 transition-colors" />
        </a>
    );
}

function ResetLocalKeyRow() {
    const { user } = useAuthStore();
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <div
                onClick={() => setShowModal(true)}
                className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group border-t border-slate-100 dark:border-slate-800 cursor-pointer"
            >
                <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Скинути ключ на цьому пристрої</p>
                    <p className="text-[13px] text-slate-500 mt-0.5">Видаляє локальний ключ і запитує Recovery PIN при вході</p>
                </div>
                <RotateCcw size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-amber-500 transition-colors" />
            </div>
            {showModal && user && (
                <ResetLocalKeyModal userId={user.id} onClose={() => setShowModal(false)} />
            )}
        </>
    );
}

function ResetLocalKeyModal({ userId, onClose }: { userId: number; onClose: () => void }) {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const handleReset = async () => {
        setLoading(true);
        await deletePrivateKey(userId);
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200/50 dark:border-slate-700/50 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <RotateCcw size={16} className="text-amber-500" /> Скидання ключа
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl p-4 space-y-2">
                        <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                            <AlertTriangle size={14} /> Що відбудеться
                        </p>
                        <ul className="text-[13px] text-amber-700/80 dark:text-amber-300/70 space-y-1.5">
                            <li className="flex gap-2"><span>→</span> Локальний ключ шифрування буде видалено з цього браузера</li>
                            <li className="flex gap-2"><span>→</span> При наступному вході з'явиться запит Recovery PIN</li>
                            <li className="flex gap-2"><span>→</span> Після введення PIN усі повідомлення знову будуть читабельні</li>
                        </ul>
                    </div>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        Переконайся, що Recovery PIN налаштований до скидання. Якщо ні — спочатку встанови його через «Скинути Recovery PIN».
                    </p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[14px] transition-colors">
                            Скасувати
                        </button>
                        <button onClick={handleReset} disabled={loading}
                                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[14px] font-semibold flex justify-center items-center gap-2 transition-colors">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Скинути ключ'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
    const [step,       setStep]       = useState<1 | 2>(1);
    const [password,   setPassword]   = useState('');
    const [showPass,   setShowPass]   = useState(false);
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');

    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [twoFACode,    setTwoFACode]    = useState('');
    const [checkingTwoFA, setCheckingTwoFA] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    useEffect(() => {
        if (step !== 2) return;
        setCheckingTwoFA(true);
        api.get('/auth/2fa/status').then(r => setTwoFAEnabled(r.data.enabled)).catch(() => {}).finally(() => setCheckingTwoFA(false));
    }, [step]);

    const handleDelete = async () => {
        if (!password) { setError('Введіть пароль'); return; }
        if (twoFAEnabled && twoFACode.length !== 6) { setError('Введіть 6-значний код 2FA'); return; }
        setLoading(true); setError('');
        try {
            await api.delete('/auth/account', { data: { password, ...(twoFAEnabled && twoFACode ? { twoFactorCode: twoFACode } : {}) } });
            useAuthStore.getState().logout();
            localStorage.removeItem('auth-storage');
            router.push('/auth/register');
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка. Перевірте пароль.'));
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200/50 dark:border-slate-700/50 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-500" /> Видалення акаунту
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {step === 1 ? (
                    <div className="p-5">
                        <p className="text-[14px] text-slate-600 dark:text-slate-300 mb-4 text-center">
                            Ви впевнені? Це незворотна дія.
                        </p>
                        <ul className="text-[13px] text-slate-500 space-y-2 bg-red-50/50 dark:bg-red-900/10 p-4 rounded-xl mb-6 border border-red-100 dark:border-red-900/30">
                            <li className="flex gap-2"><span className="text-red-400">✕</span> Всі повідомлення зникнуть</li>
                            <li className="flex gap-2"><span className="text-red-400">✕</span> Друзі втратять зв'язок з вами</li>
                            <li className="flex gap-2"><span className="text-red-400">✕</span> Дані неможливо буде відновити</li>
                        </ul>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => setStep(2)} className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[14px] font-semibold transition-colors">
                                Продовжити видалення
                            </button>
                            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-[14px] transition-colors">
                                Скасувати
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 space-y-4">
                        <div className="relative">
                            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                                   onKeyDown={e => { if (e.key === 'Enter' && !twoFAEnabled) handleDelete(); }} placeholder="Ваш пароль" autoFocus
                                   className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-transparent focus:border-red-400 text-[14px] outline-none transition-all dark:text-white" />
                            <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        {checkingTwoFA && <div className="text-[12px] text-slate-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Перевірка безпеки...</div>}
                        {!checkingTwoFA && twoFAEnabled && (
                            <input type="text" inputMode="numeric" maxLength={6} value={twoFACode} onChange={e => { setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                                   onKeyDown={e => { if (e.key === 'Enter') handleDelete(); }} placeholder="Код 2FA (000000)"
                                   className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-transparent focus:border-red-400 text-center text-[14px] font-mono tracking-widest outline-none transition-all dark:text-white" />
                        )}
                        {error && <p className="text-[13px] text-red-500">{error}</p>}

                        <div className="flex gap-2 mt-2">
                            <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[14px] transition-colors">
                                Назад
                            </button>
                            <button onClick={handleDelete} disabled={loading || !password} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[14px] font-semibold flex justify-center items-center gap-2 transition-colors">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Видалити'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// CHANGE PASSWORD FORM
// =============================================================================
function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword,     setNewPassword]     = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew,     setShowNew]     = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error,   setError]   = useState('');

    const validate = () => {
        if (!currentPassword)                return 'Введіть поточний пароль';
        if (newPassword.length < 6)          return 'Новий пароль — мінімум 6 символів';
        if (newPassword !== confirmPassword) return 'Паролі не збігаються';
        if (newPassword === currentPassword) return 'Новий пароль має відрізнятись від поточного';
        return '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) { setError(err); return; }
        setLoading(true); setError(''); setSuccess(false);
        try {
            await api.patch('/auth/password', { currentPassword, newPassword });
            setSuccess(true);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            setTimeout(() => setSuccess(false), 4000);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка зміни пароля'));
        } finally { setLoading(false); }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <PasswordInput label="Поточний пароль"     value={currentPassword} onChange={setCurrentPassword} show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} placeholder="••••••••" />
            <PasswordInput label="Новий пароль"         value={newPassword}     onChange={setNewPassword}     show={showNew}     onToggle={() => setShowNew(!showNew)}     placeholder="Мінімум 6 символів" />
            {newPassword && <PasswordStrength password={newPassword} />}
            <PasswordInput label="Підтвердження пароля" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} placeholder="Повторіть новий пароль" isError={!!confirmPassword && confirmPassword !== newPassword} />

            {error   && <p className="text-[13px] text-red-500 bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-lg">{error}</p>}
            {success && <div className="flex items-center gap-2 text-[13px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 px-3 py-2 rounded-lg"><Check size={14} /> Пароль успішно змінено</div>}

            <button type="submit" disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-[14px] font-medium transition-colors flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Змінити пароль'}
            </button>
        </form>
    );
}

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

function PasswordInput({ label, value, onChange, show, onToggle, placeholder, isError }: any) {
    return (
        <div>
            <div className="relative">
                <input
                    type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                    className={`w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-transparent text-[14px] outline-none transition-all dark:text-white dark:placeholder-slate-500
                        ${isError ? 'focus:border-red-400 bg-red-50/50 dark:bg-red-900/10' : 'focus:border-violet-400'}`}
                />
                <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
        </div>
    );
}

function PasswordStrength({ password }: { password: string }) {
    const score = [ password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password) ].filter(Boolean).length;
    const levels = [
        { label: 'Дуже слабкий', color: 'bg-red-500' }, { label: 'Слабкий', color: 'bg-orange-400' },
        { label: 'Середній', color: 'bg-yellow-400' }, { label: 'Сильний', color: 'bg-emerald-400' }, { label: 'Дуже сильний', color: 'bg-emerald-500' },
    ];
    const level = levels[score] ?? levels[0];
    return (
        <div className="space-y-1.5 px-1">
            <div className="flex gap-1.5">
                {[0,1,2,3].map((i) => (<div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? level.color : 'bg-slate-200 dark:bg-slate-700'}`} />))}
            </div>
            <p className={`text-[11px] font-medium ${score <= 1 ? 'text-red-500' : score === 2 ? 'text-yellow-500' : 'text-emerald-500'}`}>{level.label}</p>
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider ml-2 flex items-center gap-2">
                {icon} {title}
            </h3>
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 overflow-hidden shadow-sm">
                {children}
            </div>
        </div>
    );
}

function ThemeCard({ value, current, label, icon, preview, onSelect }: any) {
    const active = value === current;
    return (
        <button onClick={() => onSelect(value)}
                className={`relative rounded-xl border-2 overflow-hidden transition-all text-left flex flex-col group
                ${active ? 'border-violet-500 ring-4 ring-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
            <div className="h-20 w-full overflow-hidden opacity-90 group-hover:opacity-100 transition-opacity">{preview}</div>
            <div className={`flex items-center justify-between px-3 py-2 ${active ? 'bg-violet-50 dark:bg-violet-900/20' : 'bg-slate-50 dark:bg-slate-800'}`}>
                <div className="flex items-center gap-2">
                    <span className={active ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500'}>{icon}</span>
                    <span className={`text-[13px] font-medium ${active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-300'}`}>{label}</span>
                </div>
                {active && <span className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0"><Check size={10} className="text-white" /></span>}
            </div>
        </button>
    );
}

function LightPreview() {
    return (
        <div className="w-full h-full bg-slate-100 p-2 flex gap-1.5 pointer-events-none">
            <div className="w-1/3 bg-white rounded-md p-1.5 flex flex-col gap-1 shadow-sm"><div className="w-4 h-4 rounded-full bg-violet-100" /><div className="h-1 bg-slate-100 rounded-full w-full" /><div className="h-1 bg-violet-100 rounded-full w-4/5" /></div>
            <div className="flex-1 bg-white rounded-md p-1.5 flex flex-col justify-end gap-1.5 shadow-sm"><div className="self-start h-2 bg-slate-100 rounded-full w-3/4" /><div className="self-end h-2 bg-violet-400 rounded-full w-1/2" /></div>
        </div>
    );
}

function DarkPreview() {
    return (
        <div className="w-full h-full bg-slate-950 p-2 flex gap-1.5 pointer-events-none">
            <div className="w-1/3 bg-slate-900 rounded-md p-1.5 flex flex-col gap-1"><div className="w-4 h-4 rounded-full bg-violet-500/20" /><div className="h-1 bg-slate-800 rounded-full w-full" /><div className="h-1 bg-violet-500/30 rounded-full w-4/5" /></div>
            <div className="flex-1 bg-slate-900 rounded-md p-1.5 flex flex-col justify-end gap-1.5"><div className="self-start h-2 bg-slate-800 rounded-full w-3/4" /><div className="self-end h-2 bg-violet-500 rounded-full w-1/2" /></div>
        </div>
    );
}

function EmojiStatusForm() {
    const { user, accessToken } = useAuthStore();
    const setAuth = useAuthStore(s => s.setAuth);
    const [selected, setSelected] = useState<string>((user as any)?.statusEmoji ?? '');
    const [saving, setSaving] = useState(false);
    const EMOJIS = ['', '😊','🔥','💤','🎮','✈️','🤒','📚','🎵','🍕','🔕','💼','🏋️','🎉','❤️','⚡'];

    const save = async (emoji: string) => {
        setSaving(true);
        try {
            await api.patch('/users/status', { emoji: emoji || null });
            if (user && accessToken) setAuth({ ...user, statusEmoji: emoji || null } as any, accessToken);
            setSelected(emoji);
        } finally { setSaving(false); }
    };

    return (
        <div className="p-4">
            <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                {EMOJIS.map(e => (
                    <button key={e || 'none'} onClick={() => save(e)} disabled={saving}
                            className={`aspect-square flex items-center justify-center rounded-xl text-lg sm:text-xl transition-all
                                ${selected === e ? 'bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-400 shadow-sm scale-110' : 'hover:bg-slate-100 dark:hover:bg-slate-800 bg-slate-50 dark:bg-slate-900/50'}`}>
                        {e || <span className="text-[10px] font-medium text-slate-400">OFF</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ComingSoonItem({ label, last }: { label: string; last?: boolean }) {
    return (
        <div className={`flex items-center justify-between px-4 py-3 ${!last ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
            <span className="text-[14px] text-slate-800 dark:text-slate-200">{label}</span>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md uppercase tracking-wide">В розробці</span>
        </div>
    );
}