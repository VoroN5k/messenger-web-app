'use client';

import { RefObject, useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Send, Paperclip, Mic, Loader2, X, WifiOff, Calendar, Timer, Forward, ChevronLeft, ShieldOff, Mail, CheckCircle2 } from 'lucide-react';
import { VoiceRecorder }  from '@/src/components/chat/VoiceRecorder';
import { ScheduleModal }  from '@/src/components/chat/ScheduleModal';
import { Message }        from '@/src/types/conversation.types';


interface Props {
    canPost:           boolean;
    inputValue:        string;
    replyTo:           Message | null;
    pendingForward:    Message | null;
    onClearPendingForward: () => void;
    typingUsers:       { userId: number; nickname: string }[];
    showVoice:         boolean;
    uploadProgress:    number | null;
    uploadError:       string | null;
    isOnline:          boolean;
    socketConnected:   boolean;
    offlineQueueCount: number;
    fileInputRef:      RefObject<HTMLInputElement | null>;
    inputRef?:         RefObject<HTMLTextAreaElement | null>;
    onInputChange:     (v: string) => void;
    onSubmit:          (e: React.FormEvent, scheduledAt?: Date | null, destructAfterSeconds?: number | null) => void;
    onFileSelect:      (file: File) => void;
    onSendVoice:       (blob: Blob, wf: number[], dur: number, mime: string) => Promise<void>;
    onCancelUpload:    () => void;
    onClearError:      () => void;
    onSetReplyTo:      (msg: Message | null) => void;
    onSetShowVoice:    (v: boolean) => void;
    notifyTyping:      () => void;
    peerV2Blocked?:    boolean;
    peerV2Loading?:    boolean;
    onNotifyPeerV2?:   () => Promise<void>;
    notifyV2Sent?:     boolean;
}

