'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, FileText, Download, Loader2, ImageOff, Image, Mic, Paperclip } from 'lucide-react';
import api from '@/src/lib/axios';
import { ImageModal } from './ImageModal';
import { VoiceBubble } from './VoiceBubble';
import { formatFileSize, isImageType } from '@/src/lib/uploadFile';

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
    decryptFn?:     (data: ArrayBuffer) => Promise<ArrayBuffer>;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function parseMeta(raw: string | null): Record<string, any> | null {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function isVoice(m: MediaFile): boolean {
    const p = parseMeta(m.metadata);
    return !!(p && ('waveform' in p || 'duration' in p));
}

function categorize(msgs: MediaFile[]) {
    const media: MediaFile[] = [];
    const voice: MediaFile[] = [];
    const files: MediaFile[] = [];
    for (const m of msgs) {
        if (!m.fileUrl) continue;
        if (isImageType(m.fileType))    { media.push(m); continue; }
        if (isVoice(m))                 { voice.push(m); continue; }
        files.push(m);
    }
    return { media, voice, files };
}

function formatDay(dateStr: string): string {
    const d   = new Date(dateStr);
    const now = new Date();
    const y   = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Сьогодні';
    if (d.toDateString() === y.toDateString())   return 'Вчора';
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ── Encrypted image tile — decrypts on mount ──────────────────────────────────
function EncryptedImageTile({
                                m, decryptFn, onClick,
                            }: { m: MediaFile; decryptFn: (data: ArrayBuffer) => Promise<ArrayBuffer>; onClick: (url: string) => void }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [err,     setErr]     = useState(false);

    useEffect(() => {
        let url: string | null = null;
        fetch(m.fileUrl)
            .then(r => r.arrayBuffer())
            .then(buf => decryptFn(buf))
            .then(dec => {
                url = URL.createObjectURL(new Blob([dec], { type: m.fileType ?? 'image/jpeg' }));
                setBlobUrl(url);
            })
            .catch(() => setErr(true));
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [m.fileUrl]);

    if (err) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <ImageOff size={18} className="text-slate-400" />
        </div>
    );
    if (!blobUrl) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <Loader2 size={16} className="animate-spin text-slate-400" />
        </div>
    );
    return (
        <img
            src={blobUrl}
            alt={m.fileName ?? 'image'}
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onClick(blobUrl)}
        />
    );
}

