import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {

    // take cookie from request
    const refreshToken = request.cookies.get('refreshToken')?.value;

    // path where user is trying to access
    const { pathname } = request.nextUrl;

    // groups of paths
    const isAuthRoute = pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register");
    const isProtectedRoute = pathname.startsWith("/chat") || pathname.startsWith("/profile");

    // Scenario A: User without token is trying to access protected route
    if ( isProtectedRoute && !refreshToken ) {
        return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Scenario B: User with token is trying to access auth route
    if ( isAuthRoute && refreshToken ) {
        return NextResponse.redirect(new URL('/chat', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/chat/:path*',
        '/profile/:path*',
        '/auth/:path*'],
};