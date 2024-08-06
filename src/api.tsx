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
import { Collections, NotificationUpdatePayload, TokenInfo, UpdateUserLoginPayload, UserInfo } from "./types";
import { isPWA } from "./App";

const firebaseConfig = {
    apiKey: "AIzaSyDC7Yz2zm6DB7WgQHZ_HDojIHzkHwXU4hk",
    authDomain: "born2win-1.firebaseapp.com",
    projectId: "born2win-1",
    storageBucket: "born2win-1.appspot.com",
    messagingSenderId: "244359776136",
    appId: "1:244359776136:web:d7685c4a14714bd2129c3d",
    measurementId: "G-YFG1BK8564"
};

const VAPID_KEY = "BKoNH8dLa3kdG_u6ZPU1AAM56o4SCqmhXYkTwGwpI8VIEHx5xAQek4HhKVpPTb-dhMBPwM761w6T57tPPisLQL8";

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

export function getUserInfo(uid: string, volunteerId: string): Promise<UserInfo> {
    let docRef = doc(db, Collections.Users, volunteerId);
    const unknwon =  {
        firstName: "לא ידוע",
        lastName:"",
        notificationOn: false,
        notificationToken: undefined,
    }

    return getDoc(docRef).then(doc => {
        const data = doc.data();
        if (!doc.exists || !data) {
            console.log(doc)
            return unknwon;
        }
        return ({
            notificationToken: data.notificationTokens?.find((tokenInfo: TokenInfo) => tokenInfo.uid === uid),
            firstName: data.firstName,
            lastName: data.lastName,
            notificationOn: data.notificationOn === true,
        });
    })
        .catch((err) => {
            console.log(err.message);
            //throw new Error("חשבונך אינו פעיל - יש לפנות למנהל המערכת")
            return unknwon
        });
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
    };
}

export function getMealRequests(): Promise<Family[]> {
    const getMealRequestsFunc = httpsCallable(functions, 'GetMealRequests');
    return getMealRequestsFunc().then((res: any) => res.data.records as Family[]);
}