export function ChatInput({
                              canPost, inputValue, replyTo, pendingForward, onClearPendingForward,
                              typingUsers, showVoice,
                              uploadProgress, uploadError, isOnline, socketConnected, offlineQueueCount,
                              fileInputRef, inputRef, onInputChange, onSubmit, onFileSelect, onSendVoice, onCancelUpload,
                              onClearError, onSetReplyTo, onSetShowVoice, notifyTyping,
                              peerV2Blocked, peerV2Loading, onNotifyPeerV2, notifyV2Sent,
                          }: Readonly<Props>) {
    const t = useTranslations('input');
    const tMsg = useTranslations('message');
    const [showScheduleModal,    setShowScheduleModal]    = useState(false);
    const [showDestructPicker,   setShowDestructPicker]   = useState(false);
    const [destructAfterSeconds, setDestructAfterSeconds] = useState<number | null>(null);
    const [focused,              setFocused]              = useState(false);
    const [notifying,            setNotifying]            = useState(false);
    // Mobile long-press menu
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [mobilePage,     setMobilePage]     = useState<'main' | 'destruct'>('main');
    const longPressRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPress   = useRef(false);
    const justSentRef    = useRef(false);

    const fireSubmit = (scheduledAt?: Date | null) => {
        onSubmit({ preventDefault: () => {} } as React.FormEvent, scheduledAt ?? null, destructAfterSeconds);
    };

    // Auto-resize textarea to fit content
    useEffect(() => {
        const el = inputRef?.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [inputValue, inputRef]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        fireSubmit(null);
    };

    const handleScheduleConfirm = (scheduledAt: Date) => {
        setShowScheduleModal(false);
        onSubmit({ preventDefault: () => {} } as React.FormEvent, scheduledAt, destructAfterSeconds);
    };

    // ── Long-press on send button (mobile) ──────────────────────────────────
    const onSendPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        // Only intercept left-button / touch
        if (e.button !== undefined && e.button !== 0) return;
        didLongPress.current = false;
        longPressRef.current = setTimeout(() => {
            didLongPress.current = true;
            navigator.vibrate?.(25);
            setMobilePage('main');
            setShowMobileMenu(true);
        }, 500);
    };

    const onSendPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (longPressRef.current) clearTimeout(longPressRef.current);
        if (!didLongPress.current && canSend) {
            justSentRef.current = true;
            setTimeout(() => { justSentRef.current = false; }, 400);
            fireSubmit(null);
        }
    };

    const onSendPointerCancel = () => {
        if (longPressRef.current) clearTimeout(longPressRef.current);
    };

    const DESTRUCT_OPTIONS = [
        { label: 'Off',    value: null },
        { label: '30 sec', value: 30 },
        { label: '5 min',  value: 5 * 60 },
        { label: '1 hr',   value: 3600 },
        { label: '24 hr',  value: 24 * 3600 },
    ];
    const destructLabel = destructAfterSeconds
        ? DESTRUCT_OPTIONS.find(o => o.value === destructAfterSeconds)?.label
        : null;

    const hasText  = inputValue.trim().length > 0;
    const hasFwd   = !!pendingForward;
    const canSend  = hasText || hasFwd;
    const isOffline = !isOnline || !socketConnected;

    const fwdSenderName = pendingForward?.sender?.nickname
        ?? pendingForward?.forwardedFrom?.sender?.nickname
        ?? '?';
    const fwdContent = pendingForward?.fileUrl
        ? (pendingForward.fileType?.startsWith('audio/') ? tMsg('voice') : tMsg('file'))
        : (pendingForward?.content ?? '');

    return (
        <div className="shrink-0 relative"
             style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>

            {/* ── Offline banner ── */}
            {isOffline && (
                <div className="flex items-center gap-2.5 px-5 py-2 slide-up"
                     style={{ background: 'rgba(251,191,36,0.07)', borderBottom: '1px solid rgba(251,191,36,0.12)' }}>
                    <WifiOff size={12} className="text-amber-400 shrink-0" />
                    <span className="text-[11px]" style={{ color: 'rgba(251,191,36,0.8)' }}>
                        {t('offline_banner')}
                        {offlineQueueCount > 0 && ` (${offlineQueueCount})`}
                    </span>
                </div>
            )}

            {/* ── Typing indicator ── */}
            {typingUsers.length > 0 && (
                <div className="flex items-center gap-2.5 px-5 py-2 slide-up"
                     style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-0.5">
                        {[0, 1, 2].map(i => (
                            <span key={i} className="typing-dot w-1 h-1 rounded-full"
                                  style={{ background: 'var(--accent)', display: 'inline-block' }} />
                        ))}
                    </div>
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {typingUsers.map(u => u.nickname).join(', ')}
                        {' '}{typingUsers.length === 1 ? t('typing_one') : t('typing_many')}
                    </span>
                </div>
            )}

            {/* ── Upload progress ── */}
            {uploadProgress !== null && (
                <div className="px-5 py-2.5 flex items-center gap-3 slide-up"
                     style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex-1 h-0.5 rounded-full overflow-hidden"
                         style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full transition-all duration-300"
                             style={{ width: `${uploadProgress}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="text-[10px] font-mono w-8 text-right shrink-0"
                          style={{ color: 'var(--text-3)' }}>
                        {uploadProgress}%
                    </span>
                    <button onClick={onCancelUpload} className="cursor-pointer transition-colors duration-150"
                            style={{ color: 'var(--text-3)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--red)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* ── Upload error ── */}
            {uploadError && (
                <div className="flex items-center justify-between px-5 py-2 slide-up"
                     style={{ background: 'rgba(255,77,106,0.07)', borderBottom: '1px solid rgba(255,77,106,0.12)' }}>
                    <span className="text-[11px]" style={{ color: 'var(--red)' }}>{uploadError}</span>
                    <button onClick={onClearError} className="cursor-pointer" style={{ color: 'var(--red)' }}>
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* ── Reply / Pending Forward / Destruct banners ── */}
            {(replyTo || pendingForward || destructLabel) && (
                <div className="px-5 py-2 flex flex-col gap-1.5 slide-up"
                     style={{ borderBottom: '1px solid var(--border)' }}>

                    {replyTo && (
                        <div className="flex items-center gap-2.5">
                            <div className="w-0.5 h-7 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium" style={{ color: 'var(--accent-bright)' }}>
                                    {replyTo.sender?.nickname ?? 'Користувач'}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                    {replyTo.deletedAt ? tMsg('deleted') : replyTo.content || tMsg('file')}
                                </p>
                            </div>
                            <button onClick={() => onSetReplyTo(null)}
                                    className="cursor-pointer ml-auto shrink-0 transition-colors duration-150"
                                    style={{ color: 'var(--text-3)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {pendingForward && (
                        <div className="flex items-center gap-2.5">
                            <div className="w-0.5 h-8 rounded-full shrink-0"
                                 style={{ background: 'rgba(99,179,237,0.8)' }} />
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <Forward size={11} style={{ color: 'rgba(99,179,237,0.8)', flexShrink: 0 }} />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-medium" style={{ color: 'rgba(99,179,237,0.9)' }}>
                                        {t('forward_from', { name: fwdSenderName })}
                                    </p>
                                    <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                        {fwdContent || '…'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClearPendingForward}
                                    className="cursor-pointer ml-auto shrink-0 transition-colors duration-150"
                                    style={{ color: 'var(--text-3)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {destructLabel && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg self-end shrink-0"
                             style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.14)' }}>
                            <Timer size={11} className="text-amber-400" />
                            <span className="text-[11px] text-amber-400">{destructLabel}</span>
                            <button onClick={() => setDestructAfterSeconds(null)}
                                    className="cursor-pointer text-amber-400/60 hover:text-amber-400 transition-colors ml-0.5">
                                <X size={11} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Input row ── */}
            {peerV2Blocked ? (
                /* Peer hasn't upgraded to v2 — sending is blocked to prevent downgrade */
                <div className="px-5 py-4 flex flex-col items-center gap-3 text-center slide-up">
                    <div className="flex items-center gap-2">
                        <ShieldOff size={15} className="text-amber-400 shrink-0" />
                        <span className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
                            Peer hasn&apos;t upgraded to Vesper v2 security
                        </span>
                    </div>
                    <p className="text-[11px] max-w-sm" style={{ color: 'var(--text-3)' }}>
                        New messages are blocked to prevent downgrade to the old protocol.
                        Previous messages are shown read-only.
                    </p>
                    <button
                        onClick={async () => {
                            if (!onNotifyPeerV2 || notifyV2Sent || notifying) return;
                            setNotifying(true);
                            await onNotifyPeerV2().catch(() => {});
                            setNotifying(false);
                        }}
                        disabled={notifyV2Sent || notifying}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all duration-150 cursor-pointer disabled:cursor-default"
                        style={{
                            background: notifyV2Sent ? 'rgba(255,255,255,0.04)' : 'rgba(251,191,36,0.12)',
                            border: notifyV2Sent ? '1px solid var(--border)' : '1px solid rgba(251,191,36,0.25)',
                            color: notifyV2Sent ? 'var(--text-3)' : 'rgb(251,191,36)',
                        }}
                    >
                        {notifyV2Sent
                            ? <><CheckCircle2 size={13} /> Notification sent</>
                            : notifying
                                ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                                : <><Mail size={13} /> Notify via email</>
                        }
                    </button>
                </div>
            ) : peerV2Loading ? (
                <div className="px-5 py-4 flex items-center justify-center gap-2"
                     style={{ color: 'var(--text-3)' }}>
                    <Loader2 size={13} className="animate-spin" />
                    <span className="text-[12px]">Checking peer security…</span>
                </div>
            ) : showVoice ? (
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

                    {/* Text input + desktop-only inline tools */}
                    <div
                        className="flex-1 flex items-end rounded-xl transition-all duration-200 px-3 gap-1"
                        style={{
                            background: focused ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)',
                            border: focused ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                            minHeight: '40px',
                        }}
                    >
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            rows={1}
                            onChange={e => { onInputChange(e.target.value); notifyTyping(); }}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e as any);
                                }
                            }}
                            placeholder={pendingForward ? t('placeholder_forward') : t('placeholder')}
                            className="flex-1 bg-transparent outline-none py-2.5 min-w-0 resize-none"
                            style={{
                                color: 'var(--text-1)', caretColor: 'var(--accent)', fontSize: '14px',
                                maxHeight: '160px', overflowY: 'auto', lineHeight: '1.5',
                            }}
                        />

                        {/* ── Desktop-only: Schedule + Self-destruct ── */}
                        <button
                            type="button"
                            onClick={() => setShowScheduleModal(true)}
                            className="hidden md:flex w-7 h-7 rounded-lg items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
                            style={{ color: 'var(--text-3)' }}
                            title={t('schedule')}
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

                        <div className="hidden md:block relative">
                            <button
                                type="button"
                                onClick={() => setShowDestructPicker(v => !v)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
                                title={t('self_destruct')}
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
                                <div className="absolute bottom-full right-0 mb-2 py-1.5 rounded-xl shadow-2xl modal-enter z-50 min-w-[160px]"
                                     style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-md)' }}>
                                    <p className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest"
                                       style={{ color: 'var(--text-3)' }}>
                                        {t('self_destruct')}
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

                    {/* ── Send / Mic / Long-press menu ── */}
                    <div className="relative shrink-0">
                        {/* Mobile long-press popup */}
                        {showMobileMenu && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setShowMobileMenu(false)}
                                />
                                {/* Menu panel */}
                                <div
                                    className="absolute bottom-full right-0 mb-2 rounded-2xl shadow-2xl modal-enter z-50 overflow-hidden"
                                    style={{
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-md)',
                                        minWidth: '210px',
                                    }}
                                >
                                    {mobilePage === 'main' ? (
                                        <>
                                            <div className="px-4 py-2.5"
                                                 style={{ borderBottom: '1px solid var(--border)' }}>
                                                <p className="text-[10px] font-semibold uppercase tracking-wider"
                                                   style={{ color: 'var(--text-3)' }}>
                                                    {t('send_as')}
                                                </p>
                                            </div>

                                            {/* Send now */}
                                            <button
                                                type="button"
                                                className="flex items-center gap-3 w-full px-4 py-3.5 text-[13px] cursor-pointer transition-colors duration-100"
                                                style={{ color: 'var(--text-1)' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                                onClick={() => { setShowMobileMenu(false); fireSubmit(null); }}
                                            >
                                                <Send size={15} style={{ color: 'var(--accent)' }} />
                                                {t('send_now')}
                                            </button>

                                            {/* Schedule */}
                                            <button
                                                type="button"
                                                className="flex items-center gap-3 w-full px-4 py-3.5 text-[13px] cursor-pointer transition-colors duration-100"
                                                style={{ color: 'var(--text-1)' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                                onClick={() => { setShowMobileMenu(false); setShowScheduleModal(true); }}
                                            >
                                                <Calendar size={15} style={{ color: 'var(--text-2)' }} />
                                                {t('schedule')}
                                            </button>

                                            {/* Self-destruct */}
                                            <button
                                                type="button"
                                                className="flex items-center gap-3 w-full px-4 py-3.5 text-[13px] cursor-pointer transition-colors duration-100"
                                                style={{ color: 'var(--text-1)', borderTop: '1px solid var(--border)' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                                onClick={() => setMobilePage('destruct')}
                                            >
                                                <Timer size={15} style={{ color: destructAfterSeconds ? 'var(--amber)' : 'var(--text-2)' }} />
                                                <span className="flex-1 text-left">{t('self_destruct')}</span>
                                                {destructAfterSeconds && (
                                                    <span className="text-[11px]" style={{ color: 'var(--amber)' }}>
                                                        {destructLabel}
                                                    </span>
                                                )}
                                                <ChevronLeft size={13} style={{ color: 'var(--text-3)', transform: 'rotate(180deg)' }} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="flex items-center gap-2 w-full px-4 py-2.5 cursor-pointer transition-colors duration-100"
                                                style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                                onClick={() => setMobilePage('main')}
                                            >
                                                <ChevronLeft size={14} />
                                                <span className="text-[10px] font-semibold uppercase tracking-wider"
                                                      style={{ color: 'var(--text-3)' }}>
                                                    {t('self_destruct')}
                                                </span>
                                            </button>
                                            {DESTRUCT_OPTIONS.map(opt => (
                                                <button
                                                    key={String(opt.value)}
                                                    type="button"
                                                    className="flex items-center gap-3 w-full px-4 py-3 text-[13px] cursor-pointer transition-colors duration-100"
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
                                                    onClick={() => {
                                                        setDestructAfterSeconds(opt.value);
                                                        setShowMobileMenu(false);
                                                        setMobilePage('main');
                                                    }}
                                                >
                                                    {destructAfterSeconds === opt.value
                                                        ? <span className="w-3 text-center" style={{ color: 'var(--accent-bright)' }}>✓</span>
                                                        : <span className="w-3" />
                                                    }
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Send button */}
                        {canSend ? (
                            <button
                                type="button"
                                onPointerDown={onSendPointerDown}
                                onPointerUp={onSendPointerUp}
                                onPointerCancel={onSendPointerCancel}
                                onPointerLeave={onSendPointerCancel}
                                disabled={!canSend}
                                className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 disabled:opacity-40 select-none"
                                style={{
                                    background: hasFwd && !hasText ? 'rgba(99,179,237,0.2)' : 'var(--accent)',
                                    touchAction: 'none',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background =
                                    hasFwd && !hasText ? 'rgba(99,179,237,0.35)' : '#9060ff'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background =
                                    hasFwd && !hasText ? 'rgba(99,179,237,0.2)' : 'var(--accent)'}
                            >
                                {hasFwd && !hasText
                                    ? <Forward size={15} style={{ color: 'rgba(99,179,237,0.9)' }} />
                                    : <Send size={15} className="text-white ml-0.5" />
                                }
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { if (!justSentRef.current) onSetShowVoice(true); }}
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
                    </div>
                </form>
            ) : (
                <div className="px-5 py-4 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
                    {t('channel_readonly')}
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
