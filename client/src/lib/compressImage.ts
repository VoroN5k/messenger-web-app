import {CompressOptions, CompressResult} from "@/src/types/compressImage.types";

const SKIP_MIME = new Set(['image/gif', 'image/svg+xml', 'image/webp']);

export async function compressImage(
    file: File,
    opts: CompressOptions = {},
): Promise<CompressResult> {
    const noOp: CompressResult = {
        file,
        originalSize: file.size,
        compressedSize: file.size,
        wasCompressed: false,
        savedPercent: 0,
    };

    if(!file.type.startsWith('image/') || SKIP_MIME.has(file.type)) return noOp;

    const {
        maxWidth = 1920,
        maxHeight = 1080,
        quality = 0.82,
        outputFormat = 'image/jpeg',
        skipIfSmaller = 100 * 1024, // 100KB
    } = opts;

    if (file.size <= skipIfSmaller) return noOp;

    try {
        const objectUrl = URL.createObjectURL(file);
        const img = await loadImage(objectUrl);
        URL.revokeObjectURL(objectUrl);

        const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return noOp;

        if (outputFormat === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(img, 0, 0, w, h);

        const blob = await canvasToBlob(canvas, outputFormat, quality);
        if (!blob) return noOp;

        if (blob.size >= file.size) return noOp;

        const ext         = outputFormat === 'image/jpeg' ? '.jpg' : '.webp';
        const baseName    = file.name.replace(/\.[^.]+$/, '');
        const compFile    = new File([blob], `${baseName}${ext}`, { type: outputFormat });

        const savedPercent = Math.round((1 - blob.size / file.size) * 100);

        return {
            file:           compFile,
            originalSize:   file.size,
            compressedSize: blob.size,
            wasCompressed:  true,
            savedPercent,
        };
    } catch (err) {
    // Якщо щось пішло не так — мовчки відправляємо оригінал
    console.warn('[compressImage] failed, using original:', err);
    return noOp;
    }
}

// Helpers

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error('Image load error'));
        img.src = src;
    });
}

function fitDimensions(
    srcW: number,
    srcH: number,
    maxW: number,
    maxH: number,
): { w: number; h: number } {
    if (srcW <= maxW && srcH <= maxH) return { w: srcW, h: srcH };
    const ratio = Math.min(maxW / srcW, maxH / srcH);
    return {
        w: Math.max(1, Math.round(srcW * ratio)),
        h: Math.max(1, Math.round(srcH * ratio)),
    };
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    type:    string,
    quality: number,
): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}