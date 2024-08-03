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
import { NotificationUpdatePayload, UpdateUserLoginPayload } from "./types";

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
    setPersistence(auth, indexedDBLocalPersistence).then(() => onAuthStateChanged(auth, onAuth));
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

export async function sendTestNotification(uid: string) {
    const testNotification = httpsCallable(functions, 'testNotification');
    console.log("Send test notification", uid)
    const payload = {
        displayName: uid
    };

    return testNotification(payload);
}

export function updateLoginInfo(volunteerId: string) {
    const updateLoginInfoFunc = httpsCallable(functions, 'UpdateUserLogin');
    const uulp = { volunteerID: volunteerId } as UpdateUserLoginPayload;

    return updateLoginInfoFunc(uulp);
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


