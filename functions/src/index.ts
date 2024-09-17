

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
    AirTableRecord, Collections, FamilityDemandUpdatePayload, FamilyDemand, FamilyDetails, LoginInfo,
    NotificationActions, NotificationUpdatePayload, Recipient, SearchUsersPayload, SendMessagePayload,
    SendNotificationStats, TokenInfo, UpdateUserLoginPayload, UserInfo, UserRecord,
    FamilityDetailsPayload,
    NotificationChannels,
    GenerateLinkPayload,
    OpenFamilyDemands,
    VolunteerInfo,
    VolunteerInfoPayload,
    GetDemandsPayload,
} from "../../src/types";
import axios from "axios";
import express = require("express");
import crypto = require("crypto");
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { IL_DATE, replaceAll } from "../../src/utils";
import localeData = require("dayjs/plugin/localeData");
import { Lock } from "./lock";

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
const DATE_AT = "YYYY-MM-DD";
const db = getFirestore();

const appHost = "app.born2win.org.il";

const born2winApiKey = defineString("BORN2WIN_API_KEY");
const manyChatApiKey = defineString("BORN2WIN_MANYCHAT_API_KEY");

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
            logger.error("Multiple users on same uid", uid);
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

function normilizePhone(phone: string): string {
    if (phone.startsWith("0")) {
        phone = "972" + phone.substring(1);
    } else if (phone.startsWith("+972")) {
        phone = phone.substring(1);
    }
    phone = replaceAll(phone, " ", "");
    phone = replaceAll(phone, "-", "");
    return phone;
}
function findUserByPhone(phone: string): Promise<QueryDocumentSnapshot | null> {
    phone = normilizePhone(phone);

    return db.collection(Collections.Users).where("phone", "==", phone).get().then(res => {
        if (res.empty) {
            // no matching users
            return null;
        }
        if (res.docs.length > 1) {
            // take the newest - todo
            console.log("Warnning multiple matches for phone", phone);
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

        if (doc.data()?.isAdmin) {
            // sets the isAdmin claim
            await updateAdminClaim(uid, true);
        }

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

        if (doc.data()?.isAdmin) {
            // sets the isAdmin claim
            await updateAdminClaim(uid, true);
        }
        // Return volunteerID for Phase 2
        return doc.id;
    } else if (uulp.phone) {
        // Phone flow
        doc = await findUserByPhone(uulp.phone);
        if (!doc) {
            throw new HttpsError("not-found", "User with given phone is not known");
        }

        if (!uulp.otp) {
            // Phone - Phase 1 (no otp)
            // Generate OTP:
            const newOTP = Math.floor(1000 + Math.random() * 9000) + "";
            await doc.ref.update({
                // Generate 4 digits otp
                otp: newOTP,
                // Renew date
                otpCreatedAt: now.format(DATE_TIME),
            });

            await sendOTPViaManychat(doc.data().manychat_id, newOTP);
        } else {
            // Phone - Phase 2 (with otp)
            logger.log("phone flow", doc.data().otp, uulp.otp, Math.abs(now.diff(doc.data().otpCreatedAt, "seconds")));
            if (doc.data().otp === uulp.otp &&
                Math.abs(now.diff(dayjs.tz(doc.data().otpCreatedAt, JERUSALEM), "seconds")) < 300) {
                // Update UID based on the verified phone (iOS Phase 2)
                const update: any = {
                    uid: FieldValue.arrayUnion(uid),
                    otp: FieldValue.delete(),
                    otpCreatedAt: FieldValue.delete(),
                    loginInfo: FieldValue.arrayUnion({ uid, createdAt: now.format(DATE_TIME), isIOS: uulp.isIOS }),
                };
                await doc.ref.update(update);

                if (doc.data()?.isAdmin) {
                    // sets the isAdmin claim
                    await updateAdminClaim(uid, true);
                }

                // All set
                return doc.id;
            } else {
                throw new HttpsError("invalid-argument", "Invalid or expired OTP");
            }
        }
        return ""; // not yet sending volunteer Id
    } else {
        throw new HttpsError("invalid-argument", "Missing volunteerID or fingerprint");
    }
});

function validateOTPOrFingerprint(token: string | undefined, savedToken: string | string, createdAt: string, validForDays: number): boolean {
    logger.info("validate otp. token:", token, "savedToken:", savedToken, "ca", createdAt, "days", validForDays);
    if (!token || !savedToken) return false;

    return (token === savedToken && dayjs(createdAt).isAfter(dayjs().subtract(validForDays, "day")));
}

function sendOTPViaManychat(manySubscriberId: string, otp: string) {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };

    return axios.post("https://api.manychat.com/fb/subscriber/setCustomFieldByName", {
        subscriber_id: manySubscriberId,
        field_name: "verificationCode",
        field_value: otp,
    }, httpOptions);
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
    const data = doc.data();
    const allDistricts = await getDestricts();
    const userDistrict = allDistricts.find(d => d.id === data.mahoz);
    let adminDistricts = undefined;

    // Calculate the admin's districts
    if (data.adminDistricts && data.adminDistricts.length > 0) {
        if (data.adminDistricts[0] == "all") {
            adminDistricts = allDistricts.map(district => ({ id: district.id, name: district.name }));
        } else {
            adminDistricts = [];
            data.adminDistricts.forEach((ad: string) => {
                const district = allDistricts.find(d => d.id === ad);
                if (district) {
                    adminDistricts.push({ id: district.id, name: district.name });
                }
            });
        }
    }

    return {
        id: doc.id,
        notificationOn: data.notificationOn,
        notificationToken: data.notificationTokens?.find((tokenInfo: TokenInfo) => tokenInfo.uid === request.auth?.uid),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        userDistrict: { id: data.mahoz, name: userDistrict?.name || "" },
        isAdmin: (data.isAdmin == true),
        districts: adminDistricts,
    } as UserInfo;
}

