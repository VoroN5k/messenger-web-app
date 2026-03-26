'use client';

import { RefObject, useState, useRef }    from 'react';
import { Send, Paperclip, Mic, Loader2, X, WifiOff, Calendar, Timer } from 'lucide-react';
import { VoiceRecorder }  from '@/src/components/chat/VoiceRecorder';
import { ScheduleModal }  from '@/src/components/chat/ScheduleModal';
import { Message }        from '@/src/types/conversation.types';

const DESTRUCT_OPTIONS = [
    { label: 'Вимкнути', value: null },
    { label: '30 секунд', value: 30 },
    { label: '5 хвилин', value: 5 * 60 },
    { label: '1 година', value: 3600 },
    { label: '24 години', value: 24 * 3600 },
];

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
    onSubmit:         (e: React.FormEvent, scheduledAt?: Date | null, destructAfterSeconds?: number | null) => void;
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
                              fileInputRef, onInputChange, onSubmit, onFileSelect, onSendVoice, onCancelUpload,
                              onClearError, onSetReplyTo, onSetShowVoice, notifyTyping,
                          }: Readonly<Props>) {
    const [showScheduleModal,   setShowScheduleModal]   = useState(false);
    const [showDestructPicker,  setShowDestructPicker]  = useState(false);
    const [destructAfterSeconds, setDestructAfterSeconds] = useState<number | null>(null);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(e, null, destructAfterSeconds);
    };

    const handleScheduleConfirm = (scheduledAt: Date) => {
        setShowScheduleModal(false);
        onSubmit({ preventDefault: () => {} } as any, scheduledAt, destructAfterSeconds);
    };

    const destructLabel = destructAfterSeconds ? DESTRUCT_OPTIONS.find(o => o.value === destructAfterSeconds)?.label ?? `${destructAfterSeconds}с` : null;

    return (
        <div className="bg-[#05030f] border-t border-white/5 relative z-20">
            {/* Offline banner */}
            {(!isOnline || !socketConnected) && (
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
                    <WifiOff size={14} className="text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-500/90 flex-1">Відсутнє з'єднання...</span>
                </div>
            )}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
                <div className="px-5 py-2 flex items-center gap-2 text-xs text-violet-400/70 border-b border-white/5">
                    <div className="flex gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                    </div>
                    <span>{typingUsers.map(t => t.nickname).join(', ')} друкує...</span>
                </div>
            )}

            {/* Upload progress */}
            {uploadProgress !== null && (
                <div className="px-4 py-3 bg-violet-900/20 border-b border-violet-500/10 flex items-center gap-3">
                    <div className="flex-1 bg-black/40 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-violet-500 transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span className="text-xs font-mono text-violet-400 w-10 text-right">{uploadProgress}%</span>
                    <button onClick={onCancelUpload} className="text-slate-500 hover:text-red-400"><X size={14}/></button>
                </div>
            )}

            {/* Reply / Destruct Banner */}
            {(replyTo || destructLabel) && (
                <div className="px-4 py-2 flex items-center justify-between bg-black/20 border-b border-white/5">
                    {replyTo && (
                        <div className="flex-1 flex items-center gap-3 min-w-0 pr-4">
                            <div className="w-1 h-8 bg-violet-500 rounded-full" />
                            <div className="min-w-0">
                                <p className="text-xs text-violet-400 font-medium">Відповідь: {replyTo.sender?.nickname ?? 'Користувач'}</p>
                                <p className="text-xs text-slate-400 truncate">{replyTo.deletedAt ? 'Видалено' : replyTo.content || 'Файл'}</p>
                            </div>
                            <button onClick={() => onSetReplyTo(null)} className="text-slate-500 hover:text-slate-300 ml-auto"><X size={16} /></button>
                        </div>
                    )}
                    {destructLabel && (
                        <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-400 rounded-md px-2 py-1 ml-auto">
                            <Timer size={12} />
                            <span className="text-xs">{destructLabel}</span>
                            <button onClick={() => setDestructAfterSeconds(null)} className="hover:text-orange-300 ml-1"><X size={14} /></button>
                        </div>
                    )}
                </div>
            )}

            {/* Main Input */}
            {showVoice ? (
                <VoiceRecorder onSend={onSendVoice} onCancel={() => onSetShowVoice(false)} />
            ) : canPost ? (
                <form onSubmit={handleSend} className="p-3 flex gap-2 items-end bg-[#0a0714]">
                    <input ref={fileInputRef as any} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); e.target.value = ''; }} />

                    <button type="button" onClick={() => (fileInputRef as any).current?.click()} disabled={uploadProgress !== null}
                            className="p-3 text-slate-400 hover:text-violet-400 transition-colors cursor-pointer">
                        {uploadProgress !== null ? <Loader2 size={20} className="animate-spin text-violet-500" /> : <Paperclip size={20} />}
                    </button>

                    <div className="flex-1 flex items-center bg-[#151221] rounded-2xl border border-white/5 focus-within:border-violet-500/30 transition-all">
                        <input
                            value={inputValue}
                            onChange={e => { onInputChange(e.target.value); notifyTyping(); }}
                            className="flex-1 bg-transparent text-slate-200 placeholder-slate-500 px-4 py-3 outline-none text-sm"
                            placeholder="Напишіть повідомлення..."
                        />
                        <button type="button" onClick={() => setShowScheduleModal(true)} className="p-2 text-slate-500 hover:text-violet-400 transition-colors">
                            <Calendar size={18} />
                        </button>
                        <div className="relative mr-2">
                            <button type="button" onClick={() => setShowDestructPicker(v => !v)} className={`p-2 transition-colors ${destructAfterSeconds ? 'text-orange-400' : 'text-slate-500 hover:text-orange-400'}`}>
                                <Timer size={18} />
                            </button>
                            {showDestructPicker && (
                                <div className="absolute bottom-full right-0 mb-3 bg-[#151221] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] z-50">
                                    <p className="text-[10px] font-mono text-slate-500 uppercase px-3 py-2 border-b border-white/5">Таймер знищення</p>
                                    {DESTRUCT_OPTIONS.map(opt => (
                                        <button key={String(opt.value)} type="button" onClick={() => { setDestructAfterSeconds(opt.value); setShowDestructPicker(false); }}
                                                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors">
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {inputValue.trim() ? (
                        <button type="submit" className="p-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors cursor-pointer shadow-lg">
                            <Send size={20} className="ml-0.5" />
                        </button>
                    ) : (
                        <button type="button" onClick={() => onSetShowVoice(true)} disabled={uploadProgress !== null}
                                className="p-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-colors cursor-pointer">
                            <Mic size={20} />
                        </button>
                    )}
                </form>
            ) : (
                <div className="p-4 bg-[#0a0714] text-center text-sm text-slate-500">
                    Тільки адміністратори можуть писати в цьому каналі
                </div>
            )}

            {showScheduleModal && <ScheduleModal onConfirm={handleScheduleConfirm} onClose={() => setShowScheduleModal(false)} />}
        </div>
    );
}