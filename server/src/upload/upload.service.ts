import {BadRequestException, Injectable, Logger} from "@nestjs/common";
import {createClient, SupabaseClient} from "@supabase/supabase-js";
import {ConfigService} from "@nestjs/config";
import * as path from "path";
import {randomUUID} from "crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
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
]);

@Injectable()
export class UploadService {
    private supabase: SupabaseClient;
    private bucket: string;
    private readonly logger = new Logger(UploadService.name);

    constructor(private readonly config: ConfigService) {
        this.supabase = createClient(
            config.getOrThrow<string>('SUPABASE_URL'),
            config.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
        );
        this.bucket = config.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');
    }

    async uploadFile(file: Express.Multer.File, userId: number) {
        if (file.size > MAX_FILE_SIZE) throw new BadRequestException('File is too large (max 10 MB)');
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);

        const ext = path.extname(file.originalname).toLowerCase();
        const storagePath = `${userId}/${randomUUID()}${ext}`

        const { error } = await this.supabase.storage
            .from(this.bucket)
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (error) {
            this.logger.error(`Supabase upload error: ${error.message}`)
            throw new BadRequestException('File upload failed');
        }

        const { data } = this.supabase.storage
            .from(this.bucket)
            .getPublicUrl(storagePath);

        this.logger.log(`User ${userId} uploaded: ${file.originalname} → ${storagePath}`)

        return {
            url: data.publicUrl,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
        }
    }

    async uploadAvatar(file: Express.Multer.File, userId: number) {
        if (file.size > MAX_AVATAR_SIZE)            throw new BadRequestException('Avatar too large (max 5 MB)');
        if (!AVATAR_MIME_TYPES.has(file.mimetype))  throw new BadRequestException('Invalid avatar type (only JPEG, PNG, WEBP allowed)');

        const ext       = file.mimetype === 'image/webp' ? '.webp'
                                            : file.mimetype === 'image.png' ? '.png' : '.jpg';
        const storagePath = `avatars/${userId}/${randomUUID()}${ext}`;

        // upsert false
        const { error } = await this.supabase.storage
            .from(this.bucket)
            .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false})

        if ( error ) {
            this.logger.error(`Avatar upload error: ${error.message}`);
            throw new BadRequestException('Avatar upload failed');
        }

        const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(storagePath);
        this.logger.log(`User ${userId} updated avatar → ${storagePath}`);

        return { url: data.publicUrl };
    }
}