exports.GenerateUserLink = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);
    if (!userInfo.isAdmin) {
        throw new HttpsError("permission-denied", "Only Admin can generate link");
    }
    const glp = request.data as GenerateLinkPayload;
    const userDoc = await getUserByID(glp.userId);
    if (!userDoc) {
        throw new HttpsError("not-found", "User not found");
    }

    const update = {
        // Keep existing otp if exists
        otp: userDoc.data()?.otp ? userDoc.data()?.otp : crypto.randomUUID(),
        // Renew date
        otpCreatedAt: dayjs().format(DATE_TIME),
    };
    return userDoc.ref.update(update).then(() => {
        return getRegistrationLink(glp.userId, update.otp);
    });
});

exports.TestNotification = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    if (doc) {
        const displayName = doc.data().firstName + " " + doc.data().lastName;
        return addNotificationToQueue("הודעת בדיקה", "הודעת בדיקה ל:" + displayName, NotificationChannels.General, [], [doc.id]);
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
        const waitFor = [];
        const baseQuery = db.collection(Collections.Users).where("active", "==", true);
        if (query.startsWith("0") && /^[0-9]+$/.test(query)) {
            if (query.length < 6) {
                return [];
            }
            const phonePrefix = normilizePhone(query);
            const phoneQuery = baseQuery
                .where("phone", ">=", phonePrefix)
                .where("phone", "<", phonePrefix + "\uf8ff"); // The \uf8ff character is the last character in the Unicode range
            waitFor.push(phoneQuery.get());
        } else {
            const firstNameQuery = baseQuery
                .where("firstName", ">=", query)
                .where("firstName", "<", query + "\uf8ff");
            const lastNameQuery = baseQuery
                .where("lastName", ">=", query)
                .where("lastName", "<", query + "\uf8ff");
            waitFor.push(firstNameQuery.get());
            waitFor.push(lastNameQuery.get());
        }

        const all = await Promise.all(waitFor);
        const users = new Map();
        all.forEach(list => list.forEach(doc => users.set(doc.id, doc)));
        return Array.from(users.values()).map(u => ({
            name: u.data().firstName + " " + u.data().lastName,
            id: u.id,
            phone: u.data().phone,
            mahoz: u.data().mahoz,
        }));
    }
    throw new HttpsError("unauthenticated", "Only admin can send message.");
});

/**
 *
 * @param title
 * @param body
 * @param channel
 * @param toDistricts an array of districts ID or "all"
 * @param toRecipients an array of users ID
 * @param data
 * @returns
 */

