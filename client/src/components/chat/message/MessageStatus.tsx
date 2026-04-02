'use client';

import { Message } from '@/src/types/conversation.types';

const CP = 'M1.5 5L5 8.5L12.5 1';

export function MessageStatus({ msg }: { msg: Message }) {
    if (msg.isPending) {
        return (
            <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                className="inline-block shrink-0 opacity-60"
            >
                <title>Очікує відправки...</title>
                <circle cx="12" cy="12" r="9"
                        stroke="rgba(255,255,255,0.7)" strokeWidth="1.8"/>
                <path d="M12 7v5l2.5 2.5"
                      stroke="rgba(255,255,255,0.7)" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        );
    }

    if ((msg as any)._sendFailed) {
        return (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline-block shrink-0">
                <title>Не вдалося надіслати</title>
                <circle cx="12" cy="12" r="9" stroke="var(--red)" strokeWidth="1.8"/>
                <path d="M12 7v5M12 16v1" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
        );
    }

    const isRead = msg.isRead === true;
    const c = isRead ? '#69dafa' : 'rgba(255,255,255,0.5)';

    if (!msg.id)
        return (
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block shrink-0">
                <path d={CP} stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        );

    return (
        <svg width="19" height="10" viewBox="0 0 19 10" fill="none" className="inline-block shrink-0">
            <path d={CP}                   stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.5 5L9 8.5L16.5 1" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}
