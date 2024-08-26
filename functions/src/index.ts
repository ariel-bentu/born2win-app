

import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions, logger } from "firebase-functions/v2";

// Dependencies for the addMessage function.
import { getFirestore, FieldValue, QueryDocumentSnapshot, DocumentSnapshot, FieldPath } from "firebase-admin/firestore";
// const sanitizer = require("./sanitizer");
// import { initializeApp } from "firebase-admin";
import admin = require("firebase-admin");
import dayjs = require("dayjs");
import utc = require("dayjs/plugin/utc");
import timezone = require("dayjs/plugin/timezone");
import { defineString } from "firebase-functions/params";
import {
    AirTableRecord, Collections, FamilityDemandUpdatePayload, FamilyDemand, FamilyDetails, GetDemandStatPayload, LoginInfo,
    NotificationActions, NotificationUpdatePayload, Recipient, SearchUsersPayload, SendMessagePayload, SendNotificationStats, StatsData, TokenInfo, UpdateUserLoginPayload, UserInfo, UserRecord,
    FamilityDetailsPayload,
} from "../../src/types";
import axios from "axios";
import express = require("express");
import crypto = require("crypto");
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { IL_DATE } from "../../src/utils";
import localeData = require("dayjs/plugin/localeData");

// [END Imports]

setGlobalOptions({
    region: "europe-west1",
});
admin.initializeApp();

dayjs.extend(utc);
dayjs.extend(timezone);
require("dayjs/locale/he");


dayjs.extend(localeData);
dayjs.locale("he");

const JERUSALEM = "Asia/Jerusalem";
const DATE_TIME = "YYYY-MM-DD HH:mm";
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

