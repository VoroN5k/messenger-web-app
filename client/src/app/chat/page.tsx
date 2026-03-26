'use client';

import { useEffect, useState } from 'react';
import { useAuthStore }           from '@/src/store/useAuthStore';
import { useSocket }              from '@/src/context/SocketContext';   // ← з контексту
import { useConversations }       from '@/src/hooks/useConversations';
import { useFriends }             from '@/src/hooks/useFriends';
import { usePushNotifications }   from '@/src/hooks/usePushNotifications';
import api, { refreshAccessToken } from '@/src/lib/axios';
import { jwtDecode }              from 'jwt-decode';
import {Bell, KeyRound, X} from 'lucide-react';
import Sidebar                    from '@/src/components/chat/SideBar';
import ChatArea                   from '@/src/components/chat/ChatArea';
import { Conversation }           from '@/src/types/conversation.types';
import { useWebRTC }              from '@/src/hooks/useWebRTC';
import { IncomingCallModal }      from '@/src/components/call/IncomingCallModal';
import { ActiveCallOverlay }      from '@/src/components/call/ActiveCallOverlay';
import { useE2E }                 from '@/src/hooks/useE2E';
import {RecoveryUnlockModal} from "@/src/components/chat/RecoveryUnlockModal";
import {useRouter} from "next/navigation";

export default function ChatPage() {
    const { user, logout } = useAuthStore();
    const socket = useSocket();   // ← береться з SocketContext, не створюється тут
    const { needsRecovery, needsRecoverySetup, unlockWithPin } = useE2E();
    const router = useRouter();

    useEffect(() => {
        if (needsRecoverySetup && sessionStorage.getItem('freshLogin') === 'true') {
            sessionStorage.removeItem('freshLogin');

            router.push('/auth/setup-recovery');
        }
    }, [needsRecoverySetup, router]);

    const [selectedConv,  setSelectedConv]  = useState<Conversation | null>(null);
    const [isLoaded,      setIsLoaded]      = useState(false);
    const [showBanner,    setShowBanner]    = useState(false);

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
        <div className="flex h-screen bg-gray-100 flex-col">
            {showBanner && (
                <div className="flex items-center justify-between gap-3 px-5 py-3 bg-indigo-600 text-white text-sm z-50">
                    <div className="flex items-center gap-2">
                        <Bell size={16} className="shrink-0" />
                        <span>Увімкніть сповіщення, щоб не пропускати нові повідомлення</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={async () => { setShowBanner(false); await requestPermission(); }}
                            className="bg-white text-indigo-600 font-semibold px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer text-xs"
                        >
                            Увімкнути
                        </button>
                        <button
                            onClick={() => { setShowBanner(false); localStorage.setItem('push-banner-dismissed', '1'); }}
                            className="text-indigo-200 hover:text-white cursor-pointer"
                        >
                            <X size={16} />
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
                        'Невідомий'
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
            {needsRecoverySetup && (
                <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-white dark:bg-slate-800
                    rounded-2xl shadow-xl border border-violet-100 dark:border-violet-900/40
                    p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40
                        flex items-center justify-center shrink-0">
                        <KeyRound size={16} className="text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            Захистіть переписку
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Встановіть Recovery PIN щоб мати доступ на нових пристроях
                        </p>
                        <a href="/auth/setup-recovery"
                           className="text-xs text-violet-600 font-semibold hover:underline mt-1 inline-block">
                            Налаштувати →
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}