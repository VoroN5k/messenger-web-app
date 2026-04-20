import { useAuthStore } from "@/src/store/useAuthStore";

export interface UploadResult {
    url:        string;
    fileName:   string;
    fileType:   string;
    fileSize:   number;
}

// MIME helpers

const EXT_TO_MIME: Record<string, string> = {
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    webp: 'image/webp',
    svg:  'image/svg+xml',
    bmp:  'image/bmp',
    tiff: 'image/tiff',
    tif:  'image/tiff',
    ico:  'image/x-icon',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
};

/** Derive a MIME type from a filename extension. Returns null if unknown. */
export function mimeFromFileName(fileName: string): string | null {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return EXT_TO_MIME[ext] ?? null;
}

export const isImageType = (
    mime?: string | null,
    fileName?: string | null,
): boolean => {
    if (mime?.startsWith('image/')) return true;
    if (fileName) {
        const derived = mimeFromFileName(fileName);
        if (derived?.startsWith('image/')) return true;
    }
    return false;
};

export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024)           return `${bytes} B`;
    if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// XHR upload

export const uploadFile = (
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
): Promise<UploadResult> =>
    new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        xhr.open('POST', `${apiUrl}/upload`);
        xhr.withCredentials = true;

        const token = useAuthStore.getState().accessToken;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };

        xhr.onload = () => {
            if (xhr.status === 201) {
                const result = JSON.parse(xhr.responseText) as UploadResult;

                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
                if (supabaseUrl && result.url.startsWith(supabaseUrl)) {
                    result.url = result.url
                        .replace(supabaseUrl + '/storage/v1/object/public', '/storage');
                }

                resolve(result);
            } else {
                try { reject(new Error(JSON.parse(xhr.responseText).message || 'Upload failed')); }
                catch { reject(new Error('Upload failed')); }
            }
        };

        xhr.onerror = () => reject(new Error('Network error'));

        signal?.addEventListener('abort', () => {
            xhr.abort();
            reject(new Error('Upload cancelled'));
        });

        xhr.send(formData);
    });