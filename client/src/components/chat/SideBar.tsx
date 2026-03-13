'use client';

import { useState } from 'react';
import { LogOut, Bell, BellOff } from 'lucide-react';
import { User } from '@/src/types/auth.types';
import { Avatar } from './Avatar';
import { AvatarCropModal } from './AvatarCropModal';
import { useAuthStore } from '@/src/store/useAuthStore';
import api from '@/src/lib/axios';

interface SidebarProps {
    currentUser:     User | null;
    users:           User[];
    selectedUser:    User | null;
    onSelectUser:    (user: User) => void;
    onLogout:        () => void;
    pushPermission?: string;
    onTogglePush?:   () => void;
}

export default function Sidebar({
                                    currentUser, users, selectedUser,
                                    onSelectUser, onLogout,
                                    pushPermission, onTogglePush,
                                }: SidebarProps) {
    const [showCropModal, setShowCropModal] = useState(false);
    const { setAuth, user, accessToken }    = useAuthStore();

    const handleSaveAvatar = async (blob: Blob) => {
        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.jpg');

        const res = await api.post<{ avatarUrl: string }>('/users/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        // Оновлюємо user в сторі з новим avatarUrl
        if (user && accessToken) {
            setAuth({ ...user, avatarUrl: res.data.avatarUrl }, accessToken);
        }
        setShowCropModal(false);
    };

    return (
        <aside className="w-1/4 bg-white border-r border-gray-100 flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-20">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Аватар з кліком для зміни */}
                    <div className="relative group">
                        {currentUser && (
                            <Avatar
                                user={currentUser}
                                size="md"
                                onClick={() => setShowCropModal(true)}
                                className="ring-2 ring-transparent group-hover:ring-violet-300 transition-all"
                            />
                        )}
                        {/* Overlay підказка */}
                        <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </div>
                    </div>
                    <span className="font-semibold text-gray-800 truncate">{currentUser?.nickname}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {pushPermission !== 'unsupported' && (
                        <button
                            onClick={onTogglePush}
                            disabled={pushPermission === 'granted' || pushPermission === 'denied'}
                            title={
                                pushPermission === 'granted' ? 'Сповіщення увімкнено' :
                                    pushPermission === 'denied'  ? 'Сповіщення заблоковано браузером' :
                                        'Увімкнути сповіщення'
                            }
                            className={`p-2 rounded-full transition-all
                                ${pushPermission === 'granted'  ? 'text-indigo-500 bg-indigo-50 cursor-default'
                                : pushPermission === 'denied'   ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 cursor-pointer'}`}
                        >
                            {pushPermission === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
                        </button>
                    )}
                    <button onClick={onLogout} className="text-gray-400 hover:text-violet-600 hover:bg-violet-50 p-2 rounded-full transition-all cursor-pointer" title="Вийти">
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {users.map((u) => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                        <div
                            key={u.id}
                            onClick={() => onSelectUser(u)}
                            className={`px-4 py-3 cursor-pointer transition-all flex items-center gap-3 border-l-4
                                ${isSelected ? 'bg-violet-50 border-l-violet-500' : 'hover:bg-slate-50 border-l-transparent'}`}
                        >
                            <div className="relative shrink-0">
                                <Avatar user={u} size="lg" />
                                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white
                                    ${u.isOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                            </div>
                            <div className="min-w-0">
                                <p className={`font-medium truncate ${isSelected ? 'text-violet-900' : 'text-gray-700'}`}>
                                    {u.nickname}
                                </p>
                                <p className="text-xs text-slate-400 font-medium">
                                    {u.isOnline ? 'В мережі' : 'Офлайн'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showCropModal && (
                <AvatarCropModal
                    onClose={() => setShowCropModal(false)}
                    onSave={handleSaveAvatar}
                />
            )}
        </aside>
    );
}