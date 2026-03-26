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
    title: 'Мій Месенджер',
    description: 'Найкращий чат на Next.js',
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
        <body className={inter.className}>
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