export interface Message {
    id?: number;
    content: string;
    senderId: number | string;
    receiverId?: number | string;
    isRead?: boolean;
    createdAt: string | Date;
    updatedAt: string | Date | null;
    deletedAt: string | Date | null;
}