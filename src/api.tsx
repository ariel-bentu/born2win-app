import { FirebaseApp, initializeApp } from "firebase/app";
import { getMessaging, getToken } from 'firebase/messaging';
import {
    getAuth, onAuthStateChanged, signInAnonymously,
    signOut,
    setPersistence,
    indexedDBLocalPersistence,
    Auth,
    NextOrObserver,
    User
} from "firebase/auth";

import dayjs from 'dayjs'

import { Functions, getFunctions, httpsCallable } from 'firebase/functions';
import {
    Contact,
    FamilyContactsPayload,
    FamilyDeleteContactPayload,
    FamilyDemandUpdatePayload, FamilyDetailsPayload, FamilyUpsertContactsPayload, FamilyCompact, FamilyDemand,
    FamilyDetails, GenerateLinkPayload, GetDemandsPayload, GetRegisteredHolidaysPayload, GetUserInfoPayload, Holiday, IdName, NotificationChannels,
    NotificationUpdatePayload, OpenFamilyDemands, Recipient, SearchFamilyPayload, SearchUsersPayload,
    SendMessagePayload, UpdateDemandTransportationPayload, UpdateUserLoginPayload, UpsertHolidayPayload, UserInfo, VolunteerInfo, VolunteerInfoPayload,
    VolunteerType,
    GetOpenDemandPayload,
    GetUserRegistrationsPayload,
    UpdateIdentificationNumberPayload
} from "./types";
import { readAllNotifications } from "./notifications";
import { getDB } from "./db";
import { isNotEmpty } from "./utils";
import { Analytics, getAnalytics, logEvent } from "firebase/analytics";


const firebaseConfig = {
    apiKey: "AIzaSyDVO_fe3wOIp66it8AzF00oqjvyuI3HLWg",
    authDomain: "born2win-prod.firebaseapp.com",
    projectId: "born2win-prod",
    storageBucket: "born2win-prod.appspot.com",
    messagingSenderId: "126118201382",
    appId: "1:126118201382:web:849e06fa978ee250d5fee7",
    measurementId: "G-FWWBBZ7KNC"
};

const VAPID_KEY = "BN_C98WkGcuT-h8cwniGtDjPwlJ1K_iP12wCgWPNehBfDLUiXALz98jZCLTGug_uoWI8ryoGJT-QxKHJjHIqEUE";
let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let serviceWorkerRegistration: any;
let analytics: Analytics;

export let impersonateUser: {
    id: string;
    name: string;
    phone?: string;
} | undefined = undefined;

export async function init(onAuth: NextOrObserver<User>) {
    if (!app) {
        app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);
        // workaround
        let m_any: any = messaging;
        m_any.vapidKey = VAPID_KEY;


        if ("serviceWorker" in navigator) {
            await navigator.serviceWorker.register("service-worker.js", {
                scope:
                    window.location.href.startsWith("http://localhost") ? "http://localhost:3000/firebase-messaging-sw.js" :
                        "https://app.born2win.org.il/firebase-messaging-sw.js"
            }).then((swReg) => {
                serviceWorkerRegistration = swReg;
                m_any.swRegistration = swReg;
                console.log("WSReg", swReg)
            });
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                (window as any).deferredInstallPrompt = e;
            });
        }

        auth = getAuth(app);
        analytics = getAnalytics(app);

        functions = getFunctions(app, 'europe-west1');
    }
    return setPersistence(auth, indexedDBLocalPersistence).then(() => onAuthStateChanged(auth, onAuth));
}

export function login(isLink: boolean) {
    return signInAnonymously(auth)
        .then((u) => {
            // Signed in..
            console.log("User is authenticated", u.user.uid);
            logEvent(analytics, isLink ? 'Login to Link' : 'Login to app');
        })
        .catch((error) => {
            // const errorCode = error.code;
            // const errorMessage = error.message;
            // ...
        });
}

export function logout() {
    return signOut(auth)
        .then((u) => {
            // signOut in..
            console.log("User is Now logged out");
        })
        .catch((error) => {
            // const errorCode = error.code;
            // const errorMessage = error.message;
            // ...
        });
}

export function impersonate(id: string, name: string, phone?: string) {
    impersonateUser = { id, name, phone };
}
export function resetImpersonation() {
    impersonateUser = undefined;
}

