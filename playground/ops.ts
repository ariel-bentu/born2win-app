import axios from "axios";
import dayjs, { Dayjs } from "dayjs";

import { AirTableRecord, Collections, FamilyDemand, FamilyDetails, UserRecord, NotificationChannels, GenerateLinkPayload, OpenFamilyDemands, VolunteerInfo, VolunteerInfoPayload, GetDemandsPayload, Errors, Status, Contact, VolunteerType, EventType } from "../src/types";
export const DATE_AT = "YYYY-MM-DD";
const DATE_TIME = "YYYY-MM-DD HH:mm";

import { getFirestore, FieldValue, QueryDocumentSnapshot, DocumentSnapshot, FieldPath } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
var admin = require("firebase-admin");

interface District {
    id: string;
    name: string;
    base_id: string;
    demandsTable: string;
    familiesTable: string;
}
const os = require('os');
const path = require('path');

const homeDirectory = os.homedir();
const serviceAccountPath = "../creds.json";
//path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'firebase', 'born2win-prod-firebase-adminsdk-dltch-7d0cd3c9f4.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    storageBucket: "born2win-prod.appspot.com",
});

const db = getFirestore();
const bucket = getStorage().bucket();


const logger = {
    info: (...args: any[]) => { console.info(...args) }
}


class HttpsError extends Error {
    code: string;
    details?: any;

    constructor(code: string, message: string, details?: any) {
        super(message); // Call the Error constructor with the message
        this.code = code;
        this.details = details;

        // Set the prototype explicitly to allow instanceof checks
        Object.setPrototypeOf(this, HttpsError.prototype);
    }
}
function getSafeFirstArrayElement(arr: any[], defaultValue: any) {
    return arr && arr.length && arr[0] || defaultValue;
}


const born2winApiKey = {
    value: () => { return process.env.BORN2WIN_API_KEY }
}
const mainBase = {
    value: () => { return process.env.BORM2WIN_MAIN_BASE }
}

const manyChatApiKey = {
    value: () => { return process.env.BORN2WIN_MANYCHAT_API_KEY }
}
async function getDestricts(): Promise<District[]> {
    const apiKey = born2winApiKey.value();
    const airTableMainBase = mainBase.value();
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };

    const districtResponse = await axios.get(`https://api.airtable.com/v0/${airTableMainBase}/${encodeURIComponent("מחוז")}`, {
        headers,
    });
    return districtResponse.data.records.map((r: any) => ({
        id: r.id,
        name: r.fields["מחוז"],
        base_id: r.fields.base_id,
        demandsTable: r.fields.table_id,
        familiesTable: r.fields.table_familyid,
    }));

}


//------------

async function AirTableGet<T>(tableName: string, id: string, mapper: (t: AirTableRecord) => T): Promise<T> {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}/${id}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        Authorization: `Bearer ${apiKey}`,
    };

    const response: any = await axios.get(url, {
        headers,
    }).catch(err => {
        console.log(err)
    });
    return mapper(response.data);
}

export async function AirTableUpdate(tableName: string, id: string, updates: any) {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}/${id}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
    };

    return axios.patch(url, updates, {
        headers,
    });
}

export async function AirTableUpdateBatch(tableName: string, updates: any) {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
    };

    return axios.patch(url, updates, {
        headers,
    });
}


class AirTableQuery<T> {
    private tableName: string;
    private mapper: (record: AirTableRecord) => T;

    constructor(tableName: string, mapper: (record: AirTableRecord) => T) {
        this.tableName = tableName;
        this.mapper = mapper;
    }

