'use client';

import { useState, useEffect }                          from 'react';
import { FileText, Download, ImageOff }                 from 'lucide-react';
import { Message }                                      from '@/src/types/conversation.types';
import { ImageModal }                                   from '@/src/components/chat/ImageModal';
import { useSignedUrl }                                 from '@/src/hooks/useSignedUrl';
import { isImageType, formatFileSize, mimeFromFileName } from '@/src/lib/uploadFile';
import { parseMetadata }                                from '@/src/lib/parseMetadata';

interface Props {
    msg:        Message;
    isMe:       boolean;
    onDecrypt?: (data: ArrayBuffer) => Promise<ArrayBuffer>;
}

// Skeleton for image placeholder
function ImageSkeleton() {
    return (
        <div className="max-w-[260px] w-[220px] h-[160px] rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
    );
}

// Skeleton for generic file
function FileSkeleton({ isMe }: { isMe: boolean }) {
    return (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-xl w-[220px] animate-pulse
            ${isMe
            ? 'bg-white/15'
            : 'bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600'}`}>
            <div className={`w-9 h-9 rounded-xl shrink-0
                ${isMe ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-600'}`} />
            <div className="flex-1 space-y-1.5 min-w-0">
                <div className={`h-2.5 rounded-full w-3/4
                    ${isMe ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-600'}`} />
                <div className={`h-2 rounded-full w-1/2
                    ${isMe ? 'bg-white/15' : 'bg-slate-200 dark:bg-slate-600'}`} />
            </div>
        </div>
    );
}

export function FileBubble({ msg, isMe, onDecrypt }: Props) {
    const signedSrc = useSignedUrl(msg.fileUrl);

    useEffect(() => {
        setErr(false);
    }, [signedSrc]);

    const [err,        setErr]        = useState(false);
    const [blobUrl,    setBlobUrl]    = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [lightbox,   setLightbox]   = useState(false);

    const { encrypted: isEncryptedFlag } = parseMetadata(msg.metadata);
    const isEncrypted = isEncryptedFlag && !!onDecrypt;

    // If the sender has a local (pre-encryption) blob URL, use it directly —
    // no need to re-download and decrypt our own freshly sent file.
    const localSrc = msg._localBlobUrl ?? null;

    const displayMime =
        (msg.fileType && msg.fileType !== 'application/octet-stream')
            ? msg.fileType
            : (mimeFromFileName(msg.fileName ?? '') ?? msg.fileType ?? undefined);

    const isImage = isImageType(displayMime, msg.fileName);

    useEffect(() => {
        // Skip decrypt when we already have a local preview (sender's own message)
        if (localSrc) return;
        if (!isEncrypted || !onDecrypt || !signedSrc) return;

        let objectUrl: string | null = null;
        setDecrypting(true);

        fetch(signedSrc)
            .then(r => r.arrayBuffer())
            .then(buf => onDecrypt(buf))
            .then(dec => {
                objectUrl = URL.createObjectURL(new Blob([dec], { type: displayMime }));
                setBlobUrl(objectUrl);
            })
            .catch(() => setErr(true))
            .finally(() => setDecrypting(false));

        return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [signedSrc, isEncrypted, localSrc]); // eslint-disable-line react-hooks/exhaustive-deps

    // Loading / skeleton states
    // Show skeleton only when there is NO local preview available
    if (!localSrc && (decrypting || (!signedSrc && !err))) {
        return isImage ? <ImageSkeleton /> : <FileSkeleton isMe={isMe} />;
    }

    // Resolve the best URL to display
    const srcUrl = localSrc
        ? localSrc                                          // sender's local preview
        : isEncrypted
            ? (blobUrl ?? signedSrc ?? msg.fileUrl!)        // decrypted blob
            : (signedSrc ?? msg.fileUrl!);                  // plain signed URL

    // Image
    if (isImage && !err) {
        return (
            <>
                <img
                    src={srcUrl}
                    alt={msg.fileName ?? 'image'}
                    onError={() => setErr(true)}
                    onClick={() => setLightbox(true)}
                    className="max-w-[260px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90 block transition-opacity"
                />
                {lightbox && (
                    <ImageModal
                        src={srcUrl}
                        alt={msg.fileName ?? 'image'}
                        fileName={msg.fileName ?? undefined}
                        onClose={() => setLightbox(false)}
                    />
                )}
            </>
        );
    }

    // Generic file download
    return (
        <a
            href={srcUrl}
            target={isEncrypted && (blobUrl || localSrc) ? '_self' : '_blank'}
            rel="noopener noreferrer"
            download={msg.fileName ?? true}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors max-w-[260px]
                ${isMe
                ? 'bg-white/15 hover:bg-white/25'
                : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'}`}
        >
            {err
                ? <ImageOff size={20} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
                : <FileText size={20} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
            }
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                    {msg.fileName ?? 'Файл'}
                </p>
                {msg.fileSize != null && (
                    <p className={`text-xs ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {formatFileSize(msg.fileSize)}
                    </p>
                )}
            </div>
            <Download size={14} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
        </a>
    );
}