function findUserByFingerprint(fingerprint: string): Promise<QueryDocumentSnapshot | null> {
    return db.collection(Collections.Users).where("fingerprint", "==", fingerprint).get().then(res => {
        if (res.empty) {
            // no matching users
            return null;
        }
        if (res.docs.length > 1) {
            // take the newest - todo
            console.log("Warnning multiple matches to fingerpring", fingerprint);
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
/**
 * Associate a uid with user in the db
 * uid is generated to the device, and persisted using anonymousLogin - so by itself cannot be trusted
 * prerequisite: user with the volunteerId (as its id) already in the DB
 * Association phases:
 * Android:
 *  in android the browser and PWA share the same storage space, so same uid. Thus, one phase is enough
 *  - Browser with parameters vid=<xyz> and otp=<123> is opened
 *  - browser does anonymousLogin and then calls UpdateUserLogin (containing uid (in auth), vid, otp, isIOS=false)
 *    - the otp is validated: match vid in db, and no older than 30 days max
 *    - if matches: otp is deleted and uid is associated with the user.
 *    - user is set -  no otp or fingerpring is left.
 *  - browser saves the volunteerId in localStoragethe and *does not* logout!
 *  - PWA always expects to find the volunteerId and auth/uid and is ready to work
 *
 * iOS:
 *  in iOS, the browser which starts the process does not share the same device storage space, thus we use fingerprint.
 *  (see clientjs for info)
 *  - Phase 1:
 *    - Browser with parameters vid=<xyz> and otp=<123> is opened
 *    - browser does anonymousLogin, calculates a fingerprint and then then calls UpdateUserLogin (containing uid (in auth), vid, otp, fingerpring, isIOS=true)
 *    - the otp is validated: match vid in db, and no older than 30 days max
 *    - fingerprint is associated with user
 *    - otp is deleted (waiting for the iOS as PWA to come with fingerprint as otp)
 *    - if success, browser logs out from firebase
 *  - Phase 2:
      - PWA was installed, it logs in (gets new uid) and calculates fingerprint
      - PWA calls this function with fingerprint as otp (uid, fingerprint)
      - a user with that fingerprint is searched. if found, validate: fingerprint was set not older than 1 day
      - uid is associated with the user
      - user is set - no otp or fingerpring is left
      - PWA saves the volunteerId in localStorage, to know it is paired for future times
 */
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

    if (uulp.volunteerId) {
        // Androing or iOS phase 1
        // -----------------------
        doc = await getUserByID(uulp.volunteerId);
        if (!doc) {
            throw new HttpsError("not-found", "Volunteer ID not found");
        }

        // Validate OTP (for Android and Phase 1 of iOS)
        const devOtp = doc.data()?.devOtp;
        const otpValid = devOtp ?
            uulp.otp === devOtp :
            validateOTPOrFingerprint(uulp.otp, doc.data()?.otp, doc.data()?.otpCreatedAt, 30);

        if (!otpValid) {
            throw new HttpsError("invalid-argument", "Invalid or expired OTP");
        }

        if (uulp.isIOS && !uulp.fingerprint) {
            throw new HttpsError("invalid-argument", "Missing fingerpring");
        }
        const update: any = uulp.isIOS ?
            {
                // leave otp for cases they refresh the browser
                fingerprint: uulp.fingerprint,
                otpCreatedAt: now.format(DATE_TIME),
            } :
            {
                otp: FieldValue.delete(),
                otpCreatedAt: FieldValue.delete(),
            };

        if ((devOtp || !uulp.isIOS) && !doc.data()?.loginInfo?.find((li: LoginInfo) => li.uid === uid)) {
            update.uid = FieldValue.arrayUnion(uid);
            update.loginInfo = FieldValue.arrayUnion({ uid, createdAt: now.format(DATE_TIME), isIOS: uulp.isIOS } as LoginInfo);
        }

        await doc.ref.update(update);

        // Return volunteerID
        return doc.id;
    } else if (uulp.fingerprint && uulp.isIOS) {
        // Phase 2 of iOS
        doc = await findUserByFingerprint(uulp.fingerprint);

        if (!doc) {
            throw new HttpsError("not-found", "Fingerprint not found");
        }
        const devOtp = doc.data()?.devOtp;

        const fpValid = validateOTPOrFingerprint(uulp.fingerprint, doc.data()?.fingerprint, doc.data()?.otpCreatedAt, 1);
        if (!fpValid) {
            throw new HttpsError("invalid-argument", "Invalid or expired Fingerpring");
        }
        // Update UID based on fingerprint (iOS Phase 2)
        const update: any = {
            uid: FieldValue.arrayUnion(uid),
            otp: FieldValue.delete(),
            loginInfo: FieldValue.arrayUnion({ uid, createdAt: now.format(DATE_TIME), isIOS: true }),
        };
        if (!devOtp) {
            update.fingerprint = FieldValue.delete();
            update.otpCreatedAt = FieldValue.delete();
        }

        await doc.ref.update(update);

        // Return volunteerID for Phase 2
        return doc.id;
    } else {
        throw new HttpsError("invalid-argument", "Missing volunteerID or fingerprint");
    }
});

function validateOTPOrFingerprint(token: string | undefined, savedToken: string | string, createdAt: string, validForDays: number): boolean {
    logger.info("validate otp. token:", token, "savedToken:", savedToken, "ca", createdAt, "days", validForDays);
    if (!token || !savedToken) return false;

    return (token === savedToken && dayjs(createdAt).isAfter(dayjs().subtract(validForDays, "day")));
}

exports.UpdateNotification = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    const uid = request.auth?.uid || "";
    if (doc) {
        const unp = request.data as NotificationUpdatePayload;
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


exports.GetUserInfo = onCall({ cors: true }, getUserInfo);

async function getUserInfo(request: CallableRequest<any>): Promise<UserInfo> {
    const doc = await authenticate(request);
    if (doc) {
        const data = doc.data();
        const response = {
            id: doc.id,
            isAdmin: false,
            notificationToken: data.notificationTokens?.find((tokenInfo: TokenInfo) => tokenInfo.uid === request.auth?.uid),
            firstName: data.firstName,
            lastName: data.lastName,
            notificationOn: data.notificationOn,
        } as UserInfo;

        return db.collection(Collections.Admins).doc(doc.id).get().then(async (adminDoc) => {
            if (adminDoc.exists) {
                response.isAdmin = true;
                const allDistricts = await getDestricts();
                if (adminDoc.data()?.districts.length > 0 && adminDoc.data()?.districts[0] === "all") {
                    response.districts = allDistricts.map(d => ({ id: d.id, name: d.name }));
                } else {
                    response.districts = [];
                    adminDoc.data()?.districts?.forEach((did: string) => {
                        const district = allDistricts.find(d => d.id === did);
                        if (district) {
                            response.districts?.push({
                                id: did,
                                name: district.id,
                            });
                        }
                    });
                }
            }
            return response;
        });
    }
    return {
        isAdmin: false,
        firstName: "לא ידוע",
        lastName: "",
        notificationOn: false,
        notificationToken: undefined,
    };
}

exports.TestNotification = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    if (doc) {
        const displayName = doc.data().firstName + " " + doc.data().lastName;
        return addNotificationToQueue("הודעת בדיקה", "הודעת בדיקה ל:\n" + displayName, [], [doc.id]);
    }

    return;
});

exports.SearchUsers = onCall({ cors: true }, async (request): Promise<Recipient[]> => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const sup = request.data as SearchUsersPayload;
        const query = sup.query;
        if (query.length < 0) {
            return [];
        }

        const baseQuery = db.collection(Collections.Users).where("active", "==", true);
        const firstNameQuery = baseQuery
            .where("firstName", ">=", query)
            .where("firstName", "<", query + "\uf8ff"); // The \uf8ff character is the last character in the Unicode range

        const lastNameQuery = baseQuery
            .where("lastName", ">=", query)
            .where("lastName", "<", query + "\uf8ff");

        const [firstNameSnapshot, lastNameSnapshot] = await Promise.all([firstNameQuery.get(), lastNameQuery.get()]);

        const users = new Map();

        firstNameSnapshot.forEach(doc => users.set(doc.id, doc));
        lastNameSnapshot.forEach(doc => users.set(doc.id, doc));

        return Array.from(users.values()).map(u => ({
            name: u.data().firstName + " " + u.data().lastName,
            id: u.id,
            mahoz: u.data().mahoz,
        }));
    }
    throw new HttpsError("unauthenticated", "Only admin can send message.");
});

