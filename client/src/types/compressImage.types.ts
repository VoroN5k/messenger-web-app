export interface CompressOptions {
    maxWidth?:  number;
    maxHeight?: number;
    quality?: number;
    outputFormat?: 'image/jpeg' | 'image/webp';
    skipIfSmaller?: number;
}

export interface CompressResult {
    file: File;
    originalSize: number;
    compressedSize: number;
    wasCompressed: boolean;
    savedPercent: number;
}