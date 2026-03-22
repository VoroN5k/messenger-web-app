export interface MessageMetadata {
    /** Амплітуди для waveform, значення [0..1] */
    waveform: number[];
    /** Тривалість аудіо в секундах */
    duration: number;
    /** MIME type аудіо */
    mimeType: string;
    /** Чи зашифрований файл E2E */
    encrypted: boolean;
}

const ALLOWED_AUDIO_MIMES = new Set([
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
]);

const FORBIDDEN_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
]);

const DEFAULTS: MessageMetadata = {
    waveform:  [],
    duration:  0,
    mimeType:  'audio/wav',
    encrypted: false,
};

/**
 * Безпечно парсить metadata рядок.
 * Ніколи не кидає помилку — при будь-якій проблемі повертає defaults.
 *
 * @example
 * const { waveform, duration, mimeType, encrypted } = parseMetadata(msg.metadata);
 */
export function parseMetadata(raw: string | null | undefined): MessageMetadata {
    if (!raw) return { ...DEFAULTS };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ...DEFAULTS };
    }

    // Має бути plain object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ...DEFAULTS };
    }

    // Prototype pollution guard
    for (const key of FORBIDDEN_KEYS) {
        if (key in parsed) return { ...DEFAULTS };
    }

    const obj = parsed as Record<string, unknown>;

    // waveform
    let waveform: number[] = [];
    const rawWaveform = obj['waveform'];
    if (Array.isArray(rawWaveform)) {
        waveform = rawWaveform
            .slice(0, 2_000) // обмеження на кількість точок
            .map((v) => {
                const n = typeof v === 'number' ? v : parseFloat(String(v));
                if (!isFinite(n)) return 0.05; // дефолтна амплітуда
                return Math.min(1, Math.max(0, n)); // клампуємо [0, 1]
            });
    }

    // duration
    let duration = 0;
    const rawDuration = obj['duration'];
    if (rawDuration !== undefined) {
        const n = typeof rawDuration === 'number'
            ? rawDuration
            : parseFloat(String(rawDuration));
        if (isFinite(n) && n >= 0 && n <= 10_800) { // max 3 години
            duration = n;
        }
    }

    // mimeType
    let mimeType = DEFAULTS.mimeType;
    const rawMime = obj['mimeType'];
    if (typeof rawMime === 'string') {
        const normalized = rawMime.toLowerCase().trim();
        if (ALLOWED_AUDIO_MIMES.has(normalized)) {
            mimeType = normalized;
        }
        // Якщо не з allowlist — залишаємо дефолт (audio/wav)
        // Не кидаємо помилку — дані могли прийти до оновлення валідатора
    }

    // encrypted
    // Приймаємо тільки справжній boolean true
    const encrypted = obj['encrypted'] === true;

    return { waveform, duration, mimeType, encrypted };
}

/**
 * Перевіряє чи рядок взагалі містить metadata
 * (швидка перевірка без повного парсингу)
 */
export function hasMetadata(raw: string | null | undefined): boolean {
    return typeof raw === 'string' && raw.length > 2; // мінімум "{}"
}