    async execute(filters?: string[], apikey = "", baseIn = ""): Promise<T[]> {
        const base = baseIn.length > 0 ? baseIn : mainBase.value();
        const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(this.tableName)}`;

        let offset: string | undefined;
        const apiKey = apikey.length > 0 ? apikey : born2winApiKey.value();

        const headers = {
            Authorization: `Bearer ${apiKey}`,
        };
        let results: T[] = [];

        do {
            const params: any = { offset };
            if (filters && filters.length > 0) {
                params.filterByFormula = `AND(${filters.join(",")})`;
            }
            const response: any = await axios.get(url, {
                headers,
                params,
            }).catch(err => {
                console.log(err)
            });

            if (response && response.data) {
                offset = response.data.offset;
            } else {
                console.log("ttt")
            }
            if (response.data.records) {
                results = results.concat(response.data.records.map((record: AirTableRecord) => this.mapper(record)));
            }
        } while (offset);

        return results;
    }
}


interface CacheMetadata {
    lastFetched: number; // Timestamp in milliseconds
    etag: string; // ETag for cache validation
}

export class CachedAirTable<T> {
    private cachedData: T[] | undefined = undefined;
    private lastFetched: number = 0;
    private filters: string[];
    private query: AirTableQuery<T>;
    private cachedFilePath: string;
    private cacheMetadata: CacheMetadata | undefined = undefined;
    private isFetching: boolean = false;
    private fetchPromise: Promise<T[]> | null = null;

    /**
     * Constructor for CachedAirTable
     * @param tableName - Name of the Airtable table
     * @param mapper - Function to map Airtable records to type T
     * @param filters - Array of filter strings for Airtable queries
     * @param cacheFileName - Optional custom cache file name
     */
    constructor(
        tableName: string,
        mapper: (record: AirTableRecord) => T,
        filters: string[],
        cacheFileName?: string
    ) {
        this.filters = filters;
        this.query = new AirTableQuery<T>(tableName, mapper);
        this.cachedFilePath = cacheFileName
            ? `cache/${cacheFileName}.json`
            : `cache/${tableName}.json`; // Default cache file path
    }

    /**
     * Retrieves cached data or fetches new data from Airtable if cache is invalid or absent.
     * Utilizes both Firebase Storage and in-memory caching.
     * @param filterFromCache - Optional filter function to apply to cached data
     * @returns Promise resolving to an array of type T
     */
    async get(filterFromCache?: (t: T) => boolean): Promise<T[]> {
        const file = bucket.file(this.cachedFilePath);

        // read etag
        const metadata = await file.getMetadata().catch(() => {
            // kept blank as expected (file does not exists)
        });

        if (metadata) {
            const currentETag = metadata[0].etag;
            if (this.cachedData && this.cacheMetadata && currentETag === this.cacheMetadata.etag) {
                // Cache is consistent
                console.info(`In-memory cache valid for ${this.cachedFilePath}.`);
                return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
            } else {
                console.info(`New Cached file inconsistency detected for ${this.cachedFilePath}. Reloading cache.`);
                // Invalidate in-memory cache
                this.cachedData = undefined;
                this.cacheMetadata = undefined;
            }
        } else {
            console.info(`Cache file ${this.cachedFilePath} no longer exists. Reloading cache.`);
            // Invalidate in-memory cache
            this.cachedData = undefined;
            this.cacheMetadata = undefined;
        }

        // If a fetch is already in progress, wait for it
        if (this.isFetching && this.fetchPromise) {
            console.log(`Fetch in progress for ${this.cachedFilePath}. Waiting for existing fetch.`);
            return this.fetchPromise;
        }

        // Start fetching data
        this.isFetching = true;
        this.fetchPromise = this.fetchData(metadata != undefined, filterFromCache)
            .finally(() => {
                // Reset fetching state
                this.isFetching = false;
                this.fetchPromise = null;
            });
        const result = await this.fetchPromise;
        return result;
    }


    /**
     * Fetches data from Firebase Storage or Airtable, updates in-memory cache.
     * @param filterFromCache - Optional filter function
     * @returns Promise resolving to an array of type T
     */
    private async fetchData(exists: boolean, filterFromCache?: (t: T) => boolean): Promise<T[]> {
        const now = dayjs();
        const file = bucket.file(this.cachedFilePath);
        if (exists) {
            // Fetch file metadata
            const [metadata] = await file.getMetadata();
            const fileUpdated = dayjs(metadata.updated);

            // Download and parse cached data
            console.log(`Loading cached data from ${this.cachedFilePath}.`);
            const [contents] = await file.download();
            const cacheJson = JSON.parse(contents.toString('utf-8')) as CacheMetadata & { data: T[] };

            this.cachedData = cacheJson.data;
            this.lastFetched = cacheJson.lastFetched;
            this.cacheMetadata = {
                lastFetched: cacheJson.lastFetched,
                etag: metadata.etag || "",
            };

            return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
        } else {
            console.info(`Cache file ${this.cachedFilePath} does not exist. Fetching data from Airtable.`);
        }

        // Fetch data from Airtable
        const fetchedData: T[] = await this.query.execute(this.filters);

        // Prepare cache content
        const cacheContent = {
            data: fetchedData,
            lastFetched: now.valueOf(), // Timestamp in milliseconds
        };

        // Save cache to Firebase Storage
        await file.save(JSON.stringify(cacheContent), {
            contentType: 'application/json',
        });

        // Fetch updated metadata
        const [updatedMetadata] = await file.getMetadata();

        // Update in-memory cache
        this.cachedData = fetchedData;
        this.lastFetched = now.valueOf();
        this.cacheMetadata = {
            lastFetched: this.lastFetched,
            etag: updatedMetadata.etag || "",
        };

        console.log(`Cache updated for ${this.cachedFilePath}.`);

        return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
    }


    /**
     * Evicts the cached data by deleting the cache file from Firebase Storage and clearing in-memory cache.
     */
    async evict(): Promise<void> {
        const file = bucket.file(this.cachedFilePath);

        try {
            await file.delete();
            console.log(`Cache evicted: ${this.cachedFilePath} has been deleted.`);
        } catch (error: any) {
            if (error.code === 404) {
                console.warn(`Cache file ${this.cachedFilePath} does not exist.`);
            } else {
                console.error(`Error evicting cache file ${this.cachedFilePath}:`, error);
                throw error; // Rethrow to let the caller handle the error
            }
        }

        // Clear in-memory cache
        this.cachedData = undefined;
        this.cacheMetadata = undefined;
        this.lastFetched = 0;
    }
}

interface Family {
    id: string;
    name: string;
    district: string;
    days: number[];
    cityId: string;
    active: boolean;
}

const daysMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
}

interface City {
    id: string;
    name: string;
    district: string;
}

export interface Holiday {
    id: string;
    date: string;
    name: string;
    familyId?: string;
    familyName?: string;
    alternateDate?: string
    cityName?: string;
    district?: string;
    type: EventType;
}

function familyAirtable2Family(family: AirTableRecord): Family {
    return {
        id: family.id,
        name: family.fields.Name,
        district: getSafeFirstArrayElement(family.fields["מחוז"], ""),
        days: family.fields["Days of the Week"] ? family.fields["Days of the Week"].map((d: string) => daysMap[d]) : [],
        cityId: getSafeFirstArrayElement(family.fields["עיר"], ""),
        active: family.fields["סטטוס בעמותה"] == Status.Active,
    }
}

function holidayAirtable2Holiday(holiday: AirTableRecord, cityName?: string, district?: string): Holiday {
    return {
        id: holiday.id,
        name: holiday.fields.Name,
        date: holiday.fields["תאריך"],
        alternateDate: holiday.fields["תאריך חלופי"],
        familyId: getSafeFirstArrayElement(holiday.fields["משפחה"], undefined),
        familyName: getSafeFirstArrayElement(holiday.fields["שם משפחה"], undefined),
        cityName,
        district,
        type: holiday.fields["סוג"],
    };
}

const activeFamilies = new CachedAirTable<Family>("משפחות רשומות", familyAirtable2Family, [`{סטטוס בעמותה}='${Status.Active}'`]);
const cities = new CachedAirTable<City>("ערים", (city => {
    return {
        id: city.id,
        name: city.fields["שם"].replaceAll("\n", ""),
        district: city.fields["מחוז"][0],
    }
}), ["{כמות משפחות פעילות בעיר}>0"]);

function getCities() {
    return cities.get();
}

const holidays = new CachedAirTable<Holiday>("חגים וחריגים", holidayAirtable2Holiday, ["AND(IS_AFTER({תאריך}, DATEADD(TODAY(), -7, 'days')))"]);



export function dateInRange(date: string | Dayjs, start: string | Dayjs, end: string | Dayjs) {
    const dateS = dayjs(date).format(DATE_AT);
    const startS = dayjs(start).format(DATE_AT);
    const endS = dayjs(end).format(DATE_AT);

    return dateS >= startS && dateS <= endS;
}
const seperator = "$$";

function getCalcDemandID(familyId: string, date: string, cityId: string) {
    return familyId + seperator + date + seperator + cityId;
}

function isCalcDemandId(id: string): boolean {
    return id.indexOf(seperator) > 0;
}

function parseDemandID(id: string): { familyId: string, date: string, cityId: string } {
    const parts = id.split(seperator);
    if (parts.length < 3) {
        return { familyId: "", date: "", cityId: "" };
    }
    return {
        familyId: parts[0],
        date: parts[1],
        cityId: parts[2],
    };
}

function airtableArrayCondition(fieldName: string, value: string): string {
    return `FIND("${value}", ARRAYJOIN({${fieldName}}))> 0`;
}


function familyAirtable2FamilyDetails(rec: AirTableRecord, cityName: string, includeContacts: boolean = false): FamilyDetails {
    return {
        id: rec.id,
        familyLastName: rec.fields.Name,
        district: getSafeFirstArrayElement(rec.fields["מחוז"], ""),
        city: cityName,
        cityId: getSafeFirstArrayElement(rec.fields["עיר"], ""),
        mainBaseFamilyId: rec.id,
        patientAge: getSafeFirstArrayElement(rec.fields["גיל החולה"], 0),
        prefferedMeal: getSafeFirstArrayElement(rec.fields["העדפה לסוג ארוחה"], ""),
        meatPreferences: getSafeFirstArrayElement(rec.fields["העדפות בשר"], ""),
        fishPreferences: getSafeFirstArrayElement(rec.fields["העדפות דגים"], ""),
        avoidDishes: getSafeFirstArrayElement(rec.fields["לא אוכלים"], ""),
        sideDishes: getSafeFirstArrayElement(rec.fields["תוספות"], ""),
        kosherLevel: rec.fields["כשרות מטבח"],
        favoriteFood: rec.fields["אוהבים לאכול"],
        importantNotice: rec.fields["נא לשים לב"],
        alergies: getSafeFirstArrayElement(rec.fields["רגישויות ואלרגיות"], ""),
        adultsCount: getSafeFirstArrayElement(rec.fields["מספר נפשות הגרים בבית"], 1), // todo fix name of field
        familyStructure: getSafeFirstArrayElement(rec.fields["הרכב הורים"], ""),
        familyMembersAge: getSafeFirstArrayElement(rec.fields["גילאים של הרכב המשפחה"], ""),
        cookingDays: getSafeFirstArrayElement(rec.fields["ימים"], ""),

        street: rec.fields["רחוב"],
        floor: rec.fields["קומה"],
        appartment: rec.fields["דירה"],
        streatNumber: rec.fields["מספר הרחוב"],
        contactName: includeContacts ? rec.fields["שם איש קשר לוגיסטי"] : "",
        phone: includeContacts ? rec.fields["טלפון איש קשר לוגיסטי"] : "",
        relationToPatient: "", // todo
    };
}

async function GetFamilyDetails2(familyId: string, includeContacts: boolean): Promise<FamilyDetails> {
    const _cities = await cities.get();
    const getCityName = (id: string) => {
        const city = _cities.find(c => c.id == id);
        if (!city) {
            console.log("can't find city", id)
        }
        return city?.name || "";
    }

    return AirTableGet<FamilyDetails>("משפחות רשומות", familyId, (rec) =>
        familyAirtable2FamilyDetails(rec, getCityName(getSafeFirstArrayElement(rec.fields["עיר"], "")), includeContacts));
}


// יהודה ושומרון recxuE1Cwav0kfA7g
// צפון recLbwpPC80SdRmPO
// שרון recmLo9MWRxmrLEsM
// מרכז recP17rsfOseG3Frx
// getDemands2(["recP17rsfOseG3Frx", "recmLo9MWRxmrLEsM"], Status.Occupied, "2024-10-11", "2024-12-14", "rec2YAetKYmqRwO2k").then(demands => {
//     demands.forEach(d => console.log(d.date, d.status))

// });


// getDemands3(["recP17rsfOseG3Frx"], Status.Available, "2024-11-22", "2024-11-25").then(demands => {
//     demands
//         //.filter(d=>d.mainBaseFamilyId == "recwVL742srgkzO0u$$2024")
//         .forEach(d => console.log(d.date, d.status))
// })

async function syncBorn2WinFamilies() {
    let offset = null;
    let count = 0;
    let countActive = 0;
    const airTableMainBase = mainBase.value();
    const apiKey = born2winApiKey.value();

    const sinceDate = dayjs().subtract(25, "hour");

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss[z]");
    const becameActive = [];


    const _cities = await cities.get();
    const districts = await getDestricts();


    const url = `https://api.airtable.com/v0/${airTableMainBase}/${encodeURI("משפחות רשומות")}`;
    const batch = db.batch();
    do {
        const response: any = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            params: {
                //filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
                fields: ["סטטוס בעמותה", "מחוז", "מאניצט לוגיסטי", "Name", "עיר", "שם איש קשר לוגיסטי"],
                offset: offset,
            },
        }).catch(err => {
            console.error(err);
        });
        offset = response.data.offset;
        for (let i = 0; i < response.data.records.length; i++) {
            const family = response.data.records[i];
            const familyId = family.id;

            const docRef = db.collection("families").doc(familyId);
            const familyDoc = await docRef.get();
            const maid = getSafeFirstArrayElement(family.fields["מאניצט לוגיסטי"], "");
            if (maid == "") {
                console.log("Family with missing MAID", familyId, family.fields.Name);
            }

            const familyRecord = {
                active: family.fields["סטטוס בעמותה"] == "פעיל",
                lastModified: now,
                mahoz: getSafeFirstArrayElement(family.fields["מחוז"], ""),
                mainBaseFamilyId: family.id,
                manychat_id: maid,
                contactName: getSafeFirstArrayElement(family.fields["שם איש קשר לוגיסטי"], ""),
            };

            if (familyRecord.active) {
                countActive++;
            }

            if (familyDoc && familyDoc.exists) {
                const prevFamilyRecord = familyDoc.data();
                if (prevFamilyRecord &&
                    familyRecord.active === prevFamilyRecord.active &&
                    familyRecord.manychat_id === prevFamilyRecord.manychat_id &&
                    familyRecord.contactName === prevFamilyRecord.contactName &&
                    familyRecord.mahoz === prevFamilyRecord.mahoz) {
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
                const city = _cities.find(c => c.id === getSafeFirstArrayElement(family.fields["עיר"], ""));
                becameActive.push({
                    name: family.fields["Name"],
                    city: city?.name || "",
                    district: city ? districts.find(d => d.id === city.district) || "" : "",
                });
            }
        }
    } while (offset);

    await batch.commit().then(async () => {
        console.info("Sync Families: observed modified:", count, "observed Active", countActive);
    });

    if (becameActive.length > 0) {
        // Send notification to admins
        const admins = await db.collection(Collections.Admins).get();
        const adminsIds = admins.docs.map(doc => doc.id);

        console.log("משפחה חדשה", becameActive.map(nf => `
משפחה: ${nf.name}
מחוז: ${nf.district}
עיר: ${nf.city}`).join("\n---\n"), NotificationChannels.Alerts, [], adminsIds);
    }
}

