export interface Message {
    id?: number;
    content: string;
    senderId: number | string;
    receiverId?: number | string;
    isRead?: boolean;
    createdAt: string | Date;
}