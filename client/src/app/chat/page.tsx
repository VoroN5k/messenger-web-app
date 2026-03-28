'use client';

import { useEffect, useState } from 'react';
import { useAuthStore }           from '@/src/store/useAuthStore';
import { useSocket }              from '@/src/context/SocketContext';
import { useConversations }       from '@/src/hooks/useConversations';
import { useFriends }             from '@/src/hooks/useFriends';
import { usePushNotifications }   from '@/src/hooks/usePushNotifications';
import api, { refreshAccessToken } from '@/src/lib/axios';
import { jwtDecode }              from 'jwt-decode';
import { Bell, X, ShieldAlert }   from 'lucide-react';
import Sidebar                    from '@/src/components/chat/SideBar';
import ChatArea                   from '@/src/components/chat/ChatArea';
import { Conversation, Message }  from '@/src/types/conversation.types';
import { useWebRTC }              from '@/src/hooks/useWebRTC';
import { IncomingCallModal }      from '@/src/components/call/IncomingCallModal';
import { ActiveCallOverlay }      from '@/src/components/call/ActiveCallOverlay';
import { useE2E }                 from '@/src/hooks/useE2E';
import { RecoveryUnlockModal }    from "@/src/components/chat/RecoveryUnlockModal";
import { useRouter }              from "next/navigation";

export default function ChatPage() {
    const { user, logout } = useAuthStore();
    const socket = useSocket();
    const { needsRecovery, needsRecoverySetup, unlockWithPin } = useE2E();
    const router = useRouter();

    const [selectedConv,  setSelectedConv]  = useState<Conversation | null>(null);
    const [isLoaded,      setIsLoaded]      = useState(false);
    const [showBanner,    setShowBanner]    = useState(false);

    const [pendingForward, setPendingForward] = useState<Message | null>(null);

    useEffect(() => {
        if (needsRecoverySetup && sessionStorage.getItem('freshLogin') === 'true') {
            sessionStorage.removeItem('freshLogin');
            router.push('/auth/setup-recovery');
        }
    }, [needsRecoverySetup]);

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
    } = useConversations(socket, selectedConv?.id);

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

    useEffect(() => {
        if (!isSupported) return;
        const dismissed = localStorage.getItem('push-banner-dismissed');
        if (dismissed) return;
        const t = setTimeout(() => {
            if (Notification.permission === 'default') setShowBanner(true);
        }, 3000);
        return () => clearTimeout(t);
    }, [isSupported]);

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
        <div className="flex h-screen flex-col overflow-hidden text-slate-200 bg-[#050505] selection:bg-violet-500/30">

            {showBanner && (
                <div className="relative z-50 flex items-center justify-between gap-3 px-6 py-3 bg-violet-600/10 border-b border-violet-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-full bg-violet-500/20 text-violet-400">
                            <Bell size={16} />
                        </div>
                        <span className="text-sm font-medium text-slate-200">
                            Увімкніть Push-сповіщення, щоб не пропускати повідомлення у фоновому режимі.
                        </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <button
                            onClick={async () => { setShowBanner(false); await requestPermission(); }}
                            className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                        >
                            Увімкнути
                        </button>
                        <button
                            onClick={() => { setShowBanner(false); localStorage.setItem('push-banner-dismissed', '1'); }}
                            className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer p-1"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
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
                    onTogglePush={requestPermission}
                />

                <ChatArea
                    currentUser={user}
                    conversation={selectedConv}
                    conversations={conversations}
                    socket={socket}
                    onConversationUpdate={updateConversation}
                    onMarkRead={(id) => markConversationRead(id)}
                    onStartCall={startCall}
                    pendingForward={pendingForward}
                    onSetPendingForward={setPendingForward}
                    onSelectConversation={handleSelectConversation}
                />
            </div>

            {callState.status === 'incoming' && callState.incomingData && (
                <IncomingCallModal data={callState.incomingData} onAccept={acceptCall} onReject={rejectCall} />
            )}

            {(['calling','connecting','active','ended'] as const).includes(callState.status as any) && (
                <ActiveCallOverlay
                    callState={callState} localStream={localStream} remoteStream={remoteStream}
                    isMuted={isMuted} isCameraOff={isCameraOff}
                    peerName={callState.incomingData?.callerName ?? conversations.find(c => c.id === callState.conversationId)?.name ?? 'Користувач'}
                    peerAvatar={callState.incomingData?.callerAvatar ?? conversations.find(c => c.id === callState.conversationId)?.avatarUrl ?? null}
                    onEnd={endCall} onToggleMute={toggleMute} onToggleCamera={toggleCamera}
                />
            )}

            {needsRecovery && <RecoveryUnlockModal onUnlock={unlockWithPin} />}

            {needsRecoverySetup && (
                <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-[#111114] rounded-2xl shadow-2xl border border-amber-500/20 p-5 flex items-start gap-4 animate-in slide-in-from-bottom-8">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                        <ShieldAlert size={20} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 mb-1">
                            Ключі не захищені
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed mb-3">
                            Встановіть Recovery PIN, інакше ви втратите історію чатів при виході з акаунту.
                        </p>
                        <button onClick={() => router.push('/auth/setup-recovery')} className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">
                            Налаштувати зараз
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}