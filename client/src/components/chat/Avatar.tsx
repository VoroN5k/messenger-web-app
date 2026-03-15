'use client';

import { useState } from 'react';

interface AvatarProps {
    user:      { nickname: string; avatarUrl?: string | null };
    size?:     'sm' | 'md' | 'lg' | 'xl';
    onClick?:  () => void;
    className?: string;
}

const SIZE_MAP = {
    sm: { container: 'w-8 h-8',   text: 'text-xs' },
    md: { container: 'w-10 h-10', text: 'text-sm' },
    lg: { container: 'w-12 h-12', text: 'text-base' },
    xl: { container: 'w-16 h-16', text: 'text-xl' },
};

// Генеруємо стабільний колір на основі нікнейму
const PALETTE = [
    'bg-violet-400', 'bg-indigo-400', 'bg-blue-400',   'bg-cyan-400',
    'bg-teal-400',   'bg-emerald-400','bg-pink-400',    'bg-rose-400',
    'bg-orange-400', 'bg-amber-400',
];

function avatarColor(nickname: string): string {
    let hash = 0;
    for (let i = 0; i < nickname.length; i++) hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
    return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({ user, size = 'md', onClick, className = '' }: AvatarProps) {
    const [imgError, setImgError] = useState(false);
    const { container, text } = SIZE_MAP[size];
    const initials = user.nickname.slice(0, 2).toUpperCase();
    const showImg  = !!user.avatarUrl && !imgError;

    return (
        <div className="relative inline-flex shrink-0" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            <div className={`${container} rounded-full overflow-hidden flex items-center justify-center select-none
            ${showImg ? '' : `${avatarColor(user.nickname)} text-white font-semibold`}
            ${className}`}>
                {showImg
                    ? <img src={user.avatarUrl!} alt={user.nickname} onError={() => setImgError(true)} className="w-full h-full object-cover" />
                    : <span className={`${text} leading-none`}>{initials}</span>}
            </div>
            {/* Emoji status badge */}
            {(user as any).statusEmoji && (
                <span className="absolute -bottom-0.5 -right-0.5 text-[11px] leading-none select-none z-10">
                {(user as any).statusEmoji}
            </span>
            )}
        </div>
    );
}