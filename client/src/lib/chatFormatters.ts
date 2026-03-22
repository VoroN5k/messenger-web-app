export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const formatTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

export const formatDateSep = (d: string | Date) => {
    const date = new Date(d);
    const now  = new Date();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString())  return 'Сьогодні';
    if (date.toDateString() === yest.toDateString()) return 'Вчора';
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
};

export function formatLastSeen(lastSeen?: string | Date | null): string {
    if (!lastSeen) return 'Офлайн';
    const d    = new Date(lastSeen as string);
    const now  = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000)    return 'щойно в мережі';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} хв тому`;
    const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString())  return `сьогодні о ${time}`;
    if (d.toDateString() === yest.toDateString()) return `вчора о ${time}`;
    return `${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} о ${time}`;
}

export const escReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');