

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
    Collections, FamilityDemandUpdatePayload, FamilyDemand, FamilyDetails, LoginInfo,
    NotificationActions, NotificationUpdatePayload, Recipient, SearchUsersPayload, SendMessagePayload,
    SendNotificationStats, TokenInfo, UpdateUserLoginPayload, UserInfo, UserRecord,
    FamilityDetailsPayload,
    NotificationChannels,
    GenerateLinkPayload,
    OpenFamilyDemands,
    VolunteerInfo,
    VolunteerInfoPayload,
    GetDemandsPayload,
    Errors,
    Status,
    UpdateDemandTransportationPayload,
    FamilyCompact,
    SearchFamilyPayload,
    Holiday,
    UpsertHolidayPayload,
    GetRegisteredHolidaysPayload,
    AdminAuthorities,
    District,
} from "../../src/types";
import axios from "axios";
import express = require("express");
import crypto = require("crypto");
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { getSafeFirstArrayElement, IL_DATE, replaceAll, simplifyFamilyName } from "../../src/utils";
import localeData = require("dayjs/plugin/localeData");
import { SendLinkOrInstall, weeklyNotifyFamilies } from "./scheduled-functions";
import { AirTableQuery, AirTableUpdate, CachedAirTable } from "./airtable";
import { getDemands2, updateFamilityDemand } from "./demands";
import { getFamilyDetails2, searchFamilies } from "./families";
import { Lock } from "./lock";
import { deleteHoliday, getHolidays, upsertHoliday } from "./holidays";

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
export const DATE_AT = "YYYY-MM-DD";
const DATE_BIRTHDAY = "DD-MM";
export const db = getFirestore();

const appHost = "app.born2win.org.il";

export const born2winApiKey = defineString("BORN2WIN_API_KEY");
export const manyChatApiKey = defineString("BORN2WIN_MANYCHAT_API_KEY");

export const mainBase = defineString("BORM2WIN_MAIN_BASE");

const usersWebHookID = defineString("BORM2WIN_AT_WEBHOOK_USERS_ID");
const usersWebHookMacSecretBase64 = defineString("BORM2WIN_AT_WEBHOOK_USERS_MAC");

const familiesWebHookID = defineString("BORM2WIN_AT_WEBHOOK_FAMILIES_ID");
const familiesWebHookMacSecretBase64 = defineString("BORM2WIN_AT_WEBHOOK_FAMILIES_MAC");

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
        logger.error("Request had invalid credentials.");
        throw new HttpsError("unauthenticated", "Request had invalid credentials.");
    }

    const uid = request.auth.uid;
    if (!uid) {
        logger.error("Request is missing uid.");
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }

    const uulp = request.data as UpdateUserLoginPayload;
    const now = dayjs().utc().tz(JERUSALEM);

    let doc;

    if (uulp.volunteerId) {
        // Android or iOS phase 1
        // -----------------------
        doc = await getUserByID(uulp.volunteerId);
        if (!doc) {
            logger.error("Volunteer ID not found", uulp);
            throw new HttpsError("not-found", "Volunteer ID not found");
        }

        // Validate OTP (for Android and Phase 1 of iOS)
        const devOtp = doc.data()?.devOtp;
        const otpValid = devOtp ?
            uulp.otp === devOtp :
            validateOTPOrFingerprint(uulp.otp, doc.data()?.otp, doc.data()?.otpCreatedAt, 30);

        if (!otpValid) {
            logger.error("Invalid or expired OTP", uulp);
            throw new HttpsError("invalid-argument", "Invalid or expired OTP");
        }

        if (uulp.isIOS && !uulp.fingerprint) {
            logger.error("Missing fingerpring", uulp);
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

        if (!uulp.isIOS && doc.data()?.manychat_id !== undefined) {
            await updateVolunteerHasInstalled(doc.id, now.format(DATE_AT));
        }

        // Return volunteerID
        return doc.id;
    } else if (uulp.fingerprint && uulp.isIOS) {
        // Phase 2 of iOS
        doc = await findUserByFingerprint(uulp.fingerprint);

        if (!doc) {
            logger.info("Fingerprint not found", uulp);
            throw new HttpsError("not-found", "Fingerprint not found");
        }
        const devOtp = doc.data()?.devOtp;

        const fpValid = validateOTPOrFingerprint(uulp.fingerprint, doc.data()?.fingerprint, doc.data()?.otpCreatedAt, 1);
        if (!fpValid) {
            logger.error("Invalid or expired Fingerpring", uulp, doc.data()?.fingerprint, doc.data()?.otpCreatedAt);
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

        await updateVolunteerHasInstalled(doc.id, now.format(DATE_AT));

        // Return volunteerID for Phase 2
        return doc.id;
    } else if (uulp.phone) {
        // Phone flow
        doc = await findUserByPhone(uulp.phone);
        if (!doc) {
            logger.error("User with given phone is not known", uulp);
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

                await updateVolunteerHasInstalled(doc.id, now.format(DATE_AT));

                // All set
                return doc.id;
            } else {
                logger.error("Invalid or expired OTP - 2", uulp, doc.data().otp, doc.data().otpCreatedAt);
                throw new HttpsError("invalid-argument", "Invalid or expired OTP");
            }
        }
        return ""; // not yet sending volunteer Id
    } else {
        logger.error("Missing volunteerID or fingerprint", uulp);
        throw new HttpsError("invalid-argument", "Missing volunteerID or fingerprint");
    }
});

