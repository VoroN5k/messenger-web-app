/**
 * Safe Metadata Parser (client-side)
 *
 * mimeType: приймаємо будь-який audio/* —
 * MediaRecorder може повертати різні варіанти:
 *   "audio/webm;codecs=opus"
 *   "audio/webm; codecs=opus"   (з пробілом)
 *   'audio/webm;codecs="opus"'  (з лапками)
 * Жорсткий allowlist ламав відтворення якщо формат не збігався точно.
 */

export interface MessageMetadata {
    waveform:  number[];
    duration:  number;
    mimeType:  string;
    encrypted: boolean;
}

const FORBIDDEN_KEYS = new Set([
    '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
]);

// Дефолт — webm, бо саме його використовують браузери
const DEFAULTS: MessageMetadata = {
    waveform:  [],
    duration:  0,
    mimeType:  'audio/webm',
    encrypted: false,
};

/**
 * Перевіряє чи MIME type є безпечним audio/* рядком.
 * Не використовує жорсткий allowlist — MediaRecorder повертає
 * багато варіантів одного формату.
 */
function isSafeAudioMime(mime: string): boolean {
    const normalized = mime.toLowerCase().trim();
    if (!normalized.startsWith('audio/')) return false;
    if (normalized.length > 100) return false;
    // Блокуємо підозрілі injection-рядки
    if (/html|javascript|script|<|>/.test(normalized)) return false;
    return true;
}

/**
 * Безпечно парсить metadata рядок.
 * Ніколи не кидає помилку — при будь-якій проблемі повертає defaults.
 */
export function parseMetadata(raw: string | null | undefined): MessageMetadata {
    if (!raw) return { ...DEFAULTS };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ...DEFAULTS };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ...DEFAULTS };
    }

    for (const key of FORBIDDEN_KEYS) {
        if (key in parsed) return { ...DEFAULTS };
    }

    const obj = parsed as Record<string, unknown>;

    // waveform
    let waveform: number[] = [];
    const rawWaveform = obj['waveform'];
    if (Array.isArray(rawWaveform)) {
        waveform = rawWaveform
            .slice(0, 2_000)
            .map((v) => {
                const n = typeof v === 'number' ? v : parseFloat(String(v));
                if (!isFinite(n)) return 0.05;
                return Math.min(1, Math.max(0, n));
            });
    }

    // duration
    let duration = 0;
    const rawDuration = obj['duration'];
    if (rawDuration !== undefined) {
        const n = typeof rawDuration === 'number'
            ? rawDuration
            : parseFloat(String(rawDuration));
        if (isFinite(n) && n >= 0 && n <= 10_800) {
            duration = n;
        }
    }

    // mimeType — приймаємо будь-який audio/*, зберігаємо оригінальний рядок
    let mimeType = DEFAULTS.mimeType;
    const rawMime = obj['mimeType'];
    if (typeof rawMime === 'string' && rawMime.trim()) {
        if (isSafeAudioMime(rawMime.trim())) {
            mimeType = rawMime.trim();
        }
    }

    // encrypted
    const encrypted = obj['encrypted'] === true;

    return { waveform, duration, mimeType, encrypted };
}

export function hasMetadata(raw: string | null | undefined): boolean {
    return typeof raw === 'string' && raw.length > 2;
}