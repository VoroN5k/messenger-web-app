import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export interface SyncSession {
    userId: number;
    sourceSocketId: string;
    targetSocketId?: string;
    expiresAt: number;
    ekSource?: string;
    sdpOffer?: RTCSessionDescriptionInit;
}

const TTL_S   = 5 * 60;
const KEY     = (id:  string) => `dsync:${id}`;
const SKT_KEY = (skt: string) => `dsync_skt:${skt}`;

@Injectable()
export class SyncSessionService implements OnModuleDestroy {
    private readonly logger = new Logger(SyncSessionService.name);
    private readonly redis: Redis | null = null;
    private readonly mem    = new Map<string, SyncSession>();
    private readonly sktMem = new Map<string, string>(); // socketId → sessionId

    constructor(config: ConfigService) {
        const url = config.get<string>('REDIS_URL');
        if (url) {
            this.redis = new Redis(url);
            this.redis.on('error', (err: Error) =>
                this.logger.error(`Redis error: ${err.message}`),
            );
            this.logger.log('Using Redis sync session store');
        } else {
            this.logger.log('Using in-memory sync session store');
        }
    }

    onModuleDestroy() {
        this.redis?.disconnect();
    }

    async has(sessionId: string): Promise<boolean> {
        if (this.redis) return (await this.redis.exists(KEY(sessionId))) === 1;
        return this.mem.has(sessionId);
    }

    async get(sessionId: string): Promise<SyncSession | null> {
        if (this.redis) {
            const raw = await this.redis.get(KEY(sessionId));
            return raw ? (JSON.parse(raw) as SyncSession) : null;
        }
        return this.mem.get(sessionId) ?? null;
    }

    async set(sessionId: string, session: SyncSession): Promise<void> {
        if (this.redis) {
            await this.redis.set(KEY(sessionId), JSON.stringify(session), 'EX', TTL_S);
        } else {
            this.mem.set(sessionId, session);
        }
    }

    async update(sessionId: string, patch: Partial<SyncSession>): Promise<SyncSession | null> {
        const session = await this.get(sessionId);
        if (!session) return null;
        const updated = { ...session, ...patch };
        await this.set(sessionId, updated);
        return updated;
    }

    async trackSocket(socketId: string, sessionId: string): Promise<void> {
        if (this.redis) {
            await this.redis.set(SKT_KEY(socketId), sessionId, 'EX', TTL_S);
        } else {
            this.sktMem.set(socketId, sessionId);
        }
    }

    async getSessionBySocket(
        socketId: string,
    ): Promise<{ sessionId: string; session: SyncSession } | null> {
        let sessionId: string | null | undefined;
        if (this.redis) {
            sessionId = await this.redis.get(SKT_KEY(socketId));
        } else {
            sessionId = this.sktMem.get(socketId);
        }
        if (!sessionId) return null;
        const session = await this.get(sessionId);
        return session ? { sessionId, session } : null;
    }

    async deleteSession(sessionId: string): Promise<SyncSession | null> {
        const session = await this.get(sessionId);
        if (!session) return null;
        const keys = [KEY(sessionId), SKT_KEY(session.sourceSocketId)];
        if (session.targetSocketId) keys.push(SKT_KEY(session.targetSocketId));
        if (this.redis) {
            await this.redis.del(...keys);
        } else {
            this.mem.delete(sessionId);
            this.sktMem.delete(session.sourceSocketId);
            if (session.targetSocketId) this.sktMem.delete(session.targetSocketId);
        }
        return session;
    }

    purgeExpired(): void {
        if (this.redis) return; // Redis handles TTL natively
        const now = Date.now();
        for (const [id, s] of this.mem.entries()) {
            if (s.expiresAt <= now) {
                this.sktMem.delete(s.sourceSocketId);
                if (s.targetSocketId) this.sktMem.delete(s.targetSocketId);
                this.mem.delete(id);
            }
        }
    }
}