async function addNotificationToQueue(title: string, body: string, channel: NotificationChannels, toDistricts: string[], toRecipients: string[] | string, data?: { [key: string]: string }) {
    const docRef = db.collection(Collections.Notifications).doc();
    if (data) {
        data.channel = channel;
    } else {
        data = { channel };
    }
    return docRef.create({
        title,
        body,
        data: JSON.stringify(data),
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


// Updates the "users" collection with admin info, on every change to "admins" collection
exports.OnAdminChange = onDocumentWritten(`${Collections.Admins}/{docId}`, async (event) => {
    logger.info("Admins changed", event);
    if (event.data) {
        const docAfter = event.data.after;
        const updateUser: any = {};
        if (docAfter.exists && docAfter.data()?.suspended !== true) {
            updateUser.isAdmin = true;
            updateUser.adminDistricts = docAfter.data()?.districts || [];
        } else {
            updateUser.isAdmin = false;
            updateUser.adminDistricts = FieldValue.delete();
        }

        const doc = await db.collection(Collections.Users).doc(event.params.docId).get();
        if (doc.exists && doc.data()) {
            const waitFor = doc.data()?.uid?.map((uid: string) => updateAdminClaim(uid, updateUser.isAdmin));

            waitFor.push(doc.ref.update(updateUser));
            return Promise.all(waitFor);
        }
    }
    return;
});

function updateAdminClaim(uid: string, isAdmin: boolean) {
    admin.auth().setCustomUserClaims(uid, { isAdmin: isAdmin });
}


exports.LoadExistingNotifications = onCall({ cors: true }, async (request) => {
    const doc = await authenticate(request);
    const mahoz = doc.data().mahoz;

    const NotificationsRef = db.collection(Collections.Notifications);

    return Promise.all([
        // Personal messages
        NotificationsRef.where("toRecipients", "array-contains", doc.id).get(),
        NotificationsRef.where("toDistricts", "array-contains", mahoz).get(),
        NotificationsRef.where("toDistricts", "array-contains", "all").get(),
    ]).then(all => {
        // Unite and filter to 2 weeks old:
        const notifications: any[] = [];
        all.forEach(result => {
            result.docs.forEach(doc => {
                if (!notifications.find(f => f.id === doc.id)) {
                    const data = doc.data();
                    if (data.created > dayjs().subtract(2, "weeks").format(DATE_TIME)) {
                        notifications.push({
                            id: doc.id,
                            title: data.title,
                            body: data.body,
                            data: data.data,
                            timestamp: dayjs(data.created).valueOf(),
                        });
                    }
                }
            });
        });
        return notifications;
    });
});

exports.SendMessage = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const smp = request.data as SendMessagePayload;

        return addNotificationToQueue(smp.title, smp.body, NotificationChannels.General, smp.toDistricts, smp.toRecipients);
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
        } else if (to.startsWith("admins")) {
            const adminUsersSnapshot = await usersRef.where("isAdmin", "==", true).get();
            adminUsersSnapshot.forEach(admin => {
                admin.data().notificationTokens?.forEach((nt: TokenInfo) => {
                    webPushDevices.push({
                        ownerId: admin.id,
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

    const imageUrl = `https://${appHost}/favicon.ico`;
    const actionUrl = `https://${appHost}`;
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

    const impersonateUser = request.data?.impersonateUser;

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
    if (!doc) {
        throw new HttpsError("unauthenticated", "unauthorized user");
    }
    if (!doc.data().active) {
        throw new HttpsError("unauthenticated", "Inactive user");
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

let cities: City[] | undefined = undefined;
interface City {
    id: string;
    name: string;
    district: string;
}

async function getCities(): Promise<City[]> {
    if (!cities) {
        const apiKey = born2winApiKey.value();
        const airTableMainBase = mainBase.value();

        let offset = null;
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };
        cities = [];
        do {
            const query = `https://api.airtable.com/v0/${airTableMainBase}/ערים`;
            const citiesResponse: any = await axios.get(query, {
                headers,
                params: {
                    offset,
                    filterByFormula: "{כמות משפחות פעילות בעיר}>0",
                },
            });
            offset = citiesResponse.data.offset;
            if (citiesResponse.data.records) {
                citiesResponse.data.records.forEach((city: AirTableRecord) => (cities?.push({
                    id: city.id,
                    name: city.fields["שם"],
                    district: city.fields["מחוז"][0],
                    // numOfFamilies: city.fields["כמות משפחות פעילות בעיר"],
                })));
            }
        } while (offset);
    }
    return cities || [];
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
    includeNonActiveFamily: boolean,
    dateStart?: string,
    dateEnd?: string,
    volunteerId?: string,
    districtBaseFamilyId?: string
): Promise<FamilyDemand[]> {
    const apiKey = born2winApiKey.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const mahuzRec = (await getDestricts()).find((d: any) => d.id === district);
    if (mahuzRec) {
        let demantsResult: FamilyDemand[] = [];
        const baseId = mahuzRec.base_id;
        const demandsTable = mahuzRec.demandsTable;
        const filters = [];

        if (!includeNonActiveFamily) {
            filters.push("({סטטוס בעמותה} = 'פעיל')");
        }

        if (districtBaseFamilyId) {
            filters.push(`FIND("${districtBaseFamilyId}",  ARRAYJOIN({record_id (from משפחה)})) > 0`);
        }
        if (status) {
            filters.push(`{זמינות שיבוץ}='${status}'`);
        }
        if (dateStart !== undefined) {
            // eslint-disable-next-line quotes
            filters.push(`IS_AFTER({תאריך},'${dateStart}')`);
        }
        if (dateEnd != undefined) {
            filters.push(`IS_BEFORE({תאריך},'${dateEnd}')`);
        }
        if (volunteerId) {
            filters.push(`{volunteer_id}='${volunteerId}'`);
        }

        const formula = `AND(${filters.join(",")})`;
        const query = `https://api.airtable.com/v0/${baseId}/${demandsTable}`;
        let offset;
        do {
            const demandsRespose: any = await axios.get(query, {
                headers,
                params: {
                    offset: offset,
                    filterByFormula: formula,
                },
            });
            offset = demandsRespose.data.offset;
            if (demandsRespose.data.records) {
                demantsResult = demantsResult.concat(demandsRespose.data.records.map((demand: AirTableRecord) => demandAirtable2FamilyDemand(demand, district)));
            }
        } while (offset);

        return demantsResult;
    }
    throw new HttpsError("not-found", "District not found");
}

async function getDemand(district: string, familyDemandId: string): Promise<FamilyDemand> {
    const apiKey = born2winApiKey.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const districtRec = (await getDestricts()).find((d: any) => d.id === district);
    if (districtRec) {
        const query = `https://api.airtable.com/v0/${districtRec.base_id}/דרישות לשיבוצים/${familyDemandId}`;

        const demand = await axios.get(query, {
            headers,
        });
        if (demand.data) {
            return demandAirtable2FamilyDemand(demand.data, district);
        }
    }
    throw new HttpsError("not-found", "Family demand " + familyDemandId + " not found");
}

function demandAirtable2FamilyDemand(demand: AirTableRecord, district: string): FamilyDemand {
    return {
        id: demand.id,
        date: demand.fields["תאריך"],
        city: getSafeFirstArrayElement(demand.fields["עיר"], ""),
        familyLastName: demand.fields.Name,
        district: district,
        status: demand.fields["זמינות שיבוץ"],
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields.Family_id, ""), // The record ID of the main base table משפחות רשומות
        districtBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""), // The record ID in the district table of משפחות במחוז
        volunteerId: demand.fields.volunteer_id,
        isFamilyActive: demand.fields["סטטוס בעמותה"] == "פעיל",
    };
}

function getSafeFirstArrayElement(arr: any[], defaultValue: any) {
    return arr && arr.length && arr[0] || defaultValue;
}


exports.GetOpenDemands = onCall({ cors: true }, async (request): Promise<OpenFamilyDemands> => {
    const doc = await authenticate(request);

    const district = doc.data().mahoz;
    const cities = await getCities();
    const demands = await getDemands(district, "זמין", false, dayjs().format(DATE_AT), dayjs().add(45, "days").format(DATE_AT));
    return { demands, allDistrictCities: cities.filter(city => city.district === district) };
});

exports.GetDemands = onCall({ cors: true }, async (request): Promise<FamilyDemand[]> => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const gdp = request.data as GetDemandsPayload;
        let resultDemands: FamilyDemand[] = [];

        for (let i = 0; i < gdp.districts.length; i++) {
            const requestedDistrict = gdp.districts[i];
            // Verify the user is admin of that district
            if (userInfo.districts?.find((d: any) => d.id === requestedDistrict)) {
                const districtDemands = await getDemands(requestedDistrict, undefined, true, gdp.from, gdp.to);
                resultDemands = resultDemands.concat(districtDemands);
            }
        }
        return resultDemands;
    }

    throw new HttpsError("permission-denied", "Unauthorized user to read all demands");
});

exports.GetUserRegistrations = onCall({ cors: true }, async (request): Promise<FamilyDemand[]> => {
    const doc = await authenticate(request);
    const district = doc.data().mahoz;
    const volunteerId = doc.id;
    return getDemands(district, "תפוס", true, undefined, undefined, volunteerId);
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

    // Add Locking - so only one user can update the same family & date
    const lock = await Lock.acquire(db, fdup.demandId);
    if (!lock) {
        throw new HttpsError("already-exists", "מתנדב אחר מעדכן את הרשומה הזו ממש עכשיו");
    }

    // First read the recod to verify it is indeed free
    const demand = await getDemand(district.id, fdup.demandId);
    if (demand.status !== (fdup.isRegistering ?
        "זמין" :
        "תפוס")) {
        logger.info("Attept to a duplicated update family demand", fdup);
        await lock.release();
        // record does not fit expected state, reject the action
        throw new HttpsError("already-exists", fdup.isRegistering ?
            "התאריך המבוקש עבור משפחה זו נתפס" :
            "התאריך המבוטל כבר מסומן כפנוי"
        );
    }

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
                            fdup.mainBaseFamilyId,
                        ],
                        "מתנדב": [
                            volunteerId,
                        ],
                        "עיר": [
                            fdup.cityId,
                        ],
                        "DATE": demandDate,
                    },
                },
            ],
        };

        await axios.post(urlMainBase, newRegistrationRec, httpOptions).then(async (response) => {
            // send notification to admins - disabled for now
            //             const admins = await db.collection(Collections.Admins).get();
            //             const adminsIds = admins.docs.map(doc => doc.id);

            //             await addNotificationToQueue("שיבוץ חדש", `תאריך: ${demandDate}
            // משפחה: ${updatedRecord.fields.Name}
            // מתנדב: ${doc.data().firstName + " " + doc.data().lastName}
            // עיר: ${updatedRecord.fields["עיר"]}
            // `, NotificationChannels.Registrations, [], adminsIds);

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
            const rec = findResult.data.records.find((r: AirTableRecord) => r.fields["משפחה"][0] == fdup.mainBaseFamilyId && r.fields["מתנדב"][0] == volunteerId);
            if (rec) {
                // Delete the records
                const updateCancelUrl = `${urlMainBase}/${rec.id}`;

                const updateCancelFields = {
                    fields: {
                        "סטטוס": "בוטל",
                        "סיבת ביטול": fdup.reason,
                    },
                };

                await axios.patch(updateCancelUrl, updateCancelFields, httpOptions);
                logger.info("Existing registration was cancelled", rec.id, "main-base-family", fdup.mainBaseFamilyId, "vid", volunteerId);

                // send notification to admins - if date is less than 10 days:
                const daysDiff = dayjs().diff(demandDate, "days");
                if (Math.abs(daysDiff) <= 10) {
                    const admins = await db.collection(Collections.Admins).get();
                    const adminsIds = admins.docs.map(doc => doc.id);

                    await addNotificationToQueue("שיבוץ בוטל!", `תאריך: ${demandDate}
משפחה: ${updatedRecord.fields.Name}
מתנדב: ${doc.data().firstName + " " + doc.data().lastName}
עיר: ${updatedRecord.fields["עיר"]}
`, NotificationChannels.Registrations, [], adminsIds);
                }
            } else {
                logger.info("Unable to find registration id in main base", filterFormula);
            }
        }
    }

    return lock.release();
});


