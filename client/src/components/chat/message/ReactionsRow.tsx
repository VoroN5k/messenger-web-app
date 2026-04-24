'use client';

import { useState, useRef, useEffect } from 'react';
import { Reaction, ReactionUser } from '@/src/types/conversation.types';
import { useSignedUrl } from '@/src/hooks/useSignedUrl';

interface Props {
    reactions:     Reaction[];
    currentUserId: number | string;
    onToggle:      (emoji: string) => void;
}

function SignedAvatar({ user, className }: { user: ReactionUser; className?: string }) {
    const signedUrl = useSignedUrl(user.avatarUrl);
    const bg = avatarBg(user.nickname);

    if (signedUrl) {
        return (
            <img
                src={signedUrl}
                alt={user.nickname}
                className={`w-full h-full object-cover ${className ?? ''}`}
            />
        );
    }
    return (
        <div className={`w-full h-full flex items-center justify-center text-[8px] font-bold text-white ${bg} ${className ?? ''}`}>
            {user.nickname.slice(0, 1).toUpperCase()}
        </div>
    );
}

// Tooltip showing who reacted
function ReactionTooltip({
                             reaction,
                             currentUserId,
                         }: Readonly<{
    reaction: Reaction;
    currentUserId: number | string;
}>) {
    const MAX_SHOWN = 10;
    const shown     = reaction.users.slice(0, MAX_SHOWN);
    const extra     = reaction.users.length - MAX_SHOWN;

    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                        bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800
                        rounded-2xl shadow-2xl px-3.5 py-2.5 min-w-[140px] max-w-[220px]
                        pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            {/* Emoji header */}
            <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-slate-700/60">
                <span className="text-xl leading-none">{reaction.emoji}</span>
                <span className="text-xs font-semibold text-slate-300">
                    {reaction.count} {reaction.count === 1 ? 'реакція' : reaction.count < 5 ? 'реакції' : 'реакцій'}
                </span>
            </div>

            {/* User list */}
            <div className="flex flex-col gap-1.5">
                {shown.map(u => {
                    const isMe = String(u.id) === String(currentUserId);
                    return (
                        <div key={u.id} className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full ring-1 ring-slate-700 overflow-hidden shrink-0">
                                <SignedAvatar user={u} />
                            </div>
                            <span className={`text-xs font-medium truncate ${isMe ? 'text-violet-300' : 'text-slate-200'}`}>
                                {isMe ? 'Ви' : u.nickname}
                            </span>
                        </div>
                    );
                })}
                {extra > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">+{extra} ще</p>
                )}
            </div>

            {/* Arrow */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2
                            w-3 h-3 bg-slate-900 dark:bg-slate-950 border-r border-b border-slate-700 dark:border-slate-800
                            rotate-45" />
        </div>
    );
}

// Single reaction button
function ReactionButton({
                            reaction,
                            mine,
                            currentUserId,
                            onToggle,
                        }: Readonly<{
    reaction: Reaction;
    mine: boolean;
    currentUserId: number | string;
    onToggle: () => void;
}>) {
    const [hovered, setHovered] = useState(false);
    const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = () => {
        timerRef.current = setTimeout(() => setHovered(true), 300);
    };
    const handleMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setHovered(false);
    };

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    return (
        <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <button
                onClick={onToggle}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border
                            transition-all cursor-pointer select-none active:scale-90
                            ${mine
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60'
                    : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
            >
                {/* Stacked mini-avatars (up to 3) — now using signed URLs */}
                {reaction.users.length > 0 && reaction.users.length <= 3 && (
                    <div className="flex -space-x-1.5 mr-0.5">
                        {reaction.users.slice(0, 3).map(u => (
                            <div
                                key={u.id}
                                className="w-4 h-4 rounded-full ring-1 ring-white dark:ring-slate-700 overflow-hidden shrink-0"
                            >
                                <SignedAvatar user={u} />
                            </div>
                        ))}
                    </div>
                )}
                <span className="text-sm leading-none">{reaction.emoji}</span>
                <span>{reaction.count}</span>
            </button>

            {hovered && reaction.users.length > 0 && (
                <ReactionTooltip reaction={reaction} currentUserId={currentUserId} />
            )}
        </div>
    );
}

// Simple deterministic bg color from nickname
const BG_PALETTE = [
    'bg-violet-400', 'bg-indigo-400', 'bg-blue-400', 'bg-cyan-400',
    'bg-teal-400',   'bg-emerald-400','bg-pink-400',  'bg-rose-400',
];
function avatarBg(nickname: string): string {
    let hash = 0;
    for (let i = 0; i < nickname.length; i++) hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
    return BG_PALETTE[Math.abs(hash) % BG_PALETTE.length];
}

// Public component
export function ReactionsRow({ reactions, currentUserId, onToggle }: Props) {
    if (!reactions?.length) return null;

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map(r => {
                const mine = r.userIds.some(id => String(id) === String(currentUserId));
                return (
                    <ReactionButton
                        key={r.emoji}
                        reaction={r}
                        mine={mine}
                        currentUserId={currentUserId}
                        onToggle={() => onToggle(r.emoji)}
                    />
                );
            })}
        </div>
    );
}