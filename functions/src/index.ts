

import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
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
import { Collections, FamilityIDPayload, NotificationUpdatePayload, TokenInfo, UpdateUserLoginPayload, UserRecord } from "../../src/types";
import axios from "axios";
import express = require("express");
import crypto = require("crypto");

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
const mainBase = defineString("BORM2WIN_MAIN_BASE");

const usersWebHookID = defineString("BORM2WIN_AT_WEBHOOK_USERS_ID");
const usersWebHookMacSecretBase64 = defineString("BORM2WIN_AT_WEBHOOK_USERS_MAC");
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
            if (!(doc.data()?.uid?.find((u: string) => u == uid) && doc.data()?.fingerprint?.find((f: string) => f == uulp.fingerprint))) {
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

async function authenticate(request: CallableRequest<any>): Promise<QueryDocumentSnapshot> {
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
    return doc;
}

let districts: District[] | undefined = undefined;
interface District {
    id: string;
    base_id: string;
    demandsTable: string;
    familiesTable: string;
}

async function getDestricts(): Promise<District[]> {
    if (!districts) {
        // districts are cached
        const apiKey = born2winApiKey.value();
        const airTableMainBase = mainBase.value();
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };

        const districtResponse = await axios.get(`https://api.airtable.com/v0/${airTableMainBase}/מחוז`, {
            headers,
        });
        districts = districtResponse.data.records.map((r: any) => ({
            id: r.id,
            base_id: r.fields.base_id,
            demandsTable: r.fields.table_id,
            familiesTable: r.fields.table_familyid,
        }));
    }
    return districts || [];
}

exports.GetMealRequests = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    const mahoz = doc.data().mahoz;

    if (mahoz && mahoz.length > 0) {
        const apiKey = born2winApiKey.value();
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };
        const mahuzRec = (await getDestricts()).find((d: any) => d.id === mahoz);
        if (mahuzRec) {
            const baseId = mahuzRec.base_id;
            const districtFamilies = await axios.get(`https://api.airtable.com/v0/${baseId}/משפחות במחוז?filterByFormula=AND(NOT({דרישות לשיבוצים}=''),({סטטוס בעמותה} = 'פעיל'))&sort[0][field]=שם משפחה של החולה&sort[0][direction]=asc`, {
                headers,
            });
            return districtFamilies.data;
        }
    }
    return "District not found";
});


exports.GetFamilityAvailability = onCall({ cors: true }, async (request) => {
    await authenticate(request);
    const gfp = request.data as FamilityIDPayload;

    // TODO: verify user is the same mahuz
    const apiKey = born2winApiKey.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const formula = encodeURIComponent(`AND((FIND("${gfp.familyId}",  ARRAYJOIN({record_id (from משפחה)}))>0),AND(({זמינות שיבוץ}='זמין'),IS_AFTER({תאריך},TODAY()),IS_BEFORE({תאריך},DATEADD(TODAY(),45,'days'))))`);
    const query = `https://api.airtable.com/v0/${gfp.baseId}/דרישות לשיבוצים?filterByFormula=${formula}`;

    console.log("Availability Query:", query);
    const response = await axios.get(query, {
        headers,
    });
    return response.data;
});


exports.GetUserRegistrations = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    let mahoz = doc.data().mahoz;
    let volunteerId = doc.id;

    // todo temp fixed dummie data
    volunteerId = "recpvp2E7B5yEywPi";
    mahoz = "recP17rsfOseG3Frx";

    if (mahoz && mahoz.length > 0) {
        const apiKey = born2winApiKey.value();
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };
        const mahuzRec = (await getDestricts()).find((d: any) => d.id === mahoz);
        if (mahuzRec) {
            const baseId = mahuzRec.base_id;
            const formula = encodeURIComponent(`{volunteer_id}='${volunteerId}'`);
            const userRegistrations = await axios.get(`https://api.airtable.com/v0/${baseId}/דרישות לשיבוצים?filterByFormula=${formula}&sort[0][field]=תאריך&sort[0][direction]=desc`, {
                headers,
            });
            return userRegistrations.data;
        }
    }
    return [];
});

exports.GetFamilyDetails = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    const gfp = request.data as FamilityIDPayload;
    let mahoz = doc.data().mahoz;

    // todo - fix the mahoz for dummie data
    mahoz = "recP17rsfOseG3Frx";

    const mahuzRec = (await getDestricts()).find((d: any) => d.id === mahoz);
    if (mahuzRec) {
        const apiKey = born2winApiKey.value();
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };
        const baseId = mahuzRec.base_id;
        const familiesTable = mahuzRec.familiesTable;

        const userRegistrations = await axios.get(`https://api.airtable.com/v0/${baseId}/${familiesTable}/${gfp.familyId}`, {
            headers,
        });
        return userRegistrations.data;
    }
    throw new HttpsError("not-found", "Family not found");
});

/**
 * WEB HOOKS
 */
const app = express();
app.use(express.json());

function verifyAirtableWebhook(req: any, secret: string) {
    const macSecretDecoded = Buffer.from(secret, "base64");
    const body = Buffer.from(JSON.stringify(req.body), "utf8");
    const hmac = crypto.createHmac("sha256", macSecretDecoded);
    hmac.update(body.toString(), "ascii");
    const expectedContentHmac = "hmac-sha256=" + hmac.digest("hex");

    const providedHmac = req.headers["x-airtable-content-mac"];

    return providedHmac === expectedContentHmac;
}