exports.GetFamilyDetails = onCall({ cors: true }, async (request): Promise<FamilyDetails> => {
    const userInfo = await getUserInfo(request);
    const gfp = request.data as FamilityDetailsPayload;
    const district = userInfo.userDistrict.id;

    if (gfp.district !== district &&
        (!userInfo.isAdmin || !userInfo.districts?.find(d => d.id === gfp.district))) {
        logger.error("Permission denied to read family details", userInfo.id, userInfo.userDistrict, userInfo.isAdmin, gfp.district, "admin regions:", userInfo.districts);
        throw new HttpsError("permission-denied", "Unauthorized to read family details from this district");
    }

    const mahuzRec = (await getDestricts()).find((d: any) => d.id === gfp.district);
    if (mahuzRec) {
        const apiKey = born2winApiKey.value();
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };
        const baseId = mahuzRec.base_id;
        const familiesTable = mahuzRec.familiesTable;

        const userRegistrations = await axios.get(`https://api.airtable.com/v0/${baseId}/${familiesTable}/${gfp.districtBaseFamilyId}`, {
            headers,
        });
        const rec = userRegistrations.data;
        const contactDetails = {
            name: "",
            phone: "",
        };
        if (gfp.includeContacts && (userInfo.isAdmin || gfp.familyDemandId)) {
            try {
                let allowed = true;
                if (!userInfo.isAdmin) {
                    // read the demand and verify belongs to this user and not older that 7 days ago
                    const demand = await getDemand(gfp.district, gfp.familyDemandId);
                    if (demand.volunteerId !== userInfo.id || dayjs(demand.date).add(7, "days").isBefore(dayjs())) {
                        allowed = false;
                    }
                }
                if (allowed) {
                    const fetchedDetails = await getFamilyContactDetails(rec.fields.familyid);

                    // Save the returned contact details as constants
                    contactDetails.name = fetchedDetails.name;
                    contactDetails.phone = fetchedDetails.phone;
                }
            } catch (error) {
                logger.error("Error fetching contact details:", (error as any).message);
            }
        }
        return ({
            id: rec.id,
            mainBaseFamilyId: rec.fields.familyid,
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
            contactName: contactDetails.name,
            phone: contactDetails.phone,
        }) as FamilyDetails;
    }
    throw new HttpsError("not-found", "Family not found");
});