async function updateVolunteerHasInstalled(volunteerId: string, date: string) {
    const updatedFields = {
        fields: {
            "תאריך התקנת אפליקציה": dayjs(date).format("YYYY-MM-DD"),
        },
    };
    // eslint-disable-next-line new-cap
    return AirTableUpdate("מתנדבים", volunteerId, updatedFields).catch(err => {
        logger.error("Error saving installation info in AirTable", err);
    });
}

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
        let sendWelcome = false;

        const update: any = {};
        if (unp.notificationOn !== undefined) {
            update.notificationOn = unp.notificationOn;
            dirty = true;
        }

        if (unp.tokenInfo !== undefined) {
            if (doc.data().notificationTokens === undefined || doc.data().notificationTokens.length === 0) {
                update.notificationTokens = [{ ...unp.tokenInfo, uid }];
                dirty = true;
                sendWelcome = true;
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
            return doc.ref.update(update).then(() => {
                if (sendWelcome) {
                    const gender = doc.data().gender;
                    const greeting = gender === "אישה" ?
                        "ברוכה הבאה" : (gender === "גבר" ? "ברוך הבא" : "ברוכים הבאים");


                    return addNotificationToQueue(`${greeting} ${doc.data().firstName} 💜`, `שמחים שהצטרפת לאפליקצית נולדת לנצח. מומלץ לעשות סיור בכל הלשוניות -

הודעות: לכאן תגענה הודעות מהמערכת אליך
שיבוצים: משמש לרישום להתנדבות
התנדבויות: לראות את כל ההתנדבויות שנרשמת אליהן, ופרטי המשפחה
גלריה: תמונות של ארוחות לקבלת רעיונות

התנדבות נעימה
                    `, NotificationChannels.Greetings, [], [doc.id]);
                }
                return;
            });
        }
    }
    return;
});


exports.GetUserInfo = onCall({ cors: true }, getUserInfo);

