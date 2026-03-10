import { User as UserIcon, LogOut } from "lucide-react";
import { User } from "@/src/types/auth.types";

interface SidebarProps {
    currentUser: User | null;
    users: User[];
    selectedUser: User | null;
    onSelectUser: (user: User) => void;
    onLogout: () => void;
}

export default function Sidebar({ currentUser, users, selectedUser, onSelectUser, onLogout }: SidebarProps) {
    return (
        <aside className="w-1/4 bg-white border-r border-gray-100 flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-20">
            {/* Світла сучасна шапка */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-violet-600 font-bold">
                        {currentUser?.nickname?.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-gray-800 truncate">{currentUser?.nickname}</span>
                </div>
                <button
                    onClick={onLogout}
                    className="text-gray-400 hover:text-violet-600 hover:bg-violet-50 p-2 rounded-full transition-all"
                    title="Вийти"
                >
                    <LogOut size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {users.map((u) => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                        <div
                            key={u.id}
                            onClick={() => onSelectUser(u)}
                            // Flat-дизайн для списку: без ліній між юзерами, тільки виділення кольором
                            className={`px-5 py-3 cursor-pointer transition-all flex items-center gap-3 border-l-4 
                                ${isSelected ? 'bg-violet-50 border-l-violet-500' : 'hover:bg-slate-50 border-l-transparent'}`}
                        >
                            <div className="relative">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors
                                    ${isSelected ? 'bg-white shadow-sm' : 'bg-slate-100'}`}
                                >
                                    <UserIcon size={24} className={isSelected ? 'text-violet-500' : 'text-slate-400'} />
                                </div>

                                <span
                                    className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-[2.5px] border-white 
                                    ${u.isOnline ? 'bg-emerald-400' : 'bg-slate-300'}`}
                                />
                            </div>

                            <div>
                                <p className={`font-medium ${isSelected ? 'text-violet-900' : 'text-gray-700'}`}>
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
        </aside>
    );
}