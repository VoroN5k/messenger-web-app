'use client';

import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video, Mic } from 'lucide-react';
import { Avatar } from '@/src/components/chat/Avatar';
import { IncomingCallData, CallType } from '@/src/hooks/useWebRTC';

interface Props {
    data:     IncomingCallData;
    onAccept: (type: CallType) => void;
    onReject: () => void;
}

export function IncomingCallModal({ data, onAccept, onReject }: Props) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

            {/* Card */}
            <div className="relative flex flex-col items-center gap-6 bg-slate-900 border border-slate-700 rounded-3xl px-10 py-10 shadow-2xl w-80 animate-in fade-in zoom-in-95">

                {/* Pulse ring */}
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping scale-125" />
                    <Avatar
                        user={{ nickname: data.callerName, avatarUrl: data.callerAvatar }}
                        size="xl"
                        className="ring-4 ring-emerald-400/30"
                    />
                </div>

                <div className="text-center">
                    <p className="text-lg font-bold text-white">{data.callerName}</p>
                    <p className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1.5">
                        {data.callType === 'video'
                            ? <><Video size={13} />Відео дзвінок</>
                            : <><Mic  size={13} />Аудіо дзвінок</>
                        }
                    </p>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                        {elapsed}с...
                    </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-6">
                    {/* Reject */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={onReject}
                            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-500/30"
                        >
                            <PhoneOff size={24} className="text-white" />
                        </button>
                        <span className="text-xs text-slate-400">Відхилити</span>
                    </div>

                    {/* Accept audio */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={() => onAccept('audio')}
                            className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/30"
                        >
                            <Phone size={24} className="text-white" />
                        </button>
                        <span className="text-xs text-slate-400">Аудіо</span>
                    </div>

                    {/* Accept video (only if incoming is video) */}
                    {data.callType === 'video' && (
                        <div className="flex flex-col items-center gap-2">
                            <button
                                onClick={() => onAccept('video')}
                                className="w-16 h-16 rounded-full bg-indigo-500 hover:bg-indigo-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-lg shadow-indigo-500/30"
                            >
                                <Video size={24} className="text-white" />
                            </button>
                            <span className="text-xs text-slate-400">Відео</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}