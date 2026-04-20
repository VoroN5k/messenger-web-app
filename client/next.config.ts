import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
    './src/i18n/request.ts'
)

const nextConfig: NextConfig = {
    // Required for Docker / fly.io — produces a self-contained server.js bundle.
    // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
    output: 'standalone',

    async rewrites() {
        return [
            {
                source: '/storage/:path*',
                destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/:path*`,
            },
        ];
    },
};

export default withNextIntl(nextConfig);
