'use client';

import { RefObject, useState, useRef } from 'react';
import { Send, Paperclip, Mic, Loader2, X, WifiOff, Calendar, Timer } from 'lucide-react';
import { VoiceRecorder }  from '@/src/components/chat/VoiceRecorder';
import { ScheduleModal }  from '@/src/components/chat/ScheduleModal';
import { Message }        from '@/src/types/conversation.types';

const DESTRUCT_OPTIONS = [
    { label: 'Вимкнено',   value: null },
    { label: '30 сек',     value: 30 },
    { label: '5 хв',       value: 5 * 60 },
    { label: '1 год',      value: 3600 },
    { label: '24 год',     value: 24 * 3600 },
];

interface Props {
    canPost:           boolean;
    inputValue:        string;
    replyTo:           Message | null;
    typingUsers:       { userId: number; nickname: string }[];
    showVoice:         boolean;
    uploadProgress:    number | null;
    uploadError:       string | null;
    isOnline:          boolean;
    socketConnected:   boolean;
    offlineQueueCount: number;
    fileInputRef:      RefObject<HTMLInputElement | null>;
    onInputChange:     (v: string) => void;
    onSubmit:          (e: React.FormEvent, scheduledAt?: Date | null, destructAfterSeconds?: number | null) => void;
    onFileSelect:      (file: File) => void;
    onSendVoice:       (blob: Blob, wf: number[], dur: number, mime: string) => Promise<void>;
    onCancelUpload:    () => void;
    onClearError:      () => void;
    onSetReplyTo:      (msg: Message | null) => void;
    onSetShowVoice:    (v: boolean) => void;
    notifyTyping:      () => void;
}