async function addNotificationToQueue(title: string, body: string, toDistricts: string[], toRecipients: string[], data?: { [key: string]: string }) {
    const docRef = db.collection(Collections.Notifications).doc();
    return docRef.create({
        title,
        body,
        ...(data && { data: JSON.stringify(data) }),
        toDistricts,
        toRecipients,
        created: dayjs().format(DATE_TIME),
    }).then(() => docRef.id);
}

exports.OnNotificationAdded = onDocumentCreated(`${Collections.Notifications}/{docId}`, async (event) => {
    if (event.data) {
        const payloadData = event.data.data();
        const { title, body, toRecipients, toDistricts } = payloadData;
        const data = payloadData.data ? JSON.parse(payloadData.data) : undefined;

        const waitFor = [];
        if (toRecipients && toRecipients.length > 0) {
            const devices = await getWebTokens(toRecipients);
            waitFor.push(sendNotification(title, body, devices, data));
        }

        if (toDistricts && toDistricts.length > 0) {
            for (let i = 0; i < toDistricts.length; i++) {
                const devices = await getWebTokens(`district:${toDistricts[i]}`);
                waitFor.push(sendNotification(title, body, devices, data));
            }
        }

        const results = await Promise.all(waitFor);

        const delivery = {
            successCount: 0,
            errorCount: 0,
        } as SendNotificationStats;

        results.forEach(r => {
            delivery.errorCount += r.errorCount;
            delivery.successCount += r.successCount;
        });

        await event.data?.ref.update({
            delivery,
        });
    } else {
        logger.info("OnNotificationAdded missing. id=", event.params.docId);
    }
    return;
});

exports.SendMessage = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const smp = request.data as SendMessagePayload;

        return addNotificationToQueue(smp.title, smp.body, smp.toDistricts, smp.toRecipients);
    }

    throw new HttpsError("unauthenticated", "Only admin can send message.");
});

interface DeviceInfo {
    ownerId: string,
    tokenInfo: TokenInfo,
}

interface DeviceInfoUpdate {
    ownerId: string,
    tokensInfos: TokenInfo[],
}

/**
 * getWebTokens
 * @param to may be an array volunteerIds, or a string "all", or a string with this format: "district:<districtId>"
 *
 * the users are filtered to only active users and only those who notificationOn=true
 * @returns array of DeviceInfo
 */

