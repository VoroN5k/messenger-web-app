'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, FileText, Download, Loader2, ImageOff, Image, Mic, Paperclip } from 'lucide-react';
import api from '@/src/lib/axios';
import { ImageModal }   from './ImageModal';
import { VoiceBubble }  from './VoiceBubble';
import { formatFileSize, isImageType } from '@/src/lib/uploadFile';
import { parseMetadata }  from '@/src/lib/parseMetadata';
import { useSignedUrl, resolveSignedUrl } from '@/src/hooks/useSignedUrl';

interface MediaFile {
    id:        number;
    fileUrl:   string;
    fileName:  string | null;
    fileType:  string | null;
    fileSize:  number | null;
    metadata:  string | null;
    createdAt: string;
    senderId:  number;
    sender:    { id: number; nickname: string };
}

type Tab = 'media' | 'voice' | 'files';

interface Props {
    conversationId: number;
    currentUserId:  number | string;
    onClose:        () => void;
    decryptFn?:     (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
}

function isVoice(m: MediaFile): boolean {
    const { waveform, duration } = parseMetadata(m.metadata);
    return waveform.length > 0 || duration > 0;
}

function categorize(msgs: MediaFile[]) {
    const media: MediaFile[] = [], voice: MediaFile[] = [], files: MediaFile[] = [];
    for (const m of msgs) {
        if (!m.fileUrl) continue;
        if (isImageType(m.fileType)) { media.push(m); continue; }
        if (isVoice(m))              { voice.push(m); continue; }
        files.push(m);
    }
    return { media, voice, files };
}

function formatDay(s: string): string {
    const d = new Date(s), now = new Date();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString())   return 'Yesterday';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
}

function groupByDay(items: MediaFile[]) {
    const groups: { label: string; items: MediaFile[] }[] = [];
    for (const m of items) {
        const label = formatDay(m.createdAt);
        const last  = groups[groups.length - 1];
        if (last?.label === label) last.items.push(m);
        else groups.push({ label, items: [m] });
    }
    return groups;
}

// Skeleton rows
function GridSkeleton() {
    return (
        <div className="p-3">
            <div className="skeleton h-3 rounded-full w-16 mb-3" />
            <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="skeleton aspect-square rounded-lg" />
                ))}
            </div>
        </div>
    );
}

