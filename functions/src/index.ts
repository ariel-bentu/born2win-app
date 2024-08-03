

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

// Dependencies for the addMessage function.
import { getFirestore, FieldValue } from "firebase-admin/firestore";
// const sanitizer = require("./sanitizer");
// import { initializeApp } from "firebase-admin";
import admin = require("firebase-admin");
import dayjs = require("dayjs");
import utc = require("dayjs/plugin/utc");
import timezone = require("dayjs/plugin/timezone");
// [END Imports]

setGlobalOptions({
    region: "europe-west1",
    serviceAccount: "firebase-adminsdk-i4v9g@born2win-1.iam.gserviceaccount.com",
});
admin.initializeApp();

dayjs.extend(utc);
dayjs.extend(timezone);
const JERUSALEM = "Asia/Jerusalem";

const USERS_COLLECTION = "users";

import { NotificationUpdatePayload, UpdateUserLoginPayload } from "../../src/types";
const db = getFirestore();

/**
 * users collection
 * doc-id = volunteerId
 * {
 *   firstName: string,
 *   lastName: string,
 *   uid: [] string,
 *   loginInfo: [{uid:string, createdAt: string}],
 *   notificationTokens: [{token:string, isSafari:boolean, createdAt:string}]
 * }
 */

exports.UpdateUserLogin = onCall({ cors: true }, request => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }
    const uulp = request.data as UpdateUserLoginPayload;

    // todo - add OTP
    return db.collection(USERS_COLLECTION).doc(uulp.volunteerID).get().then(doc => {
        if (doc.exists) {
            const now = dayjs().utc().tz(JERUSALEM).format("YYYY-MM-DD HH:mm:ss");

            doc.ref.update({
                uid: FieldValue.arrayUnion(uid),
                loginInfo: FieldValue.arrayUnion({ uid, createdAt: now }),
            });
        } else {
            throw new HttpsError("not-found", "Volunteer ID not found");
        }
    });
});

exports.UpdateNotification = onCall({ cors: true }, request => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }
    const unp = request.data as NotificationUpdatePayload;


    return db.collection(USERS_COLLECTION).where("uid", "array-contains", uid).get().then(res => {
        if (res.empty) {
            // no matching users
            return;
        }
        if (res.docs.length > 1) {
            // not expect - too many results
            return;
        }
        const doc = res.docs[0];

        const update: any = {};
        if (unp.notificationOn !== undefined) {
            update.notificationOn = unp.notificationOn;
        }

        if (unp.tokenInfo !== undefined) {
            if (doc.data().notificationTokens === undefined || !doc.data().notificationTokens.find((nt: any) => nt.token === unp.tokenInfo.token)) {
                update.notificationTokens = FieldValue.arrayUnion(unp.tokenInfo);
            }
        }

        return doc.ref.update(update);
    });
});