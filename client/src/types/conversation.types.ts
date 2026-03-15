export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';
export type MemberRole       = 'OWNER' | 'ADMIN' | 'MEMBER';
export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED';

export interface ConvUser {
    id:        number;
    nickname:  string;
    avatarUrl: string | null;
    isOnline:  boolean;
    lastSeen?: string;
    statusEmoji?:  string | null;
}

export interface ConversationMember {
    userId:   number;
    role:     MemberRole;
    joinedAt: string;
    user:     ConvUser;
}

export interface LastMessage {
    id:        number;
    content:   string;
    senderId:  number;
    createdAt: string;
    fileType:  string | null;
    fileUrl:   string | null;
}

export interface Conversation {
    id:          number;
    type:        ConversationType;
    name:        string | null;
    avatarUrl:   string | null;
    description: string | null;
    isOnline?:   boolean;
    myRole:      MemberRole;
    lastMessage: LastMessage | null;
    unreadCount: number;
    members:     ConversationMember[];
    updatedAt:   string;
    pinnedMessageId?: number | null;
    pinnedMessage?: {
    id:        number;
    content:   string;
    senderId: { id: number; nickname: string };
    } | null;
}

export interface Reaction {
    emoji:   string;
    count:   number;
    userIds: (number | string)[];
}

export interface ReplyPreview {
    id:        number;
    content:   string;
    deletedAt: string | null;
    sender:    { id: number; nickname: string };
}

export interface Message {
    id?:            number;
    content:        string;
    senderId:       number | string;
    conversationId: number;
    createdAt:      string | Date;
    editedAt?:      string | Date | null;
    deletedAt?:     string | Date | null;
    isRead:         boolean;
    reactions?:     Reaction[];
    replyToId?:     number | null;
    replyTo?:       ReplyPreview | null;
    sender?:        { id: number; nickname: string; avatarUrl: string | null };
    fileUrl?:       string | null;
    fileName?:      string | null;
    fileType?:      string | null;
    fileSize?:      number | null;
    metadata?: string | null;
    forwardedFromId?:   number | null;
    forwardedFromUserId?: number | null;
    forwardedFrom?: {
        id:      number;
        content: string;
        fileType?: string | null;
        sender:  { id: number; nickname: string };
    } | null;
    readBy?: { userId: number; nickname: string }[];
}

export interface Friendship {
    id:         number;
    senderId:   number;
    receiverId: number;
    status:     FriendshipStatus;
    createdAt:  string;
    sender?:    ConvUser;
    receiver?:  ConvUser;
}

export interface FriendItem {
    friendshipId: number;
    friend:       ConvUser;
}

export interface UserSearchResult {
    id:               number;
    nickname:         string;
    avatarUrl:        string | null;
    isOnline:         boolean;
    friendshipId:     number | null;
    friendshipStatus: FriendshipStatus | null;
    isRequester:      boolean;
}