async function getFamilyContactDetails(mainBaseFamilyId: string) {
    try {
        logger.info("getFamilyContactDetails main-base-familyId:", mainBaseFamilyId);

        const airTableMainBase = mainBase.value();
        const apiKey = born2winApiKey.value();

        // Construct the URL
        const url = `https://api.airtable.com/v0/${airTableMainBase}/${encodeURIComponent("משפחות רשומות")}/${mainBaseFamilyId}`;

        // Make the request
        const response = await axios.get(url, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
            },
        });
        // Check if the response has the fields you need
        if (response.data && response.data.fields) {
            const name = response.data.fields["שם איש קשר לוגיסטי"] ? response.data.fields["שם איש קשר לוגיסטי"][0] : "";
            const phone = response.data.fields["טלפון איש קשר לוגיסטי"] ? response.data.fields["טלפון איש קשר לוגיסטי"][0] : "";

            return {
                name,
                phone,
            };
        } else {
            return {
                error: "No contact details found for the given familyId",
            };
        }
    } catch (error) {
        logger.error("Error fetching contact details:", error);
        return {
            error: (error as any).message,
        };
    }
}

exports.GetVolunteerInfo = onCall({ cors: true }, async (request): Promise<VolunteerInfo | undefined> => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const vip = request.data as VolunteerInfoPayload;
        const volunteerDoc = await db.collection(Collections.Users).doc(vip.volunteerId).get();
        if (volunteerDoc && volunteerDoc.exists) {
            const data = volunteerDoc.data();
            if (data) {
                const districts = await getDestricts();
                const volunteerDistrict = districts.find(d => d.id === data.mahoz);
                return {
                    id: volunteerDoc.id,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    district: { id: data.mahoz, name: volunteerDistrict ? volunteerDistrict.name : "" },
                    phone: data.phone,
                    active: data.active,
                };
            }
        }
    }
    return;
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
    { desc: "Reminder on Sunday at 10:30", min: 30, hour: [10], weekDay: 0, callback: remindVolunteersToRegister },
    { desc: "Refresh webhook registration", min: 0, hour: [12], weekDay: "*", callback: refreshWebhookToken },
    { desc: "Sync Born2Win users daily", min: 0, hour: [17], weekDay: "*", callback: syncBorn2WinUsers },
    { desc: "Alert 5 days ahead open demand", min: 40, hour: [13], weekDay: "*", callback: alertOpenDemands },
    { desc: "Alert 72 hours before cooking", min: 0, hour: [16], weekDay: "*", callback: alertUpcomingCooking },
    // todo - archive notifications
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
    await addNotificationToQueue("התחלנו שיבוצים!",
        "הכנסו לבחור למי תתנו חיבוק החודש. ניתן להרשם באפליקציה", NotificationChannels.Registrations, [], "all");
}

