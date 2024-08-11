export const Collections = {
    Users: "users",
};

export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: TokenInfo;
}

export interface GetFamilityAvailabilityPayload {
    familyId: string;
    baseId: string;
}


export interface TokenInfo {
    token: string;
    isSafari: boolean;
    createdAt: string;
    lastMessageDate?: string;
    uid?: string;
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

export interface LoginInfo {
    uid: string;
    fingerprint: string;
    createdAt: string;
}

export interface UserRecord {
    active: boolean;
    firstName: string;
    lastName: string;
    uid?: string[];
    fingerpring?: string[];
    loginInfo?: LoginInfo[],
    notificationTokens?: TokenInfo[];
    lastModified: string;
    otp?:string;
}