async function getWebTokens(to: string | string[]): Promise<DeviceInfo[]> {
    const webPushDevices = [] as DeviceInfo[];
    const usersRef = db.collection("users").where("active", "==", true).where("notificationOn", "==", true);

    if (typeof to === "string") {
        // Case 1: "all" - select all active users
        if (to === "all") {
            const activeUsersSnapshot = await usersRef.get();
            activeUsersSnapshot.forEach(user => {
                user.data().notificationTokens?.forEach((nt: TokenInfo) => {
                    webPushDevices.push({
                        ownerId: user.id,
                        tokenInfo: nt,
                    });
                });
            });

            // Case 2: district:xyz - select users based on district
        } else if (to.startsWith("district:")) {
            const districtId = to.split(":")[1];
            const districtUsersSnapshot = await usersRef.where("mahoz", "==", districtId).get();
            districtUsersSnapshot.forEach(user => {
                user.data().notificationTokens?.forEach((nt: TokenInfo) => {
                    webPushDevices.push({
                        ownerId: user.id,
                        tokenInfo: nt,
                    });
                });
            });
        }
    } else if (Array.isArray(to)) {
        // Case 3: Array of doc-ids

        if (to.length < 50) {
            // Chunk doc-ids and perform a batched query
            const chunks = chunkArray(to, 10); // Assuming you want to query in chunks of 10
            for (const chunk of chunks) {
                const chunkedUsersSnapshot = await usersRef.where(FieldPath.documentId(), "in", chunk).get();
                chunkedUsersSnapshot.forEach(user => {
                    user.data().notificationTokens?.forEach((nt: TokenInfo) => {
                        webPushDevices.push({
                            ownerId: user.id,
                            tokenInfo: nt,
                        });
                    });
                });
            }
        } else {
            // Query all active users if array length >= 50
            const activeUsersSnapshot = await usersRef.get();
            activeUsersSnapshot.forEach(user => {
                user.data().notificationTokens?.forEach((nt: TokenInfo) => {
                    webPushDevices.push({
                        ownerId: user.id,
                        tokenInfo: nt,
                    });
                });
            });
        }
    }

    return webPushDevices;
}

// Utility function to chunk an array into smaller arrays
function chunkArray(array: any[], chunkSize: number) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

