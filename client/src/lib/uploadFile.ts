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
        if (token) xhr.setRequestHeader('Authorization', `Bearer${token}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };

    })