async function getUserInfo(request: CallableRequest<any>): Promise<UserInfo> {
    const doc = await authenticate(request);
    const data = doc.data();
    const allDistricts = await getDestricts();
    let availableDistricts: District[] = [];

    // Calculate the admin's districts
    if (data.adminDistricts && data.adminDistricts.length > 0) {
        if (data.adminDistricts[0] == "all") {
            availableDistricts = allDistricts.map(district => ({ id: district.id, name: district.name }));
        } else {
            data.adminDistricts.forEach((ad: string) => {
                const district = allDistricts.find(d => d.id === ad);
                if (district) {
                    availableDistricts.push({ id: district.id, name: district.name });
                }
            });
        }
    } else {
        availableDistricts = data.districts.map((district: string) => allDistricts.find(d => d.id === district));
    }

    return {
        id: doc.id,
        notificationOn: data.notificationOn,
        notificationToken: data.notificationTokens?.find((tokenInfo: TokenInfo) => tokenInfo.uid === request.auth?.uid),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        userDistrict: data.districts.length > 0 ? data.districts[0] : { id: "N/A", name: "N/A" }, // Deprecetated
        userDistricts: data.districts, // holds ID of all districts the user volunteers in
        isAdmin: (data.isAdmin == true),
        adminAuthorities: data.adminAuthorities,
        districts: availableDistricts, // holds District id/name of all districts the user volunteers in, or relevant for admin
        needToSignConfidentiality: data.needToSignConfidentiality,
        active: data.active,
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
        return Array.from(users.values())
            .filter(u => !u.data().needToSignConfidentiality) // ommit users who did not sign confidentiality agreement
            .map(u => ({
                name: u.data().firstName + " " + u.data().lastName,
                id: u.id,
                phone: u.data().phone,
                districts: u.data().districts,
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

export async function addNotificationToQueue(title: string, body: string, channel: NotificationChannels,
    toDistricts: string[], toRecipients: string[] | string, data?: { [key: string]: string }, delayInMin?: number) {
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
        ...(delayInMin && delayInMin > 0 ? { delayInMin } : {}),
    }).then(() => docRef.id);
}

exports.OnNotificationAdded = onDocumentCreated(`${Collections.Notifications}/{docId}`, async (event) => {
    if (event.data) {
        const payloadData = event.data.data();
        const { title, body, toRecipients, toDistricts, delayInMin } = payloadData;
        const data = payloadData.data ? JSON.parse(payloadData.data) : undefined;

        if (delayInMin > 0) {
            await db.collection(Collections.DeferredNotifications).doc().create({
                notificationDocId: event.params.docId,
                notBefore: dayjs().add(delayInMin, "minutes").format(DATE_TIME),
            });
            return;
        }

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
            updateUser.adminAuthorities = docAfter.data()?.authorities;
        } else {
            updateUser.isAdmin = false;
            updateUser.adminDistricts = FieldValue.delete();
            updateUser.adminAuthorities = FieldValue.delete();
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
    const districts = doc.data().districts;

    const NotificationsRef = db.collection(Collections.Notifications);

    const waitFor = [
        NotificationsRef.where("toRecipients", "array-contains", doc.id).get(),
        NotificationsRef.where("toDistricts", "array-contains", "all").get(),
    ];

    districts.forEach((d: string) => {
        waitFor.push(NotificationsRef.where("toDistricts", "array-contains", d).get());
    });

    return Promise.all(waitFor).then(all => {
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
            const districtUsersSnapshot = await usersRef.where("districts", "array-contains", districtId).get();
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
    }

    return webPushDevices;
}

// Utility function to chunk an array into smaller arrays
export function chunkArray(array: any[], chunkSize: number) {
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
        logger.info("Request has invalid credentials.");
        throw new HttpsError("unauthenticated", "Request has invalid credentials.");
    }
    const uid = request.auth.uid;
    if (!uid) {
        logger.info("Request is missing uid.", request.auth);
        throw new HttpsError("unauthenticated", "Request is missing uid.");
    }

    const impersonateUser = request.data?.impersonateUser;

    // TEMP anonymous access - remove after app-adoption
    if (impersonateUser && impersonateUser.startsWith("OLD:")) {
        logger.warn("Old link access blocked", impersonateUser);
        throw new HttpsError("permission-denied", Errors.OldLinkBlocked);

        // const oldAccessUserID = impersonateUser.substring(4);
        // const impersonateDoc = await getUserByID(oldAccessUserID);
        // if (!impersonateDoc) {
        //     throw new HttpsError("not-found", "impersonated user not found");
        // }

        // if (impersonateDoc.data()?.loginInfo && impersonateDoc.data()?.loginInfo.length > 0) {
        //     // user is already onboarded to app - reject old access
        //     logger.warn(Errors.UserAlreadyOnboardedToApp, oldAccessUserID);
        //     throw new HttpsError("permission-denied", Errors.UserAlreadyOnboardedToApp);
        // }

        // return impersonateDoc as QueryDocumentSnapshot;
    }

    const doc = await findUserByUID(uid);
    if (!doc) {
        logger.warn("unauthorized user - unknown uid", uid);
        throw new HttpsError("unauthenticated", "unauthorized user");
    }
    if (!doc.data().active) {
        logger.warn("unauthorized user - user inactive", doc.id);
        throw new HttpsError("unauthenticated", Errors.InactiveUser);
    }

    if (request.data && impersonateUser) {
        const adminDoc = await db.collection(Collections.Admins).doc(doc.id).get();
        if (!adminDoc.exists) {
            logger.error("not authorized to impersonate", doc.id);
            throw new HttpsError("permission-denied", "not authorized to impersonate");
        }

        // Admin can impersonate to another user
        const impersonateDoc = await getUserByID(impersonateUser);
        if (!impersonateDoc) {
            logger.warn("not authorized to impersonate", doc.id, impersonateUser);
            throw new HttpsError("not-found", "impersonated user not found");
        }
        if (impersonateDoc && !impersonateDoc.data()?.active) {
            logger.info("Inactive impersonated user", doc.id, impersonateUser);
            throw new HttpsError("permission-denied", "Inactive impersonated user");
        }
        // for change of type, as we only use id and data() - hack
        return impersonateDoc as QueryDocumentSnapshot;
    }
    return doc;
}


const districts = new CachedAirTable<District>("מחוז", (district => {
    return {
        id: district.id,
        name: district.fields.Name,
    };
}), [], 60 * 24);

export async function getDestricts() {
    return districts.get();
}

interface City {
    id: string;
    name: string;
    district: string;
}

// Cities cache
const cities = new CachedAirTable<City>("ערים", (city => {
    return {
        id: city.id,
        name: city.fields["שם"].replaceAll("\n", "").replaceAll("\"", "").trim(),
        district: city.fields["מחוז"][0],
    };
}), ["{כמות משפחות פעילות בעיר}>0"], 60 * 24);


export async function getCities(): Promise<City[]> {
    return cities.get();
}


exports.GetOpenDemands2 = onCall({ cors: true }, async (request): Promise<OpenFamilyDemands> => {
    const doc = await authenticate(request);

    const districts = doc.data().districts;
    const cities = await getCities();
    const demands = await getDemands2(districts, Status.Available, dayjs().add(1, "day").format(DATE_AT), dayjs().add(45, "days").format(DATE_AT));
    return { demands, allDistrictCities: cities.filter(city => districts.some((d: string) => city.district === d)) };
});


exports.GetDemandsNew = onCall({ cors: true }, async (request): Promise<FamilyDemand[]> => {
    const userInfo = await getUserInfo(request);
    if (userInfo.isAdmin) {
        const gdp = request.data as GetDemandsPayload;
        return await getDemands2(gdp.districts, undefined, gdp.from, gdp.to);
    }
    throw new HttpsError("permission-denied", "Unauthorized user to read all demands");
});

exports.GetUserRegistrationsNew = onCall({ cors: true }, async (request): Promise<FamilyDemand[]> => {
    const doc = await authenticate(request);
    const districts = doc.data().districts;
    const volunteerId = doc.id;
    return getDemands2(districts, Status.Occupied, dayjs().startOf("month").format(DATE_AT), dayjs().add(45, "days").format(DATE_AT), volunteerId);
});

exports.UpdateDemandTransportation = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);
    if (!userInfo.isAdmin) {
        throw new HttpsError("permission-denied", "Only Admin may set transportation");
    }

    const udtp = request.data as UpdateDemandTransportationPayload;

    const transpotingVolunteerId = udtp.transpotingVolunteerId;
    const lock = await Lock.acquire(db, udtp.demandId);
    if (!lock) {
        throw new HttpsError("already-exists", "מתנדב אחר מעדכן את הרשומה הזו ממש עכשיו");
    }

    const updateTransportationFields = {
        fields: {
            "מתנדב משנע": transpotingVolunteerId && transpotingVolunteerId.length > 0 ? [transpotingVolunteerId] : [],
        },
    };
    // eslint-disable-next-line new-cap
    await AirTableUpdate("ארוחות", udtp.demandId, updateTransportationFields)
        .then(() => logger.info("Transporating volunteer is added", udtp.demandId, "transport-vid", transpotingVolunteerId))
        .finally(() => {
            lock.release();
        });
});


exports.UpdateFamilityDemandNew = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);
    const fdup = request.data as FamilityDemandUpdatePayload;

    const demandDistrictId = (fdup.district);
    const volunteerId = (fdup.volunteerId || userInfo.id);

    const demandDistrict = userInfo.districts.find(d => d.id == demandDistrictId);
    if (!demandDistrict) throw new HttpsError("not-found", "District " + demandDistrictId + " not in scope of the user");

    if (!fdup.isRegistering && !(fdup.reason && fdup.reason.trim().length > 0)) {
        throw new HttpsError("invalid-argument", "Missing cancellation reason");
    }
    return updateFamilityDemand(fdup.demandId, demandDistrictId, fdup.isRegistering, volunteerId, userInfo.firstName + " " + userInfo.lastName, fdup.reason);
});

