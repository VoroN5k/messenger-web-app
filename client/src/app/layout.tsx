import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import {ThemeProvider} from "@/src/context/ThemeProvider";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
    title: "Мій Месенджер",
    description: "Найкращий чат на Next.js",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="uk" suppressHydrationWarning>
        <head>
            {/* Запобігаємо миготінню при завантаженні — встановлюємо тему до рендеру */}
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
        <ThemeProvider>
            {children}
        </ThemeProvider>
        </body>
        </html>
    );
}