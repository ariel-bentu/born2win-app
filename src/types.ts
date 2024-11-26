import { Dayjs } from "dayjs";

export const Collections = {
    Users: "users",
    Admins: "admins",
    Notifications: "notifications",
    Cancellations: "cancellations",
    Locks: "locks",
    DeferredNotifications: "deferredNotifications"
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

export interface GetOpenDemandPayload {
    type: VolunteerType;
}

export interface GetUserRegistrationsPayload {
    type: VolunteerType;
}

export interface FamilyDetailsPayload {
    districtBaseFamilyId: string;
    mainBaseFamilyId?: string;
    district: string;
    includeContacts: boolean;
    familyDemandId: string;
}

export interface FamilyContactsPayload {
    familyId: string;
}

export interface FamilyUpsertContactsPayload {
    familyId: string;
    contact: Contact;
}

export interface FamilyDeleteContactPayload {
    familyId: string;
    contactId: string;
}


export interface VolunteerInfoPayload {
    volunteerId: string;
}

export interface VolunteerInfo {
    id: string;
    firstName: string;
    lastName: string;
    districts: District[];
    phone: string;
    active: boolean;
    city: string;
}

export interface City {
    id: string;
    name: string;
}

export enum VolunteerType {
    Meal = "ארוחה",
    HolidayTreat = "פינוק לחג",
    Any = "xxx",
}

export interface FamilyDemandUpdatePayload {
    demandId: string;
    mainBaseFamilyId: string;
    cityId: string;
    isRegistering: boolean; // true means register, false mean unregister
    type: VolunteerType;
    reason?: string;
    district: string; // defaults to the user's. for admin this is needed
    volunteerId?: string // defaults to the user's. for admin this is needed
}

export interface UpdateDemandTransportationPayload {
    demandId: string;
    transpotingVolunteerId?: string;
}

export interface TokenInfo {
    token: string;
    isSafari: boolean;
    createdAt: string;
    lastMessageDate?: string;
    uid?: string;
}

export interface UpdateUserLoginPayload {
    volunteerId: string | null | undefined;
    fingerprint?: string;
    phone?: string;
    otp?: string;
    isIOS: boolean;
}

export interface District {
    id: string;
    name: string;
}

export interface UserInfo {
    id: string;
    notificationToken: TokenInfo | undefined,
    firstName: string,
    lastName: string,
    notificationOn: boolean,
    phone: string,
    userDistrict: { id: string, name: string },
    userDistricts: string[];
    isAdmin: boolean,
    adminAuthorities?: AdminAuthorities[],
    needToSignConfidentiality?: string;
    districts: District[],
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
    gender: string;
    needToSignConfidentiality?: string | any;
    cityId: string;
}


export interface AirTableRecord {
    id: string;
    createdTime: string;
    fields: { [key: string]: any };
}

export interface FamilyDemand {
    id: string;
    date: string;
    familyCityName: string;
    district: string;
    status: string;
    familyLastName: string;
    mainBaseFamilyId: string;
    districtBaseFamilyId: string;
    volunteerId: string;
    volunteerCityName: string;
    transpotingVolunteerId?: string
    isFamilyActive: boolean;
    type: VolunteerType;
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
    type: VolunteerType;
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
    districts: string[];
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

export interface IdName {
    id: string;
    name: string;
}


export interface FamilyCompact {
    districtBaseFamilyId: string;
    mainBaseFamilyId: string;
    district: string;
    familyLastName: string;
    city: string;
    active: boolean;
}

export interface SearchFamilyPayload {
    searchStr: string;
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
    importantNotice: string;
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
    OldLinkBlocked: "גישה דרך הלינק חסומה - יש להתקין את האפליקציה",
    Unauthorized: "Unauthorized",
    UserAuthenticationRequired: "נדרש אימות משתמש",
    UserAuthenticationRequiredCodeSent: "נדרש אימות משתמש, קוד נשלח ל ",
    WrongOtp: "קוד שגוי",
    ExpiredOtp: "פג תוקף הקוד",
}

export enum Status {
    Cancelled = "בוטל",
    Occupied = "תפוס",
    Available = "זמין",
    OccupiedOrCancelled = "תפוס או בוטל",
    Active = "פעיל",
}

export interface Holiday {
    id: string;
    date: string;
    name: string;
    familyId?: string;
    familyName?: string;
    alternateDate?: string
    addAvailability: boolean; // when true, it means the main "date" should be added to family
    cityName?: string;
    district?: string;
}

export interface UpsertHolidayPayload {
    holiday: Holiday,
}

export interface GetRegisteredHolidaysPayload {
    from: string;
    to: string;
}

export interface GetUserInfoPayload {
    volunteerId?: string;
}

export enum AdminAuthorities {
    ManageHoliday = 1,
    ManageContacts = 2,
    NotifiedBirthdays = 3,
}

export interface Contact {
    id: string;
    firstName: string; // שם פרטי
    lastName: string; // שם משפחה
    role: string[]; // תפקיד (multiple selects)
    email: string;
    phone: string; // טלפון
    age: number; // גיל
    gender: string; // מגדר (single select)
    dateOfBirth: string; // תאריך לידה
    idNumber: string; // תעודת זהות
    manychatId: string;
    relationToPatient: string; // סוג הקשר לחולה (single select)
}

export interface SuitabilityCheck {
    id: string;
    // Other fields
}