exports.GetFamilyDetailsNew = onCall({ cors: true }, async (request): Promise<FamilyDetails> => {
    const userInfo = await getUserInfo(request);
    const gfp = request.data as FamilityDetailsPayload;

    if (!gfp.mainBaseFamilyId) {
        throw new HttpsError("invalid-argument", "Family ID is missing");
    }

    const demandDistrict = userInfo.districts.find(d => d.id == gfp.district);
    if (!demandDistrict) {
        logger.error("Permission denied to read family details", userInfo.id, userInfo.userDistrict, userInfo.isAdmin, gfp.district, "admin regions:", userInfo.districts);
        throw new HttpsError("permission-denied", "Unauthorized to read family details from this district");
    }

    const family = getFamilyDetails2(gfp.mainBaseFamilyId, gfp.includeContacts);
    if (family) {
        return family;
    }
    throw new HttpsError("not-found", "Family not found");
});

exports.SearchFamilies = onCall({ cors: true }, async (request): Promise<FamilyCompact[]> => {
    const userInfo = await getUserInfo(request);
    const sfp = request.data as SearchFamilyPayload;

    if (!userInfo.isAdmin) {
        throw new HttpsError("permission-denied", "Only Admin may search families");
    }

    return searchFamilies(sfp.searchStr);
});

