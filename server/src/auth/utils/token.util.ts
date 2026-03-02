import * as crypto from 'crypto';

export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}