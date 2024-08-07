

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions, logger } from "firebase-functions/v2";

// Dependencies for the addMessage function.
import { getFirestore, FieldValue, QueryDocumentSnapshot, DocumentSnapshot } from "firebase-admin/firestore";
// const sanitizer = require("./sanitizer");
// import { initializeApp } from "firebase-admin";
import admin = require("firebase-admin");
import dayjs = require("dayjs");
import utc = require("dayjs/plugin/utc");
import timezone = require("dayjs/plugin/timezone");
import { defineString } from "firebase-functions/params";
import { Collections, GetFamilityAvailabilityPayload, NotificationUpdatePayload, TokenInfo, UpdateUserLoginPayload } from "../../src/types";
import axios from "axios";
// [END Imports]

setGlobalOptions({
    region: "europe-west1",
    serviceAccount: "firebase-adminsdk-i4v9g@born2win-1.iam.gserviceaccount.com",
});
admin.initializeApp();

dayjs.extend(utc);
dayjs.extend(timezone);
const JERUSALEM = "Asia/Jerusalem";

const db = getFirestore();

const born2winApiKey = defineString("BORN2WIN_API_KEY");
const testUser = defineString("BORN2WIN_TEST_USER");
const mainBase = defineString("BORM2WIN_MAIN_BASE");

/**
 * users collection
 * doc-id = volunteerId
 * {
 *   firstName: string,
 *   lastName: string,
 *   uid: [] string, # for search by uid
 *   fingerpring: [] string # for search by fingerprint
 *   loginInfo: [{uid:string, fingerprint:string, createdAt: string}],
 *   notificationTokens: [{token:string, isSafari:boolean, createdAt:string}]
 * }
 */

function findUserByUID(uid: string): Promise<QueryDocumentSnapshot | null> {
    return db.collection(Collections.Users).where("uid", "array-contains", uid).get().then(res => {
        if (res.empty) {
            // no matching users
            return null;
        }
        if (res.docs.length > 1) {
            // not expect - too many results
            return null;
        }
        return res.docs[0];
    });
}

function findUserByFingerprint(fingerprint: string, since: string): Promise<QueryDocumentSnapshot | null> {
    return db.collection(Collections.Users).where("fingerprint", "array-contains", fingerprint).get().then(res => {
        if (res.empty) {
            // no matching users
            return null;
        }
        if (res.docs.length > 1) {
            // take the newest - todo
            console.log("Warnning multiple matches to fingerpring", fingerprint, since);
            return res.docs[0];
        }
        return res.docs[0];
    });
}

function getUserByID(id: string): Promise<DocumentSnapshot | null> {
    return db.collection(Collections.Users).doc(id).get().then(doc => {
        if (doc.exists) {
            return doc;
        }
        return null;
    });
}

