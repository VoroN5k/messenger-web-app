import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
    './src/i18n/request.ts'
)

const nextConfig: NextConfig = {

    // required for WASM modules (crypto worker)
    experimental: {
        serverComponentsExternalPackages: []
    },
    webpack(config, { isServer, dev }) {
        config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };

        if(!isServer) {
            config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';

            config.output.publicPath = '/_next/';
        }

        return config;
    },
    // Required for Docker / fly.io — produces a self-contained server.js bundle.
    // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
    output: 'standalone',

    async rewrites() {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        return [
            // Proxy all API calls through Next.js so cookies are same-origin
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
