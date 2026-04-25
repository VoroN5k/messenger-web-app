'use client';

import { useState, useEffect, useRef } from 'react';
import { Bug, Lightbulb, MessageSquare, MoreHorizontal, X, Send, CheckCircle, ImagePlus, Loader2 } from 'lucide-react';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/store/useAuthStore';

type ReportType = 'BUG' | 'FEATURE_REQUEST' | 'FEEDBACK' | 'OTHER';

const TYPES: { value: ReportType; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'BUG',             label: 'Bug',     icon: <Bug size={15} />,           desc: 'Something is broken' },
    { value: 'FEATURE_REQUEST', label: 'Feature', icon: <Lightbulb size={15} />,     desc: 'Suggest an improvement' },
    { value: 'FEEDBACK',        label: 'Feedback',icon: <MessageSquare size={15} />, desc: 'General feedback' },
    { value: 'OTHER',           label: 'Other',   icon: <MoreHorizontal size={15} />,desc: 'Something else' },
];

interface ReportModalProps {
    onClose: () => void;
}

function ReportModalContent({ onClose }: ReportModalProps) {
    const [type,           setType]           = useState<ReportType>('BUG');
    const [title,          setTitle]          = useState('');
    const [description,    setDescription]    = useState('');
    const [image,          setImage]          = useState<File | null>(null);
    const [imagePreview,   setImagePreview]   = useState<string | null>(null);
    const [imageUploading, setImageUploading] = useState(false);
    const [loading,        setLoading]        = useState(false);
    const [success,        setSuccess]        = useState(false);
    const [error,          setError]          = useState('');
    const textRef      = useRef<HTMLTextAreaElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { textRef.current?.focus(); }, []);

    // Revoke blob URL on unmount
    useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
        if (file.size > 5 * 1024 * 1024)    { setError('Image must be under 5 MB'); return; }
        setError('');
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImage(file);
        setImagePreview(URL.createObjectURL(file));
        // reset input so same file can be re-selected
        e.target.value = '';
    };

    const removeImage = () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImage(null);
        setImagePreview(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;
        setLoading(true); setError('');

        let imageUrl: string | undefined;

        if (image) {
            setImageUploading(true);
            try {
                const formData = new FormData();
                formData.append('file', image);
                const token  = useAuthStore.getState().accessToken;
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
                const res    = await fetch(`${apiUrl}/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    credentials: 'include',
                    body: formData,
                });
                if (res.ok) {
                    const data = await res.json();
                    imageUrl   = data.url as string;
                }
            } catch {
                // Image upload failed — continue without it
            } finally {
                setImageUploading(false);
            }
        }

        try {
            await api.post('/reports', {
                type,
                title:       title.trim(),
                description: description.trim(),
                metadata: {
                    page:      typeof window !== 'undefined' ? window.location.pathname : '',
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                    ...(imageUrl ? { imageUrl } : {}),
                },
            });
            setSuccess(true);
            setTimeout(onClose, 2200);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Failed to send. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                     style={{ background: 'rgba(34,212,114,0.12)', border: '1px solid rgba(34,212,114,0.3)' }}>
                    <CheckCircle size={28} className="text-emerald-400" />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    Report sent — thanks!
                </p>
                <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
                    We'll look into it soon.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Type selector */}
            <div className="grid grid-cols-4 gap-1.5">
                {TYPES.map(t => (
                    <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-all duration-150 cursor-pointer"
                        style={{
                            background: type === t.value ? 'var(--accent-dim)' : 'rgba(255,255,255,0.03)',
                            border:     type === t.value ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                            color:      type === t.value ? 'var(--accent-bright)' : 'var(--text-3)',
                        }}
                    >
                        {t.icon}
                        <span className="text-[10px] font-semibold">{t.label}</span>
                    </button>
                ))}
            </div>

            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {TYPES.find(t => t.value === type)?.desc}
            </p>

            {/* Title */}
            <input
                value={title}
                onChange={e => { setTitle(e.target.value); setError(''); }}
                placeholder="Short summary…"
                maxLength={200}
                className="w-full px-3 py-2.5 text-[13px] rounded-xl outline-none transition-all"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border:     '1px solid var(--border)',
                    color:      'var(--text-1)',
                    caretColor: 'var(--accent)',
                }}
                onFocus={e  => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                onBlur={e   => (e.currentTarget.style.borderColor = 'var(--border)')}
            />

            {/* Description */}
            <textarea
                ref={textRef}
                value={description}
                onChange={e => { setDescription(e.target.value); setError(''); }}
                placeholder={
                    type === 'BUG'
                        ? "What happened? What did you expect? Steps to reproduce?"
                        : type === 'FEATURE_REQUEST'
                            ? "Describe the feature and why it would be useful…"
                            : "Tell us anything on your mind…"
                }
                maxLength={2000}
                rows={4}
                className="w-full px-3 py-2.5 text-[13px] rounded-xl outline-none resize-none transition-all"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border:     '1px solid var(--border)',
                    color:      'var(--text-1)',
                    caretColor: 'var(--accent)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <div className="flex justify-end -mt-3">
                <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {description.length}/2000
                </span>
            </div>

            {/* Image attachment */}
            <div>
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                />

                {imagePreview ? (
                    <div className="relative rounded-xl overflow-hidden group"
                         style={{ border: '1px solid var(--border)' }}>
                        <img
                            src={imagePreview}
                            alt="Attachment preview"
                            className="w-full max-h-48 object-contain"
                            style={{ background: 'rgba(0,0,0,0.3)' }}
                        />
                        <button
                            type="button"
                            onClick={removeImage}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all"
                            style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                        >
                            <X size={13} />
                        </button>
                        <div className="px-3 py-2 flex items-center gap-2"
                             style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid var(--border)' }}>
                            <span className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                {image?.name}
                            </span>
                            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-3)' }}>
                                {image ? `${(image.size / 1024).toFixed(0)} KB` : ''}
                            </span>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] cursor-pointer transition-all"
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border:     '1px dashed var(--border)',
                            color:      'var(--text-3)',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.borderColor  = 'var(--border-accent)';
                            (e.currentTarget as HTMLElement).style.color        = 'var(--accent-bright)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.borderColor  = 'var(--border)';
                            (e.currentTarget as HTMLElement).style.color        = 'var(--text-3)';
                        }}
                    >
                        <ImagePlus size={14} />
                        Attach screenshot (optional, max 5 MB)
                    </button>
                )}
            </div>

            {/* Auto-collected info note */}
            <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                 style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
                <span className="text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    📎 We'll also include your current page and browser info to help debug.
                </span>
            </div>

            {error && (
                <p className="text-[12px]" style={{ color: 'var(--red)' }}>{error}</p>
            )}

            {/* Submit */}
            <button
                type="submit"
                disabled={loading || imageUploading || !title.trim() || description.trim().length < 10}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 4px 20px rgba(124,77,255,0.3)' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#9060ff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
            >
                {loading || imageUploading ? (
                    <><Loader2 size={14} className="animate-spin" /> {imageUploading ? 'Uploading image…' : 'Sending…'}</>
                ) : (
                    <><Send size={14} /> Send Report</>
                )}
            </button>
        </form>
    );
}

export function ReportButton({ inline = false }: { inline?: boolean }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [open]);

    const triggerButton = inline ? (
        <button
            onClick={() => setOpen(true)}
            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150"
            style={{ color: 'var(--text-3)' }}
            title="Report an issue"
            onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
            }}
        >
            <Bug size={15} />
        </button>
    ) : (
        <button
            onClick={() => setOpen(true)}
            className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-200 group"
            style={{
                background:     'rgba(14,14,22,0.9)',
                border:         '1px solid var(--border-md)',
                backdropFilter: 'blur(12px)',
                boxShadow:      '0 4px 20px rgba(0,0,0,0.4)',
                color:          'var(--text-3)',
            }}
            title="Report an issue"
        >
            <Bug size={13} />
            <span className="text-[11px] font-medium hidden group-hover:inline transition-all">
                Report
            </span>
        </button>
    );

    return (
        <>
            {triggerButton}

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-enter"
                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                    onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
                >
                    <div
                        className="w-full sm:max-w-md rounded-2xl overflow-hidden modal-enter"
                        style={{
                            background: 'var(--bg-elevated)',
                            border:     '1px solid var(--border-md)',
                            boxShadow:  '0 24px 60px rgba(0,0,0,0.5)',
                            maxHeight:  '90vh',
                            overflowY:  'auto',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-5 py-4 sticky top-0"
                            style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}
                        >
                            <div className="flex items-center gap-2.5">
                                <div
                                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                                    style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                                >
                                    <Bug size={13} style={{ color: 'var(--accent-bright)' }} />
                                </div>
                                <div>
                                    <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                                        Report an issue
                                    </p>
                                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                                        Help us improve Vesper
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <ReportModalContent onClose={() => setOpen(false)} />
                    </div>
                </div>
            )}
        </>
    );
}