export function ChatInput({
                              canPost, inputValue, replyTo, typingUsers, showVoice,
                              uploadProgress, uploadError, isOnline, socketConnected, offlineQueueCount,
                              fileInputRef, onInputChange, onSubmit, onFileSelect, onSendVoice, onCancelUpload,
                              onClearError, onSetReplyTo, onSetShowVoice, notifyTyping,
                          }: Readonly<Props>) {
    const [showScheduleModal, setShowScheduleModal]     = useState(false);
    const [showDestructPicker, setShowDestructPicker]   = useState(false);
    const [destructAfterSeconds, setDestructAfterSeconds] = useState<number | null>(null);
    const [focused, setFocused] = useState(false);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(e, null, destructAfterSeconds);
    };

    // Explicit click handler for the send button — ensures sending
    // works regardless of how the form submit event propagates.
    const handleSendClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!inputValue.trim()) return;
        // Create a synthetic event compatible with the onSubmit signature
        const syntheticEvent = {
            preventDefault: () => {},
        } as React.FormEvent;
        onSubmit(syntheticEvent, null, destructAfterSeconds);
    };

    const handleScheduleConfirm = (scheduledAt: Date) => {
        setShowScheduleModal(false);
        onSubmit({ preventDefault: () => {} } as React.FormEvent, scheduledAt, destructAfterSeconds);
    };

    const destructLabel = destructAfterSeconds
        ? DESTRUCT_OPTIONS.find(o => o.value === destructAfterSeconds)?.label
        : null;

    const hasText = inputValue.trim().length > 0;
    const isOffline = !isOnline || !socketConnected;

    return (
        <div
            className="shrink-0 relative"
            style={{
                background: 'var(--bg-surface)',
                borderTop: '1px solid var(--border)',
            }}
        >
            {/* ── Offline banner ── */}
            {isOffline && (
                <div
                    className="flex items-center gap-2.5 px-5 py-2 slide-up"
                    style={{
                        background: 'rgba(251,191,36,0.07)',
                        borderBottom: '1px solid rgba(251,191,36,0.12)',
                    }}
                >
                    <WifiOff size={12} className="text-amber-400 shrink-0" />
                    <span className="text-[11px]" style={{ color: 'rgba(251,191,36,0.8)' }}>
                        Немає з'єднання — повідомлення надішлються автоматично
                        {offlineQueueCount > 0 && ` (${offlineQueueCount} в черзі)`}
                    </span>
                </div>
            )}

            {/* ── Typing indicator ── */}
            {typingUsers.length > 0 && (
                <div
                    className="flex items-center gap-2.5 px-5 py-2 slide-up"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    <div className="flex items-center gap-0.5">
                        {[0, 1, 2].map(i => (
                            <span
                                key={i}
                                className="typing-dot w-1 h-1 rounded-full"
                                style={{ background: 'var(--accent)', display: 'inline-block' }}
                            />
                        ))}
                    </div>
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {typingUsers.map(t => t.nickname).join(', ')}
                        {typingUsers.length === 1 ? ' друкує…' : ' друкують…'}
                    </span>
                </div>
            )}

            {/* ── Upload progress ── */}
            {uploadProgress !== null && (
                <div
                    className="px-5 py-2.5 flex items-center gap-3 slide-up"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full transition-all duration-300"
                             style={{ width: `${uploadProgress}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="text-[10px] font-mono w-8 text-right shrink-0" style={{ color: 'var(--text-3)' }}>
                        {uploadProgress}%
                    </span>
                    <button
                        onClick={onCancelUpload}
                        className="cursor-pointer transition-colors duration-150"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--red)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* ── Upload error ── */}
            {uploadError && (
                <div
                    className="flex items-center justify-between px-5 py-2 slide-up"
                    style={{ background: 'rgba(255,77,106,0.07)', borderBottom: '1px solid rgba(255,77,106,0.12)' }}
                >
                    <span className="text-[11px]" style={{ color: 'var(--red)' }}>{uploadError}</span>
                    <button onClick={onClearError} className="cursor-pointer" style={{ color: 'var(--red)' }}>
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* ── Reply / Destruct banners ── */}
            {(replyTo || destructLabel) && (
                <div
                    className="px-5 py-2 flex items-center gap-3 slide-up"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    {replyTo && (
                        <div className="flex-1 flex items-center gap-2.5 min-w-0">
                            <div className="w-0.5 h-7 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium" style={{ color: 'var(--accent-bright)' }}>
                                    {replyTo.sender?.nickname ?? 'Користувач'}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                    {replyTo.deletedAt ? 'Повідомлення видалено' : replyTo.content || 'Файл'}
                                </p>
                            </div>
                            <button
                                onClick={() => onSetReplyTo(null)}
                                className="cursor-pointer ml-auto shrink-0 transition-colors duration-150"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                    {destructLabel && (
                        <div
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg ml-auto shrink-0"
                            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.14)' }}
                        >
                            <Timer size={11} className="text-amber-400" />
                            <span className="text-[11px] text-amber-400">{destructLabel}</span>
                            <button
                                onClick={() => setDestructAfterSeconds(null)}
                                className="cursor-pointer text-amber-400/60 hover:text-amber-400 transition-colors ml-0.5"
                            >
                                <X size={11} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Input row ── */}
            {showVoice ? (
                <VoiceRecorder onSend={onSendVoice} onCancel={() => onSetShowVoice(false)} />
            ) : canPost ? (
                <form onSubmit={handleSend} className="flex items-end gap-2 px-4 py-3">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef as any}
                        type="file"
                        className="hidden"
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) onFileSelect(f);
                            e.target.value = '';
                        }}
                    />

                    {/* Attachment button */}
                    <button
                        type="button"
                        onClick={() => (fileInputRef as any).current?.click()}
                        disabled={uploadProgress !== null}
                        className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0 disabled:opacity-40"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                            (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                            (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                        }}
                    >
                        {uploadProgress !== null
                            ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                            : <Paperclip size={16} />
                        }
                    </button>

                    {/* Text input + inline tools */}
                    <div
                        className="flex-1 flex items-center rounded-xl transition-all duration-200 px-3 gap-1"
                        style={{
                            background: focused ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)',
                            border: focused ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                            minHeight: '40px',
                        }}
                    >
                        <input
                            value={inputValue}
                            onChange={e => { onInputChange(e.target.value); notifyTyping(); }}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e as any);
                                }
                            }}
                            placeholder="Повідомлення…"
                            className="flex-1 bg-transparent outline-none text-[14px] py-2.5 min-w-0"
                            style={{
                                color: 'var(--text-1)',
                                caretColor: 'var(--accent)',
                            }}
                        />

                        {/* Schedule button */}
                        <button
                            type="button"
                            onClick={() => setShowScheduleModal(true)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
                            style={{ color: 'var(--text-3)' }}
                            title="Запланувати"
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }}
                        >
                            <Calendar size={14} />
                        </button>

                        {/* Self-destruct timer */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowDestructPicker(v => !v)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
                                title="Самознищення"
                                style={{
                                    color: destructAfterSeconds ? 'var(--amber)' : 'var(--text-3)',
                                    background: destructAfterSeconds ? 'rgba(251,191,36,0.08)' : 'transparent',
                                }}
                                onMouseEnter={e => {
                                    if (!destructAfterSeconds) {
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!destructAfterSeconds) {
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    }
                                }}
                            >
                                <Timer size={14} />
                            </button>

                            {showDestructPicker && (
                                <div
                                    className="absolute bottom-full right-0 mb-2 py-1.5 rounded-xl shadow-2xl modal-enter z-50 min-w-[160px]"
                                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-md)' }}
                                >
                                    <p className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                                        Самознищення
                                    </p>
                                    {DESTRUCT_OPTIONS.map(opt => (
                                        <button
                                            key={String(opt.value)}
                                            type="button"
                                            onClick={() => { setDestructAfterSeconds(opt.value); setShowDestructPicker(false); }}
                                            className="w-full text-left px-3 py-2 text-[12px] transition-colors duration-100 cursor-pointer"
                                            style={{
                                                color: destructAfterSeconds === opt.value ? 'var(--accent-bright)' : 'var(--text-2)',
                                                background: destructAfterSeconds === opt.value ? 'var(--accent-dim)' : 'transparent',
                                            }}
                                            onMouseEnter={e => {
                                                if (destructAfterSeconds !== opt.value)
                                                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                                            }}
                                            onMouseLeave={e => {
                                                if (destructAfterSeconds !== opt.value)
                                                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Send / Mic button */}
                    {hasText ? (
                        <button
                            type="submit"
                            onClick={handleSendClick}
                            disabled={!inputValue.trim()}
                            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0 active:scale-95 disabled:opacity-40"
                            style={{ background: 'var(--accent)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#9060ff'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--accent)'}
                        >
                            <Send size={15} className="text-white ml-0.5" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onSetShowVoice(true)}
                            disabled={uploadProgress !== null}
                            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0 disabled:opacity-40"
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-3)',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                                (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                                (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                            }}
                        >
                            <Mic size={16} />
                        </button>
                    )}
                </form>
            ) : (
                <div className="px-5 py-4 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
                    Тільки адміни можуть писати в цьому каналі
                </div>
            )}

            {showScheduleModal && (
                <ScheduleModal
                    onConfirm={handleScheduleConfirm}
                    onClose={() => setShowScheduleModal(false)}
                />
            )}
        </div>
    );
}