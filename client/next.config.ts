import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
    './src/i18n/request.ts'
)

const nextConfig: NextConfig = {

    experimental: {
        serverComponentsExternalPackages: []
    },

    // Required for Docker / fly.io — produces a self-contained server.js bundle.
    output: 'standalone',

    async rewrites() {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        return [
            {
                source: '/api/:path*',
                destination: `${backendUrl}/api/:path*`,
            },
            {
                source: '/storage/:path*',
                destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/:path*`,
            },
        ];
    },
};

export default withNextIntl(nextConfig);