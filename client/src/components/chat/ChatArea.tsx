'use client';

import React, {
    useState, useRef, useEffect, UIEvent, useCallback,
} from 'react';
import { Paperclip, Loader2, Pin, PinOff, ArrowDown } from 'lucide-react';

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
import { EDIT_WINDOW_MS }        from '@/src/lib/chatFormatters';

interface ChatAreaProps {
    currentUser:           User | null;
    conversation:          Conversation | null;
    conversations:         Conversation[];
    socket:                Socket | null;
    onConversationUpdate?: (updated: any) => void;
    onMarkRead?:           (conversationId: number) => void;
    onStartCall?:          (convId: number, targetUserId: number, type: 'audio' | 'video') => void;
}

export default function ChatArea({
                                     currentUser, conversation, conversations, socket,
                                     onConversationUpdate, onMarkRead, onStartCall,
                                 }: Readonly<ChatAreaProps>) {
    const currentUserId = currentUser?.id;

    // UI state
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
    const [forwardMsg,     setForwardMsg]     = useState<Message | null>(null);
    const [showMedia,      setShowMedia]      = useState(false);

    // Image preview before sending
    const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);

    // Refs
    const abortRef       = useRef<AbortController | null>(null);
    const fileInputRef   = useRef<HTMLInputElement>(null);
    const editInputRef   = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollRef      = useRef<HTMLDivElement>(null);
    const lastMsgIdRef   = useRef<string | number | null>(null);
    const msgRefsMap     = useRef<Record<number, HTMLDivElement | null>>({});

    // Conversation-level helpers
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

    // E2E
    const e2e = useE2E();

    const decryptFn = otherUserId
        ? (data: ArrayBuffer, _: number) => e2e.decryptBinary(data, otherUserId)
        : conversation?.type === 'GROUP' && conversation?.id
            ? (data: ArrayBuffer, senderId: number) => e2e.decryptBinaryFromGroup(data, conversation.id, senderId)
            : undefined;

    // Messages hook
    const {
        messages, typingUsers,
        hasMore, hasMoreNewer,
        isLoadingMore, isLoadingNewer,
        jumpTarget,
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

    // Search hook
    const {
        query, setQuery, results, isSearching,
        isOpen: isSearchOpen, setIsOpen: setSearchOpen,
        close: closeSearch, loadedCount,
    } = useSearch(conversation?.id, otherUserId);

    // Auto-scroll to bottom on new messages (skip when in jump mode)
    useEffect(() => {
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const id   = last.id ?? (last.createdAt as string);
        if (id !== lastMsgIdRef.current && !jumpTarget && !hasMoreNewer) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            lastMsgIdRef.current = id;
        }
    }, [messages]);

    // Mark as read when other user's message arrives
    useEffect(() => {
        if (!messages.length || !conversation) return;
        const last = messages[messages.length - 1];
        if (String(last.senderId) !== String(currentUserId)) {
            onMarkRead?.(conversation.id);
        }
    }, [messages]);

    // Scroll to jumped message and clear highlight after 2.5s
    useEffect(() => {
        if (jumpTarget === null) return;
        const el = msgRefsMap.current[jumpTarget];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const t = setTimeout(clearJumpTarget, 2500);
            return () => clearTimeout(t);
        }
    }, [jumpTarget, messages]);

    // Reset search navigation when results change
    useEffect(() => { setSearchNavIdx(0); }, [results]);

    // Keyboard shortcuts - Escape closes edit / reply / search / preview
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

    // Focus edit input when entering edit mode
    useEffect(() => {
        if (editingId !== null) {
            editInputRef.current?.focus();
            const len = editInputRef.current?.value.length ?? 0;
            editInputRef.current?.setSelectionRange(len, len);
        }
    }, [editingId]);

    // Focus search input when panel opens
    useEffect(() => {
        if (isSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
    }, [isSearchOpen]);

    // Bidirectional infinite scroll
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
    };

    // Core upload logic — now accepts optional caption for image sends
    const handleFileUpload = useCallback(async (file: File, caption?: string) => {
        if (!file || !conversation) return;
        setUploadError(null);
        setUploadProgress(0);
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            let fileToProcess = file;
            let displayName   = file.name;
            let displaySize   = file.size;
            let displayType   = file.type;

            if (!displayType || displayType === 'application/octet-stream') {
                const derived = mimeFromFileName(file.name);
                if (derived) displayType = derived;
            }
            if (displayType !== file.type) {
                fileToProcess = new File([file], file.name, { type: displayType });
            }

            if (displayType.startsWith('image/')) {
                const result = await compressImage(file, {
                    maxWidth:      1920,
                    maxHeight:     1920,
                    quality:       0.75,
                    outputFormat:  'image/jpeg',
                    skipIfSmaller: 100 * 1024,
                });
                if (result.wasCompressed) {
                    fileToProcess = result.file;
                    displayType   = result.file.type;
                    displaySize   = result.originalSize;
                }
            }

            const localBlobUrl = URL.createObjectURL(fileToProcess);

            let fileToUpload = fileToProcess;
            let encMeta: string | undefined;

            if (otherUserId) {
                const buf    = await fileToProcess.arrayBuffer();
                const encBuf = await e2e.encryptBinary(buf, otherUserId);
                fileToUpload = new File([encBuf], fileToProcess.name, { type: fileToProcess.type });
                encMeta      = JSON.stringify({ encrypted: true });
            } else if (conversation?.type === 'GROUP' && conversation?.id) {
                const buf    = await fileToProcess.arrayBuffer();
                const encBuf = await e2e.encryptBinaryForGroup(buf, conversation.id);
                fileToUpload = new File([encBuf], fileToProcess.name, { type: fileToProcess.type });
                encMeta      = JSON.stringify({ encrypted: true });
            }

            const r = await uploadFile(fileToUpload, setUploadProgress, ctrl.signal);
            sendFileMessage({
                fileUrl:       r.url,
                fileName:      displayName,
                fileType:      displayType,
                fileSize:      displaySize,
                content:       caption?.trim() || undefined,
                replyToId:     replyTo?.id,
                metadata:      encMeta,
                _localBlobUrl: localBlobUrl,
            });
            setReplyTo(null);
        } catch (err: any) {
            if (err.message !== 'Upload cancelled') setUploadError(err.message ?? 'Помилка');
        } finally {
            setUploadProgress(null);
            abortRef.current = null;
        }
    }, [conversation, sendFileMessage, replyTo, otherUserId, e2e]);

    // File select — show preview for images, upload directly for other types
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

    // Confirm send from image preview
    const handleConfirmImageSend = useCallback(async (caption: string) => {
        if (!imagePreview) return;
        const { file, url } = imagePreview;
        URL.revokeObjectURL(url);
        setImagePreview(null);
        await handleFileUpload(file, caption);
    }, [imagePreview, handleFileUpload]);

    // Cancel image preview
    const handleCancelImagePreview = useCallback(() => {
        if (imagePreview) URL.revokeObjectURL(imagePreview.url);
        setImagePreview(null);
    }, [imagePreview]);

    // Voice message — encrypts blob before upload
    const mimeToExtension = (m: string) => {
        if (m === 'audio/webm') return 'webm';
        if (m === 'audio/ogg')  return 'ogg';
        if (m === 'audio/mp4')  return 'mp4';
        if (m === 'audio/mpeg') return 'mp3';
        if (m === 'audio/wav')  return 'wav';
        return 'webm';
    };

    const sendVoiceMessage = useCallback(async (
        blob: Blob, waveform: number[], duration: number, mimeType: string,
    ) => {
        if (!conversation) return;
        setShowVoice(false);
        setUploadError(null);
        setUploadProgress(0);
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const baseMeta = { waveform, duration, mimeType };
            let fileToUpload: File;
            let metaObj: object;

            if (otherUserId) {
                const buf = await blob.arrayBuffer();
                const enc = await e2e.encryptBinary(buf, otherUserId);
                fileToUpload = new File([enc], `voice.${mimeToExtension(mimeType)}`, { type: mimeType });
                metaObj      = { ...baseMeta, encrypted: true };
            } else if (conversation?.type === 'GROUP' && conversation?.id) {
                const buf = await blob.arrayBuffer();
                const enc = await e2e.encryptBinaryForGroup(buf, conversation.id);
                fileToUpload = new File([enc], `voice.${mimeToExtension(mimeType)}`, { type: mimeType });
                metaObj      = { ...baseMeta, encrypted: true };
            } else {
                fileToUpload = new File([blob], `voice.${mimeToExtension(mimeType)}`, { type: mimeType });
                metaObj      = baseMeta;
            }

            const r = await uploadFile(fileToUpload, setUploadProgress, ctrl.signal);
            sendFileMessage({
                fileUrl:  r.url,
                fileName: 'Голосове повідомлення',
                fileType: mimeType,
                fileSize: blob.size,
                metadata: JSON.stringify(metaObj),
            });
        } catch (err: any) {
            if (err.message !== 'Upload cancelled') setUploadError(err.message ?? 'Помилка');
        } finally {
            setUploadProgress(null);
            abortRef.current = null;
        }
    }, [conversation, sendFileMessage, otherUserId, e2e]);

    // Socket-based pin / unpin
    const pinMessage = useCallback((msgId: number) => {
        if (!conversation) return;
        socket?.emit('pinMessage', { conversationId: conversation.id, messageId: msgId });
    }, [socket, conversation]);

    const unpinMessage = useCallback(() => {
        if (!conversation) return;
        socket?.emit('unpinMessage', { conversationId: conversation.id });
    }, [socket, conversation]);

    // Socket-based forward
    const forwardMessage = useCallback((msgId: number, targetConvId: number) => {
        socket?.emit('forwardMessage', { messageId: msgId, targetConversationId: targetConvId });
    }, [socket]);

    // Drag-and-drop file upload
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
        e.preventDefault();
        setIsDragging(false);
        setDragCounter(0);
        const f = e.dataTransfer.files[0];
        if (f) handleFileSelect(f);      // ← now goes through preview for images
    };

    // Edit helpers
    const startEdit = (msg: Message) => {
        if (!msg.id || msg.deletedAt || msg.fileUrl) return;
        if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) return;
        setEditingId(msg.id);
        setEditingContent(msg.content);
        setConfirmDelId(null);
        setPickerKey(null);
    };
    const cancelEdit = () => { setEditingId(null); setEditingContent(''); };
    const submitEdit = (id: number) => {
        if (editingContent.trim()) editMessage(id, editingContent.trim());
        cancelEdit();
    };

    // Search result navigation
    const navSearch = (dir: 'prev' | 'next') => {
        if (!results.length) return;
        const next = dir === 'next'
            ? (searchNavIdx + 1) % results.length
            : (searchNavIdx - 1 + results.length) % results.length;
        setSearchNavIdx(next);
        const msg = results[next];
        if (msg.id) jumpToMessage(msg.id);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        sendMessage(inputValue.trim(), replyTo?.id);
        setInputValue('');
        setReplyTo(null);
    };

    // Empty state - no conversation selected
    if (!conversation) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 font-medium flex-col gap-3 transition-colors duration-200">
                <MessageSquarePlaceholder />
                <p>Оберіть чат або знайдіть друзів</p>
            </div>
        );
    }

    return (
        <main
            className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 relative min-w-0 transition-colors duration-200"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
        >
            {/* Drag-and-drop overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl px-10 py-8 flex flex-col items-center gap-3 border-2 border-dashed border-indigo-400">
                        <Paperclip size={36} className="text-indigo-400" />
                        <p className="text-indigo-600 dark:text-indigo-400 font-semibold text-lg">
                            Відпустіть, щоб надіслати файл
                        </p>
                        <p className="text-slate-400 text-sm">Максимум 10 МБ</p>
                    </div>
                </div>
            )}

            {/* Floating "back to latest" button */}
            {hasMoreNewer && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
                    <button
                        onClick={resetToLatest}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-full shadow-lg transition-all cursor-pointer animate-bounce"
                    >
                        <ArrowDown size={13} />
                        Перейти до останніх
                    </button>
                </div>
            )}

            {/* Chat header */}
            <ChatHeader
                conversation={conversation}
                currentUser={currentUser}
                isSearchOpen={isSearchOpen}
                showMedia={showMedia}
                onToggleSearch={() => setSearchOpen(o => !o)}
                onToggleMedia={() => setShowMedia(o => !o)}
                onStartCall={onStartCall}
            />

            {/* Pinned message banner */}
            {conversation.pinnedMessage && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40 px-4 py-2 flex items-center gap-2 z-10">
                    <Pin size={13} className="text-amber-500 shrink-0" />
                    <button
                        onClick={() => conversation.pinnedMessage?.id && jumpToMessage(conversation.pinnedMessage.id)}
                        className="flex-1 min-w-0 text-left"
                    >
                        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 leading-tight">
                            {conversation.pinnedMessage.sender.nickname}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {conversation.pinnedMessage.content || '📎 Файл'}
                        </p>
                    </button>
                    {canPin && (
                        <button
                            onClick={unpinMessage}
                            className="p-1 text-slate-400 hover:text-red-500 cursor-pointer transition-colors"
                            title="Відкріпити"
                        >
                            <PinOff size={13} />
                        </button>
                    )}
                </div>
            )}

            {/* Search panel */}
            {isSearchOpen && (
                <SearchPanel
                    query={query}
                    setQuery={setQuery}
                    results={results}
                    isSearching={isSearching}
                    loadedCount={loadedCount}
                    navIdx={searchNavIdx}
                    currentUserId={currentUserId}
                    searchInputRef={searchInputRef}
                    onNavSearch={navSearch}
                    onClose={closeSearch}
                    onJumpTo={(msgId, idx) => { setSearchNavIdx(idx); jumpToMessage(msgId); }}
                />
            )}

            {/* Scrollable message list */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-5 py-5 space-y-1"
            >
                {isLoadingMore && (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
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
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <ChatInput
                canPost={!!canPost}
                inputValue={inputValue}
                replyTo={replyTo}
                typingUsers={typingUsers}
                showVoice={showVoice}
                uploadProgress={uploadProgress}
                uploadError={uploadError}
                isOnline={isOnline}
                socketConnected={!!socket?.connected}
                offlineQueueCount={offlineQueueCount}
                fileInputRef={fileInputRef}
                onInputChange={setInputValue}
                onSubmit={handleSubmit}
                onFileSelect={handleFileSelect}      // ← uses preview wrapper
                onSendVoice={sendVoiceMessage}
                onCancelUpload={() => { abortRef.current?.abort(); setUploadProgress(null); }}
                onClearError={() => setUploadError(null)}
                onSetReplyTo={setReplyTo}
                onSetShowVoice={setShowVoice}
                notifyTyping={notifyTyping}
            />

            {/* Forward modal */}
            {forwardMsg && (
                <ForwardModal
                    conversations={conversations}
                    onForward={(targetId) => { if (forwardMsg.id) forwardMessage(forwardMsg.id, targetId); }}
                    onClose={() => setForwardMsg(null)}
                />
            )}

            {/* Media attachments panel */}
            {showMedia && conversation && (
                <MediaPanel
                    conversationId={conversation.id}
                    currentUserId={currentUserId!}
                    onClose={() => setShowMedia(false)}
                    decryptFn={decryptFn}
                />
            )}

            {/* Image send preview modal */}
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

function MessageSquarePlaceholder() {
    return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-slate-200 dark:text-slate-700">
            <rect width="56" height="56" rx="28" fill="currentColor"/>
            <path d="M14 18h28M14 26h20M14 34h14" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
    );
}