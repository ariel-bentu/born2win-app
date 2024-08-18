import { Dayjs } from "dayjs";

export const Collections = {
    Users: "users",
    Admins: "admins",
};

export type onClickEvent = (e: any) => void;

export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: TokenInfo;
}

export interface FamilityIDPayload {
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
    isAdmin: boolean,
    districts?: { id: string, name: string }[],
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
    phone: string;
    uid?: string[];
    fingerpring?: string[];
    loginInfo?: LoginInfo[],
    notificationTokens?: TokenInfo[];
    lastModified: string;
    otp?: string;
}

export interface RegistrationRecord {
    id: string;
    date: string;
    city: string;
    familyLastName: string;
    weekday: string;
    familyId: string;
}


export interface StatsData {
    totalDemands: number[];
    fulfilledDemands: number[];
    labels: string[];
}

export interface GetDemandStatPayload {
    districts: string[];
    from: string;
    to: string;
}

export interface Cached<T> {
    data: T | undefined;
    fetchedTS: Dayjs;
    inProgress?: Promise<T>;
}