export interface Reaction {
    emoji: string;
    count: number;
    userIds: (number | string)[];
}

export interface Message {
    id?: number;
    content: string;
    senderId: number | string;
    receiverId?: number | string;
    isRead?: boolean;
    createdAt: string | Date;
    editedAt: string | Date | null;
    deletedAt: string | Date | null;
    reactions?: Reaction[];
}