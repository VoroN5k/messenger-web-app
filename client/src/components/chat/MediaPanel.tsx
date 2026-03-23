'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, FileText, Download, Loader2, ImageOff,
    Image, Mic, Paperclip,
} from 'lucide-react';
import api from '@/src/lib/axios';
import { ImageModal }   from './ImageModal';
import { VoiceBubble }  from './VoiceBubble';
import { formatFileSize, isImageType } from '@/src/lib/uploadFile';
import { parseMetadata } from '@/src/lib/parseMetadata';
import { useSignedUrl, resolveSignedUrl } from '@/src/hooks/useSignedUrl';

// Types

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

// Helpers

function isVoice(m: MediaFile): boolean {
    const { waveform, duration } = parseMetadata(m.metadata);
    return waveform.length > 0 || duration > 0;
}

function categorize(msgs: MediaFile[]) {
    const media: MediaFile[] = [];
    const voice: MediaFile[] = [];
    const files: MediaFile[] = [];
    for (const m of msgs) {
        if (!m.fileUrl) continue;
        if (isImageType(m.fileType))  { media.push(m); continue; }
        if (isVoice(m))               { voice.push(m); continue; }
        files.push(m);
    }
    return { media, voice, files };
}

function formatDay(dateStr: string): string {
    const d   = new Date(dateStr);
    const now = new Date();
    const y   = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Сьогодні';
    if (d.toDateString() === y.toDateString())   return 'Вчора';
    return d.toLocaleDateString('uk-UA', {
        day: 'numeric', month: 'long',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
}

function groupByDay(items: MediaFile[]): { label: string; items: MediaFile[] }[] {
    const groups: { label: string; items: MediaFile[] }[] = [];
    for (const m of items) {
        const label = formatDay(m.createdAt);
        const last  = groups[groups.length - 1];
        if (last?.label === label) last.items.push(m);
        else groups.push({ label, items: [m] });
    }
    return groups;
}

// ── Skeleton components ───────────────────────────────────────────────────────

function MediaGridSkeleton() {
    return (
        <div className="py-2">
            <div className="h-3 mx-4 mb-2 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
            <div className="grid grid-cols-3 gap-0.5 px-1">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div
                        key={i}
                        className="aspect-square rounded-sm bg-slate-200 dark:bg-slate-700 animate-pulse"
                        style={{ animationDelay: `${i * 40}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

function VoiceListSkeleton() {
    return (
        <div className="py-2 space-y-0.5">
            <div className="h-3 mx-4 mb-3 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 animate-pulse"
                     style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-1/4" />
                        <div className="h-3 bg-slate-100 dark:bg-slate-700/60 rounded-full w-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function FileListSkeleton() {
    return (
        <div className="py-2">
            <div className="h-3 mx-4 mb-3 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 animate-pulse"
                     style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                        <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full w-3/5" />
                        <div className="h-2 bg-slate-100 dark:bg-slate-700/60 rounded-full w-1/4" />
                    </div>
                    <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700/60 shrink-0" />
                </div>
            ))}
        </div>
    );
}

// Image tile - plain (no E2E)

function PlainImageTile({
                            m, onLightbox,
                        }: {
    m:          MediaFile;
    onLightbox: (s: { src: string; name?: string }) => void;
}) {
    const signedSrc = useSignedUrl(m.fileUrl);
    const [errored, setErrored] = useState(false);

    if (!signedSrc) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-700 animate-pulse" />
    );

    if (errored) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-700">
            <ImageOff size={16} className="text-slate-400" />
        </div>
    );

    return (
        <img
            src={signedSrc}
            alt={m.fileName ?? 'image'}
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onError={() => setErrored(true)}
            onClick={() => onLightbox({ src: signedSrc, name: m.fileName ?? undefined })}
        />
    );
}

// Image tile — E2E encrypted

function EncryptedImageTile({
                                m, decryptFn, onLightbox,
                            }: {
    m:          MediaFile;
    decryptFn:  (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
    onLightbox: (s: { src: string; name?: string }) => void;
}) {
    const signedSrc            = useSignedUrl(m.fileUrl);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [err,     setErr]     = useState(false);

    useEffect(() => {
        if (!signedSrc) return;
        let url: string | null = null;
        fetch(signedSrc)
            .then(r => r.arrayBuffer())
            .then(buf => decryptFn(buf, m.senderId))
            .then(dec => {
                url = URL.createObjectURL(
                    new Blob([dec], { type: m.fileType ?? 'image/jpeg' }),
                );
                setBlobUrl(url);
            })
            .catch(() => setErr(true));
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [signedSrc]); // eslint-disable-line react-hooks/exhaustive-deps

    if (err) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <ImageOff size={18} className="text-slate-400" />
        </div>
    );
    if (!blobUrl) return (
        <div className="w-full h-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
    );
    return (
        <img
            src={blobUrl}
            alt={m.fileName ?? 'image'}
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onLightbox({ src: blobUrl, name: m.fileName ?? undefined })}
        />
    );
}

// Media grid

function MediaGrid({
                       groups, decryptFn, onLightbox,
                   }: {
    groups:     { label: string; items: MediaFile[] }[];
    decryptFn?: (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
    onLightbox: (s: { src: string; name?: string }) => void;
}) {
    if (!groups.length) return <Empty label="Фото і відео відсутні" />;

    return (
        <div className="py-2">
            {groups.map(g => (
                <div key={g.label} className="mb-4">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-4 py-1.5">
                        {g.label}
                    </p>
                    <div className="grid grid-cols-3 gap-0.5 px-1">
                        {g.items.map(m => {
                            const { encrypted: isEncryptedFlag } = parseMetadata(m.metadata);
                            const encrypted = isEncryptedFlag && !!decryptFn;
                            return (
                                <div key={m.id}
                                     className="aspect-square overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700">
                                    {encrypted && decryptFn
                                        ? <EncryptedImageTile
                                            m={m}
                                            decryptFn={decryptFn}
                                            onLightbox={onLightbox}
                                        />
                                        : <PlainImageTile
                                            m={m}
                                            onLightbox={onLightbox}
                                        />
                                    }
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Voice list

function VoiceList({
                       groups, currentUserId, decryptFn,
                   }: {
    groups:        { label: string; items: MediaFile[] }[];
    currentUserId: number | string;
    decryptFn?:    (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
}) {
    if (!groups.length) return <Empty label="Голосових повідомлень немає" />;

    return (
        <div className="py-2">
            {groups.map(g => (
                <div key={g.label} className="mb-4">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-4 py-1.5">
                        {g.label}
                    </p>
                    <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {g.items.map(m => {
                            const isMe = String(m.senderId) === String(currentUserId);
                            return (
                                <div key={m.id} className="px-4 py-2.5 flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                                                {isMe ? 'Ви' : m.sender.nickname}
                                            </span>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                                                {new Date(m.createdAt).toLocaleTimeString('uk-UA', {
                                                    hour: '2-digit', minute: '2-digit',
                                                })}
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-2 py-1.5">
                                            <VoiceBubble
                                                fileUrl={m.fileUrl}
                                                metadata={m.metadata}
                                                isMe={false}
                                                onDecrypt={
                                                    decryptFn
                                                        ? (d) => decryptFn(d, m.senderId)
                                                        : undefined
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
                     m, encrypted, decryptFn,
                 }: {
    m:          MediaFile;
    encrypted:  boolean;
    decryptFn?: (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
}) {
    const [blobUrl,    setBlobUrl]    = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);

    const handleDownload = useCallback(async () => {
        if (encrypted && decryptFn) {
            if (blobUrl) {
                const a = document.createElement('a');
                a.href = blobUrl; a.download = m.fileName ?? 'file'; a.click();
                return;
            }
            setDecrypting(true);
            try {
                const src = await resolveSignedUrl(m.fileUrl);
                const buf = await fetch(src).then(r => r.arrayBuffer());
                const dec = await decryptFn(buf, m.senderId);
                const url = URL.createObjectURL(
                    new Blob([dec], { type: m.fileType ?? 'application/octet-stream' }),
                );
                setBlobUrl(url);
                const a = document.createElement('a');
                a.href = url; a.download = m.fileName ?? 'file'; a.click();
            } catch {
                window.open(m.fileUrl, '_blank');
            } finally {
                setDecrypting(false);
            }
        } else {
            try {
                const src = await resolveSignedUrl(m.fileUrl);
                const a   = document.createElement('a');
                a.href = src; a.download = m.fileName ?? 'file';
                a.target = '_blank'; a.click();
            } catch {
                window.open(m.fileUrl, '_blank');
            }
        }
    }, [m, encrypted, decryptFn, blobUrl]);

    return (
        <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {m.fileName ?? 'Файл'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    {m.fileSize != null && (
                        <span className="text-[10px] text-slate-400">{formatFileSize(m.fileSize)}</span>
                    )}
                    <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-[10px] text-slate-400">
                        {new Date(m.createdAt).toLocaleTimeString('uk-UA', {
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                    {encrypted && (
                        <>
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-[10px] text-violet-400">🔒</span>
                        </>
                    )}
                </div>
            </div>
            <button
                onClick={handleDownload}
                disabled={decrypting}
                className="p-1.5 rounded-full text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-300
                           hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-all
                           disabled:opacity-50 shrink-0"
                title="Завантажити"
            >
                {decrypting
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Download size={14} />
                }
            </button>
        </div>
    );
}

// ── File list ─────────────────────────────────────────────────────────────────

function FileList({
                      groups, decryptFn,
                  }: Readonly<{
    groups: { label: string; items: MediaFile[] }[];
    decryptFn?: (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
}>) {
    if (!groups.length) return <Empty label="Файлів немає" />;

    return (
        <div className="py-2">
            {groups.map(g => (
                <div key={g.label} className="mb-4">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-4 py-1.5">
                        {g.label}
                    </p>
                    <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {g.items.map(m => {
                            const { encrypted: isEncryptedFlag } = parseMetadata(m.metadata);
                            return (
                                <FileRow
                                    key={m.id}
                                    m={m}
                                    encrypted={isEncryptedFlag && !!decryptFn}
                                    decryptFn={decryptFn}
                                />
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Empty state

function Empty({ label }: Readonly<{ label: string }>) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300 dark:text-slate-600 py-16">
            <Paperclip size={32} className="opacity-50" />
            <p className="text-xs font-medium">{label}</p>
        </div>
    );
}

// Main panel

export function MediaPanel({
                               conversationId, currentUserId, onClose, decryptFn,
                           }: Readonly<Props>) {
    const [tab,      setTab]      = useState<Tab>('media');
    const [all,      setAll]      = useState<MediaFile[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [lightbox, setLightbox] = useState<{ src: string; name?: string } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Fetch attachment list
    useEffect(() => {
        setLoading(true);
        api.get<MediaFile[]>(`/conversations/${conversationId}/media`)
            .then(r => setAll(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [conversationId]);

    // Close on outside click
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        const t = setTimeout(() => document.addEventListener('mousedown', h), 80);
        return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
    }, [onClose]);

    // Close on Escape (but not when lightbox is open)
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox) onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose, lightbox]);

    const { media, voice, files } = categorize(all);

    const TAB_DATA: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
        { id: 'media', label: 'Медіа',    icon: <Image     size={14} />, count: media.length },
        { id: 'voice', label: 'Голосові', icon: <Mic       size={14} />, count: voice.length },
        { id: 'files', label: 'Файли',    icon: <Paperclip size={14} />, count: files.length },
    ];

    return (
        <>
            <div
                ref={panelRef}
                className="absolute top-0 right-0 h-full w-[320px] bg-white dark:bg-slate-800
                           border-l border-slate-100 dark:border-slate-700 flex flex-col z-20
                           shadow-xl animate-in slide-in-from-right-4 duration-200"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700 shrink-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Вкладення</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-all"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-700 shrink-0">
                    {TAB_DATA.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer
                                ${tab === t.id
                                ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 -mb-px'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            <span>{t.icon}</span>
                            <span>{t.label}</span>
                            {!loading && t.count > 0 && (
                                <span className={`text-[9px] font-bold
                                    ${tab === t.id
                                    ? 'text-violet-500'
                                    : 'text-slate-300 dark:text-slate-600'}`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content — skeleton while loading, real content after */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        tab === 'media' ? <MediaGridSkeleton /> :
                            tab === 'voice' ? <VoiceListSkeleton /> :
                                <FileListSkeleton />
                    ) : tab === 'media' ? (
                        <MediaGrid
                            groups={groupByDay(media)}
                            decryptFn={decryptFn}
                            onLightbox={setLightbox}
                        />
                    ) : tab === 'voice' ? (
                        <VoiceList
                            groups={groupByDay(voice)}
                            currentUserId={currentUserId}
                            decryptFn={decryptFn}
                        />
                    ) : (
                        <FileList
                            groups={groupByDay(files)}
                            decryptFn={decryptFn}
                        />
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