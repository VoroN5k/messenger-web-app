'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Check, Upload } from 'lucide-react';

interface AvatarCropModalProps {
    onClose:  () => void;
    onSave:   (blob: Blob) => Promise<void>;
}

export function AvatarCropModal({ onClose, onSave }: AvatarCropModalProps) {
    const [imageSrc, setImageSrc]     = useState<string | null>(null);
    const [zoom,     setZoom]         = useState(1);
    const [offset,   setOffset]       = useState({ x: 0, y: 0 });
    const [dragging, setDragging]     = useState(false);
    const [saving,   setSaving]       = useState(false);
    const [dragStart,setDragStart]    = useState({ x: 0, y: 0 });

    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const previewRef  = useRef<HTMLCanvasElement>(null);
    const imgRef      = useRef<HTMLImageElement | null>(null);
    const fileInputRef= useRef<HTMLInputElement>(null);

    const CANVAS_SIZE = 280; // розмір зони кропу (px)
    const OUTPUT_SIZE = 400; // розмір результату (px)

    // ── Завантаження файлу ────────────────────────────────────────────────────
    const handleFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            setImageSrc(e.target?.result as string);
            setZoom(1);
            setOffset({ x: 0, y: 0 });
        };
        reader.readAsDataURL(file);
    };

    // ── Малюємо preview ───────────────────────────────────────────────────────
    const drawPreview = useCallback(() => {
        const canvas = previewRef.current;
        const img    = imgRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width  = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;

        const scaledW = img.naturalWidth  * zoom;
        const scaledH = img.naturalHeight * zoom;

        // Центруємо зображення + зсув від драгу
        const drawX = (CANVAS_SIZE - scaledW) / 2 + offset.x;
        const drawY = (CANVAS_SIZE - scaledH) / 2 + offset.y;

        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Фон
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.drawImage(img, drawX, drawY, scaledW, scaledH);

        // Затемнення за межами кола
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Вирізаємо коло
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Обводка кола
        ctx.strokeStyle = 'rgba(139,92,246,0.8)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 4, 0, Math.PI * 2);
        ctx.stroke();
    }, [zoom, offset]);

    useEffect(() => {
        if (!imageSrc) return;
        const img    = new Image();
        img.onload   = () => { imgRef.current = img; drawPreview(); };
        img.src      = imageSrc;
    }, [imageSrc, drawPreview]);

    // ── Drag ──────────────────────────────────────────────────────────────────
    const onMouseDown = (e: React.MouseEvent) => {
        setDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };
    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const onMouseUp   = () => setDragging(false);

    // Touch support
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        setDragging(true);
        setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
    };
    const onTouchMove = (e: React.TouchEvent) => {
        if (!dragging) return;
        const t = e.touches[0];
        setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
    };

    // Wheel zoom
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setZoom((z) => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
    };

    // ── Зберегти ──────────────────────────────────────────────────────────────
    const handleSave = async () => {
        const img = imgRef.current;
        if (!img) return;

        const out  = canvasRef.current!;
        out.width  = OUTPUT_SIZE;
        out.height = OUTPUT_SIZE;
        const ctx  = out.getContext('2d')!;

        // Кругова маска
        ctx.beginPath();
        ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();

        const scaledW = img.naturalWidth  * zoom;
        const scaledH = img.naturalHeight * zoom;
        const drawX   = (CANVAS_SIZE - scaledW) / 2 + offset.x;
        const drawY   = (CANVAS_SIZE - scaledH) / 2 + offset.y;

        // Масштабуємо координати з CANVAS_SIZE → OUTPUT_SIZE
        const scale = OUTPUT_SIZE / CANVAS_SIZE;
        ctx.drawImage(img, drawX * scale, drawY * scale, scaledW * scale, scaledH * scale);

        setSaving(true);
        try {
            const blob = await new Promise<Blob>((res, rej) =>
                out.toBlob((b) => b ? res(b) : rej(new Error('Canvas empty')), 'image/jpeg', 0.92),
            );
            await onSave(blob);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Оновити аватар</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 flex flex-col items-center gap-4">

                    {!imageSrc ? (
                        /* ── Зона вибору файлу ── */
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                            className="w-full h-48 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-all"
                        >
                            <Upload size={28} className="text-slate-300" />
                            <p className="text-sm text-slate-400 text-center">
                                Перетягніть фото або<br/>
                                <span className="text-violet-500 font-medium">оберіть файл</span>
                            </p>
                            <p className="text-xs text-slate-300">JPEG, PNG, WebP · до 5 МБ</p>
                        </div>
                    ) : (
                        /* ── Crop canvas ── */
                        <>
                            <p className="text-xs text-slate-400">Перетягуйте та масштабуйте фото</p>

                            <canvas
                                ref={previewRef}
                                width={CANVAS_SIZE}
                                height={CANVAS_SIZE}
                                className="rounded-2xl cursor-grab active:cursor-grabbing touch-none"
                                style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
                                onMouseDown={onMouseDown}
                                onMouseMove={onMouseMove}
                                onMouseUp={onMouseUp}
                                onMouseLeave={onMouseUp}
                                onTouchStart={onTouchStart}
                                onTouchMove={onTouchMove}
                                onTouchEnd={onMouseUp}
                                onWheel={onWheel}
                            />

                            {/* Zoom slider */}
                            <div className="flex items-center gap-3 w-full px-2">
                                <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="text-slate-400 hover:text-violet-500 cursor-pointer transition-colors">
                                    <ZoomOut size={16} />
                                </button>
                                <input
                                    type="range" min="0.5" max="4" step="0.05"
                                    value={zoom}
                                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                                    className="flex-1 accent-violet-500"
                                />
                                <button onClick={() => setZoom((z) => Math.min(4, z + 0.1))} className="text-slate-400 hover:text-violet-500 cursor-pointer transition-colors">
                                    <ZoomIn size={16} />
                                </button>
                            </div>

                            <button
                                onClick={() => { setImageSrc(null); setZoom(1); setOffset({ x: 0, y: 0 }); }}
                                className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                Обрати інше фото
                            </button>
                        </>
                    )}

                    {/* Hidden canvases */}
                    <canvas ref={canvasRef} className="hidden" />
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                           onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                </div>

                {/* Footer */}
                {imageSrc && (
                    <div className="px-5 pb-5 flex gap-2">
                        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">
                            Скасувати
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold cursor-pointer disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                            ) : (
                                <Check size={15} />
                            )}
                            Зберегти
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}