//syncBorn2WinFamilies();
async function sendToManychat(manySubscriberId: string, manyChatFlowId: string, fields: { [key: string]: string }) {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };

    const fieldsArray = Object.keys(fields).map(fieldName => {
        return {
            field_name: fieldName,
            field_value: fields[fieldName],
        };
    });

    const payload = {
        subscriber_id: manySubscriberId,
        fields: fieldsArray,
    };

    if (fieldsArray.length > 0) {
        await axios.post("https://api.manychat.com/fb/subscriber/setCustomFields", payload, httpOptions);
    }

    return axios.post("https://api.manychat.com/fb/sending/sendFlow", {
        subscriber_id: manySubscriberId,
        flow_ns: manyChatFlowId,
    }, httpOptions);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

enum ManyChatFlows {
    FamilyFourWeekSummary = "content20241008192343_098603",
    SendOldLink = "content20230824123136_725765",
    SendInstallMessage = "content20241013201532_353172",
}

export async function SendLinkOrInstall() {
    const date = dayjs().format(DATE_AT);

    const query = new AirTableQuery<any>("מחוז", (rec) => ({
        id: rec.id,
        familyCount: rec.fields["כמות משפחות פעילות במחוז"],
    }))

    const districtsIdsWithFamilies = (await query.execute()).filter(d => d.familyCount > 0).map(d => d.id);


    const users = await db.collection(Collections.Users).where("active", "==", true).get();
    const relevantUsers = users.docs.filter(u =>
        u.data().uid == undefined &&
        u.data().manychat_id !== undefined &&
        u.data().sendWeeklyMessage !== date &&
        districtsIdsWithFamilies.includes(u.data().mahoz)
    );


    let bulk: Promise<any>[] = [];
    let totalInstall = 0;
    let totalLinks = 0;
    let errCount = 0;
    for (const user of relevantUsers) {
        if (bulk.length == 10) {
            await Promise.all(bulk);
            console.log("10 more send", totalInstall, "of", relevantUsers.length);
            await delay(1000);
            bulk = [];
        }
        bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendInstallMessage, {})
            .then(() => user.ref.update({ sendWeeklyMessage: date }))
            .catch(error => {
                console.log("Error sending install app message", error.message, "man_id", user.data().manychat_id);
                errCount++;
                return { user, error };
            }));

        totalInstall++;
    }
    await Promise.all(bulk);
    bulk = [];
    // for (const user of usersForLink) {
    //     if (bulk.length == 10) {
    //         await Promise.all(bulk);
    //         await delay(1000);
    //         console.log("10 more send", totalLinks, "of", usersForLink.length);
    //         bulk = [];
    //     }
    //     bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendOldLink, {})
    //         .then(() => user.ref.update({ sendWeeklyMessage: date }))
    //         .catch(error => {
    //             console.log("Error sending old link", error.message, "man_id", user.data().manychat_id);
    //             errCount++;
    //             return { user, error };
    //         }));

    //     totalLinks++;
    // }
    await Promise.all(bulk);

    console.log("Finish running. err", errCount, "install", totalInstall, "links", totalLinks);
}

