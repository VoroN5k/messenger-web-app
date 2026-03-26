export interface User {
    id: number;
    nickname: string;
    email?: string;
    role?: string;
    isOnline?: boolean;
    lastSeen?: Date | string;
    avatarUrl?: string | null;
    statusEmoji?: string;
}

export interface JwtPayload {
    sub: number;
    nickname: string;
    email: string;
    role: string;
    avatarUrl: string | null;
    statusEmoji?: string | null;
    iat: number;
    exp: number;
}

export interface AuthResponse {
    accessToken: string;
}