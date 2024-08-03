export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: TokenInfo;
}

export interface TokenInfo {
    token: string;
    isSafari: boolean;
    createdAt: string;
    lastMessageDate?:string;
}

export interface UpdateUserLoginPayload {
    volunteerID: string;
    otp: string;
}