//SendLinkOrInstall()
const DATE_BIRTHDAY = "DD-MM";

async function syncAllBorn2WinUsers() {
    let offset = null;
    let count = 0;
    let countActive = 0;
    const airTableMainBase = mainBase.value();
    const apiKey = born2winApiKey.value();

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
                //filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
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
                phone: user.fields.phone_e164 || "",
                mahoz: getSafeFirstArrayElement(user.fields["מחוז"], ""),
                birthDate: user.fields["תאריך לידה"] ? dayjs(user.fields["תאריך לידה"]).format(DATE_BIRTHDAY) : "",
                gender: (user.fields["מגדר"] || "לא ידוע"),
                volId: user.id,
                manychat_id: user.fields.manychat_id || "",
                cityId: getSafeFirstArrayElement(user.fields["ערים"], ""),
            } as UserRecord;

            if (!user.fields.manychat_id) {
                console.log("user with empty manichat_id", userRecord);
            }

            if (getSafeFirstArrayElement(user.fields["מחוז"], "") == "") {
                console.log("user with empty mahuz", userRecord);
            }

            if (userRecord.firstName == "missing" || userRecord.phone == "") {
                console.log("user with empty first name or phone", userRecord);
            }

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
                // if (prevUserRecord && userRecord.active !== prevUserRecord.active && userRecord.active) {
                //     // user has changed to active, add OTP and send it to admins
                //     userRecord.otp = crypto.randomUUID();
                //     userRecord.otpCreatedAt = dayjs().format(DATE_TIME);
                // }

                if (prevUserRecord && prevUserRecord.needToSignConfidentiality && !isNeedToSignConfidentiality) {
                    userRecord.needToSignConfidentiality = FieldValue.delete();
                }

                batch.update(userDoc.ref, userRecord as any);
            } else {
                // create new
                // if (userRecord.active) {
                //     userRecord.otp = crypto.randomUUID();
                //     userRecord.otpCreatedAt = dayjs().format(DATE_TIME);
                // }

                if (isNeedToSignConfidentiality) {
                    userRecord.needToSignConfidentiality = generateSignConfidentialityURL(user.fields["שם פרטי"], user.fields["תעודת זהות"], userId);
                }

                batch.create(docRef, userRecord);
            }

        }
    } while (offset);

    return batch.commit().then(async () => {
        console.info("Sync Users: obsered modified:", count, "observed Active", countActive, "registrationLinks", newLinksToAdmin, "duplicates:", duplicates);
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

function generateSignConfidentialityURL(firstName: string, identificationId: string, volunteerId: string) {
    const entry = {
        identitycard: identificationId,
        name: firstName,
        recordid: volunteerId,
    };

    return `https://born2win.org.il/confidentiality-and-privacy/?entry=${encodeURI(JSON.stringify(entry))}`;
}


//syncAllBorn2WinUsers()
import { HebrewCalendar, HDate, Location, Event, CalOptions } from '@hebcal/core';
import { only } from "node:test";


function getHolidays() {

    const options: CalOptions = {
        year: 2024,
        isHebrewYear: false,
        candlelighting: false,
        //location: Location.lookup('Tel Aviv'),
        sedrot: false,
        omer: false,
        noRoshChodesh: true
    };
    const events = HebrewCalendar.calendar(options);

    for (const ev of events) {
        const hd = ev.getDate();
        const date = hd.greg();
        console.log(date.toLocaleDateString(), ev.render('he'), hd.toString());
    }
}
export interface FamilyCompact {
    districtBaseFamilyId: string;
    mainBaseFamilyId: string;
    district: string;
    familyLastName: string;
    city: string;
    active: boolean;
}

export async function searchFamilies(searchStr: string): Promise<FamilyCompact[]> {
    const familyQuery = new AirTableQuery<FamilyCompact>("משפחות רשומות", (m) => {
        return {
            districtBaseFamilyId: "N/A",
            mainBaseFamilyId: m.id,
            district: getSafeFirstArrayElement(m.fields["מחוז"], ""),
            familyLastName: m.fields.Name,
            city: getSafeFirstArrayElement(m.fields["עיר"], ""), // todo it is ID
            active: true,
        }
    });
    const prefix = "משפחת ";

    return familyQuery.execute([
        `LEFT({Name}, ${searchStr.length + prefix.length}) = "${prefix + searchStr}"`,
        "{סטטוס בעמותה}='פעיל'",
    ])
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

        }
    } while (offset);

    return batch.commit().then(async () => {
        //logger.info("Sync Users: obsered modified:", count, "observed Active", countActive, "registrationLinks", newLinksToAdmin, "duplicates:", duplicates);
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

// getHolidays()

// searchFamilies("עמ").then(f=>{
//     f.forEach(family=>console.log(family.familyLastName));
// })

async function migrateUsers() {
    db.collection(Collections.Users).get().then(async (res) => {
        let i = 1
        let sum = "לא נרשמו להודעות\n"
        for (const doc of res.docs) {
            if (doc.data().loginInfo && (!doc.data().notificationTokens || doc.data().notificationTokens.length == 0) && !!doc.data().active) {
                sum += i + ". " + doc.data().firstName + " " + doc.data().lastName + "\n"; //+(doc.data().loginInfo[0].isIOS?" IOS":" Android" )+"\n"
                i++
                // if (doc.data().manychat_id){
                // await sendToManychat(doc.data().manychat_id, "content20241130162157_600222", {}).catch(e=>{
                //     console.log("send error", e)
                // });
                // }
            }

            // doc.ref.update({
            //     districts: [doc.data().mahoz]
            // })
        }
        console.log(sum)
    })
}
//migrateUsers()

//syncBorn2WinUsers()

async function updateAirTableAppinstalled() {
    const airTableMainBase = mainBase.value();
    const users = await db.collection("users").where("notificationOn", "==", true).get();

    const url = `https://api.airtable.com/v0/${airTableMainBase}/מתנדבים/`;
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${born2winApiKey.value()}`,
            "Content-Type": "application/json",
        },
    };

    let count = 0;
    for (let i = 0; i < users.docs.length; i++) {
        const user = users.docs[i];

        if (user.id.startsWith("rec")) {
            const loginInfo = user.data()?.loginInfo;
            if (loginInfo && loginInfo.length) {
                const date = loginInfo[0].createdAt;

                const updatedFields = {
                    fields: {
                        "תאריך התקנת אפליקציה": dayjs(date).format("YYYY-MM-DD"),
                    },
                };
                count++;
                await axios.patch(url + user.id, updatedFields, httpOptions).catch(err => {
                    console.log(err)
                })
                delay(1000);

            }
        }
    }
    console.log("Installed", count)
}

//updateAirTableAppinstalled()

async function findDanglingContacts() {
    const q = new AirTableQuery<any>("אנשי קשר", (rec => rec));
    const all = await q.execute();
    let dangling = 0
    let only2 = 0
    let ok = 0
    let onlyOne = 0

    for (let c of all) {
        const families = c.fields["משפחות רשומות"];
        const families2 = c.fields["משפחות רשומות 2"];
        if (!families && !families2) {
            dangling++
            continue;
        } else if (families && families2) {
            continue;
        }

        ok++
        // const list = c.fields["משפחות רשומות"] ? c.fields["משפחות רשומות"] :  c.fields["משפחות רשומות 2"];

        // await AirTableUpdate("אנשי קשר", c.id, {
        //     fields: {
        //         "משפחות רשומות": list,
        //         "משפחות רשומות 2": list,
        //     }
        // });
    }
    console.log("Total ok", ok, "only1", onlyOne, "only2", only2, "dangling", dangling)
}

//findDanglingContacts()


async function migrateMeals() {
    const q = new AirTableQuery<any>("ארוחות", (rec => rec));
    const all = await q.execute();
    let count = 0;
    const update = { records: [] as any[] };

    for (let c of all) {
        update.records.push({
            "id": c.id,
            "fields": {
                "סוג": "ארוחה"
            }
        })
        count++;
        if (count == 10) {
            await AirTableUpdateBatch("ארוחות", update);
            update.records = [];
            count = 0;
        }

    }

    if (update.records.length > 0) {
        await AirTableUpdateBatch("ארוחות", update);
    }

}


async function migrateHolidays() {
    const q = new AirTableQuery<any>("חגים וחריגים", (rec => rec));
    const all = await q.execute();
    const fields = {} as any;
    for (const h of all) {
        if (h.fields["Name"].startsWith("פינוקי")) {
            fields["סוג"] = EventType.HolidayTreats;
        } else {
            continue;
        }

        // if (h.fields["זמין"] == true && h.fields["משפחה"]) {
        //     fields["סוג"] = "הוספת תאריך למשפחה";
        // } else if (!h.fields["משפחה"]) {
        //     fields["סוג"] = "חג";
        // } else {
        //     fields["סוג"] = "חסימה/החלפת תאריך למשפחה";
        // }

        await AirTableUpdate("חגים וחריגים", h.id, { fields });
    }

}

async function migrateContacts() {
    try {
        const q = new AirTableQuery<any>("אנשי קשר", (rec => rec));
        const all = await q.execute();

        const f = new AirTableQuery<any>("משפחות רשומות", (rec => rec));

        const families = await f.execute();

        let count = 0;

        for (const fam of families) {
            const contacts = fam.fields["פרטי קשר של המשפחה"];
            if (contacts && new Set(contacts).size !== contacts.length) {
                console.log("duplicates", fam)
            }
        }


        // for (const contact of all) {
        //     const f2 = contact.fields["משפחות רשומות 2"];
        //     if (!f2) continue;

        //     const familyIds = f2.map((ff:string)=>families.find(f=>f.id == ff));
        //     if (familyIds.length > 1) {
        //         console.log("more than one family", contact)
        //     } else if (familyIds.length == 1){
        //         const contacts = families.find(f=>f.id = familyIds[0])?.fields["פרטי קשר של המשפחה"];
        //         if (contacts?.length > 1 ) {
        //             console.log("more than one contact", contacts)
        //         }
        //     }


        // }

        console.log("done")
    } catch (e) {
        console.log(e)
    }
}

//migrateHolidays();
// migrateMeals()
//migrateContacts()


function mealAirtable2FamilyDemand(demand: AirTableRecord, familyCityName: string, volunteerCityName: string, active: boolean): FamilyDemand {
    return {
        id: demand.id,
        date: demand.fields["DATE"],
        familyCityName,
        familyLastName: demand.fields.Name,
        district: getSafeFirstArrayElement(demand.fields["מחוז"], ""),
        status: demand.fields["סטטוס"] == Status.Cancelled ? Status.Cancelled : Status.Occupied,
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""),
        districtBaseFamilyId: "N/A",
        volunteerId: getSafeFirstArrayElement(demand.fields["מתנדב"], undefined),
        volunteerCityName,
        isFamilyActive: active,
        transpotingVolunteerId: getSafeFirstArrayElement(demand.fields["מתנדב משנע"], undefined),
        type: demand.fields["סוג"] || VolunteerType.Meal,
        expandDays: [],
    };
}

// let families = (await activeFamilies.get((f => checkDistrict(f.district))))
// families = families.filter(f=>f.name.indexOf("שלח")>=0);


export async function getDemands2(
    district: string | string[] | undefined,
    familyId: string | undefined,
    status: Status.Occupied | Status.Available | undefined | Status.OccupiedOrCancelled,
    type: VolunteerType,
    dateStart: string,
    dateEnd: string,
    volunteerId?: string,
): Promise<FamilyDemand[]> {

    const checkDistrict = ((districtId: string) => Array.isArray(district) ? district.some(d => d == districtId) : !district || district == districtId);

    const families = await activeFamilies.get(f => checkDistrict(f.district) && (!familyId || f.id == familyId));

    const _cities = await getCities();
    const getCityName = (id: string) => _cities.find(c => c.id == id)?.name || "";

    const mealsQuery = new AirTableQuery<FamilyDemand>("ארוחות", (m) => {
        const family = families.find(f => f.id == getSafeFirstArrayElement(m.fields["משפחה"], ""));
        return mealAirtable2FamilyDemand(m,
            getCityName(getSafeFirstArrayElement(m.fields["עיר"], "")),
            getCityName(getSafeFirstArrayElement(m.fields["עיר מתנדב"], "")),
            family ? family.active : false);
    });

    const filters: string[] = [];

    if (status != Status.OccupiedOrCancelled) {
        filters.push("{סטטוס}!='בוטל'");
    }

    if (type != VolunteerType.Any) {
        filters.push(`{סוג}='${type}'`);
    }
    // read meals from 5 days before the start date, to be able to find registered meals for a date on friday from begining of that week (sunday)
    // or in case of a sunday, we will also have the friday before, to be able to provide 1 day margin (not have cooking on friday and sunday)
    let startDateFilter = dayjs(dateStart);
    let endDateFilter = dayjs(dateEnd).add(1, "day");
    if (status != Status.Occupied && status != Status.OccupiedOrCancelled) {
        startDateFilter = startDateFilter.subtract(5, "day"); // to include all week days before the day and even a friday before that week
        endDateFilter = endDateFilter.add(2, "day"); // to include a sunday that may block a friday before
    }
    // eslint-disable-next-line quotes
    filters.push(`{DATE}>='${startDateFilter.format(DATE_AT)}'`);
    filters.push(`IS_BEFORE({DATE}, '${endDateFilter.format(DATE_AT)}')`);

    if (volunteerId) {
        filters.push(`OR(${airtableArrayCondition("vol_id", volunteerId)}, ${airtableArrayCondition("transport_vol_id", volunteerId)})`);
    }

    const meals = await mealsQuery.execute(filters);
    const filteredMeals = meals.filter(m => checkDistrict(m.district));

    if (status === Status.Occupied || status === Status.OccupiedOrCancelled) {
        // no need to calculate dates
        return filteredMeals;
    }

    // calculate dates
    const addedOpenDemands: FamilyDemand[] = [];

    let holidaysInDateRange = await holidays.get(h => (dateInRange(h.date, dateStart, dateEnd) || (!!h.alternateDate && dateInRange(h.alternateDate, dateStart, dateEnd))));

    if (type == VolunteerType.HolidayTreat || type == VolunteerType.Any) {
        const holidayTreats = holidaysInDateRange.filter(h => h.type == EventType.HolidayTreats);

        holidayTreats.forEach(holidayTreat => {
            const expandDays = [];
            // Calculate array of dates
            if (holidayTreat.alternateDate) {
                const holidayEndDate = dayjs(holidayTreat.alternateDate);
                let day = 0;
                for (let date = dayjs(holidayTreat.date); holidayEndDate.isAfter(date); date = date.add(1, "day")) {
                    if (dateInRange(date, dateStart, dateEnd)) {
                        expandDays.push(day);
                    }
                    day++;
                }
            } else {
                // this means the start holiday date is the only date so it is in range
                expandDays.push(0);
            }
            if (expandDays.length > 0) {
                const otherHolidays = holidaysInDateRange.filter(rh => rh.type != EventType.HolidayTreats);

                for (const family of families) {
                    if (holidayTreat.district && family.district != holidayTreat.district) continue;
                    if (holidayTreat.familyId && family.id != holidayTreat.familyId) continue;

                    // Check the date and family is not overruled by other holiday records
                    const theHolidayDate = dayjs(holidayTreat.date);
                    const filteredExpandDays = expandDays.filter(expandDay => {
                        const expandDate = theHolidayDate.add(expandDay, "day");
                        return !inSpecialDays(expandDate, family, otherHolidays);
                    });

                    addMeal2(addedOpenDemands, meals, families, [], family.id || "", holidayTreat.date, getCityName, VolunteerType.HolidayTreat, filteredExpandDays);
                }
            }
        });

        if (type == VolunteerType.HolidayTreat) {
            if (status == Status.Available) {
                return addedOpenDemands;
            }
            // here we remove meals that are before start date
            return filteredMeals.filter(m => dateInRange(m.date, dateStart, dateEnd)).concat(addedOpenDemands);
        }
    }

    holidaysInDateRange = holidaysInDateRange.filter(rh => rh.type != EventType.HolidayTreats);
    const blockingHolidays = holidaysInDateRange.filter(rh => rh.type != EventType.AdditionalCookingDay);

    const dateEndJs = dayjs(dateEnd);
    const dateStartJs = toSunday(dateStart);
    for (let date = dateStartJs; dateEndJs.isAfter(date); date = date.add(1, "day")) {
        const day = date.day();
        const familiesInDay = families.filter(f => f.days?.length > 0 && f.days[0] == day); // ignore more than one day of cooking - take the first

        for (const family of familiesInDay) {
            // calculate the expand days
            const expandDays = [] as number[];
            for (let weekDay = 0; weekDay <= 5; weekDay++) {
                const expandDay = -day + weekDay;
                const expandDate = date.add(expandDay, "day");
                if (dateInRange(expandDate, dateStart, dateEnd) && !inSpecialDays(expandDate, family, blockingHolidays)) {
                    expandDays.push(expandDay);
                }
            }

            addMeal2(addedOpenDemands, meals, families, holidaysInDateRange, family.id || "", date.format(DATE_AT), getCityName, VolunteerType.Meal, expandDays);
        }
    }

    if (status == Status.Available) {
        return addedOpenDemands;
    }

    return filteredMeals.filter(m => dateInRange(m.date, dateStart, dateEnd)).concat(addedOpenDemands);
}

function inSpecialDays(date: dayjs.Dayjs, family: Family, holidays: Holiday[]): boolean {
    for (const holiday of holidays) {
        if (holiday.familyId && holiday.familyId != family.id) continue;
        if (holiday.district && holiday.district != family.district) continue;

        if (holiday.alternateDate && dateInRange(date, holiday.date, holiday.alternateDate) ||
            !holiday.alternateDate && date.isSame(holiday.date, "day")) {
            return true;
        }
    }

    return false;
}

function addMeal2(demandsArray: FamilyDemand[], meals: FamilyDemand[], families: Family[], holidaysInRange: Holiday[], familyId: string, date: string, getCityName: (id: string) => string,
    type: VolunteerType, expandDays: number[]) {
    const family = families.find(f => f.id == familyId);
    if (!family || expandDays.length == 0) return;
    const mealDate = dayjs(date);
    const checkRangeStart = toSunday(mealDate);
    const checkRangeEnd = checkRangeStart.add(5, "day");


    const familyRelevantMeals = meals.filter(m => m.status == Status.Occupied && m.mainBaseFamilyId == family.id && type == m.type);
    const familyMealsInRange = familyRelevantMeals.filter(m => dateInRange(m.date, checkRangeStart, checkRangeEnd));
    const twoCookingDays = familyMealsInRange.length != 1 ? false :
        // check if the family has another cooking day in that week:
        holidaysInRange.find(h => h.familyId == familyId &&
            h.type == EventType.AdditionalCookingDay &&
            (dayjs(h.date).isBefore(date) || dayjs(h.date).isSame(date)) &&
            (dayjs(h.alternateDate).isAfter(date) || dayjs(h.alternateDate).isSame(date)) != undefined);

    const allowAdd = familyMealsInRange.length == 0 || (familyMealsInRange.length == 1 && twoCookingDays)

    if (allowAdd) {
        let filteredExpandDays = expandDays;
        // filters out a sunday or a friday if another week's cooking is adjacent
        const minDay = Math.min(...expandDays);
        const maxDay = Math.max(...expandDays);

        const minDate = dayjs(date).add(minDay, "day");
        if (minDate.day() == 0 && familyRelevantMeals.find(m => minDate.subtract(2, "day").isSame(m.date, "day"))) {
            // Sunday
            filteredExpandDays = filteredExpandDays.filter(d => d != minDay);
        }

        const maxDate = dayjs(date).add(maxDay, "day");
        if (maxDate.day() == 5 && familyRelevantMeals.find(m => minDate.add(2, "day").isSame(m.date, "day"))) {
            // Friday
            filteredExpandDays = filteredExpandDays.filter(d => d != maxDay);
        }

        if (twoCookingDays) {
            // exclude the date and day before and day after the existing cooking day
            const existingMeal = familyMealsInRange[0];
            // 1. calculate the diff in days
            const diffDays = dayjs(existingMeal.date).diff(date, "day");
            filteredExpandDays = filteredExpandDays.filter(d => d != diffDays && d != diffDays + 1 && d != diffDays - 1);
        }

        demandsArray.push({
            id: getCalcDemandID(family.id, date, family.cityId),
            date,
            familyCityName: getCityName(family.cityId),
            district: family.district,
            status: Status.Available,
            familyLastName: family.name,
            mainBaseFamilyId: family.id,
            districtBaseFamilyId: "N/A",
            volunteerId: "",
            volunteerCityName: "",
            isFamilyActive: family.active,
            type,
            expandDays: filteredExpandDays,
        });
    }
}

function toSunday(date: Dayjs | string): Dayjs {
    const _date = dayjs(date);
    return _date.subtract(_date.day(), "day");
}


export function getDatesBetween(startDateIn: string, endDateIn: string) {
    const dates = [];
    let currentDate = dayjs(startDateIn);
    const endDate = dayjs(endDateIn);

    // Loop until the current date is after the end date
    while (currentDate.isSame(endDate) || currentDate.isBefore(endDate)) {
        dates.push(currentDate.format('YYYY-MM-DD'));
        currentDate = currentDate.add(1, 'day');
    }

    return dates;
}


getDemands2("recP17rsfOseG3Frx", "rec1N6tWumuiTTOMQ", Status.Available, VolunteerType.Meal,
//    dayjs().add(1, "day").format(DATE_AT),
//    dayjs().add(45, "days").format(DATE_AT),
       "2025-03-20", "2025-03-30"
).then(demands => {
    console.log(demands.map(m => m.familyLastName + ":" + dayjs(m.date).format("DD-MM") + ":" + m.expandDays?.map(d => `"${d}"`)).join("\n"))
})
const getElapsedTime = (start: [number, number]): string => {
    const elapsed = process.hrtime(start);
    const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1e6;
    return `${elapsedMs.toFixed(3)} ms`;
};

function testGetCities() {
    const totalStart = process.hrtime();
    return cities.get().then(cities => {
        const totalElapsed = getElapsedTime(totalStart);

        console.log("Families", cities.length, totalElapsed);
    })
}

// testGetCities().then(() => testGetCities().then(() => {
//     cities.evict().then(() => testGetCities())
// }));