exports.GetRegisteredHolidays = onCall({ cors: true }, async (request): Promise<Holiday[]> => {
    const userInfo = await getUserInfo(request);
    const grhp = request.data as GetRegisteredHolidaysPayload;
    if (userInfo.isAdmin && userInfo.adminAuthorities?.includes(AdminAuthorities.ManageHoliday)) {
        return getHolidays(grhp.from, grhp.to);
    }

    throw new HttpsError("permission-denied", "Only Admin may read holidays");
});

exports.UpsertHoliday = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);
    const uhp = request.data as UpsertHolidayPayload;

    if (userInfo.isAdmin && userInfo.adminAuthorities?.includes(AdminAuthorities.ManageHoliday)) {
        return upsertHoliday(uhp.holiday);
    }

    throw new HttpsError("permission-denied", "Only Holiday Admins may update holidays");
});

exports.DeleteHoliday = onCall({ cors: true }, async (request) => {
    const userInfo = await getUserInfo(request);

    if (userInfo.isAdmin && userInfo.adminAuthorities?.includes(AdminAuthorities.ManageHoliday)) {
        return deleteHoliday(request.data);
    }

    throw new HttpsError("permission-denied", "Only Holiday Admin may delete holidays");
});


exports.GetVolunteerInfo = onCall({ cors: true }, async (request): Promise<VolunteerInfo | undefined> => {
    const userInfo = await getUserInfo(request);

    if (userInfo.isAdmin) {
        const cities = await getCities();
        const vip = request.data as VolunteerInfoPayload;
        const volunteerDoc = await db.collection(Collections.Users).doc(vip.volunteerId).get();
        if (volunteerDoc && volunteerDoc.exists) {
            const data = volunteerDoc.data();
            if (data) {
                const allDistricts = await getDestricts();
                const volunteerDistricts = data.districts.flatMap((id: string) => allDistricts.find(dist => dist.id === id));
                return {
                    id: volunteerDoc.id,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    city: cities.find(c => c.id == data.cityId)?.name || "N/A",
                    districts: volunteerDistricts,
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
    const providedHmac = req.headers["x-airtable-content-mac"];
    logger.info("verifyAirtableWebhook", req.body, providedHmac);
    const macSecretDecoded = Buffer.from(secret, "base64");
    const body = Buffer.from(JSON.stringify(req.body), "utf8");
    const hmac = crypto.createHmac("sha256", macSecretDecoded);
    hmac.update(body.toString(), "ascii");
    const expectedContentHmac = "hmac-sha256=" + hmac.digest("hex");
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

app.post("/airtable/families", (req, res) => {
    if (!verifyAirtableWebhook(req, familiesWebHookMacSecretBase64.value())) {
        logger.info("Airtable Families Webhook GET: unverified", req.headers["x-airtable-content-mac"], JSON.stringify(req.body));
        return res.status(403).send("Unauthorized request");
    }
    logger.info("Airtable Families Webhook GET: ", JSON.stringify(req.body));

    return syncBorn2WinFamilies().then(() => {
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
 * weekday: day in the week 0-Sun, 2-Mon,...6-Sat, * for every day
 * callback: an async function to call at the scheduled time
*/

const schedules = [
    { desc: "Refresh webhook registration", min: 0, hour: [12], weekDay: "*", callback: refreshWebhooksToken },
    { desc: "Sync Born2Win users daily", min: 0, hour: [17], weekDay: "*", callback: syncBorn2WinUsers },
    { desc: "Sync Born2Win families daily", min: 1, hour: [17], weekDay: "*", callback: syncBorn2WinFamilies },
    { desc: "Alert 5 days ahead open demand", min: 40, hour: [13], weekDay: "*", callback: alertOpenDemands },
    { desc: "Alert 72 hours before cooking", min: 0, hour: [10], weekDay: "*", callback: alertUpcomingCooking },
    { desc: "Birthdays greeting", min: 0, hour: [10], weekDay: "*", callback: greetingsToBirthdays },
    { desc: "Weekly Message to Families", min: 0, hour: [20], weekDay: "6", callback: weeklyNotifyFamilies },
    { desc: "Links to install or old-link on Sunday at 09:00", min: 0, hour: [9], weekDay: 0, callback: SendLinkOrInstall },
    { desc: "Reminder to all volunteers via app", min: 0, hour: [10], weekDay: 0, callback: remindVolunteersToRegister },
    { desc: "Deffered Notifications", min: [0, 30], hour: "*", weekDay: "*", callback: checkDeferredNotifications },
    // todo - archive notifications
];

function check(obj: any, fieldName: string, value: any) {
    const expectedValue = obj && obj[fieldName];
    if (expectedValue == "*") return true;
    if (expectedValue == value) return true;

    if (Array.isArray(expectedValue)) {
        return expectedValue.some(v => v == value);
    }
    return false;
}


exports.doSchedule = onSchedule({
    schedule: "every 1 minutes",
    timeZone: "Asia/Jerusalem",
    region: "europe-west1",
    timeoutSeconds: 300,
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

async function checkDeferredNotifications() {
    const now = dayjs().format(DATE_TIME);
    const deferredNotifications = await db.collection(Collections.DeferredNotifications).where("notBefore", "<", now).get();
    if (!deferredNotifications.empty) {
        const batch = db.batch();
        for (const deferedNotif of deferredNotifications.docs) {
            const notificationDocId = deferedNotif.data().notificationDocId;
            const notifDoc = await db.collection(Collections.Notifications).doc(notificationDocId).get();
            if (notifDoc.exists) {
                // create new record without delay
                const notifData = notifDoc.data();
                if (notifData) {
                    delete notifData.delayInMin;
                    batch.create(db.collection(Collections.Notifications).doc(), notifData);
                }
            }
            // remove the deferred delay record
            batch.delete(deferedNotif.ref);
        }
        batch.commit();
    }
}

async function remindVolunteersToRegister() {
    const query = new AirTableQuery<{ id: string, familyCount: number }>("מחוז", (rec) => ({
        id: rec.id,
        familyCount: rec.fields["כמות משפחות פעילות במחוז"],
    }));
    const districtsIdsWithFamilies = (await query.execute()).filter(d => d.familyCount > 0).map(d => d.id);

    await addNotificationToQueue("תזכורת לשיבוצים!",
        "הכנסו לאפליקציה לבחור למי תתנו חיבוק החודש. ניתן להרשם בלשונית השיבוצים", NotificationChannels.Registrations, districtsIdsWithFamilies, []);
}

async function greetingsToBirthdays() {
    const today = dayjs().format(DATE_BIRTHDAY);
    const allUsers = await db.collection(Collections.Users).where("birthDate", "==", today).get();
    const users = allUsers.docs.filter(u => u.data().active === true);
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (user.data().notificationOn === true) {
            await addNotificationToQueue(`יום הולדת שמח ${user.data().firstName} 💜`, "", NotificationChannels.Greetings,
                [], [user.id], { fullImage: user.data().gender === "אישה" ? "birthday-female" : "birthday-male" });
        }
    }

    const districts = await getDestricts();

    // Notify Managers
    const usersList = users.map(user => `- ${user.data().firstName} ${user.data().lastName} (${districts.find(d => (user.data().districts?.length > 0 && d.id === user.data().districts[0]))?.name || ""}) tel:+${user.data().phone}`);
    if (usersList.length > 0) {
        return addNotificationToQueue("ימי הולדת היום 💜", `הנה רשימת המתנדבים שהיום יום הולדתם:\n${usersList.join("\n")}`, NotificationChannels.Alerts,
            [], "admins");
    }
    return;
}

async function alertOpenDemands() {
    const districts = await getDestricts();
    const admins = await db.collection(Collections.Admins).get();
    const adminsIds = admins.docs.map(doc => doc.id);
    const waitFor = [];

    let adminMsg = "";
    let notifyAdmins = false;

    for (let i = 0; i < districts.length; i++) {
        const openDemands = await getDemands2(districts[i].id, Status.Available, dayjs().add(1, "day").format(DATE_AT), dayjs().add(5, "days").format(DATE_AT));
        let msgBody = "מחוז: " + districts[i].name + "\n";
        if (openDemands.length > 0) {
            let found = false;
            openDemands.filter(od => !od.familyLastName.includes("בדיקה")).forEach(od => {
                const daysLeft = Math.abs(dayjs().diff(od.date, "days"));
                if (daysLeft > 0) {
                    found = true;
                    const simplifedName = simplifyFamilyName(od.familyLastName);
                    msgBody += `- ${simplifedName} - ${od.familyCityName} (עוד ${daysLeft} ימים)` + "\n";
                }
            });
            if (found) {
                adminMsg += msgBody;
                notifyAdmins = true;
                // for now do not send the district's users, only admins
                // waitFor.push(addNotificationToQueue("שיבוצים חסרים - 5 ימים קרובים", msgBody, NotificationChannels.Alerts, [districts[i].id], []));
            }
        }
    }

    if (notifyAdmins) {
        waitFor.push(addNotificationToQueue("הודעת מנהל: חוסרים 5 ימים קרובים", adminMsg, NotificationChannels.Alerts, [], adminsIds));
    }

    Promise.all(waitFor);
}

async function alertUpcomingCooking() {
    const daysBefore = 3;
    const upcomingDemands = await getDemands2(undefined, Status.Occupied, dayjs().format(DATE_AT), dayjs().add(daysBefore + 1, "days").format(DATE_AT));
    for (let j = 0; j < upcomingDemands.length; j++) {
        const demand = upcomingDemands[j];

        if (!demand.volunteerId) {
            // unexpected
            logger.error(`Demand ${demand.id}, date:${demand.date}, district:${demand.district} name:${demand.familyLastName} is in status תפוס but has no volenteerId`);
            continue;
        }

        const daysLeft = -dayjs().startOf("day").diff(demand.date, "days");

        if (daysLeft === daysBefore) {
            const msgBody = `תאריך הבישול: ${dayjs(demand.date).format(IL_DATE)}
עוד: ${daysBefore} ימים
משפחה: ${demand.familyLastName}
עיר: ${demand.familyCityName}
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

async function refreshWebhooksToken() {
    await refreshWebhookToken(usersWebHookID.value());
    await refreshWebhookToken(familiesWebHookID.value());
}

async function refreshWebhookToken(webhookID: string) {
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
            logger.info("Refresh Webhook Succeeded");
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

    const url = `https://api.airtable.com/v0/${airTableMainBase}/${encodeURIComponent("מתנדבים")}`;
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
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון", "phone_e164", "manychat_id", "תאריך לידה", "מגדר", "חתם על שמירת סודיות", "תעודת זהות", "ערים"],
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
            const isNeedToSignConfidentiality = (user.fields["חתם על שמירת סודיות"] !== "חתם");

            const userRecord = {
                active: user.fields["פעיל"] == "פעיל",
                firstName: user.fields["שם פרטי"] || "missing",
                lastName: user.fields["שם משפחה"] || "missing",
                lastModified: now,
                phone: user.fields.phone_e164?.trim() || "",
                mahoz: getSafeFirstArrayElement(user.fields["מחוז"], ""), // deprecated
                districts: user.fields["מחוז"] || [],
                birthDate: user.fields["תאריך לידה"] ? dayjs(user.fields["תאריך לידה"]).format(DATE_BIRTHDAY) : "",
                gender: (user.fields["מגדר"] || "לא ידוע"),
                volId: user.id,
                manychat_id: user.fields.manychat_id || "",
                cityId: getSafeFirstArrayElement(user.fields["ערים"], ""),
            } as UserRecord;

            if (userDoc && userDoc.exists) {
                const prevUserRecord = userDoc.data();
                if (prevUserRecord &&
                    userRecord.active === prevUserRecord.active &&
                    userRecord.firstName === prevUserRecord.firstName &&
                    userRecord.lastName === prevUserRecord.lastName &&
                    userRecord.phone === prevUserRecord.phone &&
                    userRecord.birthDate === prevUserRecord.birthDate &&
                    userRecord.gender === prevUserRecord.gender &&
                    userRecord.cityId === prevUserRecord.cityId &&
                    (isNeedToSignConfidentiality && prevUserRecord.needToSignConfidentiality ||
                        (!isNeedToSignConfidentiality && !prevUserRecord.needToSignConfidentiality))
                ) {
                    // No change!
                    continue;
                }

                // update it
                if (prevUserRecord && userRecord.active !== prevUserRecord.active && userRecord.active) {
                    // user has changed to active, add OTP and send it to admins
                    userRecord.otp = crypto.randomUUID();
                    userRecord.otpCreatedAt = dayjs().format(DATE_TIME);
                }

                if (prevUserRecord && prevUserRecord.needToSignConfidentiality && !isNeedToSignConfidentiality) {
                    userRecord.needToSignConfidentiality = FieldValue.delete();
                }

                batch.update(userDoc.ref, userRecord as any);
            } else {
                // create new
                if (userRecord.active) {
                    userRecord.otp = crypto.randomUUID();
                    userRecord.otpCreatedAt = dayjs().format(DATE_TIME);
                }

                if (isNeedToSignConfidentiality) {
                    userRecord.needToSignConfidentiality = generateSignConfidentialityURL(user.fields["שם פרטי"], user.fields["תעודת זהות"], userId);
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


async function syncBorn2WinFamilies() {
    let offset = null;
    let count = 0;
    let countActive = 0;
    const airTableMainBase = mainBase.value();
    const apiKey = born2winApiKey.value();

    const sinceDate = dayjs().subtract(25, "hour");

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss[z]");
    const becameActive = [];


    const cities = await getCities();
    const districts = await getDestricts();


    const url = `https://api.airtable.com/v0/${airTableMainBase}/${encodeURI("משפחות רשומות")}`;
    const batch = db.batch();
    do {
        const response: any = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            params: {
                filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
                fields: ["סטטוס בעמותה", "מחוז", "מאניצט לוגיסטי", "Name", "עיר", "שם איש קשר לוגיסטי"],
                offset: offset,
            },
        }).catch(err => {
            logger.error(err);
        });
        offset = response.data.offset;
        for (let i = 0; i < response.data.records.length; i++) {
            const family = response.data.records[i];
            const familyId = family.id;

            const docRef = db.collection("families").doc(familyId);
            const familyDoc = await docRef.get();

            const familyRecord = {
                active: family.fields["סטטוס בעמותה"] == "פעיל",
                lastModified: now,
                mahoz: family.fields["מחוז"][0],
                mainBaseFamilyId: family.id,
                manychat_id: family.fields["מאניצט לוגיסטי"][0],
                contactName: family.fields["שם איש קשר לוגיסטי"][0],
            };

            if (familyRecord.active) {
                countActive++;
            }

            if (familyDoc && familyDoc.exists) {
                const prevFamilyRecord = familyDoc.data();
                if (prevFamilyRecord && familyRecord.active === prevFamilyRecord.active) {
                    // No change!
                    continue;
                }
                count++;
                batch.update(familyDoc.ref, familyRecord);
            } else {
                count++;
                batch.create(docRef, familyRecord);
            }

            if (familyRecord.active) {
                // A new active family, or a family that has changed to active
                const city = cities.find(c => c.id === getSafeFirstArrayElement(family.fields["עיר"], ""));
                becameActive.push({
                    name: family.fields["Name"],
                    city: city?.name || "",
                    district: city ? districts.find(d => d.id === city.district)?.name || "" : "",
                });
            }
        }
    } while (offset);

    await batch.commit().then(async () => {
        logger.info("Sync Families: observed modified:", count, "observed Active", countActive);
    });

    if (becameActive.length > 0) {
        // Send notification to admins
        const admins = await db.collection(Collections.Admins).get();
        const adminsIds = admins.docs.map(doc => doc.id);

        await addNotificationToQueue("משפחה חדשה", becameActive.map(nf => `
משפחה: ${nf.name}
מחוז: ${nf.district}
עיר: ${nf.city}
`).join("\n---\n") + "\nבשעה הקרובה תשלח הודעה למתנדבי המחוז.", NotificationChannels.Alerts, [], adminsIds);

        // send a delayed message to the families' districts:
        for (const family of becameActive) {
            await addNotificationToQueue("הצטרפה משפחה חדשה", `
                משפחה: ${family.name}
                עיר: ${family.city}`, NotificationChannels.Alerts, [family.district], [], {}, 65);
        }
    }
}

function generateSignConfidentialityURL(firstName: string, identificationId: string, volunteerId: string) {
    const entry = {
        identitycard: identificationId,
        name: firstName,
        recordid: volunteerId,
    };

    return `https://born2win.org.il/confidentiality-and-privacy/?entry=${encodeURI(JSON.stringify(entry))}`;
}

function getRegistrationLink(userId: string, otp: string): string {
    return `https://${appHost}?vid=${userId}&otp=${otp}`;
}
