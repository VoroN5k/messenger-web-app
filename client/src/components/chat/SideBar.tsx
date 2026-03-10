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
        <aside className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                <span className="font-bold truncate">{currentUser?.nickname}</span>
                <button onClick={onLogout} className="hover:text-gray-300 transition-colors">
                    <LogOut size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {users.map((u) => (
                    <div
                        key={u.id}
                        onClick={() => onSelectUser(u)}
                        className={`p-4 border-b cursor-pointer transition-colors flex items-center gap-3 
                            ${selectedUser?.id === u.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                        <div className="relative">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                <UserIcon size={20} className="text-gray-500" />
                            </div>

                            <span
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white 
                                ${u.isOnline ? 'bg-green-500' : 'bg-red-500'}`}
                            />
                        </div>

                        <div>
                            <p className="font-medium text-gray-800">{u.nickname}</p>
                            <p className="text-xs text-gray-400">
                                {u.isOnline ? 'В мережі' : 'Не в мережі'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}