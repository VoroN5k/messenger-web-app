'use client';

import { useEffect, useState } from 'react';
import { useAuthStore }           from '@/src/store/useAuthStore';
import { useSocket }              from '@/src/context/SocketContext';
import { useConversations }       from '@/src/hooks/useConversations';
import { useFriends }             from '@/src/hooks/useFriends';
import { usePushNotifications }   from '@/src/hooks/usePushNotifications';
import api, { refreshAccessToken } from '@/src/lib/axios';
import { jwtDecode }              from 'jwt-decode';
import { Bell, KeyRound, X, ShieldAlert } from 'lucide-react';
import Sidebar                    from '@/src/components/chat/SideBar';
import ChatArea                   from '@/src/components/chat/ChatArea';
import { Conversation }           from '@/src/types/conversation.types';
import { useWebRTC }              from '@/src/hooks/useWebRTC';
import { IncomingCallModal }      from '@/src/components/call/IncomingCallModal';
import { ActiveCallOverlay }      from '@/src/components/call/ActiveCallOverlay';
import { useE2E }                 from '@/src/hooks/useE2E';
import { RecoveryUnlockModal }    from "@/src/components/chat/RecoveryUnlockModal";
import { useRouter }              from "next/navigation";
import { GridLines, NoiseOverlay } from "@/src/components/ui/BackgroundFx";

