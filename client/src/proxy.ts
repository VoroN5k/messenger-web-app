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
        pathname === "/";

    // Scenario A: User without token is trying to access protected route
    if ( isProtectedRoute && !refreshToken ) {
        const loginUrl = new URL('/auth/login', request.url);

        loginUrl.searchParams.set('from', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Scenario B: User with token is trying to access auth route
    if ((isAuthRoute || pathname === "/") && refreshToken ) {
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