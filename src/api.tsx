import { FirebaseApp, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import {
    getAuth, onAuthStateChanged, signInAnonymously,
    signOut,
    setPersistence,
    indexedDBLocalPersistence,
    Auth,
    NextOrObserver,
    User
} from "firebase/auth";
import {
    getFirestore, collection, getDocs, getDoc, doc,
    query, where, orderBy, limit, startAfter,
    updateDoc, setDoc, deleteDoc,
    writeBatch,
    Firestore
} from 'firebase/firestore/lite';
import dayjs from 'dayjs'

import { Functions, getFunctions, httpsCallable } from 'firebase/functions';
import { GetDemandStatPayload, NotificationUpdatePayload, RegistrationRecord, StatsData, TokenInfo, UpdateUserLoginPayload, UserInfo } from "./types";


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
let db: Firestore;
let auth: Auth;
let functions: Functions;

export function init(onAuth: NextOrObserver<User>) {
    if (!app) {
        app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);
        // workaround
        let m_any: any = messaging;
        m_any.vapidKey = VAPID_KEY;

        db = getFirestore(app);
        auth = getAuth(app);

        functions = getFunctions(app, 'europe-west1');
    }
    return setPersistence(auth, indexedDBLocalPersistence).then(() => onAuthStateChanged(auth, onAuth));
}

export function login() {
    signInAnonymously(auth)
        .then((u) => {
            // Signed in..
            console.log("User is authenticated", u.user.uid);
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            // ...
        });
}

export function getUserInfo(): Promise<UserInfo> {
    const getUserInfoFunc = httpsCallable(functions, 'GetUserInfo');
    return getUserInfoFunc().then(res => res.data as UserInfo);
}


export async function getFCMToken() {
    const messaging = getMessaging(app);
    return getToken(messaging, { vapidKey: VAPID_KEY })
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
            throw ("Permission denied to recieve notifications");
        }
    });
}

export async function sendTestNotification() {
    const testNotification = httpsCallable(functions, 'TestNotification');
    console.log("Send test notification")

    return testNotification();
}

export function updateLoginInfo(volunteerId: string | undefined, fingerprint: string): any {
    const updateLoginInfoFunc = httpsCallable(functions, 'UpdateUserLogin');
    const uulp = { fingerprint } as UpdateUserLoginPayload;
    if (volunteerId && fingerprint.length > 0) {
        uulp.volunteerID = volunteerId;
    }

    return updateLoginInfoFunc(uulp).then(res => res.data);
}

export async function updateUserNotification(notificationOn: boolean | undefined, token: string, isSafari: boolean) {
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

export interface Family {
    id: string;
    fields: {
        [key: string]: any;
        'Name': string;
        'עיר': string;
        'גיל החולה': string;
        'העדפה לסוג ארוחה': string[];
        'כשרות מטבח': string;
        'אוהבים לאכול': string;
        'רגישויות ואלרגיות (from בדיקת ההתאמה)': string;
        'נפשות מבוגרים בבית': string;
        'גילאים של הרכב המשפחה': string;
        'מחוז': string;
        'קומה': string;
        base_id: string;
    };
}

export function getMealRequests(): Promise<Family[]> {
    const getMealRequestsFunc = httpsCallable(functions, 'GetMealRequests');
    return getMealRequestsFunc().then((res: any) => res.data.records as Family[]);
}


export interface Availability {
    id: string;
    createdTime: string;
    fields: {
        [key: string]: any;
        'Name': string;
        "תעדוף": string;
        "תאריך": string;
        "יום בשבוע1": string;
    }
}

export function getFamilyAvailability(familyId: string, baseId: string): Promise<Availability[]> {
    const GetFamilityAvailabilityFunc = httpsCallable(functions, 'GetFamilityAvailability');
    const payload = {
        familyId,
        baseId,
    };

    return GetFamilityAvailabilityFunc(payload).then((res: any) => {
        return res.data.records as Availability[];
    });
}

export function getFamilyDetails(familyId: string, baseId: string) {
    const getFamilyDetailsFunc = httpsCallable(functions, 'GetFamilyDetails');
    const payload = {
        familyId,
        baseId,
    };

    return getFamilyDetailsFunc(payload).then((res: any) => {
        return res.data as Family;
    });
}

export function getUserRegistrations(): Promise<RegistrationRecord[]> {
    const getUserRegistrationsFunc = httpsCallable(functions, 'GetUserRegistrations');
    return getUserRegistrationsFunc().then((res: any) => res.data.records.map((rec: any) => {
        return {
            id: rec.id,
            date: rec.fields["תאריך"],
            city: rec.fields["עיר"][0],
            familyLastName: rec.fields["שם משפחה של החולה"],
            weekday: rec.fields["יום בשבוע1"],
            familyId: rec.fields["משפחה"][0],
        } as RegistrationRecord;
    }));
}


export async function getDemandStats(dateRange: [Date | null, Date | null], districts: string[]): Promise<StatsData> {
    if (!dateRange[0] || !dateRange[1]) return { totalDemands: [0], fulfilledDemands: [0], labels: [""] }

    const getDemandStatsFunc = httpsCallable(functions, 'GetDemandStats');
    const payload = {
        from: dateRange[0].toUTCString(),
        to: dateRange[1].toUTCString(),
        districts
    } as GetDemandStatPayload;
    return getDemandStatsFunc(payload).then(res => res.data as StatsData);
}