export default function ChatPage() {
    const { user, logout } = useAuthStore();
    const socket = useSocket();
    const { needsRecovery, needsRecoverySetup, unlockWithPin } = useE2E();
    const router = useRouter();

    const [selectedConv,  setSelectedConv]  = useState<Conversation | null>(null);
    const [isLoaded,      setIsLoaded]      = useState(false);
    const [showBanner,    setShowBanner]    = useState(false);

    useEffect(() => {
        if (needsRecoverySetup && sessionStorage.getItem('freshLogin') === 'true') {
            sessionStorage.removeItem('freshLogin');
            router.push('/auth/setup-recovery');
        }
    }, [needsRecoverySetup, router]);

    useEffect(() => {
        if (user !== undefined) setIsLoaded(true);
    }, [user]);

    useEffect(() => {
        if (!useAuthStore.getState().accessToken) {
            refreshAccessToken().then((token) => {
                if (!token) window.location.href = '/auth/login';
            });
        }
    }, []);

    const {
        conversations, isLoading: convsLoading,
        fetchConversations, markConversationRead,
        addConversation, updateConversation,
    } = useConversations(socket);

    const {
        friends, pendingRequests,
        fetchAll: fetchFriends,
        respondToRequest, removeFriend, sendRequest,
    } = useFriends(socket);

    const {
        callState, localStream, remoteStream,
        isMuted, isCameraOff,
        startCall, acceptCall, rejectCall, endCall,
        toggleMute, toggleCamera,
    } = useWebRTC(socket, user?.id);

    const { isSupported, permission, requestPermission } = usePushNotifications(!!user);

    // Push banner
    useEffect(() => {
        if (!isSupported) return;
        const dismissed = localStorage.getItem('push-banner-dismissed');
        if (dismissed) return;
        const t = setTimeout(() => {
            if (Notification.permission === 'default') setShowBanner(true);
        }, 3000);
        return () => clearTimeout(t);
    }, [isSupported]);

    // Silent token refresh
    useEffect(() => {
        let tid: ReturnType<typeof setTimeout>;
        const schedule = (token: string | null) => {
            clearTimeout(tid);
            if (!token) return;
            try {
                const { exp } = jwtDecode<{ exp: number }>(token);
                const delay   = Math.max(exp * 1000 - Date.now() - 60_000, 5_000);
                tid = setTimeout(() => refreshAccessToken(), delay);
            } catch {}
        };
        schedule(useAuthStore.getState().accessToken);
        const unsub = useAuthStore.subscribe(
            (s) => s.accessToken,
            (t) => schedule(t),
        );
        return () => { clearTimeout(tid); unsub(); };
    }, []);

    const handleLogout = async () => {
        try { await api.post('/auth/logout'); } catch {}
        logout();
        localStorage.removeItem('auth-storage');
        window.location.href = '/auth/login';
    };

    const handleSelectConversation = (conv: Conversation) => {
        setSelectedConv(conv);
        markConversationRead(conv.id);
    };

    if (!isLoaded) return null;

    return (
        <div className="flex h-screen flex-col overflow-hidden text-slate-200 selection:bg-violet-500/30 relative"
             style={{ background: '#05030f', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>

            <NoiseOverlay />
            <GridLines />

            {/* Кібер-банер сповіщень */}
            {showBanner && (
                <div className="relative z-50 flex items-center justify-between gap-3 px-6 py-3 border-b border-indigo-500/30 bg-indigo-900/20 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded bg-indigo-500/20 text-indigo-400">
                            <Bell size={14} />
                        </div>
                        <span className="text-xs font-mono tracking-wide text-indigo-200">
                            [СИСТЕМА] Увімкніть Push-сповіщення для фонового отримання пакетів даних.
                        </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <button
                            onClick={async () => { setShowBanner(false); await requestPermission(); }}
                            className="text-xs font-mono uppercase tracking-widest text-indigo-300 hover:text-indigo-100 transition-colors"
                        >
                            [ ДОЗВОЛИТИ ]
                        </button>
                        <button
                            onClick={() => { setShowBanner(false); localStorage.setItem('push-banner-dismissed', '1'); }}
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden relative z-10">
                <Sidebar
                    currentUser={user}
                    conversations={conversations}
                    convsLoading={convsLoading}
                    friends={friends}
                    pendingRequests={pendingRequests}
                    selectedConvId={selectedConv?.id}
                    socket={socket}
                    onSelectConversation={handleSelectConversation}
                    onAddConversation={addConversation}
                    onSendFriendRequest={sendRequest}
                    onRespondFriendRequest={respondToRequest}
                    onRemoveFriend={removeFriend}
                    onLogout={handleLogout}
                    pushPermission={permission}
                    onTogglePush={permission === 'granted' ? undefined : requestPermission}
                />

                <ChatArea
                    currentUser={user}
                    conversation={selectedConv}
                    conversations={conversations}
                    socket={socket}
                    onConversationUpdate={updateConversation}
                    onMarkRead={(id) => markConversationRead(id)}
                    onStartCall={startCall}
                />
            </div>

            {callState.status === 'incoming' && callState.incomingData && (
                <IncomingCallModal
                    data={callState.incomingData}
                    onAccept={acceptCall}
                    onReject={rejectCall}
                />
            )}

            {(['calling','connecting','active','ended'] as const).includes(callState.status as any) && (
                <ActiveCallOverlay
                    callState={callState}
                    localStream={localStream}
                    remoteStream={remoteStream}
                    isMuted={isMuted}
                    isCameraOff={isCameraOff}
                    peerName={
                        callState.incomingData?.callerName ??
                        conversations.find(c => c.id === callState.conversationId)?.name ??
                        'UNKNOWN_ENTITY'
                    }
                    peerAvatar={
                        callState.incomingData?.callerAvatar ??
                        conversations.find(c => c.id === callState.conversationId)?.avatarUrl ??
                        null
                    }
                    onEnd={endCall}
                    onToggleMute={toggleMute}
                    onToggleCamera={toggleCamera}
                />
            )}

            {needsRecovery && (
                <RecoveryUnlockModal onUnlock={unlockWithPin} />
            )}

            {/* Кібер-банер налаштування Recovery PIN */}
            {needsRecoverySetup && (
                <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-[#0a0714]/90 backdrop-blur-xl rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.15)] border border-amber-500/30 p-5 flex items-start gap-4 animate-in slide-in-from-bottom-8">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <ShieldAlert size={18} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-mono uppercase tracking-widest text-amber-500 mb-1">
                            Критичне сповіщення
                        </p>
                        <p className="text-xs text-slate-300 font-mono leading-relaxed">
                            Ваші ключі E2E не захищені резервним PIN-кодом. При втраті сесії чати будуть знищені.
                        </p>
                        <button onClick={() => router.push('/auth/setup-recovery')} className="mt-3 text-[10px] font-mono tracking-widest uppercase text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1">
                            [ INITIATE_SETUP ]
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}