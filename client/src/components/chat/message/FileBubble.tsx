'use client';

import { useState, useEffect }                          from 'react';
import { Loader2, FileText, Download, ImageOff }        from 'lucide-react';
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

export function FileBubble({ msg, isMe, onDecrypt }: Props) {
    const signedSrc = useSignedUrl(msg.fileUrl);

    const [err,        setErr]        = useState(false);
    const [blobUrl,    setBlobUrl]    = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [lightbox,   setLightbox]   = useState(false);

    const { encrypted: isEncryptedFlag } = parseMetadata(msg.metadata);
    const isEncrypted = isEncryptedFlag && !!onDecrypt;

    const displayMime =
        (msg.fileType && msg.fileType !== 'application/octet-stream')
            ? msg.fileType
            : (mimeFromFileName(msg.fileName ?? '') ?? msg.fileType ?? undefined);

    useEffect(() => {
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
    }, [signedSrc, isEncrypted]); // eslint-disable-line react-hooks/exhaustive-deps

    if (decrypting || (!signedSrc && !err)) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 text-xs rounded-xl
                ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                <Loader2 size={13} className="animate-spin shrink-0" />
                <span>{decrypting ? 'Розшифровка...' : 'Завантаження...'}</span>
            </div>
        );
    }

    const srcUrl = isEncrypted
        ? (blobUrl ?? signedSrc ?? msg.fileUrl!)
        : (signedSrc ?? msg.fileUrl!);

    // Image
    if (isImageType(displayMime, msg.fileName) && !err) {
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
            target={isEncrypted && blobUrl ? '_self' : '_blank'}
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
