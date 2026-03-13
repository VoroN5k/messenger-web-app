import {useAuthStore} from "@/src/store/useAuthStore";

export interface UploadResult {
    url:        string;
    fileName:   string;
    fileType:   string;
    fileSize:   number;
}

export const uploadFile = (
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
): Promise<UploadResult> =>
    new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'http://localhost:4000/api/upload');

        const token = useAuthStore.getState().accessToken;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };

        xhr.onload = () => {
            if (xhr.status === 201) {
                resolve(JSON.parse(xhr.responseText) as UploadResult);
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

export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024)           return `${bytes} B`;
    if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const isImageType = (mime?: string | null): boolean =>
    !!mime?.startsWith('image/');
