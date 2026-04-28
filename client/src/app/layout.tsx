import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { ThemeProvider } from '@/src/context/ThemeProvider';
import { SocketProvider } from '@/src/context/SocketContext';
import AuthSync from '@/src/app/auth/AuthSync';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
    title: 'Vesper',
    description: 'End-to-end encrypted messenger',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Vesper',
    },
};


export default async function RootLayout({
                                             children,
                                         }: {
    children: React.ReactNode;
}) {
    const locale   = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale} suppressHydrationWarning>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
            <meta name="theme-color" content="#7c4dff" />
            <meta name="mobile-web-app-capable" content="yes" />
            <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
            <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png" />
            <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                            (function() {
                                try {
                                    var theme = localStorage.getItem('theme');
                                    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                                    if (theme === 'dark' || (!theme && prefersDark)) {
                                        document.documentElement.classList.add('dark');
                                    }
                                } catch(e) {}
                            })();
                        `,
                }}
            />
        </head>
        <body className={inter.className} suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthSync />
            <ThemeProvider>
                <SocketProvider>
                    {children}
                </SocketProvider>
            </ThemeProvider>
        </NextIntlClientProvider>
        </body>
        </html>
    );
}