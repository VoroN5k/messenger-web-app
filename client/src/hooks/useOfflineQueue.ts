import {QueuedMessage} from "@/src/types/conversation.types";
import {useCallback, useEffect, useRef, useState} from "react";

/**
 * Purely im-memory offline queue
 *
 * Messages are held in React state + a ref (for stable access in callbacks).
 * - Nothing is ever written to localStorage / sessionStorage.
 * - If the user closes the tab or refreshes — unsent messages are gone forever.
 *   This is intentional: it preserves E2E guarantees (no plaintext at rest).
 *
 * `onFlush` is called once per item when the queue drains.
 * Return `true`  → item removed from queue (sent successfully).
 * Return `false` → item stays in queue (retry later).
 */

export function useOfflineQueue(
    onFlush: (msg: QueuedMessage) => Promise<boolean>,
) {
    const [queue, setQueue] = useState<QueuedMessage[]>([]);
    const queueRef = useRef<QueuedMessage[]>([]);

    const [isOnline, setIsOnline] = useState(() =>
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );

    const flushingRef = useRef(false);
    const onFlushRef = useRef(onFlush);
    useEffect(() => { onFlushRef.current = onFlush; }, [onFlush]);

    const syncQueue = useCallback((next: QueuedMessage[]) => {
        queueRef.current = next;
        setQueue(next);
    }, []);

    const enqueue = useCallback((msg: Omit<QueuedMessage, "queueId">): string => {
        const item: QueuedMessage = {
            ...msg,
            queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        const next = [...queueRef.current, item];
        syncQueue(next);
        return item.queueId;
    }, [syncQueue]);

    const flush = useCallback(async () => {
        if (flushingRef.current)       return;
        if (!queueRef.current.length)  return;

        flushingRef.current = true;
        const toFlush = [...queueRef.current];
        const failed: QueuedMessage[] = [];

        for (const msg of toFlush) {
            try {
                const ok = await onFlushRef.current(msg);
                if (!ok) failed.push(msg);
            } catch {
                failed.push(msg);
            }
        }

        syncQueue(failed);
        flushingRef.current = false;
    }, [syncQueue]);

    // Online / offline listeners
    useEffect(() => {
        const goOnline  = () => { setIsOnline(true);  flush(); };
        const goOffline = () =>   setIsOnline(false);

        window.addEventListener("online",  goOnline);
        window.addEventListener("offline", goOffline);
        return () => {
            window.removeEventListener("online",  goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, [flush]);

    return { queue, isOnline, enqueue, flush };
}

