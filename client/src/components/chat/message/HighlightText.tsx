'use client';

import { escReg } from '@/src/lib/chatFormatters';

interface Props {
    text:  string;
    query: string;
}

export function HighlightText({ text, query }: Props) {
    if (!query.trim()) return <>{text}</>;
    const parts = text.split(new RegExp(`(${escReg(query.trim())})`, 'gi'));
    return (
        <>
            {parts.map((p, i) =>
                p.toLowerCase() === query.trim().toLowerCase()
                    ? <mark key={i} className="bg-yellow-300 text-yellow-900 rounded-sm px-px">{p}</mark>
                    : <span key={i}>{p}</span>,
            )}
        </>
    );
}