export function getUserInfo(volunteerId: string): Promise<UserInfo> {
    const payload: GetUserInfoPayload | undefined = impersonateUser ?
        undefined :
        {
            volunteerId,
        };
    return callFunctionWithImpersonation('GetUserInfo', payload).then(res => res.data as UserInfo);
}

export function analyticLog(component: string, action: string) {
    logEvent(analytics, component + ":" + action);
}

export async function getLatestTokenPersisted(): Promise<string | null> {
    const dbName = 'firebase-messaging-database';
    const storeName = 'firebase-messaging-store';

    return new Promise((resolve, reject) => {
        // Open the IndexedDB database
        const request = indexedDB.open(dbName);

        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event);
            reject('Failed to open IndexedDB');
        };

        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Open a transaction and access the store
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);

            const tokens: { token: string; createTime: number }[] = [];

            // Iterate through all records
            const cursorRequest = store.openCursor();
            cursorRequest.onerror = (cursorEvent) => {
                console.error('Error reading IndexedDB:', cursorEvent);
                reject('Failed to read from IndexedDB');
            };

            cursorRequest.onsuccess = (cursorEvent) => {
                const cursor = (cursorEvent.target as any)?.result;
                if (cursor) {
                    const value = cursor.value;
                    if (value.subscriptionOptions?.vapidKey === VAPID_KEY) {
                        tokens.push({ token: value.token, createTime: value.createTime });
                    }
                    cursor.continue();
                } else {
                    // No more records, process the results
                    if (tokens.length > 0) {
                        // Find the token with the latest createTime
                        const latestToken = tokens.reduce((latest, current) =>
                            current.createTime > latest.createTime ? current : latest
                        );
                        resolve(latestToken.token);
                    } else {
                        // No matching tokens found
                        resolve(null);
                    }
                }
            };
        };
    });
}




export async function getFCMToken() {
    const messaging = getMessaging(app);
    return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration })
}

export async function requestWebPushToken() {
    return Notification.requestPermission().then(perm => {
        if (perm === "granted") {
            console.log("permission granted");
            return getFCMToken().then((currentToken) => {
                if (currentToken) {
                    console.log("Successfully obtained a web push token: ", currentToken);
                    return currentToken;
                } else {
                    // Show permission request UI
                    console.log('No registration token available. Request permission to generate one.');
                    // ...
                }
            }).catch((err) => {
                console.log('An error occurred while retrieving token. ', err);
                throw (err);
                // ...
            });
        } else {
            console.log("Permission denied to recieve notifications");
            throw new Error("Permission denied to recieve notifications");
        }
    });
}

export async function sendTestNotification() {
    // no impersonation
    const testNotification = httpsCallable(functions, 'TestNotification');
    console.log("Send test notification")

    return testNotification();
}

export function updateLoginInfo(volunteerId: string | null | undefined, otp: string | undefined, fingerprint: string | undefined, phone: string | undefined, isIOS: boolean): any {
    // no impersonation
    const updateLoginInfoFunc = httpsCallable(functions, 'UpdateUserLogin');
    const uulp = { fingerprint, otp, volunteerId, phone, isIOS } as UpdateUserLoginPayload;

    return updateLoginInfoFunc(uulp).then(res => res.data);
}

export function updateIdentificationNumber(identificationNumber: string) {
    const updateIdentificationNumberFunc = httpsCallable(functions, 'UpdateIdentificationNumber');
    const uulp = { identificationNumber } as UpdateIdentificationNumberPayload;

    return updateIdentificationNumberFunc(uulp);
}


export async function updateUserNotification(notificationOn: boolean | undefined, token: string, isSafari: boolean) {
    // no impersonation
    const updateNotification = httpsCallable(functions, 'UpdateNotification');

    const payload = {} as NotificationUpdatePayload;
    if (notificationOn !== undefined) {
        payload.notificationOn = notificationOn;
    }

    if (token !== undefined) {
        payload.tokenInfo = {
            isSafari,
            token,
            createdAt: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        };
    }

    return updateNotification(payload);
}

function callFunctionWithImpersonation(functionName: string, payload?: any) {
    const func = httpsCallable(functions, functionName);

    if (impersonateUser) {
        if (payload) {
            payload.impersonateUser = impersonateUser.id;
        } else {
            payload = { impersonateUser: impersonateUser.id };
        }
    }

    return func(payload);
}


