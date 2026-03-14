export interface JWTPayload {
    sub: number;
    email: string;
    nickname: string;
    role: string;
    avatarUrl: string | null;
}