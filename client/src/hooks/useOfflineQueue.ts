import {QueuedMessage} from "@/src/types/conversation.types";
import {useCallback, useEffect, useRef, useState} from "react";

const STORAGE_KEY =  'offline-msg-queue';

// Persist helpers
function loadFromStorage(): QueuedMessage[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveToStorage(q: QueuedMessage[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch {}
}

/**
 * Manages the offline message queue.
 *
 * `onFlush` is called once per item when the queue drains.
 * Return `true` to remove the item from the queue, `false` to keep it ( retry later )
 */
export function useOfflineQueue(
    onFlush: (msg: QueuedMessage) => Promise<boolean>,
) {
    const [queue, setQueue] = useState<QueuedMessage[]>(loadFromStorage);
    const [isOnline, setIsOnline] = useState(() =>
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    );

    const flushingRef = useRef(false);
    const onFlushRef = useRef(onFlush);
    useEffect(() => { onFlushRef.current = onFlush; }, [onFlush]);

    const persist = useCallback((q: QueuedMessage[]) => {
        setQueue(q);
        saveToStorage(q);
    }, []);

    const enqueue = useCallback((msg: Omit<QueuedMessage, 'queueId'>): string => {
        const item: QueuedMessage = {
            ...msg,
            queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        setQueue(prev => {
            const next = [...prev, item];
            saveToStorage(next);
            return next;
        });
        return item.queueId;
    }, []);

    // Reads directly from storage so it's safe to call from window/socket events
    // even if React state hasn't re-rendered yet.
    const flush = useCallback(async () => {
        if (flushingRef.current) return;
        const current = loadFromStorage();
        if (!current.length) return;

        flushingRef.current = true;
        const failed: QueuedMessage[] = [];

        for (const msg of current) {
            try {
                const ok = await onFlushRef.current(msg);
                if (!ok) failed.push(msg);
            } catch {
                failed.push(msg);
            }
        }

        persist(failed);
        flushingRef.current = false;
    }, [persist]);

    // online / offline
    useEffect(() => {
        const goOnline  = () => { setIsOnline(true);  flush(); };
        const goOffline = () =>   setIsOnline(false);
        window.addEventListener('online',  goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online',  goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, [flush]);

    return { queue, isOnline, enqueue, flush };
}


