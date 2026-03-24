export interface MessageMetadata {
    waveform:              number[];
    duration:              number;
    mimeType:              string;
    encrypted:             boolean;
    destructAfterSeconds?: number;
}

const FORBIDDEN_KEYS = new Set([
    '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
]);

const DEFAULTS: MessageMetadata = {
    waveform:  [],
    duration:  0,
    mimeType:  'audio/webm',
    encrypted: false,
};

function isSafeAudioMime(mime: string): boolean {
    const normalized = mime.toLowerCase().trim();
    if (!normalized.startsWith('audio/')) return false;
    if (normalized.length > 100) return false;
    if (/html|javascript|script|<|>/.test(normalized)) return false;
    return true;
}

export function parseMetadata(raw: string | null | undefined): MessageMetadata {
    if (!raw) return { ...DEFAULTS };

    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return { ...DEFAULTS }; }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULTS };

    for (const key of FORBIDDEN_KEYS) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) return { ...DEFAULTS };
    }

    const obj = parsed as Record<string, unknown>;

    // waveform
    let waveform: number[] = [];
    const rawWaveform = obj['waveform'];
    if (Array.isArray(rawWaveform)) {
        waveform = rawWaveform
            .slice(0, 2_000)
            .map(v => {
                const n = typeof v === 'number' ? v : parseFloat(String(v));
                if (!isFinite(n)) return 0.05;
                return Math.min(1, Math.max(0, n));
            });
    }

    // duration
    let duration = 0;
    const rawDuration = obj['duration'];
    if (rawDuration !== undefined) {
        const n = typeof rawDuration === 'number' ? rawDuration : parseFloat(String(rawDuration));
        if (isFinite(n) && n >= 0 && n <= 10_800) duration = n;
    }

    // mimeType
    let mimeType = DEFAULTS.mimeType;
    const rawMime = obj['mimeType'];
    if (typeof rawMime === 'string' && rawMime.trim()) {
        if (isSafeAudioMime(rawMime.trim())) mimeType = rawMime.trim();
    }

    // encrypted
    const encrypted = obj['encrypted'] === true;

    // destructAfterSeconds ← NEW
    let destructAfterSeconds: number | undefined;
    const rawDas = obj['destructAfterSeconds'];
    if (rawDas !== undefined) {
        const n = typeof rawDas === 'number' ? rawDas : parseFloat(String(rawDas));
        if (isFinite(n) && n >= 1 && n <= 7 * 24 * 3600) {
            destructAfterSeconds = Math.round(n);
        }
    }

    return { waveform, duration, mimeType, encrypted, destructAfterSeconds };
}

export function hasMetadata(raw: string | null | undefined): boolean {
    return typeof raw === 'string' && raw.length > 2;
}