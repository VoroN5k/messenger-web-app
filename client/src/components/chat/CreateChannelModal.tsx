'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import api from '@/src/lib/axios';
import { Conversation } from '@/src/types/conversation.types';

interface CreateChannelModalProps {
    onClose: () => void;
    onCreated: (c: Conversation) => void;
}

export function CreateChannelModal({ onClose, onCreated }: CreateChannelModalProps) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const submit = async () => {
        if (!name.trim()) { setError('Введіть назву каналу'); return; }
        setError(''); setLoading(true);
        try {
            const res = await api.post('/conversations/channel', { name: name.trim(), description: desc.trim() || undefined });
            onCreated(res.data as Conversation);
        } catch (e: any) { setError('Помилка створення'); } finally { setLoading(false); }
    };

    if (!mounted) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#111114] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <h3 className="font-semibold text-slate-100 text-lg">Створити канал</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-200 cursor-pointer"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
                               placeholder="Назва каналу" autoFocus
                               className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:bg-white/10 transition-colors
                                ${error ? 'border-red-500/50' : 'border-transparent'}`}
                        />
                        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                    </div>
                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                              placeholder="Опис каналу (необов'язково)" rows={3}
                              className="w-full px-4 py-3 bg-white/5 border border-transparent rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:bg-white/10 resize-none transition-colors"
                    />
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