export function getOpenDemands(type: VolunteerType): Promise<OpenFamilyDemands> {
    return callFunctionWithImpersonation('GetOpenDemands_v4', { type } as GetOpenDemandPayload).then((res: any) => res.data as OpenFamilyDemands);
}

export function updateFamilyDemand(demandId: string, date: string, mainBaseFamilyId: string,
    cityId: string, isRegistering: boolean, type: VolunteerType, reason: string,
    district: string, volunteerId?: string) {
    const payload = {
        demandId,
        date,
        mainBaseFamilyId,
        isRegistering,
        cityId,
        reason,
        district,
        volunteerId,
        type,
    } as FamilyDemandUpdatePayload;

    return callFunctionWithImpersonation('UpdateFamilyDemand_v3', payload);
}


export function updateDemandTransportation(demandId: string, transpotingVolunteerId: string | undefined) {
    const payload = {
        demandId,
        transpotingVolunteerId,
    } as UpdateDemandTransportationPayload;

    return callFunctionWithImpersonation('UpdateDemandTransportation', payload);
}

export function getFamilyDetails(districtBaseFamilyId: string, district: string, familyDemandId: string | undefined, mainBaseFamilyId: string, includeContacts: boolean): Promise<FamilyDetails> {
    const payload = {
        districtBaseFamilyId, district, includeContacts, familyDemandId, mainBaseFamilyId,
    } as FamilyDetailsPayload;

    return callFunctionWithImpersonation('GetFamilyDetailsNew', payload)
        .then((res: any) => {
            return res.data as FamilyDetails;
        });
}

export function getUserRegistrations(): Promise<FamilyDemand[]> {
    return callFunctionWithImpersonation('GetUserRegistrations_v3', { type: VolunteerType.Any } as GetUserRegistrationsPayload)
        .then((res: any) => res.data);
}

export async function getVolunteerInfo(volunteerId: string): Promise<VolunteerInfo> {
    const getVolunteerInfoFunc = httpsCallable(functions, 'GetVolunteerInfo');
    if (isNotEmpty(volunteerId)) {
        const vip = { volunteerId } as VolunteerInfoPayload;

        return getVolunteerInfoFunc(vip).then(res => res.data as VolunteerInfo);
    }
    return ({
        id: "",
        firstName: "אין",
        lastName: "",
        districts: [{ id: "", name: "אין" }],
        phone: "",
        active: false,
    } as VolunteerInfo)
}


export async function getDemands(dateRange: [string, string], districts: string[] | undefined, familyId: string | undefined, type = VolunteerType.Meal): Promise<FamilyDemand[]> {
    if (!dateRange[0] || !dateRange[1]) return [];

    // No impersonation
    const getDemandsFunc = httpsCallable(functions, 'GetDemands_v4');
    const payload = {
        from: dateRange[0],
        to: dateRange[1],
        districts,
        familyId,
        type,
    } as GetDemandsPayload;
    return getDemandsFunc(payload).then(res => res.data as FamilyDemand[]);
}


export async function getRegisteredHolidays(from: string, to: string): Promise<Holiday[]> {
    const payload = {
        from,
        to,
    } as GetRegisteredHolidaysPayload;

    return httpsCallable(functions, 'GetRegisteredHolidays')(payload).then(res => res.data as Holiday[]);
}

export async function upsertHoliday(holiday: Holiday) {
    const payload = {
        holiday,
    } as UpsertHolidayPayload;

    return httpsCallable(functions, 'UpsertHoliday')(payload);
}

export async function deleteHoliday(id: string) {
    return httpsCallable(functions, 'DeleteHoliday')(id);
}

export async function sendMessage(districts: string[], recipient: Recipient[] | undefined, title: string, body: string) {
    // no impersonation
    const sendMessageFunc = httpsCallable(functions, 'SendMessage');
    const payload = {
        toDistricts: districts,
        toRecipients: recipient && recipient.length > 0 ? recipient.map(r => r.id) : [],
        title,
        body
    } as SendMessagePayload;
    return sendMessageFunc(payload);
}

