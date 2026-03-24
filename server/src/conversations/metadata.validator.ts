import { BadRequestException } from '@nestjs/common';

const MAX_METADATA_BYTES  = 64 * 1024;
const MAX_WAVEFORM_POINTS = 2_000;
const MAX_DURATION_SEC    = 3 * 3600;
const MAX_DESTRUCT_SEC    = 7 * 24 * 3600; // 1 week max

const FORBIDDEN_KEYS = new Set([
    '__proto__', 'constructor', 'prototype',
    'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
]);

export interface ValidatedMetadata {
    waveform?:             number[];
    duration?:             number;
    mimeType?:             string;
    encrypted?:            true;
    destructAfterSeconds?: number;
}

function isSafeAudioMime(mime: string): boolean {
    const normalized = mime.toLowerCase().trim();
    if (!normalized.startsWith('audio/')) return false;
    if (normalized.length > 100) return false;
    if (/html|javascript|script|<|>|data:/.test(normalized)) return false;
    if (!/^audio\/[a-z0-9+\-;=\s\."]+$/.test(normalized)) return false;
    return true;
}

export function validateAndNormalizeMetadata(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined || raw === '') return null;

    if (Buffer.byteLength(raw, 'utf8') > MAX_METADATA_BYTES) {
        throw new BadRequestException('metadata: exceeds maximum size of 64 KB');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new BadRequestException('metadata: invalid JSON');
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new BadRequestException('metadata: must be a JSON object');
    }

    const keys = Object.keys(parsed);
    for (const key of keys) {
        if (FORBIDDEN_KEYS.has(key)) {
            throw new BadRequestException(`metadata: forbidden key "${key}"`);
        }
    }

    const allowedKeys = new Set(['waveform', 'duration', 'mimeType', 'encrypted', 'destructAfterSeconds']);
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
        if (!Array.isArray(wf)) throw new BadRequestException('metadata.waveform: must be an array');
        if (wf.length > MAX_WAVEFORM_POINTS) throw new BadRequestException(`metadata.waveform: too many points`);
        const normalized: number[] = [];
        for (let i = 0; i < wf.length; i++) {
            const v = wf[i];
            if (typeof v !== 'number' || !isFinite(v)) throw new BadRequestException(`metadata.waveform[${i}]: must be a finite number`);
            normalized.push(Math.min(1, Math.max(0, v)));
        }
        result.waveform = normalized;
    }

    // duration
    if ('duration' in obj) {
        const dur = obj['duration'];
        if (typeof dur !== 'number' || !isFinite(dur) || dur < 0) throw new BadRequestException('metadata.duration: must be a non-negative finite number');
        if (dur > MAX_DURATION_SEC) throw new BadRequestException(`metadata.duration: exceeds maximum`);
        result.duration = Math.round(dur * 1000) / 1000;
    }

    // mimeType
    if ('mimeType' in obj) {
        const mime = obj['mimeType'];
        if (typeof mime !== 'string') throw new BadRequestException('metadata.mimeType: must be a string');
        const trimmed = mime.trim();
        if (!isSafeAudioMime(trimmed)) throw new BadRequestException(`metadata.mimeType: "${mime}" is not a valid audio MIME type`);
        result.mimeType = trimmed;
    }

    // encrypted
    if ('encrypted' in obj) {
        const enc = obj['encrypted'];
        if (enc !== true && enc !== false) throw new BadRequestException('metadata.encrypted: must be a boolean');
        if (enc === true) result.encrypted = true;
    }

    // destructAfterSeconds — self-destruct timer
    if ('destructAfterSeconds' in obj) {
        const das = obj['destructAfterSeconds'];
        if (typeof das !== 'number' || !isFinite(das) || das < 1) {
            throw new BadRequestException('metadata.destructAfterSeconds: must be a positive integer (≥ 1 second)');
        }
        if (das > MAX_DESTRUCT_SEC) {
            throw new BadRequestException(`metadata.destructAfterSeconds: exceeds maximum of ${MAX_DESTRUCT_SEC}s`);
        }
        result.destructAfterSeconds = Math.round(das);
    }

    if (Object.keys(result).length === 0) return null;
    return JSON.stringify(result);
}