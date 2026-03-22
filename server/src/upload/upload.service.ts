// server/src/upload/upload.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE   = 10 * 1024 * 1024;
const MAX_AVATAR_SIZE =  5 * 1024 * 1024;
const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'audio/webm', 'audio/webm;codecs=opus', 'audio/wav',
]);

// Server-side signed URL cache
interface CacheEntry { url: string; expiresAt: number }
const SIGNED_CACHE = new Map<string, CacheEntry>();
const CACHE_BUFFER_MS = 5 * 60 * 1000;

@Injectable()
export class UploadService {
    private supabase: SupabaseClient;
    private bucket:   string;
    private baseStorageUrl: string;
    private readonly logger = new Logger(UploadService.name);

    constructor(private readonly config: ConfigService) {
        const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
        const bucketName  = config.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');

        this.supabase = createClient(
            supabaseUrl,
            config.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
        );
        this.bucket         = bucketName;
        this.baseStorageUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}`;
    }

    // Upload helpers

    async uploadFile(file: Express.Multer.File, userId: number) {
        const isAllowed = ALLOWED_MIME_TYPES.has(file.mimetype) || file.mimetype.startsWith('audio/');
        if (file.size > MAX_FILE_SIZE) throw new BadRequestException('File is too large (max 10 MB)');
        if (!isAllowed) throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);

        const ext         = path.extname(file.originalname).toLowerCase();
        const storagePath = `${userId}/${randomUUID()}${ext}`;

        const { error } = await this.supabase.storage
            .from(this.bucket)
            .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

        if (error) {
            this.logger.error(`Supabase upload error: ${error.message}`);
            throw new BadRequestException('File upload failed');
        }

        // Return a server-relative proxy URL so the real Supabase origin is never
        // exposed to clients and access always goes through our auth layer.
        const proxyUrl = `/storage/${this.bucket}/${storagePath}`;
        this.logger.log(`User ${userId} uploaded: ${file.originalname} → ${storagePath}`);

        return {
            url:      proxyUrl,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
        };
    }

    async uploadAvatar(file: Express.Multer.File, userId: number) {
        if (file.size > MAX_AVATAR_SIZE)           throw new BadRequestException('Avatar too large (max 5 MB)');
        if (!AVATAR_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Invalid avatar type (only JPEG, PNG, WEBP allowed)');

        const ext         = file.mimetype === 'image/webp' ? '.webp' : file.mimetype === 'image/png' ? '.png' : '.jpg';
        const storagePath = `avatars/${userId}/${randomUUID()}${ext}`;

        const { error } = await this.supabase.storage
            .from(this.bucket)
            .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

        if (error) {
            this.logger.error(`Avatar upload error: ${error.message}`);
            throw new BadRequestException('Avatar upload failed');
        }

        // Avatars are profile pictures - still served via signed URL for consistency.
        const proxyUrl = `/storage/${this.bucket}/${storagePath}`;
        this.logger.log(`User ${userId} updated avatar → ${storagePath}`);
        return { url: proxyUrl };
    }

    // Signed URL generation

    /**
     * Returns a signed URL for `storagePath` valid for `expiresIn` seconds.
     * Results are cached server-side with a 5-minute safety buffer.
     */
    async getSignedUrl(storagePath: string, expiresIn = 3_600): Promise<{ url: string; expiresAt: number }> {
        const cached = SIGNED_CACHE.get(storagePath);
        if (cached && cached.expiresAt - CACHE_BUFFER_MS > Date.now()) {
            return cached;
        }

        const { data, error } = await this.supabase.storage
            .from(this.bucket)
            .createSignedUrl(storagePath, expiresIn);

        if (error || !data?.signedUrl) {
            this.logger.error(`Failed to create signed URL for "${storagePath}": ${error?.message}`);
            throw new BadRequestException('Cannot generate signed URL');
        }

        const entry: CacheEntry = {
            url:       data.signedUrl,
            expiresAt: Date.now() + expiresIn * 1_000,
        };
        SIGNED_CACHE.set(storagePath, entry);

        // Prevent unbounded cache growth - evict stale entries lazily
        if (SIGNED_CACHE.size > 5_000) this.evictExpired();

        return entry;
    }

    extractStoragePath(fileUrl: string): string | null {
        const proxyPrefix = `/storage/${this.bucket}/`;
        if (fileUrl.startsWith(proxyPrefix)) return fileUrl.slice(proxyPrefix.length);

        const publicPrefix = `${this.baseStorageUrl}/`;
        if (fileUrl.startsWith(publicPrefix)) return fileUrl.slice(publicPrefix.length);

        return null;
    }

    // Storage deletion

    async deleteFile(fileUrl: string): Promise<void> {
        try {
            const storagePath = this.extractStoragePath(fileUrl);
            if (!storagePath) {
                this.logger.warn(`deleteFile: unrecognised URL format, skipping: ${fileUrl}`);
                return;
            }

            const { error } = await this.supabase.storage.from(this.bucket).remove([storagePath]);
            if (error) {
                this.logger.warn(`deleteFile: Supabase remove failed for "${storagePath}": ${error.message}`);
            } else {
                this.logger.log(`deleteFile: removed "${storagePath}" from storage`);
            }

            SIGNED_CACHE.delete(storagePath);
        } catch (err: any) {
            this.logger.warn(`deleteFile: unexpected error for "${fileUrl}": ${err.message}`);
        }
    }

    // Internals

    private evictExpired() {
        const now = Date.now();
        for (const [key, entry] of SIGNED_CACHE.entries()) {
            if (entry.expiresAt < now) SIGNED_CACHE.delete(key);
        }
    }
}