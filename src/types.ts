import { Dayjs } from "dayjs";

export const Collections = {
    Users: "users",
    Admins: "admins",
    Notifications: "notifications",
    Cancellations: "cancellations",
};

export const NotificationActions = {
    RegistrationDetails: "registration-details",
    StartConversation: "start-conversation"
}

export type onClickEvent = (e: any) => void;

export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: TokenInfo;
}

export interface FamilityIDPayload {
    familyId: string;
}

export interface City {
    id: string;
    name: string;
}

export interface FamilityDemandUpdatePayload {
    demandId: string;
    familyId: string;
    cityId: string;
    isRegistering: boolean; // true means register, false mean unregister
    reason?: string;
}

export interface TokenInfo {
    token: string;
    isSafari: boolean;
    createdAt: string;
    lastMessageDate?: string;
    uid?: string;
}

export interface UpdateUserLoginPayload {
    volunteerId?: string;
    fingerprint?: string;
    otp?: string;
    isIOS: boolean;
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
    isIOS: boolean;
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
    otpCreatedAt?: string;
}


export interface AirTableRecord {
    id: string;
    createdTime: string;
    fields: { [key: string]: any };
}

export interface FamilyDemand {
    id: string;
    date: string;
    city: string;
    district: string;
    status: string;
    familyLastName: string;
    familyId: string;
    familyRecordId: string;
    volunteerId: string;
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

export interface SendMessagePayload {
    toDistricts: string[];
    toRecipients: string[];
    title: string;
    body: string;
}

export interface Cached<T> {
    userId: string;
    data: T | undefined;
    fetchedTS: Dayjs;
    inProgress?: Promise<T>;
}

export interface NavigationStep {
    tab: number,
    params?: string[],
}

export interface Recipient {
    name: string;
    id: string;
    mahoz: string;
}

export interface SearchUsersPayload {
    query: string;
}

export interface SendNotificationStats {
    successCount: number;
    errorCount: number;
}

export type ShowToast = (severity: "error" | "success" | "info" | "warn" | "secondary" | "contrast" | undefined, summary: string, detail: string) => void;

export interface Family2 {
    city: string;
    name: string;
    patientAge: number;
    prefferedMeal: string[];
    kosherLevel: string;
    favoriteFood: string;
    alergies: string;
    adultsCount: number;
    familyMembersAge: string;
    floor: string;
    district: string;
}