app.post("/airtable/users", (req, res) => {
    if (!verifyAirtableWebhook(req, usersWebHookMacSecretBase64.value())) {
        logger.info("Airtable Users Webhook GET: unverified", req.headers["x-airtable-content-mac"], JSON.stringify(req.body));
        return res.status(403).send("Unauthorized request");
    }
    logger.info("Airtable Users Webhook GET: ", JSON.stringify(req.body));

    return syncBorn2WinUsers(dayjs().subtract(10, "minute")).then(() => {
        res.json({});
        return;
    });
});

exports.httpApp = onRequest(app);


/**
 * SCHEDULING
 */
/** Schedules:
 * desc: for logs
 * min: the minute in the hour, or * for every minute
 * hour: a number or an array of numbers - the hour in the day to run the scheduled task, * for every hour
 * weekday: day in the week 0-Sat, 1-Sun,..., * for every day
 * callback: an async function to call at the scheduled time
*/

const schedules = [
    { desc: "Reminder on Sunday at 18:00", min: 0, hour: [18], weekDay: 1, callback: remindVolunteersToRegister },
    { desc: "Refresh webhook registration", min: 0, hour: [0], weekDay: "*", callback: refreshWebhookToken },
    { desc: "Sync Born2Win users daily", min: 0, hour: [17], weekDay: "*", callback: syncBorn2WinUsers },
];

function check(obj: any, fieldName: string, value: any) {
    const expectedValue = obj && obj[fieldName];
    if (expectedValue == "*") return true;
    if (expectedValue === value) return true;

    if (Array.isArray(expectedValue)) {
        return expectedValue.some(v => v === value);
    }
    return false;
}


exports.doSchedule = onSchedule({
    schedule: "every 1 minutes",
    timeZone: "Asia/Jerusalem",
    region: "europe-west1",
}, async () => {
    const now = dayjs().utc().tz(JERUSALEM);
    const waitFor = [] as Promise<any>[];
    schedules.forEach(schedule => {
        if (check(schedule, "min", now.minute()) &&
            check(schedule, "hour", now.hour()) &&
            check(schedule, "weekDay", now.day())) {
            logger.info("Scheduled Task", schedule.desc, now.format("YYYY-MM-DD HH:mm:ss"));
            waitFor.push(schedule.callback());
        }
    });

    await Promise.all(waitFor);
});


async function remindVolunteersToRegister() {
    // TODO
}

async function refreshWebhookToken() {
    const webhookID = usersWebHookID.value();
    const airTableMainBase = mainBase.value();
    const apiKey = born2winApiKey.value();

    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };

    return axios.post(`https://api.airtable.com/v0/bases/${airTableMainBase}/webhooks/${webhookID}/refresh`, {
        headers,
    });
}

async function syncBorn2WinUsers(sinceDate?: any) {
    let offset = null;
    let count = 0;
    let countActive = 0;
    const airTableMainBase = mainBase.value();
    const apiKey = born2winApiKey.value();
    if (!sinceDate) {
        sinceDate = dayjs().subtract(25, "hour");
    }
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss[z]");
    const newLinksToAdmin = [] as string[];

    const url = `https://api.airtable.com/v0/${airTableMainBase}/מתנדבים`;
    const batch = db.batch();
    const seenUsers: any = {};
    const duplicates: any = [];
    do {
        const response: any = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            params: {
                filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל"],
                offset: offset,
            },
        });
        offset = response.data.offset;
        count += response.data.records.length;
        countActive += response.data.records.filter((user: any) => user.fields["פעיל"] == "פעיל").length;
        for (let i = 0; i < response.data.records.length; i++) {
            const user = response.data.records[i];
            const userId = user.fields.record_id;
            if (seenUsers[userId]) {
                duplicates.push(userId);
                continue;
            }

            seenUsers[userId] = true;
            const docRef = db.collection(Collections.Users).doc(userId);
            const userDoc = await docRef.get();

            const userRecord = {
                active: user.fields["פעיל"] == "פעיל",
                firstName: user.fields["שם פרטי"],
                lastName: user.fields["שם משפחה"],
                lastModified: now,
            } as UserRecord;

            if (userDoc && userDoc.exists) {
                const prevUserRecord = userDoc.data();
                if (prevUserRecord &&
                    userRecord.active === prevUserRecord.active &&
                    userRecord.firstName === prevUserRecord.firstName &&
                    userRecord.lastName === prevUserRecord.lastName) {
                    // No change!
                    continue;
                }

                // update it
                if (prevUserRecord && userRecord.active !== prevUserRecord.active && userRecord.active) {
                    // user has changed to active, add OTP and send it to admins
                    userRecord.otp = crypto.randomUUID();
                }
                batch.update(userDoc.ref, userRecord as any);
            } else {
                // create new
                if (userRecord.active) {
                    userRecord.otp = crypto.randomUUID();
                }
                batch.create(docRef, userRecord);
            }
            if (userRecord.otp) {
                newLinksToAdmin.push(getRegistrationLink(userId, userRecord.otp));
            }
        }
    } while (offset);

    return batch.commit().then(() => {
        logger.info("Sync Users: obsered modified:", count, "observed Active", countActive, "registrationLinks", newLinksToAdmin, "duplicates:", duplicates);
        if (newLinksToAdmin.length > 0) {
            return getWebTokens(["arielb"]).then(tokens => {
                return sendNotification("New Link", newLinksToAdmin[0], undefined, tokens);
            });
        }
        return;
    });
}

function getRegistrationLink(userId: string, otp: string): string {
    return `https://born2win-1.web.app?vol_id=${userId}&otp=${otp}`;
}

// exports.TestSync = onCall({ cors: true }, async () => {
//     logger.info("Start test sync");
//     try {
//         return syncBorn2WinUsers();
//     } catch (e) {
//         logger.info("error test sync", e);
//     }
// });