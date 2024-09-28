import { Dayjs } from "dayjs";

export const Collections = {
    Users: "users",
    Admins: "admins",
    Notifications: "notifications",
    Cancellations: "cancellations",
    Locks: "locks",
};

export const NotificationActions = {
    RegistrationDetails: "registration-details",
    StartConversation: "start-conversation"
}

export enum NotificationChannels {
    General = "general",
    Alerts = "alerts",
    Links = "links",
    Greetings = "greetings",
    Registrations = "registrations",
};

interface ChannelInfo {
    name: string;
    icon: string;
}

export const NotificationChannelsName: { [key: string]: ChannelInfo } = {
    [NotificationChannels.General]: { name: "כללי", icon: "pi-comment" },
    [NotificationChannels.Alerts]: { name: "התראות / תזכורות", icon: "pi-bell" },
    [NotificationChannels.Links]: { name: "לינקים למשתמשים", icon: "pi-link" },
    [NotificationChannels.Greetings]: { name: "ברכות", icon: "pi-heart" },
    [NotificationChannels.Registrations]: { name: "שיבוצים", icon: "pi-calendar" },
}


export type onClickEvent = (e: any) => void;

export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: TokenInfo;
}

export interface FamilityDetailsPayload {
    districtBaseFamilyId: string;
    district: string;
    includeContacts: boolean;
    familyDemandId: string;
}


export interface VolunteerInfoPayload {
    volunteerId:string;
}

export interface VolunteerInfo {
    id: string;
    firstName: string;
    lastName: string;
    district: { id: string, name: string }
    phone:string;
    active:boolean;
}

export interface City {
    id: string;
    name: string;
}

export interface FamilityDemandUpdatePayload {
    demandId: string;
    mainBaseFamilyId: string;
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
    phone?: string;
    otp?: string;
    isIOS: boolean;
}

export interface UserInfo {
    id: string;
    notificationToken: TokenInfo | undefined,
    firstName: string,
    lastName: string,
    notificationOn: boolean,
    phone: string,
    userDistrict: { id: string, name: string },
    isAdmin: boolean,
    needToSignConfidentiality?: string;
    districts?: { id: string, name: string }[],
    active: boolean;
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
    manychat_id: string;
    uid?: string[];
    fingerpring?: string[];
    loginInfo?: LoginInfo[],
    notificationTokens?: TokenInfo[];
    lastModified: string;
    otp?: string;
    otpCreatedAt?: string;
    birthDate: string;
    gender:string;
    needToSignConfidentiality?:string | any;
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
    mainBaseFamilyId: string;
    districtBaseFamilyId: string;
    volunteerId: string;
    isFamilyActive: boolean;
}

export interface OpenFamilyDemands {
    demands: FamilyDemand[];
    allDistrictCities: City[];
}


export interface StatsData {
    totalDemands: number[];
    fulfilledDemands: number[];
    labels: string[];
    openFamilyDemands: FamilyDemand[];
    fulfilledFamilyDemands: FamilyDemand[];
}

export interface GetDemandsPayload {
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
    data: T;
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
    phone: string;
    mahoz: string;
}

export interface SearchUsersPayload {
    query: string;
}

export interface GenerateLinkPayload {
    userId: string;
}

export interface SendNotificationStats {
    successCount: number;
    errorCount: number;
}

export type ShowToast = (severity: "error" | "success" | "info" | "warn" | "secondary" | "contrast" | undefined, summary: string, detail: string) => void;

export interface NavigationState {
    label: string;
    backCallback: (label: string) => void;
}

export type AppServices = {
    showMessage: ShowToast;
    pushNavigationStep: (label: string, backCallback: (label: string) => void) => void;
    popNavigationStep: () => void;
}



export interface FamilyCompact {
    districtBaseFamilyId: string;
    district: string;
    familyLastName: string;
    city: string;
    active: boolean;
}


export interface FamilyDetails {
    id: string;
    mainBaseFamilyId: string;
    city: string;
    cityId: string;
    familyLastName: string;
    patientAge: number;
    prefferedMeal: string[];
    meatPreferences: string;
    fishPreferences: string;
    avoidDishes: string;
    sideDishes: string;
    kosherLevel: string;
    favoriteFood: string;
    alergies: string;
    adultsCount: number;
    familyStructure: string[];
    familyMembersAge: string;
    cookingDays: string[];
    floor: string;
    street: string;
    appartment: string;
    streatNumber: string;
    district: string;
    contactName: string;
    relationToPatient: string;
    phone: string;
}


export const Errors = {
    UserAlreadyOnboardedToApp: "User is already onboarded to the app",
    InactiveUser: "Inactive user",
}