export async function syncNotifications() {
    // no impersonation
    const loadExistingNotificationsFunc = httpsCallable(functions, 'LoadExistingNotifications');

    return loadExistingNotificationsFunc().then(async result => {
        const serverNotifications = result.data as any[];
        const localNotifications = await readAllNotifications();

        const db = await getDB();

        for (let i = 0; i < serverNotifications.length; i++) {
            // check if the notificaitone exists already
            const oneServerNotif = serverNotifications[i];
            if (!localNotifications.find(ln => ln.title === oneServerNotif.title && ln.body === oneServerNotif.body)) {

                let ch = NotificationChannels.General;
                let dataObj: any = {};
                if (oneServerNotif.data && oneServerNotif.data.length > 2) {
                    dataObj = JSON.parse(oneServerNotif.data);
                    if (dataObj.channel) {
                        ch = dataObj.channel;
                    }
                }

                await db.put('notifications', {
                    id: oneServerNotif.id,
                    title: oneServerNotif.title,
                    body: oneServerNotif.body || "",
                    read: 0,
                    data: dataObj,
                    channel: ch,
                    timestamp: oneServerNotif.timestamp,
                });
            }
        }
    });
}


export async function searchUsers(query: string): Promise<Recipient[]> {
    // no impersonation
    const searchUsersFunc = httpsCallable(functions, 'SearchUsers');
    const payload = {
        query
    } as SearchUsersPayload;

    return searchUsersFunc(payload).then(res => res.data as Recipient[]);
}

export async function generateInstallationLinkForUser(userId: string): Promise<string> {
    const payload = {
        userId,
    } as GenerateLinkPayload;
    return httpsCallable(functions, 'GenerateUserLink')(payload).then(res => res.data as string);
}

export const handleSearchUsers = async (userInfo: UserInfo, query: string) => {
    // Timeout to emulate a network connection
    console.log("query", query)
    const recipients = await searchUsers(query);
    const districts = new Map();
    recipients.forEach(r => {
        let userMahuz = r.districts.length > 0 ? r.districts[0] : "";

        let mahoz = districts.get(userMahuz);
        if (!mahoz) {
            mahoz = {
                districtName: userInfo.districts?.find(d => d.id === userMahuz)?.name || "אחר",
                id: userMahuz,
                users: [],
            }
            districts.set(userMahuz, mahoz);
        }

        mahoz.users.push({
            name: r.name,
            id: r.id,
            phone: r.phone,
        });
    });

    return Array.from(districts.values());
}

export async function searchFamilies(searchStr: string): Promise<FamilyCompact[]> {
    // no impersonation
    const searchFamiliesFunc = httpsCallable(functions, 'SearchFamilies');
    const payload = {
        searchStr
    } as SearchFamilyPayload;

    return searchFamiliesFunc(payload).then(res => res.data as FamilyCompact[]);
}

export const handleSearchFamilies = async (userInfo: UserInfo, query: string) => {
    const families = await searchFamilies(query);
    const districts = new Map();
    families.forEach(r => {
        let familiyDistrict = r.district || "";

        let mahoz = districts.get(familiyDistrict);
        if (!mahoz) {
            mahoz = {
                districtName: userInfo.districts?.find(d => d.id === familiyDistrict)?.name || "אחר",
                id: familiyDistrict,
                families: [],
            }
            districts.set(familiyDistrict, mahoz);
        }

        mahoz.families.push({
            name: r.familyLastName,
            id: r.mainBaseFamilyId,
            // phone: r.phone,
        } as IdName);
    });

    return Array.from(districts.values());
}

export async function getFamilyContacts(familyId: string): Promise<Contact[]> {
    const payload = {
        familyId
    } as FamilyContactsPayload;

    return httpsCallable(functions, 'GetFamilyContacts')(payload)
        .then((res: any) => {
            return res.data as Contact[];
        });
}

export async function upsertContact(contact: Contact, familyId: string) {
    const payload = {
        familyId,
        contact,
    } as FamilyUpsertContactsPayload;

    return httpsCallable(functions, 'UpsertContact')(payload);
}

export async function deleteContact(contactId: string, familyId: string) {
    const payload = {
        familyId,
        contactId,
    } as FamilyDeleteContactPayload;

    return httpsCallable(functions, 'DeleteContact')(payload);
}