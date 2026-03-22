'use client';

import { RefObject }    from 'react';
import { Send, Paperclip, Mic, Loader2, X, WifiOff } from 'lucide-react';
import { VoiceRecorder } from '@/src/components/chat/VoiceRecorder';
import { Message }       from '@/src/types/conversation.types';

interface Props {
    canPost:          boolean;
    inputValue:       string;
    replyTo:          Message | null;
    typingUsers:      { userId: number; nickname: string }[];
    showVoice:        boolean;
    uploadProgress:   number | null;
    uploadError:      string | null;
    isOnline:         boolean;
    socketConnected:  boolean;
    offlineQueueCount:number;
    fileInputRef:     RefObject<HTMLInputElement | null>;
    onInputChange:    (v: string) => void;
    onSubmit:         (e: React.FormEvent) => void;
    onFileSelect:     (file: File) => void;
    onSendVoice:      (blob: Blob, wf: number[], dur: number, mime: string) => Promise<void>;
    onCancelUpload:   () => void;
    onClearError:     () => void;
    onSetReplyTo:     (msg: Message | null) => void;
    onSetShowVoice:   (v: boolean) => void;
    notifyTyping:     () => void;
}

export function ChatInput({
                              canPost, inputValue, replyTo, typingUsers, showVoice,
                              uploadProgress, uploadError, isOnline, socketConnected, offlineQueueCount,
                              fileInputRef,
                              onInputChange, onSubmit, onFileSelect, onSendVoice, onCancelUpload,
                              onClearError, onSetReplyTo, onSetShowVoice, notifyTyping,
                          }: Readonly<Props>) {
    return (
        <>
            {/* Offline banner */}
            {(!isOnline || !socketConnected) && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-800/50 flex items-center gap-2">
                    <WifiOff size={13} className="text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
                        Немає з'єднання — повідомлення надішлються автоматично
                    </span>
                    {offlineQueueCount > 0 && (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded-full shrink-0">
                            {offlineQueueCount}
                        </span>
                    )}
                </div>
            )}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
                <div className="px-5 py-1.5 bg-slate-50 dark:bg-slate-900 border-t border-gray-100/50 dark:border-slate-800">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-violet-400 text-sm italic shadow-sm animate-pulse">
                        <span className="font-medium">{typingUsers.map(t => t.nickname).join(', ')}</span>
                        {typingUsers.length === 1 ? ' друкує...' : ' друкують...'}
                    </div>
                </div>
            )}

            {/* Upload progress */}
            {uploadProgress !== null && (
                <div className="px-4 py-2.5 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-9 text-right shrink-0">{uploadProgress}%</span>
                        <button onClick={onCancelUpload} className="text-slate-400 hover:text-red-500 cursor-pointer">
                            <X size={13}/>
                        </button>
                    </div>
                </div>
            )}

            {/* Upload error */}
            {uploadError && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-900 flex items-center justify-between">
                    <span className="text-xs text-red-500">{uploadError}</span>
                    <button onClick={onClearError} className="text-red-400 hover:text-red-600 cursor-pointer ml-3 shrink-0">
                        <X size={13}/>
                    </button>
                </div>
            )}

            {/* Reply preview */}
            {replyTo && (
                <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-900 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">
                            Відповідь на: {replyTo.sender?.nickname ?? 'повідомлення'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {replyTo.deletedAt ? 'Видалено' : replyTo.content || '📎 Файл'}
                        </p>
                    </div>
                    <button onClick={() => onSetReplyTo(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Input area */}
            {showVoice ? (
                <VoiceRecorder
                    onSend={onSendVoice}
                    onCancel={() => onSetShowVoice(false)}
                />
            ) : canPost ? (
                <form onSubmit={onSubmit} className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 flex gap-3 items-end">
                    <input
                        ref={fileInputRef as any}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onFileSelect(f);
                            e.target.value = '';
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => (fileInputRef as any).current?.click()}
                        disabled={uploadProgress !== null}
                        className="p-3 h-[48px] w-[48px] rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer shrink-0"
                    >
                        {uploadProgress !== null ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
                    </button>

                    <input
                        value={inputValue}
                        onChange={(e) => { onInputChange(e.target.value); notifyTyping(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e as any); }}}
                        className="flex-1 bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 border-transparent rounded-2xl px-5 py-3 text-gray-700 outline-none focus:bg-white dark:focus:bg-slate-600 focus:ring-4 focus:ring-violet-50 dark:focus:ring-violet-900/30 transition-all text-sm"
                        placeholder="Напишіть повідомлення..."
                    />

                    {inputValue.trim() ? (
                        <button
                            type="submit"
                            className="bg-violet-500 hover:bg-violet-600 text-white p-3 h-[48px] w-[48px] rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                        >
                            <Send size={17} className="ml-0.5" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onSetShowVoice(true)}
                            disabled={uploadProgress !== null}
                            className="p-3 h-[48px] w-[48px] rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer shrink-0"
                        >
                            <Mic size={17} />
                        </button>
                    )}
                </form>
            ) : (
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 text-center text-sm text-slate-400 italic">
                    Тільки адміни можуть писати в цьому каналі
                </div>
            )}
        </>
    );
}
