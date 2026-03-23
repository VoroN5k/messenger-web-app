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
    Wifi, Shield, Clock, RefreshCw,
} from 'lucide-react';

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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">

            {/* Header */}
            <header className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                    <button
                        onClick={() => router.push('/chat')}
                        className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Налаштування
                    </h1>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

                {/* Profile card */}
                {user && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-slate-100 dark:border-slate-700">
                        <Avatar user={user} size="xl" />
                        <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-lg">{user.nickname}</p>
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{user.email}</p>
                        </div>
                    </div>
                )}

                {/* Language */}
                <Section title="Мова інтерфейсу" icon={<Languages size={15} />}>
                    <div className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Мова / Language</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                {locale === 'uk' ? 'Зараз: Українська' : 'Current: English'}
                            </p>
                        </div>
                        <LanguageSwitcher currentLocale={locale} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl" />
                    </div>
                </Section>

                {/* Appearance */}
                <Section title="Зовнішній вигляд" icon={<Palette size={15} />}>
                    <div className="p-5">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">Тема інтерфейсу</p>
                        <div className="grid grid-cols-2 gap-3">
                            <ThemeCard value="light" current={theme} label="Світла" icon={<Sun size={20} />}   preview={<LightPreview />} onSelect={setTheme} />
                            <ThemeCard value="dark"  current={theme} label="Темна"  icon={<Moon size={20} />}  preview={<DarkPreview />}  onSelect={setTheme} />
                        </div>
                    </div>
                </Section>

                {/* Password */}
                <Section title="Безпека" icon={<Lock size={15} />}>
                    <ChangePasswordForm />
                </Section>

                {/* Active Devices */}
                <Section title="Активні пристрої" icon={<Monitor size={15} />}>
                    <ActiveDevicesSection />
                </Section>

                {/* Status */}
                <Section title="Статус" icon={<span className="text-sm">😊</span>}>
                    <EmojiStatusForm />
                </Section>

                {/* Notifications coming soon */}
                <Section title="Сповіщення" icon={<Bell size={15} />}>
                    <ComingSoonItem label="Push-сповіщення" />
                    <ComingSoonItem label="Звуки" last />
                </Section>

                {/* Account */}
                <Section title="Акаунт" icon={<UserCircle size={15} />}>
                    <ComingSoonItem label="Змінити нікнейм" />
                    <ComingSoonItem label="Email та підтвердження" />
                    <DeleteAccountSection />
                </Section>

                <p className="text-center text-xs text-slate-300 dark:text-slate-600 pb-4">
                    © 2026 My Messenger App · v1.0.0
                </p>
            </div>
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
            // Mark current session heuristically — the one that was most recently created
            // (the server doesn't expose which session belongs to this token directly,
            //  so we tag the newest one as "current")
            const sorted = [...res.data].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            const marked = sorted.map((s, i) => ({ ...s, isCurrent: i === 0 }));
            setSessions(marked);
        } catch {
            setError('Не вдалося завантажити сесії');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    const terminateSession = async (id: number) => {
        setTerminatingId(id);
        try {
            await api.delete(`/auth/sessions/${id}`);
            setSessions(prev => prev.filter(s => s.id !== id));
        } catch {
            setError('Не вдалося завершити сесію');
        } finally {
            setTerminatingId(null);
        }
    };

    const terminateAll = async () => {
        setTerminatingAll(true);
        try {
            await api.post('/auth/logout-all');
            // After logout-all the current token is also invalidated — redirect to login
            useAuthStore.getState().logout();
            localStorage.removeItem('auth-storage');
            router.push('/auth/login');
        } catch {
            setError('Не вдалося завершити всі сесії');
            setTerminatingAll(false);
        }
    };

    if (loading) {
        return (
            <div className="p-5 space-y-3">
                {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full w-1/2" />
                            <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full w-1/3" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const currentSession = sessions.find(s => s.isCurrent);
    const otherSessions  = sessions.filter(s => !s.isCurrent);

    return (
        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">

            {error && (
                <p className="px-5 py-3 text-xs text-red-500">{error}</p>
            )}

            {/* Current session */}
            {currentSession && (
                <div className="px-5 py-4">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Wifi size={11} />
                        Цей пристрій
                    </p>
                    <SessionRow session={currentSession} isCurrent />
                </div>
            )}

            {/* Other sessions */}
            {otherSessions.length > 0 && (
                <div className="px-5 py-4">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Globe size={11} />
                        Інші активні сесії · {otherSessions.length}
                    </p>
                    <div className="space-y-2">
                        {otherSessions.map(session => (
                            <div key={session.id} className="flex items-center gap-3 group">
                                <div className="flex-1 min-w-0">
                                    <SessionRow session={session} />
                                </div>
                                <button
                                    onClick={() => terminateSession(session.id)}
                                    disabled={terminatingId === session.id}
                                    className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                                               opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer disabled:opacity-40"
                                    title="Завершити сесію"
                                >
                                    {terminatingId === session.id
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <LogOut size={14} />
                                    }
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {sessions.length === 0 && !loading && (
                <p className="px-5 py-6 text-xs text-slate-400 text-center">Немає активних сесій</p>
            )}

            {/* Footer actions */}
            <div className="px-5 py-4 flex items-center justify-between gap-3">
                <button
                    onClick={fetchSessions}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer transition-colors"
                >
                    <RefreshCw size={12} />
                    Оновити
                </button>
                {otherSessions.length > 0 && (
                    <button
                        onClick={terminateAll}
                        disabled={terminatingAll}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700
                                   bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30
                                   px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                        {terminatingAll
                            ? <Loader2 size={11} className="animate-spin" />
                            : <LogOut size={11} />
                        }
                        Завершити всі інші
                    </button>
                )}
            </div>
        </div>
    );
}

function SessionRow({ session, isCurrent }: { session: Session; isCurrent?: boolean }) {
    const { browser, os } = parseUA(session.userAgent);
    return (
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${isCurrent
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>
                <DeviceIcon ua={session.userAgent} size={18} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {browser} · {os}
                    </p>
                    {isCurrent && (
                        <span className="text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">
                            Активна
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {session.ipAddress && (
                        <span className="text-[11px] text-slate-400 font-mono">{session.ipAddress}</span>
                    )}
                    <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock size={9} />
                        {formatSessionDate(session.createdAt)}
                    </span>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// DELETE ACCOUNT SECTION
// =============================================================================
function DeleteAccountSection() {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <div className="px-5 py-3.5 flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-red-500">Видалити акаунт</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        Незворотна дія — всі дані будуть видалені
                    </p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-red-500 border border-red-200 dark:border-red-900
                               hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                    <Trash2 size={12} />
                    Видалити
                </button>
            </div>

            {showModal && <DeleteAccountModal onClose={() => setShowModal(false)} />}
        </>
    );
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
    const [step,     setStep]     = useState<1 | 2>(1);
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const router = useRouter();

    // Close on Escape
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const handleDelete = async () => {
        if (!password) { setError('Введіть пароль'); return; }
        setLoading(true);
        setError('');
        try {
            await api.delete('/auth/account', { data: { password } });
            useAuthStore.getState().logout();
            localStorage.removeItem('auth-storage');
            router.push('/auth/register');
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка. Перевірте пароль.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 dark:border-slate-700">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                            <AlertTriangle size={14} className="text-red-500" />
                        </div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Видалення акаунту</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 cursor-pointer transition-colors">
                        <X size={15} />
                    </button>
                </div>

                {step === 1 ? (
                    /* ── Step 1: Warning ── */
                    <div className="p-5">
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-xl p-4 mb-5 space-y-2">
                            {[
                                'Всі ваші повідомлення будуть видалені',
                                'Акаунт не можна буде відновити',
                                'Всі активні сесії будуть завершені',
                                'Дані не можна відновити після видалення',
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-red-400 shrink-0 mt-0.5">✕</span>
                                    <p className="text-sm text-red-700 dark:text-red-300">{item}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={onClose}
                                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                                Скасувати
                            </button>
                            <button onClick={() => setStep(2)}
                                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold cursor-pointer transition-colors">
                                Я розумію, продовжити
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Step 2: Password confirm ── */
                    <div className="p-5">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Щоб підтвердити видалення, введіть ваш пароль:
                        </p>
                        <div className="relative mb-4">
                            <input
                                type={showPass ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') handleDelete(); }}
                                placeholder="Ваш пароль"
                                autoFocus
                                className={`w-full px-4 py-3 pr-10 rounded-xl border text-sm outline-none transition-all
                                    dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500
                                    ${error
                                    ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                    : 'border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-red-200 focus:border-red-400'}`}
                            />
                            <button type="button" onClick={() => setShowPass(s => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                        {error && (
                            <p className="text-xs text-red-500 mb-4">{error}</p>
                        )}
                        <div className="flex gap-2">
                            <button onClick={() => setStep(1)}
                                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                                Назад
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={loading || !password}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed
                                           text-white text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
                            >
                                {loading
                                    ? <><Loader2 size={14} className="animate-spin" />Видалення...</>
                                    : <><Trash2 size={14} />Видалити акаунт</>
                                }
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <KeyRound size={15} className="text-slate-400" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Змінити пароль</p>
            </div>
            <PasswordInput label="Поточний пароль"     value={currentPassword} onChange={setCurrentPassword} show={showCurrent} onToggle={() => setShowCurrent(s => !s)} placeholder="••••••••"             autoComplete="current-password" />
            <PasswordInput label="Новий пароль"         value={newPassword}     onChange={setNewPassword}     show={showNew}     onToggle={() => setShowNew(s => !s)}     placeholder="мінімум 6 символів" autoComplete="new-password" />
            {newPassword && <PasswordStrength password={newPassword} />}
            <PasswordInput label="Підтвердження пароля" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm(s => !s)} placeholder="повторіть новий пароль" autoComplete="new-password" isError={!!confirmPassword && confirmPassword !== newPassword} />
            {error   && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">{error}</p>}
            {success && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl">
                    <Check size={14} />Пароль успішно змінено
                </div>
            )}
            <button type="submit" disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                {loading ? <><Loader2 size={15} className="animate-spin" />Збереження...</> : 'Змінити пароль'}
            </button>
        </form>
    );
}

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

function PasswordInput({ label, value, onChange, show, onToggle, placeholder, autoComplete, isError }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; onToggle: () => void; placeholder?: string;
    autoComplete?: string; isError?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
            <div className="relative">
                <input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    className={`w-full px-4 py-2.5 pr-10 rounded-xl border text-sm outline-none transition-all
                        dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500
                        ${isError
                        ? 'border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/30'
                        : 'border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400'}`}
                />
                <button type="button" onClick={onToggle}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer transition-colors">
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
            </div>
            {isError && <p className="text-xs text-red-500 mt-1">Паролі не збігаються</p>}
        </div>
    );
}

function PasswordStrength({ password }: { password: string }) {
    const score = [
        password.length >= 8,
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;

    const levels = [
        { label: 'Дуже слабкий', color: 'bg-red-500' },
        { label: 'Слабкий',      color: 'bg-orange-400' },
        { label: 'Середній',     color: 'bg-yellow-400' },
        { label: 'Сильний',      color: 'bg-emerald-400' },
        { label: 'Дуже сильний', color: 'bg-emerald-500' },
    ];
    const level = levels[score] ?? levels[0];
    return (
        <div className="space-y-1.5">
            <div className="flex gap-1">
                {[0,1,2,3].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300
                        ${i < score ? level.color : 'bg-slate-200 dark:bg-slate-600'}`} />
                ))}
            </div>
            <p className={`text-xs font-medium ${score <= 1 ? 'text-red-500' : score === 2 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                {level.label}
                {score < 3 && <span className="text-slate-400 dark:text-slate-500 font-normal ml-2">· додайте цифри, великі літери або символи</span>}
            </p>
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">{icon}</span>
                <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{title}</h2>
            </div>
            {children}
        </div>
    );
}

function ThemeCard({ value, current, label, icon, preview, onSelect }: {
    value: ThemeOption; current: ThemeOption; label: string;
    icon: React.ReactNode; preview: React.ReactNode; onSelect: (t: ThemeOption) => void;
}) {
    const active = value === current;
    return (
        <button onClick={() => onSelect(value)}
                className={`relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer text-left
                ${active ? 'border-violet-500 shadow-md shadow-violet-100 dark:shadow-violet-900/30' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}`}>
            <div className="h-24 w-full overflow-hidden">{preview}</div>
            <div className={`flex items-center justify-between px-3 py-2.5 ${active ? 'bg-violet-50 dark:bg-violet-900/20' : 'bg-white dark:bg-slate-800'}`}>
                <div className="flex items-center gap-2">
                    <span className={active ? 'text-violet-500' : 'text-slate-400 dark:text-slate-500'}>{icon}</span>
                    <span className={`text-sm font-medium ${active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-400'}`}>{label}</span>
                </div>
                {active && (
                    <span className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                        <Check size={11} className="text-white" />
                    </span>
                )}
            </div>
        </button>
    );
}

function LightPreview() {
    return (
        <div className="w-full h-full bg-slate-100 p-2 flex gap-1.5">
            <div className="w-1/3 bg-white rounded-lg p-1.5 flex flex-col gap-1">
                <div className="w-6 h-6 rounded-full bg-violet-200" />
                <div className="h-1.5 bg-slate-100 rounded-full w-full mt-1" />
                <div className="h-1.5 bg-violet-100 rounded-full w-4/5" />
            </div>
            <div className="flex-1 bg-slate-50 rounded-lg p-1.5 flex flex-col justify-end gap-1">
                <div className="self-start h-2 bg-white border border-slate-200 rounded-full w-3/4" />
                <div className="self-end h-2 bg-violet-400 rounded-full w-1/2" />
                <div className="self-start h-2 bg-white border border-slate-200 rounded-full w-2/3" />
            </div>
        </div>
    );
}

function DarkPreview() {
    return (
        <div className="w-full h-full bg-slate-950 p-2 flex gap-1.5">
            <div className="w-1/3 bg-slate-800 rounded-lg p-1.5 flex flex-col gap-1">
                <div className="w-6 h-6 rounded-full bg-violet-500/40" />
                <div className="h-1.5 bg-slate-700 rounded-full w-full mt-1" />
                <div className="h-1.5 bg-violet-800/60 rounded-full w-4/5" />
            </div>
            <div className="flex-1 bg-slate-900 rounded-lg p-1.5 flex flex-col justify-end gap-1">
                <div className="self-start h-2 bg-slate-700 rounded-full w-3/4" />
                <div className="self-end h-2 bg-violet-500 rounded-full w-1/2" />
                <div className="self-start h-2 bg-slate-700 rounded-full w-2/3" />
            </div>
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
        <div className="p-5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Emoji-статус
                {selected && <span className="ml-2 text-lg">{selected}</span>}
            </p>
            <div className="grid grid-cols-8 gap-1.5">
                {EMOJIS.map(e => (
                    <button key={e || 'none'} onClick={() => save(e)} disabled={saving}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-all cursor-pointer
                                ${selected === e ? 'bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        {e || <span className="text-xs text-slate-400">✕</span>}
                    </button>
                ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">Відображається поряд з вашим аватаром</p>
        </div>
    );
}

function ComingSoonItem({ label, last }: { label: string; last?: boolean }) {
    return (
        <div className={`flex items-center justify-between px-5 py-3.5 ${!last ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}>
            <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">Незабаром</span>
                <ChevronRight size={14} className="text-slate-300 dark:text-slate-600" />
            </div>
        </div>
    );
}