exports.UpdateUserLogin = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }
    const uulp = request.data as UpdateUserLoginPayload;
    const now = dayjs().utc().tz(JERUSALEM);
    let doc;
    if (uulp.volunteerID) {
        doc = await getUserByID(uulp.volunteerID);
    } else {
        const since = now.subtract(3, "day");
        doc = await findUserByFingerprint(uulp.fingerprint, since.format("YYYY-MM-DD"));
    }

    // todo - add OTP
    if (doc) {
        if (uulp.volunteerID) {
            if (!(doc.data()?.uid?.find((u:string)=>u == uid) && doc.data()?.fingerprint?.find((f:string)=>f == uulp.fingerprint))) {
                await doc.ref.update({
                    uid: FieldValue.arrayUnion(uid),
                    fingerprint: FieldValue.arrayUnion(uulp.fingerprint),
                    loginInfo: FieldValue.arrayUnion({ uid, createdAt: now.format("YYYY-MM-DD HH:mm:ss"), fingerprint: uulp.fingerprint }),
                });
            }
        } else {
            await doc.ref.update({
                uid: FieldValue.arrayUnion(uid),
                loginInfo: FieldValue.arrayUnion({ uid, createdAt: now.format("YYYY-MM-DD HH:mm:ss"), fingerprint: uulp.fingerprint }),
            });
        }
        // return the volunteerID
        return doc.id;
    } else {
        throw new HttpsError("not-found", uulp.volunteerID ? "Volunteer ID not found" : "Fingerprint not found");
    }
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


    return findUserByUID(uid).then(doc => {
        if (doc) {
            let dirty = false;

            const update: any = {};
            if (unp.notificationOn !== undefined) {
                update.notificationOn = unp.notificationOn;
                dirty = true;
            }

            if (unp.tokenInfo !== undefined) {
                if (doc.data().notificationTokens === undefined || doc.data().notificationTokens.length === 0) {
                    update.notificationTokens = [{ ...unp.tokenInfo, uid }];
                    dirty = true;
                } else {
                    let currNotificationTokens = doc.data().notificationTokens;
                    if (currNotificationTokens.find((nt: TokenInfo) => nt.uid === uid && nt.token === unp.tokenInfo.token)) {
                        // this token already exists for this uid - do nothing
                    } else {
                        currNotificationTokens = currNotificationTokens.filter((nt: TokenInfo) => nt.uid !== uid);
                        currNotificationTokens.push({ ...unp.tokenInfo, uid });
                        update.notificationTokens = currNotificationTokens;
                        dirty = true;
                    }
                }
            }
            if (dirty) {
                return doc.ref.update(update);
            }
        }
        return;
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

    return findUserByUID(uid).then(doc => {
        if (doc) {
            return getWebTokens([doc.id]).then(devices => {
                const displayName = doc.data().firstName + " " + doc.data().lastName;
                logger.info("Test notification for: ", doc.id, displayName, "tokens: ", devices);

                return sendNotification("Born2Win", "הודעת בדיקה ל:\n" + displayName, {
                    navigateTo: "/#2",
                }, devices);
            });
        }
        return;
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

    const users = await db.collection(Collections.Users).get();

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
            const docRef = db.collection(Collections.Users).doc(update.ownerId);
            batch.update(docRef, {
                notificationTokens: update.tokensInfos,
            });
        });
        return batch.commit();
    });
};


exports.GetMealRequests = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }

    const doc = await findUserByUID(uid);
    if (!doc) {
        throw new HttpsError("unauthenticated", "unauthorized user");
    }

    // TODO: Temp defaults to test user
    // const volunteerID = doc.id;
    const volunteerID = testUser.value();
    const apiKey = born2winApiKey.value();
    const airTableNameBase = mainBase.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };

    const response1 = await axios.get(`https://api.airtable.com/v0/${airTableNameBase}/tbl9djJMEErRLjrjk/${volunteerID}`, {
        headers,
    });

    const mahoz = response1.data.fields["מחוז"];
    if (mahoz && mahoz.length > 0) {
        const response2 = await axios.get(`https://api.airtable.com/v0/${airTableNameBase}/%D7%9E%D7%97%D7%95%D7%96/${mahoz[0]}`, {
            headers,
        });

        const baseId = response2.data.fields.base_id;
        const response3 = await axios.get(`https://api.airtable.com/v0/${baseId}/משפחות במחוז?filterByFormula=AND(NOT({דרישות לשיבוצים}=''),({סטטוס בעמותה} = 'פעיל'))&sort[0][field]=שם משפחה של החולה&sort[0][direction]=asc`, {
            headers,
        });
        return response3.data;
    }
    return "District not found";
});


exports.GetFamilityAvailability = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }

    const doc = await findUserByUID(uid);
    if (!doc) {
        throw new HttpsError("unauthenticated", "unauthorized user");
    }

    // TODO: verify user is the same mahuz

    const gfap = request.data as GetFamilityAvailabilityPayload;

    const apiKey = born2winApiKey.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const formula = encodeURIComponent(`AND((FIND("${gfap.familyId}",  ARRAYJOIN({record_id (from משפחה)}))>0),  AND(    ({זמינות שיבוץ}='זמין')    ,IS_AFTER({תאריך},TODAY())    ,IS_BEFORE({תאריך},DATEADD(TODAY(),45,'days')    )))`);
    const query = `https://api.airtable.com/v0/${gfap.baseId}/דרישות לשיבוצים?filterByFormula=${formula}`;

    console.log("Availability Query:", query);
    const response = await axios.get(query, {
        headers,
    });
    return response.data;
});