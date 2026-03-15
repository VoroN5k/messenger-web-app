'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageModalProps {
    src:       string;
    alt?:      string;
    onClose:   () => void;
    /** If provided, shows a download button that triggers save with this filename */
    fileName?: string;
}

export function ImageModal({ src, alt, onClose, fileName }: ImageModalProps) {
    const [scale,   setScale]   = useState(1);
    const [offset,  setOffset]  = useState({ x: 0, y: 0 });
    const [isDragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

    // ── Close on Escape ───────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        // Prevent body scroll while modal is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', h);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    // ── Scroll to zoom ────────────────────────────────────────────────────────
    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.001)));
    }, []);

    // ── Drag to pan ───────────────────────────────────────────────────────────
    const onMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        e.preventDefault();
        setDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    };
    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        setOffset({
            x: dragStart.current.ox + e.clientX - dragStart.current.x,
            y: dragStart.current.oy + e.clientY - dragStart.current.y,
        });
    }, [isDragging]);
    const onMouseUp = () => setDragging(false);

    const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

    // ── Download ──────────────────────────────────────────────────────────────
    const handleDownload = async () => {
        try {
            const res  = await fetch(src);
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = fileName ?? 'image';
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            window.open(src, '_blank');
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* ── Top bar ── */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setScale(s => Math.min(5, s + 0.25))}
                        className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
                        title="Збільшити"
                    >
                        <ZoomIn size={18} />
                    </button>
                    <button
                        onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                        className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
                        title="Зменшити"
                    >
                        <ZoomOut size={18} />
                    </button>
                    {scale !== 1 && (
                        <button
                            onClick={resetZoom}
                            className="px-2.5 py-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 cursor-pointer transition-all text-xs font-mono"
                        >
                            {Math.round(scale * 100)}%
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
                        title="Завантажити"
                    >
                        <Download size={18} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
                        title="Закрити (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* ── Image ── */}
            <div
                className="relative flex items-center justify-center w-full h-full"
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            >
                <img
                    src={src}
                    alt={alt ?? 'Фото'}
                    draggable={false}
                    onDoubleClick={() => scale === 1 ? setScale(2) : resetZoom()}
                    style={{
                        transform:       `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        transformOrigin: 'center center',
                        transition:      isDragging ? 'none' : 'transform 0.15s ease',
                        maxWidth:        '90vw',
                        maxHeight:       '88vh',
                        objectFit:       'contain',
                        borderRadius:    '4px',
                        userSelect:      'none',
                        boxShadow:       '0 25px 80px rgba(0,0,0,0.6)',
                    }}
                />
            </div>

            {/* ── Hint ── */}
            {scale === 1 && (
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs pointer-events-none select-none">
                    Подвійний клік або скрол для масштабування
                </p>
            )}
        </div>
    );
}