// ── Main MediaPanel ───────────────────────────────────────────────────────────
export function MediaPanel({ conversationId, currentUserId, onClose, decryptFn }: Props) {
    const [tab,      setTab]      = useState<Tab>('media');
    const [all,      setAll]      = useState<MediaFile[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [lightbox, setLightbox] = useState<{ src: string; name?: string } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // ── Fetch all media once ──────────────────────────────────────────────────
    useEffect(() => {
        setLoading(true);
        api.get<MediaFile[]>(`/conversations/${conversationId}/media`)
            .then(r => setAll(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [conversationId]);

    // ── Close on outside click ────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        const t = setTimeout(() => document.addEventListener('mousedown', h), 80);
        return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
    }, [onClose]);

    // ── Close on Escape ───────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox) onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose, lightbox]);

    const { media, voice, files } = categorize(all);

    // ── Group by day ──────────────────────────────────────────────────────────
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

    const TAB_DATA: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
        { id: 'media', label: 'Медіа',    icon: <Image    size={14} />, count: media.length },
        { id: 'voice', label: 'Голосові', icon: <Mic      size={14} />, count: voice.length },
        { id: 'files', label: 'Файли',    icon: <Paperclip size={14}/>, count: files.length },
    ];

    return (
        <>
            {/* ── Panel ── */}
            <div
                ref={panelRef}
                className="absolute top-0 right-0 h-full w-[320px] bg-white dark:bg-slate-800
                           border-l border-slate-100 dark:border-slate-700 flex flex-col z-20
                           shadow-xl animate-in slide-in-from-right-4 duration-200"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700 shrink-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Вкладення</h3>
                    <button onClick={onClose}
                            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-all">
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
                            {t.count > 0 && (
                                <span className={`text-[9px] font-bold ${tab === t.id ? 'text-violet-500' : 'text-slate-300 dark:text-slate-600'}`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 size={22} className="animate-spin text-violet-400" />
                        </div>
                    ) : tab === 'media' ? (
                        <MediaGrid
                            items={media}
                            groups={groupByDay(media)}
                            decryptFn={decryptFn}
                            onLightbox={setLightbox}
                        />
                    ) : tab === 'voice' ? (
                        <VoiceList
                            items={voice}
                            groups={groupByDay(voice)}
                            currentUserId={currentUserId}
                            decryptFn={decryptFn}
                        />
                    ) : (
                        <FileList
                            items={files}
                            groups={groupByDay(files)}
                            decryptFn={decryptFn}
                        />
                    )}
                </div>
            </div>

            {/* Lightbox */}
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

// ── Media Grid ────────────────────────────────────────────────────────────────
function MediaGrid({
                       groups, decryptFn, onLightbox,
                   }: {
    items:      MediaFile[];
    groups:     { label: string; items: MediaFile[] }[];
    decryptFn?: (data: ArrayBuffer) => Promise<ArrayBuffer>;
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
                            const meta      = parseMeta(m.metadata);
                            const encrypted = !!meta?.encrypted && !!decryptFn;

                            return (
                                <div key={m.id} className="aspect-square overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700">
                                    {encrypted && decryptFn ? (
                                        <EncryptedImageTile
                                            m={m}
                                            decryptFn={decryptFn}
                                            onClick={(url) => onLightbox({ src: url, name: m.fileName ?? undefined })}
                                        />
                                    ) : (
                                        <img
                                            src={m.fileUrl}
                                            alt={m.fileName ?? 'image'}
                                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => onLightbox({ src: m.fileUrl, name: m.fileName ?? undefined })}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Voice List ────────────────────────────────────────────────────────────────
function VoiceList({
                       groups, currentUserId, decryptFn,
                   }: {
    items:         MediaFile[];
    groups:        { label: string; items: MediaFile[] }[];
    currentUserId: number | string;
    decryptFn?:    (data: ArrayBuffer) => Promise<ArrayBuffer>;
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
                                                {new Date(m.createdAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-2 py-1.5">
                                            <VoiceBubble
                                                fileUrl={m.fileUrl}
                                                metadata={m.metadata}
                                                isMe={false}
                                                onDecrypt={decryptFn}
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

// ── File List ─────────────────────────────────────────────────────────────────
function FileList({
                      groups, decryptFn,
                  }: {
    items:      MediaFile[];
    groups:     { label: string; items: MediaFile[] }[];
    decryptFn?: (data: ArrayBuffer) => Promise<ArrayBuffer>;
}) {
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
                            const meta      = parseMeta(m.metadata);
                            const encrypted = !!meta?.encrypted && !!decryptFn;

                            return (
                                <FileRow
                                    key={m.id}
                                    m={m}
                                    encrypted={encrypted}
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

function FileRow({ m, encrypted, decryptFn }: {
    m:          MediaFile;
    encrypted:  boolean;
    decryptFn?: (data: ArrayBuffer) => Promise<ArrayBuffer>;
}) {
    const [blobUrl,    setBlobUrl]    = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);

    const handleDownload = useCallback(async () => {
        if (encrypted && decryptFn && !blobUrl) {
            setDecrypting(true);
            try {
                const buf = await fetch(m.fileUrl).then(r => r.arrayBuffer());
                const dec = await decryptFn(buf);
                const url = URL.createObjectURL(new Blob([dec], { type: m.fileType ?? 'application/octet-stream' }));
                setBlobUrl(url);
                // Trigger download
                const a = document.createElement('a');
                a.href = url; a.download = m.fileName ?? 'file'; a.click();
            } catch {} finally { setDecrypting(false); }
        } else if (blobUrl) {
            const a = document.createElement('a');
            a.href = blobUrl; a.download = m.fileName ?? 'file'; a.click();
        } else {
            const a = document.createElement('a');
            a.href = m.fileUrl; a.download = m.fileName ?? 'file';
            a.target = '_blank'; a.click();
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
                        {new Date(m.createdAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
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
                className="p-1.5 rounded-full text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-all disabled:opacity-50 shrink-0"
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

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300 dark:text-slate-600 py-16">
            <Paperclip size={32} className="opacity-50" />
            <p className="text-xs font-medium">{label}</p>
        </div>
    );
}