function ListSkeleton() {
    return (
        <div className="py-2">
            <div className="skeleton h-3 rounded-full w-16 mx-4 mb-3" />
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="skeleton h-2.5 rounded-full w-3/5" />
                        <div className="skeleton h-2 rounded-full w-2/5" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Image tile
function ImageTile({ m, onLightbox, decryptFn }: {
    m: MediaFile;
    onLightbox: (s: { src: string; name?: string }) => void;
    decryptFn?: (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
}) {
    const signedSrc = useSignedUrl(m.fileUrl);
    const { encrypted } = parseMetadata(m.metadata);
    const [src, setSrc]  = useState<string | null>(null);
    const [err, setErr]  = useState(false);

    useEffect(() => {
        if (!signedSrc) return;
        if (encrypted && decryptFn) {
            let url: string | null = null;
            fetch(signedSrc)
                .then(r => r.arrayBuffer())
                .then(buf => decryptFn(buf, m.senderId))
                .then(dec => {
                    url = URL.createObjectURL(new Blob([dec], { type: m.fileType ?? 'image/jpeg' }));
                    setSrc(url);
                })
                .catch(() => setErr(true));
            return () => { if (url) URL.revokeObjectURL(url); };
        } else {
            setSrc(signedSrc);
        }
    }, [signedSrc]);

    if (err) return (
        <div className="w-full h-full flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-surface)' }}>
            <ImageOff size={14} style={{ color: 'var(--text-3)' }} />
        </div>
    );
    if (!src) return <div className="skeleton w-full h-full rounded-lg" />;

    return (
        <img
            src={src}
            alt={m.fileName ?? ''}
            className="w-full h-full object-cover rounded-lg cursor-pointer transition-opacity duration-150 hover:opacity-80"
            onClick={() => onLightbox({ src, name: m.fileName ?? undefined })}
        />
    );
}

// File row
function FileRow({ m, decryptFn }: { m: MediaFile; decryptFn?: (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer> }) {
    const [blobUrl, setBlobUrl]       = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const { encrypted } = parseMetadata(m.metadata);

    const handleDownload = useCallback(async () => {
        if (encrypted && decryptFn) {
            if (blobUrl) { const a = document.createElement('a'); a.href = blobUrl; a.download = m.fileName ?? 'file'; a.click(); return; }
            setDecrypting(true);
            try {
                const src = await resolveSignedUrl(m.fileUrl);
                const buf = await fetch(src).then(r => r.arrayBuffer());
                const dec = await decryptFn(buf, m.senderId);
                const url = URL.createObjectURL(new Blob([dec], { type: m.fileType ?? 'application/octet-stream' }));
                setBlobUrl(url);
                const a = document.createElement('a'); a.href = url; a.download = m.fileName ?? 'file'; a.click();
            } catch { window.open(m.fileUrl, '_blank'); }
            finally { setDecrypting(false); }
        } else {
            try {
                const src = await resolveSignedUrl(m.fileUrl);
                const a = document.createElement('a'); a.href = src; a.download = m.fileName ?? 'file'; a.target = '_blank'; a.click();
            } catch { window.open(m.fileUrl, '_blank'); }
        }
    }, [m, encrypted, decryptFn, blobUrl]);

    return (
        <div
            className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-100 cursor-pointer group"
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
            <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
            >
                <FileText size={14} style={{ color: 'var(--accent-bright)' }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                    {m.fileName ?? 'File'}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {m.fileSize != null ? formatFileSize(m.fileSize) : ''}
                    {encrypted && ' · 🔒'}
                </p>
            </div>
            <button
                onClick={handleDownload}
                disabled={decrypting}
                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-all duration-150 disabled:opacity-40"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--accent-bright)';
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                }}
            >
                {decrypting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            </button>
        </div>
    );
}

function Empty({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-3)' }}>
            <Paperclip size={28} className="opacity-40" />
            <p className="text-[12px]">{label}</p>
        </div>
    );
}

export function MediaPanel({ conversationId, currentUserId, onClose, decryptFn }: Readonly<Props>) {
    const [tab, setTab]         = useState<Tab>('media');
    const [all, setAll]         = useState<MediaFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [lightbox, setLightbox] = useState<{ src: string; name?: string } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLoading(true);
        api.get<MediaFile[]>(`/conversations/${conversationId}/media`)
            .then(r => setAll(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [conversationId]);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        const t = setTimeout(() => document.addEventListener('mousedown', h), 80);
        return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
    }, [onClose]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox) onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose, lightbox]);

    const { media, voice, files } = categorize(all);

    const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
        { id: 'media', label: 'Media',  icon: <Image size={13} />,      count: media.length },
        { id: 'voice', label: 'Voice',  icon: <Mic size={13} />,        count: voice.length },
        { id: 'files', label: 'Files',  icon: <Paperclip size={13} />,  count: files.length },
    ];

    return (
        <>
            <div
                ref={panelRef}
                className="absolute top-0 right-0 h-full w-[300px] flex flex-col z-20 panel-enter"
                style={{
                    background: 'var(--bg-surface)',
                    borderLeft: '1px solid var(--border)',
                    boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-4 shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                        Attachments
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150"
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
                        <X size={14} />
                    </button>
                </div>

                {/* Tabs */}
                <div
                    className="flex shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold cursor-pointer transition-all duration-150"
                            style={{
                                color: tab === t.id ? 'var(--accent-bright)' : 'var(--text-3)',
                                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                                marginBottom: '-1px',
                            }}
                        >
                            {t.icon}
                            {t.label}
                            {!loading && t.count > 0 && (
                                <span style={{ color: tab === t.id ? 'var(--accent-bright)' : 'var(--text-3)', fontSize: '9px' }}>
                  {t.count}
                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto chat-scroll">
                    {loading ? (
                        tab === 'media' ? <GridSkeleton /> : <ListSkeleton />
                    ) : tab === 'media' ? (
                        groupByDay(media).length === 0 ? <Empty label="No photos or videos" /> : (
                            <div className="p-3">
                                {groupByDay(media).map(g => (
                                    <div key={g.label} className="mb-4">
                                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
                                            {g.label}
                                        </p>
                                        <div className="grid grid-cols-3 gap-1">
                                            {g.items.map(m => (
                                                <div key={m.id} className="aspect-square overflow-hidden rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                                                    <ImageTile m={m} onLightbox={setLightbox} decryptFn={decryptFn} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : tab === 'voice' ? (
                        groupByDay(voice).length === 0 ? <Empty label="No voice messages" /> : (
                            <div className="py-2">
                                {groupByDay(voice).map(g => (
                                    <div key={g.label} className="mb-4">
                                        <p className="text-[10px] font-semibold uppercase tracking-widest px-4 py-1.5" style={{ color: 'var(--text-3)' }}>
                                            {g.label}
                                        </p>
                                        {g.items.map(m => (
                                            <div key={m.id} className="px-4 py-2.5">
                                                <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>
                            {String(m.senderId) === String(currentUserId) ? 'You' : m.sender.nickname}
                          </span>
                                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                            {new Date(m.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                                                </div>
                                                <div className="rounded-xl px-2 py-1.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                                    <VoiceBubble
                                                        fileUrl={m.fileUrl}
                                                        metadata={m.metadata}
                                                        isMe={false}
                                                        onDecrypt={decryptFn ? d => decryptFn(d, m.senderId) : undefined}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        groupByDay(files).length === 0 ? <Empty label="No files" /> : (
                            <div className="py-2">
                                {groupByDay(files).map(g => (
                                    <div key={g.label} className="mb-4">
                                        <p className="text-[10px] font-semibold uppercase tracking-widest px-4 py-1.5" style={{ color: 'var(--text-3)' }}>
                                            {g.label}
                                        </p>
                                        {g.items.map(m => (
                                            <FileRow key={m.id} m={m} decryptFn={decryptFn} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>

            {lightbox && (
                <ImageModal
                    src={lightbox.src}
                    alt={lightbox.name ?? 'image'}
                    fileName={lightbox.name}
                    onClose={() => setLightbox(null)}
                />
            )}
        </>
    );
}