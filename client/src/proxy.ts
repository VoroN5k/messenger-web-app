import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {

    // take cookie from request
    const refreshToken = request.cookies.get('refreshToken')?.value;

    // path where user is trying to access
    const { pathname } = request.nextUrl;

    // groups of paths
    const isAuthRoute =
        pathname.startsWith("/auth/login") ||
        pathname.startsWith("/auth/register") ||
        pathname.startsWith("/auth/forgot-password") ||
        pathname.startsWith("/auth/reset-password") ||
        pathname.startsWith("/auth/verify-pending");

    const isProtectedRoute =
        pathname.startsWith("/chat") ||
        pathname.startsWith("/profile") ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/auth/setup-recovery");

    // NOTE: refreshToken cookie lives on the API domain (voronsk-server.fly.dev),
    // so it is never visible here. Server-side protection of /chat is not possible
    // without a BFF proxy. Client-side guards in chat/page.tsx handle unauthed access.

    // Scenario B only: redirect already-authenticated users away from auth pages.
    if (isAuthRoute && refreshToken) {
        const authStorage = request.cookies.get('auth-storage')?.value;

        return NextResponse.redirect(new URL('/chat', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/chat/:path*',
        '/profile/:path*',
        '/settings/:path*',
        '/auth/:path*'],
};