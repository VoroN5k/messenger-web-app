'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/context/ThemeProvider';
import { Avatar } from '@/src/components/chat/Avatar';
import api from '@/src/lib/axios';
import {
    ArrowLeft, Moon, Sun,
    Bell, Lock, UserCircle, Palette,
    ChevronRight, Check, Eye, EyeOff,
    Loader2, KeyRound,
} from 'lucide-react';

type ThemeOption = 'light' | 'dark';

export default function SettingsPage() {
    const router   = useRouter();
    const { user } = useAuthStore();
    const { theme, setTheme } = useTheme();

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">

            {/* ── Header ── */}
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

                {/* ── Profile card ── */}
                {user && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-slate-100 dark:border-slate-700">
                        <Avatar user={user} size="xl" />
                        <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-lg">
                                {user.nickname}
                            </p>
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
                                {user.email}
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Appearance ── */}
                <Section title="Зовнішній вигляд" icon={<Palette size={15} />}>
                    <div className="p-5">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                            Тема інтерфейсу
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <ThemeCard value="light" current={theme} label="Світла" icon={<Sun size={20} />}   preview={<LightPreview />} onSelect={setTheme} />
                            <ThemeCard value="dark"  current={theme} label="Темна"  icon={<Moon size={20} />}  preview={<DarkPreview />}  onSelect={setTheme} />
                        </div>
                    </div>
                </Section>

                {/* ── Password ── */}
                <Section title="Безпека" icon={<Lock size={15} />}>
                    <ChangePasswordForm />
                </Section>

                {/* ── Coming soon ── */}
                <Section title="Акаунт" icon={<UserCircle size={15} />}>
                    <ComingSoonItem label="Змінити нікнейм" />
                    <ComingSoonItem label="Email та підтвердження" last />
                </Section>

                <Section title="Сповіщення" icon={<Bell size={15} />}>
                    <ComingSoonItem label="Push-сповіщення" />
                    <ComingSoonItem label="Звуки" last />
                </Section>

                <Section title="Статус" icon={<span className="text-sm">😊</span>}>
                    <EmojiStatusForm />
                </Section>

                <p className="text-center text-xs text-slate-300 dark:text-slate-600 pb-4">
                    © 2026 My Messenger App · v1.0.0
                </p>
            </div>
        </div>
    );
}

// ── Change Password Form ──────────────────────────────────────────────────────
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
        if (!currentPassword)           return 'Введіть поточний пароль';
        if (newPassword.length < 6)     return 'Новий пароль — мінімум 6 символів';
        if (newPassword !== confirmPassword) return 'Паролі не збігаються';
        if (newPassword === currentPassword) return 'Новий пароль має відрізнятись від поточного';
        return '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) { setError(err); return; }

        setLoading(true);
        setError('');
        setSuccess(false);

        try {
            await api.patch('/auth/password', { currentPassword, newPassword });
            setSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setSuccess(false), 4000);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка зміни пароля'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <KeyRound size={15} className="text-slate-400" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Змінити пароль
                </p>
            </div>

            {/* Current password */}
            <PasswordInput
                label="Поточний пароль"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggle={() => setShowCurrent(s => !s)}
                placeholder="••••••••"
                autoComplete="current-password"
            />

            {/* New password */}
            <PasswordInput
                label="Новий пароль"
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggle={() => setShowNew(s => !s)}
                placeholder="мінімум 6 символів"
                autoComplete="new-password"
            />

            {/* Strength bar */}
            {newPassword && (
                <PasswordStrength password={newPassword} />
            )}

            {/* Confirm */}
            <PasswordInput
                label="Підтвердження пароля"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirm}
                onToggle={() => setShowConfirm(s => !s)}
                placeholder="повторіть новий пароль"
                autoComplete="new-password"
                isError={!!confirmPassword && confirmPassword !== newPassword}
            />

            {/* Error */}
            {error && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
                    {error}
                </p>
            )}

            {/* Success */}
            {success && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl">
                    <Check size={14} />
                    Пароль успішно змінено
                </div>
            )}

            <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
                {loading
                    ? <><Loader2 size={15} className="animate-spin" />Збереження...</>
                    : 'Змінити пароль'
                }
            </button>
        </form>
    );
}

// ── Password Input ────────────────────────────────────────────────────────────
function PasswordInput({
                           label, value, onChange, show, onToggle,
                           placeholder, autoComplete, isError,
                       }: {
    label:        string;
    value:        string;
    onChange:     (v: string) => void;
    show:         boolean;
    onToggle:     () => void;
    placeholder?: string;
    autoComplete?: string;
    isError?:     boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {label}
            </label>
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
                        : 'border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400'
                    }`}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer transition-colors"
                >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
            </div>
            {isError && (
                <p className="text-xs text-red-500 mt-1">Паролі не збігаються</p>
            )}
        </div>
    );
}

// ── Password Strength ─────────────────────────────────────────────────────────
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
                    <div key={i}
                         className={`h-1 flex-1 rounded-full transition-all duration-300
                            ${i < score ? level.color : 'bg-slate-200 dark:bg-slate-600'}`}
                    />
                ))}
            </div>
            <p className={`text-xs font-medium
                ${score <= 1 ? 'text-red-500'
                : score === 2 ? 'text-yellow-500'
                    : 'text-emerald-500'}`}>
                {level.label}
                {score < 3 && (
                    <span className="text-slate-400 dark:text-slate-500 font-normal ml-2">
                        · додайте цифри, великі літери або символи
                    </span>
                )}
            </p>
        </div>
    );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, children }: {
    title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">{icon}</span>
                <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {title}
                </h2>
            </div>
            {children}
        </div>
    );
}

// ── Theme card ────────────────────────────────────────────────────────────────
function ThemeCard({ value, current, label, icon, preview, onSelect }: {
    value: ThemeOption; current: ThemeOption; label: string;
    icon: React.ReactNode; preview: React.ReactNode; onSelect: (t: ThemeOption) => void;
}) {
    const active = value === current;
    return (
        <button onClick={() => onSelect(value)}
                className={`relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer text-left
                ${active
                    ? 'border-violet-500 shadow-md shadow-violet-100 dark:shadow-violet-900/30'
                    : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}`}>
            <div className="h-24 w-full overflow-hidden">{preview}</div>
            <div className={`flex items-center justify-between px-3 py-2.5
                ${active ? 'bg-violet-50 dark:bg-violet-900/20' : 'bg-white dark:bg-slate-800'}`}>
                <div className="flex items-center gap-2">
                    <span className={active ? 'text-violet-500' : 'text-slate-400 dark:text-slate-500'}>{icon}</span>
                    <span className={`text-sm font-medium ${active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-400'}`}>
                        {label}
                    </span>
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
                    <button key={e || 'none'} onClick={() => save(e)}
                            disabled={saving}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-all cursor-pointer
                                ${selected === e
                                ? 'bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-400'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
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
        <div className={`flex items-center justify-between px-5 py-3.5
            ${!last ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}>
            <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    Незабаром
                </span>
                <ChevronRight size={14} className="text-slate-300 dark:text-slate-600" />
            </div>
        </div>
    );
}