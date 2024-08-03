

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions, logger } from "firebase-functions/v2";

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

import { NotificationUpdatePayload, TokenInfo, UpdateUserLoginPayload } from "../../src/types";
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

exports.TestNotification = onCall({ cors: true }, request => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }

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
        return getWebTokens([doc.id]).then(devices => {
            const displayName = doc.data().firstName + " " + doc.data().lastName;
            logger.info("Test notification for: ", doc.id, displayName, "tokens: ", devices);

            return sendNotification("Born2Win", "הודעת בדיקה ל:\n" + displayName, {
                navigateTo: "/#2",
            }, devices);
        });
    });
});


interface DeviceInfo {
    ownerId: string,
    tokenInfo: TokenInfo,
}

interface DeviceInfoUpdate {
    ownerId: string,
    tokensInfos: TokenInfo[],
}

async function getWebTokens(to: string[]) {
    const webPushDevices = [] as DeviceInfo[];

    const users = await db.collection(USERS_COLLECTION).get();

    to.forEach(sentToUser => {
        if (sentToUser === "all") {
            users.docs.map(user => {
                user.data().notificationTokens?.forEach((nt: TokenInfo) => {
                    webPushDevices.push({
                        ownerId: user.id,
                        tokenInfo: nt,
                    });
                });
            });
        } else {
            const user = users.docs.find(u => u.id === sentToUser);
            if (user) {
                user.data().notificationTokens?.forEach((nt: TokenInfo) => {
                    webPushDevices.push({
                        ownerId: user.id,
                        tokenInfo: nt,
                    });
                });
            }
        }
    });

    return webPushDevices;
}

const sendNotification = (title: string, body: string, data: any, devices: DeviceInfo[]) => {
    const imageUrl = "https://born2win-1.web.app/favicon.ico";
    const actionUrl = "https://born2win-1.web.app";
    const message = {
        notification: {
            title,
            body,
            imageUrl,
            // TODO actions:Array<{ action: string; icon?: string; title: string; }> An array of notification actions representing the actions available to the user when the notification is presented.
        },
        data,
        webpush: {
            notification: {
                title: title,
                body: body,
                icon: imageUrl,
                click_action: actionUrl,
            },
            fcmOptions: {
                link: actionUrl,
            },
        },
    };

    const waitFor = [] as Promise<void>[];
    const updates = [] as DeviceInfoUpdate[];

    devices.forEach(device => {
        const deviceMessage = {
            ...message,
            token: device.tokenInfo.token,
        };
        waitFor.push(
            admin.messaging().send(deviceMessage)
                .then(() => {
                    let userUpdates = updates.find(u => u.ownerId === device.ownerId);
                    if (!userUpdates) {
                        userUpdates = {
                            ownerId: device.ownerId,
                            tokensInfos: [],
                        } as DeviceInfoUpdate;
                        updates.push(userUpdates);
                    }
                    userUpdates.tokensInfos.push({ ...device.tokenInfo, lastMessageDate: dayjs().format("YYYY-MM-DD HH:mm") });
                })
                .catch(error => {
                    let userUpdate = updates.find(u => u.ownerId === device.ownerId);
                    if (!userUpdate) {
                        userUpdate = {
                            ownerId: device.ownerId,
                            tokensInfos: [],
                        } as DeviceInfoUpdate;
                        updates.push(userUpdate);
                    }

                    console.error("Error sending message to device:", device, error);

                    if (error.errorInfo?.code !== "messaging/registration-token-not-registered") {
                        userUpdate.tokensInfos.push(device.tokenInfo);
                    } // else token is removed
                }),
        );
    });

    return Promise.all(waitFor).finally(() => {
        // update the devices
        const batch = db.batch();
        updates.forEach(update => {
            const docRef = db.collection(USERS_COLLECTION).doc(update.ownerId);
            batch.update(docRef, {
                notificationTokens: update.tokensInfos,
            });
        });
        return batch.commit();
    });
};