async function alertOpenDemands() {
    const districts = await getDestricts();
    const admins = await db.collection(Collections.Admins).get();
    const adminsIds = admins.docs.map(doc => doc.id);
    const waitFor = [];

    for (let i = 0; i < districts.length; i++) {
        const openDemands = await getDemands(districts[i].id, "זמין", false, dayjs().format(DATE_AT), dayjs().add(5, "days").format(DATE_AT));
        let msgBody = "מחוז: " + districts[i].name + "\n";
        if (openDemands.length > 0) {
            let found = false;
            openDemands.forEach(od => {
                const daysLeft = Math.abs(dayjs().diff(od.date, "days"));
                if (daysLeft > 0) {
                    found = true;
                    msgBody += `- ${od.familyLastName} (עוד ${daysLeft} ימים)` + "\n";
                }
            });
            if (found) {
                waitFor.push(addNotificationToQueue("שיבוצים חסרים - 5 ימים קרובים", msgBody, NotificationChannels.Alerts, [districts[i].id], adminsIds));
            }
        }
    }
    Promise.all(waitFor);
}

async function alertUpcomingCooking() {
    const districts = await getDestricts();
    const daysBefore = 3;
    for (let i = 0; i < districts.length; i++) {
        if (districts[i].id !== "recxuE1Cwav0kfA7g") continue; // only in test for now
        const upcomingDemands = await getDemands(districts[i].id, "תפוס", true, dayjs().format(DATE_AT), dayjs().add(daysBefore, "days").format(DATE_AT));
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
                await addNotificationToQueue("תזכורת לבישול!", msgBody, NotificationChannels.Alerts, [], [demand.volunteerId], {
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

    return axios.post(`https://api.airtable.com/v0/bases/${airTableMainBase}/webhooks/${webhookID}/refresh`, {}, {
        headers,
    }).then(res => {
        if (res.status !== 200) {
            logger.error("Refresh Webhook failed", res.status, res.statusText);
            addNotificationToQueue("Refresh Webhook Failed", "AitTable Webhook refrsh Failed with status: " + res.status,
                NotificationChannels.Alerts, [], "admins");
        } else {
            logger.error("Refresh Webhook Succeeded");
        }
    }).catch((err) => {
        logger.error("Refresh Webhook failed", err);
        addNotificationToQueue("Refresh Webhook Failed", "AitTable Webhook refrsh Failed with error: " + err.message,
            NotificationChannels.Alerts, [], "admins");
    });
}

async function syncBorn2WinUsers(sinceDate?: any) {
    let offset = null;
    let count = 0;
    let countActive = 0;
    const airTableMainBase = mainBase.value();
    const apiKey = born2winApiKey.value();
    // let notifyForNewUsers = true;
    if (!sinceDate) {
        sinceDate = dayjs().subtract(25, "hour");
        // notifyForNewUsers = false;
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
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון", "phone_e164", "manychat_id"],
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
                phone: user.fields.phone_e164,
                mahoz: user.fields["מחוז"][0],
                volId: user.id,
                manychat_id: user.fields.manychat_id,
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
        // no need for now
        //         if (notifyForNewUsers && newLinksToAdmin.length > 0) {
        //             const admins = await db.collection(Collections.Admins).get();
        //             const adminsIds = admins.docs.map(doc => doc.id);

        //             await Promise.all(newLinksToAdmin.map(link => addNotificationToQueue("לינק למשתמש", `שם: ${link.name}
        // טלפון: ${link.phone}
        // לינק לשליחה למשתמש: ${link.link}
        // `, NotificationChannels.Links, [], adminsIds)));
        //         }
        return;
    });
}

function getRegistrationLink(userId: string, otp: string): string {
    return `https://${appHost}?vid=${userId}&otp=${otp}`;
}
