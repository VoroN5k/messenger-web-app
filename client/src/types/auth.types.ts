export interface User {
    id: number;
    nickname: string;
    email?: string;
    role?: string;
    isOnline?: boolean;
    lastSeen?: Date | string;
}

export interface JwtPayload {
    sub: number;
    nickname: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}

export interface AuthResponse {
    accessToken: string;
}