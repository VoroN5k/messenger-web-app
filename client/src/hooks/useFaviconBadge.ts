'use client';

import { useEffect, useRef } from 'react';

/**
 * Draws an unread count badge onto the browser favicon.
 * Works by painting on a canvas and replacing the <link rel="icon"> href.
 * Restores the original favicon when count drops to 0.
 */
export function useFaviconBadge(unreadCount: number) {
    const originalHrefRef = useRef<string | null>(null);
    const canvasRef       = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Grab the existing favicon link (or create one)
        let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }

        // Remember the original href so we can restore it
        if (!originalHrefRef.current) {
            originalHrefRef.current = link.href || '/favicon.ico';
        }

        if (unreadCount <= 0) {
            // Restore original
            link.href = originalHrefRef.current;
            return;
        }

        // Draw badge on canvas
        const size   = 32;
        let canvas   = canvasRef.current;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvasRef.current = canvas;
        }
        canvas.width  = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Load the base favicon image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.clearRect(0, 0, size, size);

            // Draw the favicon
            ctx.drawImage(img, 0, 0, size, size);

            // Badge background — violet circle in top-right
            const badgeRadius = 10;
            const cx = size - badgeRadius;
            const cy = badgeRadius;

            ctx.beginPath();
            ctx.arc(cx, cy, badgeRadius, 0, 2 * Math.PI);
            ctx.fillStyle = '#7c4dff';
            ctx.fill();

            // Badge text
            const label = unreadCount > 99 ? '99+' : String(unreadCount);
            ctx.fillStyle   = '#ffffff';
            ctx.font        = `bold ${unreadCount > 9 ? 8 : 11}px sans-serif`;
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy + 0.5);

            link!.href = canvas!.toDataURL('image/png');
        };

        img.onerror = () => {
            // Favicon failed to load — draw badge on blank canvas
            ctx.clearRect(0, 0, size, size);

            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#0f0f14';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(size - 10, 10, 10, 0, 2 * Math.PI);
            ctx.fillStyle = '#7c4dff';
            ctx.fill();

            const label = unreadCount > 99 ? '99+' : String(unreadCount);
            ctx.fillStyle    = '#ffffff';
            ctx.font         = `bold ${unreadCount > 9 ? 8 : 11}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, size - 10, 10.5);

            link!.href = canvas!.toDataURL('image/png');
        };

        img.src = originalHrefRef.current!;
    }, [unreadCount]);
}