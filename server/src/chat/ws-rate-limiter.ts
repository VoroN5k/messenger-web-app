export class WsRateLimiter {
    private readonly windows = new Map<number, number[]>();
    private readonly limit: number;
    private readonly ttlMs: number;

    constructor(limit: number, ttlSeconds: number) {
    this.limit = limit;
    this.ttlMs = ttlSeconds * 1000;
    }

    isAllowed(userId: number): boolean {
        const now = Date.now();
        const hits = this.windows.get(userId) ?? [];

        const fresh = hits.filter(t => now - t < this.ttlMs);

        if(fresh.length >= this.limit) {
            this.windows.set(userId, fresh);
            return false;
        }

        fresh.push(now);
        this.windows.set(userId, fresh);
        return true;
    }

    retryAfter (userId: number): number {
        const now = Date.now();
        const hits = this.windows.get(userId) ?? [];
        if(!hits.length) return 0;
        const oldest = Math.min(...hits);
        return Math.ceil((oldest + this.ttlMs - now) / 1000);
    }

    cleanup(): void {
        const now = Date.now();
        for (const [userId, hits] of this.windows.entries()) {
            const fresh = hits.filter(t => now - t < this.ttlMs);
            if (fresh.length === 0) this.windows.delete(userId);
            else this.windows.set(userId, fresh);
        }
    }
}