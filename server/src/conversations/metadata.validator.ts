import { BadRequestException } from '@nestjs/common';

// Дозволені MIME types для голосових повідомлень
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

// Обмеження
const MAX_METADATA_BYTES  = 64 * 1024;   // 64 KB
const MAX_WAVEFORM_POINTS = 2_000;
const MAX_DURATION_SEC    = 3 * 3600;    // 3 години — розумна межа

// Небезпечні ключі (prototype pollution)
const FORBIDDEN_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
]);

/**
 * Валідована та нормалізована структура metadata.
 * Тільки ці поля зберігаються в БД.
 */
export interface ValidatedMetadata {
    /** Масив амплітуд [0..1] для відображення waveform */
    waveform?: number[];
    /** Тривалість аудіо в секундах */
    duration?: number;
    /** MIME type оригінального аудіо файлу */
    mimeType?: string;
    /** Прапорець E2E шифрування */
    encrypted?: true;
}

/**
 * Парсить і валідує metadata рядок.
 *
 * @throws BadRequestException якщо metadata невалідна
 * @returns нормалізований JSON рядок або null
 */
export function validateAndNormalizeMetadata(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined || raw === '') return null;

    // 1. Розмір
    if (Buffer.byteLength(raw, 'utf8') > MAX_METADATA_BYTES) {
        throw new BadRequestException('metadata: exceeds maximum size of 64 KB');
    }

    // JSON parse з захистом від prototype pollution
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new BadRequestException('metadata: invalid JSON');
    }

    // Має бути plain object, не масив, не null, не примітив
    if (
        typeof parsed !== 'object' ||
        parsed === null           ||
        Array.isArray(parsed)
    ) {
        throw new BadRequestException('metadata: must be a JSON object');
    }

    // Перевірка на небезпечні ключі
    const keys = Object.keys(parsed);
    for (const key of keys) {
        if (FORBIDDEN_KEYS.has(key)) {
            throw new BadRequestException(`metadata: forbidden key "${key}"`);
        }
    }

    // Whitelist полів
    const allowedKeys = new Set(['waveform', 'duration', 'mimeType', 'encrypted']);
    for (const key of keys) {
        if (!allowedKeys.has(key)) {
            throw new BadRequestException(`metadata: unknown field "${key}"`);
        }
    }

    const obj = parsed as Record<string, unknown>;
    const result: ValidatedMetadata = {};

    // waveform
    if ('waveform' in obj) {
        const wf = obj['waveform'];

        if (!Array.isArray(wf)) {
            throw new BadRequestException('metadata.waveform: must be an array');
        }

        if (wf.length > MAX_WAVEFORM_POINTS) {
            throw new BadRequestException(
                `metadata.waveform: too many points (max ${MAX_WAVEFORM_POINTS})`,
            );
        }

        const normalized: number[] = [];
        for (let i = 0; i < wf.length; i++) {
            const v = wf[i];
            if (typeof v !== 'number' || !isFinite(v)) {
                throw new BadRequestException(
                    `metadata.waveform[${i}]: must be a finite number`,
                );
            }
            // Клампуємо до [0, 1] - UI очікує саме цей діапазон
            normalized.push(Math.min(1, Math.max(0, v)));
        }

        result.waveform = normalized;
    }

    // duration
    if ('duration' in obj) {
        const dur = obj['duration'];

        if (typeof dur !== 'number' || !isFinite(dur) || dur < 0) {
            throw new BadRequestException('metadata.duration: must be a non-negative finite number');
        }

        if (dur > MAX_DURATION_SEC) {
            throw new BadRequestException(
                `metadata.duration: exceeds maximum (${MAX_DURATION_SEC}s)`,
            );
        }

        result.duration = Math.round(dur * 1000) / 1000; // зберігаємо до мс
    }

    // mimeType
    if ('mimeType' in obj) {
        const mime = obj['mimeType'];

        if (typeof mime !== 'string') {
            throw new BadRequestException('metadata.mimeType: must be a string');
        }

        // Нормалізуємо: lowercase, без зайвих пробілів
        const normalized = mime.toLowerCase().trim();

        if (!ALLOWED_AUDIO_MIMES.has(normalized)) {
            throw new BadRequestException(
                `metadata.mimeType: "${mime}" is not allowed. ` +
                `Allowed types: ${[...ALLOWED_AUDIO_MIMES].join(', ')}`,
            );
        }

        result.mimeType = normalized;
    }

    // encrypted
    if ('encrypted' in obj) {
        const enc = obj['encrypted'];

        // Дозволяємо тільки true (boolean) - false просто не зберігаємо
        if (enc !== true && enc !== false) {
            throw new BadRequestException('metadata.encrypted: must be a boolean');
        }

        if (enc === true) {
            result.encrypted = true;
        }
        // enc === false - просто не включаємо в result
    }

    // Якщо після валідації нічого немає — повертаємо null
    if (Object.keys(result).length === 0) return null;

    // Серіалізуємо назад - тільки відомі поля, без зайвого
    return JSON.stringify(result);
}