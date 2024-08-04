export const Collections =  {
    Users: "users",
};

export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: TokenInfo;
}

export interface TokenInfo {
    token: string;
    isSafari: boolean;
    createdAt: string;
    lastMessageDate?:string;
    uid?:string;
}

export interface UpdateUserLoginPayload {
    volunteerID?: string;
    fingerprint: string;
    otp: string;
}

export interface UserInfo {
    notificationToken: TokenInfo | undefined,
    firstName: string,
    lastName: string,
    notificationOn: boolean,
}