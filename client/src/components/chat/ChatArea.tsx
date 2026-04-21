'use client';

import React, {
    useState, useRef, useEffect, UIEvent, useCallback,
} from 'react';
import { Paperclip, Loader2, Pin, PinOff, ArrowDown, Lock, Forward } from 'lucide-react';

import { useMessages }              from '@/src/hooks/useMessages';
import { useSearch }                from '@/src/hooks/useSearch';
import { useE2E }                   from '@/src/hooks/useE2E';
import { uploadFile, mimeFromFileName, isImageType } from '@/src/lib/uploadFile';
import { compressImage }            from '@/src/lib/compressImage';

import { ChatHeader }        from './ChatHeader';
import { SearchPanel }       from './SearchPanel';
import { ChatInput }         from './ChatInput';
import { MessageItem }       from './message/MessageItem';
import { ForwardModal }      from './ForwardModal';
import { MediaPanel }        from './MediaPanel';
import { ImageSendPreview }  from './ImageSendPreview';

import { Conversation, Message } from '@/src/types/conversation.types';
import { User }                  from '@/src/types/auth.types';
import { Socket }                from 'socket.io-client';
import { EDIT_WINDOW_MS, looksEncrypted } from '@/src/lib/chatFormatters';

interface ChatAreaProps {
    currentUser:           User | null;
    conversation:          Conversation | null;
    conversations:         Conversation[];
    socket:                Socket | null;
    onConversationUpdate?: (updated: any) => void;
    onMarkRead?:           (conversationId: number) => void;
    onStartCall?:          (convId: number, targetUserId: number, type: 'audio' | 'video') => void;
    // Forward navigation
    pendingForward?:         Message | null;
    onSetPendingForward?:    (msg: Message | null) => void;
    onSelectConversation?:   (conv: Conversation) => void;
    onBack?:                 () => void;
}