const sendNotification = (title: string, body: string, devices: DeviceInfo[], data?: { [key: string]: string },): Promise<SendNotificationStats> => {
    // logger.info("sendNotification", title, body, data, devices);

    const imageUrl = "https://born2win-prod.web.app/favicon.ico";
    const actionUrl = "https://born2win-prod.web.app";
    const message: any = {
        notification: {
            title,
            body,
            imageUrl,
            // TODO actions:Array<{ action: string; icon?: string; title: string; }> An array of notification actions representing the actions available to the user when the notification is presented.
        },
        webpush: {
            notification: {
                title: title,
                body: body,
                icon: imageUrl,
                click_action: actionUrl,
                data,
            },
            fcmOptions: {
                link: actionUrl,
            },
        },
    };

    const waitFor = [] as Promise<void>[];
    const updates = [] as DeviceInfoUpdate[];
    let successCount = 0;

    devices.forEach(device => {
        const deviceMessage = {
            ...message,
            token: device.tokenInfo.token,
        };
        waitFor.push(
            admin.messaging().send(deviceMessage)
                .then(() => {
                    successCount++;
                    let userUpdates = updates.find(u => u.ownerId === device.ownerId);
                    if (!userUpdates) {
                        userUpdates = {
                            ownerId: device.ownerId,
                            tokensInfos: [],
                        } as DeviceInfoUpdate;
                        updates.push(userUpdates);
                    }
                    userUpdates.tokensInfos.push({ ...device.tokenInfo, lastMessageDate: dayjs().format(DATE_TIME) });
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

    return Promise.all(waitFor).then(() => {
        // update the devices
        const batch = db.batch();
        updates.forEach(update => {
            const docRef = db.collection(Collections.Users).doc(update.ownerId);
            batch.update(docRef, {
                notificationTokens: update.tokensInfos,
            });
        });
        return batch.commit();
    }).then(() => ({ successCount, errorCount: devices.length - successCount }));
};

async function authenticate(request: CallableRequest<any>): Promise<QueryDocumentSnapshot> {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }

    const impersonateUser = request.data.impersonateUser;

    // TEMP anonymous access - remove after app-adoption
    if (impersonateUser && impersonateUser.startsWith("OLD:")) {
        const oldAccessUserID = impersonateUser.substring(4);
        const impersonateDoc = await getUserByID(oldAccessUserID);
        if (!impersonateDoc) {
            throw new HttpsError("not-found", "impersonated user not found");
        }
        return impersonateDoc as QueryDocumentSnapshot;
    }


    const doc = await findUserByUID(uid);
    if (!doc || !doc.data().active) {
        throw new HttpsError("unauthenticated", "unauthorized user");
    }
    if (request.data && impersonateUser) {
        const adminDoc = await db.collection(Collections.Admins).doc(doc.id).get();
        if (!adminDoc.exists) {
            throw new HttpsError("permission-denied", "not authorized to impersonate");
        }

        // Admin can impersonate to another user
        const impersonateDoc = await getUserByID(impersonateUser);
        if (!impersonateDoc) {
            throw new HttpsError("not-found", "impersonated user not found");
        }
        if (impersonateDoc && !impersonateDoc.data()?.active) {
            throw new HttpsError("permission-denied", "Inactive impersonated user");
        }
        // for change of type, as we only use id and data() - hack
        return impersonateDoc as QueryDocumentSnapshot;
    }
    return doc;
}

let districts: District[] | undefined = undefined;
interface District {
    id: string;
    name: string;
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
            name: r.fields["מחוז"],
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

async function getDemands(
    district: string,
    status: "תפוס" | "זמין" | undefined,
    daysAhead: number | undefined,
    volunteerId?: string,
    familyId?: string
): Promise<FamilyDemand[]> {
    const apiKey = born2winApiKey.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const mahuzRec = (await getDestricts()).find((d: any) => d.id === district);
    if (mahuzRec) {
        const baseId = mahuzRec.base_id;
        const filters = [];

        if (familyId) {
            filters.push(`FIND("${familyId}",  ARRAYJOIN({record_id (from משפחה)})) > 0`);
        }
        if (status) {
            filters.push(`{זמינות שיבוץ}='${status}'`);
        }
        if (daysAhead !== undefined) {
            // eslint-disable-next-line quotes
            filters.push(`IS_AFTER({תאריך},TODAY())`);
            filters.push(`IS_BEFORE({תאריך},DATEADD(TODAY(),${daysAhead + 2},'days'))`);
        }
        if (volunteerId) {
            filters.push(`{volunteer_id}='${volunteerId}'`);
        }

        const formula = encodeURIComponent(`AND(${filters.join(",")})`);
        const query = `https://api.airtable.com/v0/${baseId}/דרישות לשיבוצים?filterByFormula=${formula}`;

        const demands = await axios.get(query, {
            headers,
        });
        if (demands.data.records) {
            return demands.data.records.map((demand: AirTableRecord) => ({
                id: demand.id,
                date: demand.fields["תאריך"],
                city: demand.fields["עיר"][0],
                familyLastName: demand.fields.Name,
                district: district,
                status: demand.fields["זמינות שיבוץ"],
                familyId: demand.fields.Family_id[0],
                familyRecordId: demand.fields["משפחה"][0],
                volunteerId: demand.fields.volunteer_id,
            }) as FamilyDemand);
        }
    }
    throw new HttpsError("not-found", "District not found");
}

exports.GetOpenDemands = onCall({ cors: true }, async (request): Promise<FamilyDemand[]> => {
    const doc = await authenticate(request);

    const district = doc.data().mahoz;
    return getDemands(district, "זמין", 45);
});


exports.GetUserRegistrations = onCall({ cors: true }, async (request): Promise<FamilyDemand[]> => {
    const doc = await authenticate(request);
    const district = doc.data().mahoz;
    const volunteerId = doc.id;
    return getDemands(district, "תפוס", undefined, volunteerId);
});


exports.UpdateFamilityDemand = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    const mahoz = doc.data().mahoz;
    const volunteerId = doc.id;

    const districts = await getDestricts();
    const district = districts.find(d => d.id == mahoz);
    if (!district) throw new HttpsError("not-found", "District " + mahoz + " not found");

    const fdup = request.data as FamilityDemandUpdatePayload;
    const apiKey = born2winApiKey.value();

    if (!fdup.isRegistering && !(fdup.reason && fdup.reason.trim().length > 0)) {
        throw new HttpsError("invalid-argument", "Missing reason to cancellation");
    }

    const updatedFields = {
        fields: {
            "זמינות שיבוץ": fdup.isRegistering ? "תפוס" : "זמין",
            "volunteer_id": fdup.isRegistering ? volunteerId : null,
        },
    };
    const url = `https://api.airtable.com/v0/${district.base_id}/${district.demandsTable}/${fdup.demandId}`;
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };
    const updatedRecord = await axios.patch(url, updatedFields, httpOptions).then(response => response.data);

    // Update main base
    const airTableMainBase = mainBase.value();
    const demandDate = updatedRecord.fields["תאריך"];
    const urlMainBase = `https://api.airtable.com/v0/${airTableMainBase}/${encodeURIComponent("ארוחות")}`;

    if (fdup.isRegistering) {
        const newRegistrationRec = {
            "records": [
                {
                    "fields": {
                        "משפחה": [
                            fdup.familyId,
                        ],
                        "מתנדב": [
                            volunteerId,
                        ],
                        "עיר": [
                            fdup.cityId,
                        ],
                        "DATE": updatedRecord.fields["תאריך"],
                    },
                },
            ],
        };

        await axios.post(urlMainBase, newRegistrationRec, httpOptions).then(async (response) => {
            // send notification to admins
            const admins = await db.collection(Collections.Admins).get();
            const adminsIds = admins.docs.map(doc => doc.id);

            await addNotificationToQueue("שיבוץ חדש", `תאריך: ${demandDate}
משפחה: ${updatedRecord.fields.Name}
מתנדב: ${doc.data().firstName + " " + doc.data().lastName}
עיר: ${updatedRecord.fields["עיר"]}
`, [], adminsIds);

            logger.info("New registration added", response.data);
        });
    } else {
        // Need to find the record:
        const filterFormula = `DATETIME_FORMAT({DATE}, 'YYYY-MM-DD')="${demandDate}"`;
        const findResult = await axios.get(urlMainBase, {
            ...httpOptions,
            params: {
                filterByFormula: filterFormula,
                maxRecords: 1000, // Just in case there are multiple, get only the first match
            },
        });
        if (findResult.data.records.length > 0) {
            const rec = findResult.data.records.find((r: AirTableRecord) => r.fields["משפחה"][0] == fdup.familyId && r.fields["מתנדב"][0] == volunteerId);
            if (rec) {
                // Delete the records
                const deleteUrl = `${urlMainBase}/${rec.id}`;
                await axios.delete(deleteUrl, httpOptions);
                logger.info("Existing registration removed", rec.id, "family", fdup.familyId, "vid", volunteerId);

                // Add cancellation record
                const cancallationRec = await db.collection(Collections.Cancellations).doc();
                await cancallationRec.create({
                    cancelledAt: dayjs().utc().tz(JERUSALEM).format(DATE_TIME),
                    demandDate: demandDate,
                    reason: fdup.reason,
                    demandId: rec.id,
                    volunteerId,
                    familyId: fdup.familyId,
                });

                // send notification to admins
                const admins = await db.collection(Collections.Admins).get();
                const adminsIds = admins.docs.map(doc => doc.id);

                await addNotificationToQueue("שיבוץ בוטל!", `תאריך: ${demandDate}
משפחה: ${updatedRecord.fields.Name}
מתנדב: ${doc.data().firstName + " " + doc.data().lastName}
עיר: ${updatedRecord.fields["עיר"]}
`, [], adminsIds);

                return;
            }
        }
        logger.info("Unable to find registration id in main base", filterFormula);
    }
});


exports.GetFamilyDetails = onCall({ cors: true }, async (request): Promise<FamilyDetails> => {
    const doc = await authenticate(request);
    const gfp = request.data as FamilityDetailsPayload;
    const mahoz = doc.data().mahoz;

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
        const rec = userRegistrations.data;

        // if (gfp.includeContacts) {
        //     // Get contacts from main base's אנשי קשר
        //     const airTableMainBase = mainBase.value();

        //     const userRegistrations = await axios.get(`https://api.airtable.com/v0/${airTableMainBase}/${encodeURIComponent("אנשי קשר")}?`,
        //      {
        //         ...headers,
        //         params: {
        //             filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
        //             fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון"],
        // }


        return ({
            id: rec.id,
            familyId: rec.fields.familyid,
            familyLastName: rec.fields.Name,
            patientAge: rec.fields["גיל החולה"],
            prefferedMeal: rec.fields["העדפה לסוג ארוחה"],
            meatPreferences: rec.fields["העדפות בשר"],
            fishPreferences: rec.fields["העדפות דגים"],
            avoidDishes: rec.fields["לא אוכלים"],
            sideDishes: rec.fields["תוספות"],
            kosherLevel: rec.fields["כשרות מטבח"],
            favoriteFood: rec.fields["אוהבים לאכול"],
            alergies: rec.fields["רגישויות ואלרגיות (from בדיקת ההתאמה)"],
            adultsCount: rec.fields["נפשות מבוגרים בבית"],
            familyStructure: rec.fields["הרכב הורים"],
            familyMembersAge: rec.fields["גילאים של הרכב המשפחה"],
            cookingDays: rec.fields["ימים"],
            city: rec.fields["עיר"],
            cityId: rec.fields.city_id_1,
            street: rec.fields["רחוב"],
            floor: rec.fields["קומה"],
            appartment: rec.fields["דירה"],
            streatNumber: rec.fields["מספר דירה"], // todo verify the right number
            district: mahuzRec.id,
        }) as FamilyDetails;
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
    { desc: "Alert 5 days ahead open demand", min: 40, hour: [13], weekDay: "*", callback: alertOpenDemands },
    { desc: "Alert 72 hours before cooking", min: 0, hour: [16], weekDay: "*", callback: alertUpcomingCooking },
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

async function alertOpenDemands() {
    const districts = await getDestricts();
    const admins = await db.collection(Collections.Admins).get();
    const adminsIds = admins.docs.map(doc => doc.id);
    const waitFor = [];

    for (let i = 0; i < districts.length; i++) {
        const openDemands = await getDemands(districts[i].id, "זמין", 5);
        let msgBody = "מחוז: " + districts[i].name + "\n";
        if (openDemands.length > 0) {
            openDemands.forEach(od => {
                const daysLeft = Math.abs(dayjs().diff(od.date, "days"));
                msgBody += `- ${od.familyLastName} (עוד ${daysLeft} ימים)` + "\n";
            });
            waitFor.push(addNotificationToQueue("שיבוצים חסרים - 5 ימים קרובים", msgBody, [], adminsIds));
        }
    }
    Promise.all(waitFor);
}

async function alertUpcomingCooking() {
    const districts = await getDestricts();
    const daysBefore = 3;
    for (let i = 0; i < districts.length; i++) {
        if (districts[i].id !== "recxuE1Cwav0kfA7g") continue; // only in test for now
        const upcomingDemands = await getDemands(districts[i].id, "תפוס", daysBefore);
        for (let j = 0; j < upcomingDemands.length; j++) {
            const demand = upcomingDemands[j];
            const daysLeft = -dayjs().diff(demand.date, "days");

            if (daysLeft === daysBefore) {
                const msgBody = `תאריך הבישול: ${dayjs(demand.date).format(IL_DATE)}
עוד: ${daysBefore} ימים
משפחה: ${demand.familyLastName}
עיר: ${demand.city}
לא לשכוח לתאם עוד היום בשיחה או הודעה את שעת מסירת האוכל.
אם אין באפשרותך לבשל יש לבטל באפליקציה, או ליצור קשר.`;
                await addNotificationToQueue("תזכורת לבישול!", msgBody, [], [demand.volunteerId], {
                    buttons: JSON.stringify([
                        { label: "צפה בפרטים", action: NotificationActions.RegistrationDetails, params: [demand.id] },
                        { label: "צור קשר עם עמותה", action: NotificationActions.StartConversation },
                    ]),
                }
                );
            }
        }
        // TODO send summary notification to admin?
    }
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
    let notifyForNewUsers = true;
    if (!sinceDate) {
        sinceDate = dayjs().subtract(25, "hour");
        notifyForNewUsers = false;
    }
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss[z]");
    const newLinksToAdmin = [] as {
        name: string,
        phone: string,
        link: string,
    }[];

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
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון"],
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
                phone: user.fields["טלפון"],
                mahoz: user.fields["מחוז"][0],
                volId: user.id,
            } as UserRecord;

            if (userDoc && userDoc.exists) {
                const prevUserRecord = userDoc.data();
                if (prevUserRecord &&
                    userRecord.active === prevUserRecord.active &&
                    userRecord.firstName === prevUserRecord.firstName &&
                    userRecord.lastName === prevUserRecord.lastName &&
                    userRecord.phone === prevUserRecord.phone) {
                    // No change!
                    continue;
                }

                // update it
                if (prevUserRecord && userRecord.active !== prevUserRecord.active && userRecord.active) {
                    // user has changed to active, add OTP and send it to admins
                    userRecord.otp = crypto.randomUUID();
                    userRecord.otpCreatedAt = dayjs().format(DATE_TIME);
                }
                batch.update(userDoc.ref, userRecord as any);
            } else {
                // create new
                if (userRecord.active) {
                    userRecord.otp = crypto.randomUUID();
                    userRecord.otpCreatedAt = dayjs().format(DATE_TIME);
                }
                batch.create(docRef, userRecord);
            }
            if (userRecord.otp) {
                newLinksToAdmin.push({
                    name: userRecord.firstName + " " + userRecord.lastName,
                    phone: userRecord.phone,
                    link: getRegistrationLink(userId, userRecord.otp),
                });
            }
        }
    } while (offset);

    return batch.commit().then(async () => {
        logger.info("Sync Users: obsered modified:", count, "observed Active", countActive, "registrationLinks", newLinksToAdmin, "duplicates:", duplicates);
        if (notifyForNewUsers && newLinksToAdmin.length > 0) {
            const admins = await db.collection(Collections.Admins).get();
            const adminsIds = admins.docs.map(doc => doc.id);

            await Promise.all(newLinksToAdmin.map(link => addNotificationToQueue("לינק למשתמש", `שם: ${link.name}
טלפון: ${link.phone}
לינק לשליחה למשתמש: ${link.link}
`, [], adminsIds)));
        }
        return;
    });
}

function getRegistrationLink(userId: string, otp: string): string {
    return `https://born2win-prod.web.app?vid=${userId}&otp=${otp}`;
}

// exports.TestSync = onCall({ cors: true }, async () => {
//     logger.info("Start test sync");
//     try {
//         return syncBorn2WinUsers();
//     } catch (e) {
//         logger.info("error test sync", e);
//     }
// });


/**
 * ANALITICS
 */
exports.GetDemandStats = onCall({ cors: true }, async (request): Promise<StatsData> => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const gdsp = request.data as GetDemandStatPayload;
        const totalDemandsMap: { [key: string]: number } = {};
        const fulfilledDemandsMap: { [key: string]: number } = {};

        const startDate = dayjs(gdsp.from).startOf("day");
        const endDate = dayjs(gdsp.to).endOf("day");
        const apiKey = born2winApiKey.value();
        for (let i = 0; i < gdsp.districts.length; i++) {
            const requestedDistrict = gdsp.districts[i];
            // Verify the user is admin of that district
            if (userInfo.districts?.find((d: any) => d.id === requestedDistrict)) {
                // find district info
                const district = (await getDestricts()).find(d => d.id === requestedDistrict);
                if (district) {
                    const url = `https://api.airtable.com/v0/${district.base_id}/${district.demandsTable}`;
                    let offset = undefined;

                    do {
                        const response: any = await axios.get<{ records: any[] }>(url, {
                            headers: {
                                Authorization: `Bearer ${apiKey}`,
                            },
                            params: {
                                fields: ["תאריך", "זמינות שיבוץ", "volunteer_id"],
                                offset: offset,
                                filterByFormula: `AND(IS_AFTER({תאריך}, '${startDate.format("YYYY-MM-DD")}'), IS_BEFORE({תאריך}, '${endDate.format("YYYY-MM-DD")}'))`,
                            },
                        });

                        const records = response.data.records;
                        offset = response.data.offset;

                        records.forEach((record: any) => {
                            const weekLabel = dayjs(record.fields["תאריך"]).startOf("week").format("YYYY-MM-DD");

                            if (!totalDemandsMap[weekLabel]) {
                                totalDemandsMap[weekLabel] = 0;
                                fulfilledDemandsMap[weekLabel] = 0;
                            }

                            totalDemandsMap[weekLabel] += 1;

                            if (record.fields["זמינות שיבוץ"] === "תפוס" && record.fields.volunteer_id) {
                                fulfilledDemandsMap[weekLabel] += 1;
                            }
                        });
                    } while (offset);
                }
            }
        }
        const labels = Object.keys(totalDemandsMap).sort();
        const totalDemands = labels.map(label => totalDemandsMap[label]);
        const fulfilledDemands = labels.map(label => fulfilledDemandsMap[label]);

        return {
            totalDemands,
            fulfilledDemands,
            labels,
        };
    }
    return { totalDemands: [0], fulfilledDemands: [0], labels: [""] };
});