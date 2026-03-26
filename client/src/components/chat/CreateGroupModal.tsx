'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import api from '@/src/lib/axios';
import { Avatar } from './Avatar';
import { FriendItem, Conversation } from '@/src/types/conversation.types';
import { useE2E } from '@/src/hooks/useE2E';

interface CreateGroupModalProps {
    friends: FriendItem[];
    currentUserId?: number;
    onClose: () => void;
    onCreated: (c: Conversation) => void;
}

export function CreateGroupModal({ friends, onClose, onCreated, currentUserId }: CreateGroupModalProps) {
    const [name, setName] = useState('');
    const [selected, setSelected] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mounted, setMounted] = useState(false);
    const e2e = useE2E();

    useEffect(() => { setMounted(true); }, []);

    const toggle = (id: number) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

    const submit = async () => {
        if (!name.trim() || name.trim().length < 2) { setError('Введіть назву групи'); return; }
        setError(''); setLoading(true);
        try {
            const res = await api.post('/conversations/group', { name: name.trim(), memberIds: selected });
            const conv = res.data as Conversation;
            try { await e2e.distributeMySenderKey(conv.id, conv.members.map(m => m.userId)); } catch {}
            onCreated(conv);
        } catch (e: any) { setError('Помилка створення'); } finally { setLoading(false); }
    };

    if (!mounted) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#111114] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <h3 className="font-semibold text-slate-100 text-lg">Створити групу</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-200 cursor-pointer"><X size={20} /></button>
                </div>

                <div className="p-5 space-y-5">
                    <div>
                        <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                               placeholder="Назва групи" autoFocus
                               className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:bg-white/10 transition-colors
                                ${error ? 'border-red-500/50' : 'border-transparent'}`}
                        />
                        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                    </div>

                    {friends.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">Немає контактів для додавання</p>
                    ) : (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 mb-3">Оберіть учасників</p>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                                {friends.map((f: any) => (
                                    <label key={f.friendshipId} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
                                        <input type="checkbox" checked={selected.includes(f.friend.id)} onChange={() => toggle(f.friend.id)}
                                               className="appearance-none shrink-0 w-5 h-5 border-2 border-slate-600 rounded-md bg-transparent checked:bg-violet-500 checked:border-violet-500 transition-colors cursor-pointer" />
                                        <Avatar user={f.friend} size="sm" className="rounded-full" />
                                        <span className="text-sm font-medium text-slate-200 truncate">{f.friend.nickname}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-5 pb-5 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-300 font-semibold text-sm hover:bg-white/10 transition-colors cursor-pointer">
                        Скасувати
                    </button>
                    <button onClick={submit} disabled={loading || !name.trim()}
                            className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 disabled:opacity-50 transition-colors cursor-pointer">
                        {loading ? 'Створення...' : 'Створити'}
                    </button>
                </div>
            </div>
        </div>
    );
    return createPortal(modalContent, document.body);
}