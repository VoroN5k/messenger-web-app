'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/context/ThemeProvider';
import { Avatar } from '@/src/components/chat/Avatar';
import {
    ArrowLeft, Moon, Sun, Monitor,
    Bell, Lock, UserCircle, Palette,
    ChevronRight, Check,
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

                {/* ── Appearance section ── */}
                <Section title="Зовнішній вигляд" icon={<Palette size={15} />}>

                    <div className="p-5">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                            Тема інтерфейсу
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <ThemeCard
                                value="light"
                                current={theme}
                                label="Світла"
                                icon={<Sun size={20} />}
                                preview={<LightPreview />}
                                onSelect={setTheme}
                            />
                            <ThemeCard
                                value="dark"
                                current={theme}
                                label="Темна"
                                icon={<Moon size={20} />}
                                preview={<DarkPreview />}
                                onSelect={setTheme}
                            />
                        </div>
                    </div>
                </Section>

                {/* ── Coming soon sections ── */}
                <Section title="Акаунт" icon={<UserCircle size={15} />}>
                    <ComingSoonItem label="Змінити нікнейм" />
                    <ComingSoonItem label="Змінити пароль" />
                    <ComingSoonItem label="Email та безпека" last />
                </Section>

                <Section title="Сповіщення" icon={<Bell size={15} />}>
                    <ComingSoonItem label="Push-сповіщення" />
                    <ComingSoonItem label="Звуки" last />
                </Section>

                <Section title="Приватність" icon={<Lock size={15} />}>
                    <ComingSoonItem label="Статус онлайн" />
                    <ComingSoonItem label="Підтвердження читання" last />
                </Section>

                <p className="text-center text-xs text-slate-300 dark:text-slate-600 pb-4">
                    © 2026 My Messenger App · v1.0.0
                </p>
            </div>
        </div>
    );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
                     title, icon, children,
                 }: {
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
function ThemeCard({
                       value, current, label, icon, preview, onSelect,
                   }: {
    value:    ThemeOption;
    current:  ThemeOption;
    label:    string;
    icon:     React.ReactNode;
    preview:  React.ReactNode;
    onSelect: (t: ThemeOption) => void;
}) {
    const active = value === current;
    return (
        <button
            onClick={() => onSelect(value)}
            className={`relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer text-left
                ${active
                ? 'border-violet-500 shadow-md shadow-violet-100 dark:shadow-violet-900/30'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
            }`}
        >
            {/* Mini preview */}
            <div className="h-24 w-full overflow-hidden">
                {preview}
            </div>

            {/* Label */}
            <div className={`flex items-center justify-between px-3 py-2.5
                ${active
                ? 'bg-violet-50 dark:bg-violet-900/20'
                : 'bg-white dark:bg-slate-800'
            }`}
            >
                <div className="flex items-center gap-2">
                    <span className={active ? 'text-violet-500' : 'text-slate-400 dark:text-slate-500'}>
                        {icon}
                    </span>
                    <span className={`text-sm font-medium
                        ${active
                        ? 'text-violet-700 dark:text-violet-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
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

// ── Mini previews ─────────────────────────────────────────────────────────────
function LightPreview() {
    return (
        <div className="w-full h-full bg-slate-100 p-2 flex gap-1.5">
            {/* Sidebar */}
            <div className="w-1/3 bg-white rounded-lg p-1.5 flex flex-col gap-1">
                <div className="w-6 h-6 rounded-full bg-violet-200" />
                <div className="h-1.5 bg-slate-100 rounded-full w-full mt-1" />
                <div className="h-1.5 bg-violet-100 rounded-full w-4/5" />
                <div className="h-1.5 bg-slate-100 rounded-full w-full" />
            </div>
            {/* Chat */}
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
            {/* Sidebar */}
            <div className="w-1/3 bg-slate-800 rounded-lg p-1.5 flex flex-col gap-1">
                <div className="w-6 h-6 rounded-full bg-violet-500/40" />
                <div className="h-1.5 bg-slate-700 rounded-full w-full mt-1" />
                <div className="h-1.5 bg-violet-800/60 rounded-full w-4/5" />
                <div className="h-1.5 bg-slate-700 rounded-full w-full" />
            </div>
            {/* Chat */}
            <div className="flex-1 bg-slate-900 rounded-lg p-1.5 flex flex-col justify-end gap-1">
                <div className="self-start h-2 bg-slate-700 rounded-full w-3/4" />
                <div className="self-end h-2 bg-violet-500 rounded-full w-1/2" />
                <div className="self-start h-2 bg-slate-700 rounded-full w-2/3" />
            </div>
        </div>
    );
}

// ── Coming soon item ──────────────────────────────────────────────────────────
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