export default function ChatArea({
                                     currentUser, conversation, conversations, socket,
                                     onConversationUpdate, onMarkRead, onStartCall,
                                     pendingForward, onSetPendingForward, onSelectConversation, onBack,
                                 }: Readonly<ChatAreaProps>) {
    const currentUserId = currentUser?.id;

    const [inputValue,     setInputValue]     = useState('');
    const [hoveredKey,     setHoveredKey]     = useState<string | null>(null);
    const [confirmDelId,   setConfirmDelId]   = useState<number | null>(null);
    const [editingId,      setEditingId]      = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [pickerKey,      setPickerKey]      = useState<string | null>(null);
    const [replyTo,        setReplyTo]        = useState<Message | null>(null);
    const [searchNavIdx,   setSearchNavIdx]   = useState(0);
    const [isDragging,     setIsDragging]     = useState(false);
    const [dragCounter,    setDragCounter]    = useState(0);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError,    setUploadError]    = useState<string | null>(null);
    const [showVoice,      setShowVoice]      = useState(false);
    // forwardMsg: the message user clicked "forward" on — used to open ForwardModal
    const [forwardMsg,     setForwardMsg]     = useState<Message | null>(null);
    const [showMedia,      setShowMedia]      = useState(false);
    const [imagePreview,   setImagePreview]   = useState<{ file: File; url: string } | null>(null);

    const abortRef       = useRef<AbortController | null>(null);
    const fileInputRef   = useRef<HTMLInputElement>(null);
    const inputRef       = useRef<HTMLInputElement>(null);
    const editInputRef   = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollRef      = useRef<HTMLDivElement>(null);
    const lastMsgIdRef   = useRef<string | number | null>(null);
    const msgRefsMap     = useRef<Record<number, HTMLDivElement | null>>({});

    const otherUserId = conversation?.type === 'DIRECT'
        ? conversation.members.find(m => m.userId !== currentUserId)?.userId
        : undefined;

    const groupMemberIds = conversation?.type === 'GROUP'
        ? conversation.members.map(m => m.userId)
        : undefined;

    const myMember  = conversation?.members.find(m => m.userId === currentUserId);
    const canPost   = conversation?.type !== 'CHANNEL' || myMember?.role !== 'MEMBER';
    const isGroup   = conversation?.type === 'GROUP';
    const isChannel = conversation?.type === 'CHANNEL';
    const canPin    = myMember?.role === 'OWNER' || myMember?.role === 'ADMIN';

    const [groupKeysReady, setGroupKeysReady] = useState(!isGroup);

    const e2e = useE2E();

    useEffect(() => {
        const conversationId = conversation?.id;
        if (!isGroup || !conversationId || !groupMemberIds?.length) {
            setGroupKeysReady(true);
            return;
        }
        setGroupKeysReady(false);
        e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds)
            .then(() => setGroupKeysReady(true))
            .catch(() => setGroupKeysReady(true));
    }, []);

    const decryptFn = otherUserId
        ? (data: ArrayBuffer, _: number) => e2e.decryptBinary(data, otherUserId)
        : conversation?.type === 'GROUP' && conversation?.id
            ? (data: ArrayBuffer, senderId: number) => e2e.decryptBinaryFromGroup(data, conversation.id, senderId)
            : undefined;

    const {
        messages, typingUsers,
        hasMore, hasMoreNewer,
        isLoadingMore, isLoadingNewer,
        jumpTarget, firstUnreadId, clearUnreadDivider,
        sendMessage, sendFileMessage, deleteMessage, editMessage, toggleReaction,
        notifyTyping, loadMoreMessages, loadNewerMessages, resetToLatest,
        jumpToMessage, clearJumpTarget,
        isOnline, offlineQueueCount,
    } = useMessages(
        conversation?.id, currentUserId, socket, otherUserId,
        (msg) => {
            if (!msg.id) return;
            onConversationUpdate?.({
                id: msg.conversationId,
                lastMessage: {
                    id:        msg.id,
                    content:   msg.content,
                    senderId:  Number(msg.senderId),
                    createdAt: msg.createdAt as string,
                    fileType:  msg.fileType ?? null,
                    fileUrl:   msg.fileUrl  ?? null,
                },
            });
        },
        conversation?.type,
        groupMemberIds,
    );

    const {
        query, setQuery, results, isSearching,
        isOpen: isSearchOpen, setIsOpen: setSearchOpen,
        close: closeSearch, loadedCount,
    } = useSearch(conversation?.id, otherUserId);

    useEffect(() => {
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const id = last.id ?? (last.createdAt as string);
        if (id !== lastMsgIdRef.current && !jumpTarget && !hasMoreNewer) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            lastMsgIdRef.current = id;
        }
    }, [messages]);

    useEffect(() => {
        if (!messages.length || !conversation) return;
        const last = messages[messages.length - 1];
        if (String(last.senderId) !== String(currentUserId)) onMarkRead?.(conversation.id);
    }, [messages]);

    useEffect(() => {
        if (jumpTarget === null) return;
        const el = msgRefsMap.current[jumpTarget];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const t = setTimeout(clearJumpTarget, 2500);
            return () => clearTimeout(t);
        }
    }, [jumpTarget, messages]);

    useEffect(() => { setSearchNavIdx(0); }, [results]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (imagePreview)       { handleCancelImagePreview(); return; }
            if (editingId !== null) cancelEdit();
            else if (replyTo)       setReplyTo(null);
            else if (isSearchOpen)  closeSearch();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [editingId, replyTo, isSearchOpen, imagePreview]);

    useEffect(() => {
        if (editingId !== null) {
            editInputRef.current?.focus();
            const len = editInputRef.current?.value.length ?? 0;
            editInputRef.current?.setSelectionRange(len, len);
        }
    }, [editingId]);

    useEffect(() => {
        if (isSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
    }, [isSearchOpen]);

    useEffect(() => {
        if (replyTo) inputRef.current?.focus();
    }, [replyTo]);

    useEffect(() => {
        if (pendingForward) setTimeout(() => inputRef.current?.focus(), 50);
    }, [pendingForward]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollTop <= 1 && hasMore && !isLoadingMore) {
            const prevHeight = el.scrollHeight;
            await loadMoreMessages();
            requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight; });
            return;
        }
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= 100 && hasMoreNewer && !isLoadingNewer) {
            await loadNewerMessages();
        }

        if (distanceFromBottom < 100 && firstUnreadId) {
            clearUnreadDivider();
        }
    };

    const handleFileUpload = useCallback(async (file: File, caption?: string) => {
        if (!file || !conversation) return;
        setUploadError(null);
        setUploadProgress(0);
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
            let fileToProcess = file;
            let displayMime = file.type || '';
            if (!displayMime || displayMime === 'application/octet-stream') {
                const derived = mimeFromFileName(file.name);
                if (derived) displayMime = derived;
            }
            if (displayMime.startsWith('image/')) {
                const result = await compressImage(file, { maxWidth: 1920, maxHeight: 1920, quality: 0.75, outputFormat: 'image/jpeg', skipIfSmaller: 100 * 1024 });
                if (result.wasCompressed) { fileToProcess = result.file; displayMime = result.file.type; }
            }
            const localBlobUrl = URL.createObjectURL(fileToProcess);
            let fileToUpload = fileToProcess;
            let encMeta: string | undefined;
            if (otherUserId) {
                const buf = await fileToProcess.arrayBuffer();
                const encBuf = await e2e.encryptBinary(buf, otherUserId);
                fileToUpload = new File([encBuf], fileToProcess.name, { type: fileToProcess.type });
                encMeta = JSON.stringify({ encrypted: true });
            } else if (conversation?.type === 'GROUP' && conversation?.id) {
                const buf = await fileToProcess.arrayBuffer();
                const encBuf = await e2e.encryptBinaryForGroup(buf, conversation.id, groupMemberIds);
                if (encBuf === buf) throw new Error('Не вдалося зашифрувати файл для групи');
                fileToUpload = new File([encBuf], fileToProcess.name, { type: fileToProcess.type });
                encMeta = JSON.stringify({ encrypted: true });
            }
            const r = await uploadFile(fileToUpload, setUploadProgress, ctrl.signal);
            sendFileMessage({
                fileUrl: r.url, fileName: file.name, fileType: displayMime,
                fileSize: file.size, content: caption?.trim() || undefined,
                replyToId: replyTo?.id, metadata: encMeta, _localBlobUrl: localBlobUrl,
            });
            setReplyTo(null);
        } catch (err: any) {
            if (err.message !== 'Upload cancelled') setUploadError(err.message ?? 'Error');
        } finally { setUploadProgress(null); abortRef.current = null; }
    }, [conversation, sendFileMessage, replyTo, otherUserId, e2e]);

    const handleFileSelect = useCallback(async (file: File) => {
        if (!file || !conversation) return;
        const displayMime = file.type || mimeFromFileName(file.name) || '';
        if (isImageType(displayMime, file.name)) {
            const url = URL.createObjectURL(file);
            setImagePreview({ file, url });
            return;
        }
        await handleFileUpload(file);
    }, [conversation, handleFileUpload]);

    const handleConfirmImageSend = useCallback(async (caption: string) => {
        if (!imagePreview) return;
        const { file, url } = imagePreview;
        URL.revokeObjectURL(url);
        setImagePreview(null);
        await handleFileUpload(file, caption);
    }, [imagePreview, handleFileUpload]);

    const handleCancelImagePreview = useCallback(() => {
        if (imagePreview) URL.revokeObjectURL(imagePreview.url);
        setImagePreview(null);
    }, [imagePreview]);

    const mimeToExtension = (m: string) => {
        if (m === 'audio/webm') return 'webm';
        if (m === 'audio/ogg')  return 'ogg';
        if (m === 'audio/mp4')  return 'mp4';
        if (m === 'audio/mpeg') return 'mp3';
        return 'webm';
    };

    const sendVoiceMessage = useCallback(async (blob: Blob, waveform: number[], duration: number, mimeType: string) => {
        if (!conversation) return;
        setShowVoice(false);
        setUploadError(null);
        setUploadProgress(0);
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
            const baseMeta = { waveform, duration, mimeType };
            let fileToUpload: File, metaObj: object;
            if (otherUserId) {
                const enc = await e2e.encryptBinary(await blob.arrayBuffer(), otherUserId);
                fileToUpload = new File([enc], `voice.${mimeToExtension(mimeType)}`, { type: mimeType });
                metaObj = { ...baseMeta, encrypted: true };
            } else if (conversation?.type === 'GROUP' && conversation?.id) {
                const enc = await e2e.encryptBinaryForGroup(await blob.arrayBuffer(), conversation.id);
                fileToUpload = new File([enc], `voice.${mimeToExtension(mimeType)}`, { type: mimeType });
                metaObj = { ...baseMeta, encrypted: true };
            } else {
                fileToUpload = new File([blob], `voice.${mimeToExtension(mimeType)}`, { type: mimeType });
                metaObj = baseMeta;
            }
            const r = await uploadFile(fileToUpload, setUploadProgress, ctrl.signal);
            sendFileMessage({ fileUrl: r.url, fileName: 'Voice message', fileType: mimeType, fileSize: blob.size, metadata: JSON.stringify(metaObj) });
        } catch (err: any) {
            if (err.message !== 'Upload cancelled') setUploadError(err.message ?? 'Error');
        } finally { setUploadProgress(null); abortRef.current = null; }
    }, [conversation, sendFileMessage, otherUserId, e2e]);

    const pinMessage = useCallback((msgId: number) => {
        if (!conversation) return;
        socket?.emit('pinMessage', { conversationId: conversation.id, messageId: msgId });
    }, [socket, conversation]);

    const unpinMessage = useCallback(() => {
        if (!conversation) return;
        socket?.emit('unpinMessage', { conversationId: conversation.id });
    }, [socket, conversation]);

    // ── Send the pending forwarded message from the SOURCE conv into the current (target) conv ──
    const sendPendingForward = useCallback(async (msg: Message) => {
        if (!conversation || !socket) return;

        // 1. Decrypt from source conversation
        let plainContent = msg.content;
        if (looksEncrypted(msg.content)) {
            try {
                const sourceConv = conversations.find(c => c.id === msg.conversationId);
                if (sourceConv?.type === 'DIRECT') {
                    const sourceOther = sourceConv.members.find(m => m.userId !== currentUserId);
                    if (sourceOther) plainContent = await e2e.decrypt(msg.content, sourceOther.userId);
                } else if (sourceConv?.type === 'GROUP' && sourceConv.id) {
                    plainContent = await e2e.decryptFromGroup(msg.content, sourceConv.id, Number(msg.senderId));
                }
            } catch {
                // keep ciphertext as fallback
            }
        }

        // 2. Re-encrypt for the current (target) conversation
        let reEncrypted = plainContent;
        try {
            if (conversation.type === 'DIRECT') {
                const targetOther = conversation.members.find(m => m.userId !== currentUserId);
                if (targetOther) reEncrypted = await e2e.encrypt(plainContent, targetOther.userId);
            } else if (conversation.type === 'GROUP') {
                const targetMemberIds = conversation.members.map(m => m.userId);
                await e2e.prefetchGroupSenderKeys(conversation.id, targetMemberIds);
                reEncrypted = await e2e.encryptForGroup(plainContent, conversation.id);
                if (reEncrypted === plainContent) {
                    await e2e.distributeMySenderKey(conversation.id, targetMemberIds);
                    reEncrypted = await e2e.encryptForGroup(plainContent, conversation.id);
                }
            }
            // CHANNEL — no E2E
        } catch {
            reEncrypted = plainContent;
        }

        socket.emit('forwardMessage', {
            messageId:            msg.id,
            targetConversationId: conversation.id,
            reEncryptedContent:   reEncrypted,
        });

        onSetPendingForward?.(null);
    }, [conversation, conversations, currentUserId, socket, e2e, onSetPendingForward]);

    // ── ForwardModal: instead of immediately forwarding, navigate to target conv ──
    const handleForwardModalSelect = useCallback(async (targetConvId: number) => {
        if (!forwardMsg) return;

        const targetConv = conversations.find(c => c.id === targetConvId);
        if (!targetConv) return;

        // Store the message to forward at page level (survives conv switch)
        onSetPendingForward?.(forwardMsg);
        setForwardMsg(null);

        // Navigate to the target conversation
        onSelectConversation?.(targetConv);
    }, [forwardMsg, conversations, onSetPendingForward, onSelectConversation]);

    const onDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        setDragCounter(c => c + 1);
        if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
    };
    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragCounter(c => {
            const n = c - 1;
            if (n <= 0) { setIsDragging(false); return 0; }
            return n;
        });
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false); setDragCounter(0);
        const f = e.dataTransfer.files[0];
        if (f) handleFileSelect(f);
    };

    const startEdit = (msg: Message) => {
        if (!msg.id || msg.deletedAt || msg.fileUrl) return;
        if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) return;
        setEditingId(msg.id); setEditingContent(msg.content);
        setConfirmDelId(null); setPickerKey(null);
    };
    const cancelEdit = () => { setEditingId(null); setEditingContent(''); };
    const submitEdit = (id: number) => {
        if (editingContent.trim()) editMessage(id, editingContent.trim());
        cancelEdit();
    };

    const navSearch = (dir: 'prev' | 'next') => {
        if (!results.length) return;
        const next = dir === 'next'
            ? (searchNavIdx + 1) % results.length
            : (searchNavIdx - 1 + results.length) % results.length;
        setSearchNavIdx(next);
        const msg = results[next];
        if (msg.id) jumpToMessage(msg.id);
    };

    // ── Main submit: send text (if any) → then send the pending forward ──
    const handleSubmit = useCallback(async (
        e: React.FormEvent,
        scheduledAt?: Date | null,
        destructAfterSeconds?: number | null,
    ) => {
        e.preventDefault();

        const hasText   = inputValue.trim().length > 0;
        const hasFwd    = !!pendingForward && pendingForward.conversationId !== conversation?.id;
        const hasFwdSame = !!pendingForward && pendingForward.conversationId === conversation?.id;
        const hasAnyFwd = !!pendingForward;

        if (!hasText && !hasAnyFwd) return;

        // Send the text message first
        if (hasText) {
            sendMessage(inputValue.trim(), replyTo?.id, scheduledAt, destructAfterSeconds);
            setInputValue('');
            setReplyTo(null);
        }

        // Then send the forwarded message
        if (pendingForward) {
            await sendPendingForward(pendingForward);
        }
    }, [inputValue, replyTo, pendingForward, sendMessage, sendPendingForward, conversation]);

    // ── Empty state ──────────────────────────────────────────────────────────────
    if (!conversation) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                     style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', boxShadow: '0 0 32px var(--accent-glow)' }}>
                    <Lock size={24} style={{ color: 'var(--accent-bright)' }} />
                </div>
                <p className="text-[15px] font-medium mb-2" style={{ color: 'var(--text-1)' }}>End-to-end encrypted</p>
                <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>Select a conversation to begin</p>
            </div>
        );
    }

    return (
        <main
            className="flex-1 flex flex-col relative min-w-0 overflow-x-hidden"
            style={{ background: 'var(--bg-base)' }}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
        >
            {/* ── Drag overlay ── */}
            {isDragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none backdrop-enter"
                     style={{ background: 'rgba(124,77,255,0.08)', backdropFilter: 'blur(4px)' }}>
                    <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-2xl modal-enter"
                         style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border-accent)', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                        <Paperclip size={28} style={{ color: 'var(--accent-bright)' }} />
                        <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>Drop to send file</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Max 10 MB</p>
                    </div>
                </div>
            )}

            {/* ── Jump to latest ── */}
            {hasMoreNewer && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
                    <button onClick={resetToLatest}
                            className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold text-white cursor-pointer transition-all duration-150 active:scale-95"
                            style={{ background: 'var(--accent)', boxShadow: '0 4px 16px rgba(124,77,255,0.4)' }}>
                        <ArrowDown size={13} />
                        Jump to latest
                    </button>
                </div>
            )}

            {/* ── Header ── */}
            <ChatHeader
                conversation={conversation}
                currentUser={currentUser}
                isSearchOpen={isSearchOpen}
                showMedia={showMedia}
                onToggleSearch={() => setSearchOpen(o => !o)}
                onToggleMedia={() => setShowMedia(o => !o)}
                onStartCall={onStartCall}
                onJumpToMessage={jumpToMessage}
                onBack={onBack}
            />

            {/* ── Pinned message ── */}
            {conversation.pinnedMessage && (
                <div className="flex items-center gap-3 px-5 py-2.5 slide-up"
                     style={{ background: 'rgba(251,191,36,0.05)', borderBottom: '1px solid rgba(251,191,36,0.1)' }}>
                    <Pin size={11} className="text-amber-400 shrink-0" />
                    <button onClick={() => conversation.pinnedMessage?.id && jumpToMessage(conversation.pinnedMessage.id)}
                            className="flex-1 min-w-0 text-left">
                        <p className="text-[11px] font-semibold text-amber-400 leading-tight">
                            {conversation.pinnedMessage.sender.nickname}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                            {conversation.pinnedMessage.content || '📎 File'}
                        </p>
                    </button>
                    {canPin && (
                        <button onClick={unpinMessage} className="p-1 cursor-pointer transition-colors duration-150"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--red)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                            <PinOff size={13} />
                        </button>
                    )}
                </div>
            )}

            {/* ── Search panel ── */}
            {isSearchOpen && (
                <SearchPanel
                    query={query} setQuery={setQuery} results={results}
                    isSearching={isSearching} loadedCount={loadedCount}
                    navIdx={searchNavIdx} currentUserId={currentUserId}
                    searchInputRef={searchInputRef}
                    onNavSearch={navSearch} onClose={closeSearch}
                    onJumpTo={(msgId, idx) => { setSearchNavIdx(idx); jumpToMessage(msgId); }}
                />
            )}

            {/* ── Messages ── */}
            <div ref={scrollRef} onScroll={handleScroll}
                 className="flex-1 overflow-y-auto overflow-x-hidden py-4 chat-scroll"
                 style={{ paddingBottom: '8px' }}>
                {isLoadingMore && (
                    <div className="flex justify-center py-3">
                        <div className="w-4 h-4 rounded-full border-2 border-t-transparent"
                             style={{ borderColor: 'var(--border-md)', borderTopColor: 'var(--accent)', animation: 'spinSlow 0.8s linear infinite' }} />
                    </div>
                )}

                {messages.map((msg: Message, idx: number) => (
                    <MessageItem
                        key={msg.id ? `msg-${msg.id}` : `tmp-${idx}`}
                        msg={msg}
                        prevMsg={idx > 0 ? messages[idx - 1] : null}
                        currentUserId={currentUserId}
                        isGroup={!!isGroup}
                        isChannel={!!isChannel}
                        canPin={!!canPin}
                        isSearchOpen={isSearchOpen}
                        searchQuery={query}
                        jumpTarget={jumpTarget}
                        firstUnreadId={firstUnreadId}
                        hoveredKey={hoveredKey}
                        editingId={editingId}
                        editingContent={editingContent}
                        confirmDelId={confirmDelId}
                        pickerKey={pickerKey}
                        decryptFn={decryptFn}
                        msgRefsMap={msgRefsMap}
                        editInputRef={editInputRef}
                        onHover={setHoveredKey}
                        onSetReplyTo={setReplyTo}
                        onForwardMsg={setForwardMsg}
                        onPinMessage={pinMessage}
                        onPickerKey={setPickerKey}
                        onToggleReaction={toggleReaction}
                        onConfirmDelete={setConfirmDelId}
                        onStartEdit={startEdit}
                        onSubmitEdit={submitEdit}
                        onCancelEdit={cancelEdit}
                        onEditContent={setEditingContent}
                        onDeleteMessage={deleteMessage}
                    />
                ))}

                {isLoadingNewer && (
                    <div className="flex justify-center py-3">
                        <div className="w-4 h-4 rounded-full border-2 border-t-transparent"
                             style={{ borderColor: 'var(--border-md)', borderTopColor: 'var(--accent)', animation: 'spinSlow 0.8s linear infinite' }} />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* ── Input ── */}
            <ChatInput
                canPost={canPost && groupKeysReady}
                inputValue={inputValue}
                replyTo={replyTo}
                pendingForward={pendingForward ?? null}
                onClearPendingForward={() => onSetPendingForward?.(null)}
                typingUsers={typingUsers}
                showVoice={showVoice}
                uploadProgress={uploadProgress}
                uploadError={uploadError}
                isOnline={isOnline}
                socketConnected={!!socket?.connected}
                offlineQueueCount={offlineQueueCount}
                fileInputRef={fileInputRef}
                inputRef={inputRef}
                onInputChange={setInputValue}
                onSubmit={handleSubmit}
                onFileSelect={handleFileSelect}
                onSendVoice={sendVoiceMessage}
                onCancelUpload={() => { abortRef.current?.abort(); setUploadProgress(null); }}
                onClearError={() => setUploadError(null)}
                onSetReplyTo={setReplyTo}
                onSetShowVoice={setShowVoice}
                notifyTyping={notifyTyping}
            />

            {/* ── ForwardModal — now navigates instead of immediately forwarding ── */}
            {forwardMsg && (
                <ForwardModal
                    conversations={conversations}
                    onForward={handleForwardModalSelect}
                    onClose={() => setForwardMsg(null)}
                />
            )}

            {showMedia && conversation && (
                <MediaPanel
                    conversationId={conversation.id}
                    currentUserId={currentUserId!}
                    onClose={() => setShowMedia(false)}
                    decryptFn={decryptFn}
                />
            )}

            {imagePreview && (
                <ImageSendPreview
                    file={imagePreview.file}
                    previewUrl={imagePreview.url}
                    replyTo={replyTo?.sender ?? null}
                    onSend={handleConfirmImageSend}
                    onCancel={handleCancelImagePreview}
                />
            )}
        </main>
    );
}