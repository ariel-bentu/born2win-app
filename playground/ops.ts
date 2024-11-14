import axios from "axios";
import dayjs, { Dayjs } from "dayjs";

import { AirTableRecord, Collections, FamilityDemandUpdatePayload, FamilyDemand, FamilyDetails, LoginInfo, NotificationActions, NotificationUpdatePayload, Recipient, SearchUsersPayload, SendMessagePayload, SendNotificationStats, TokenInfo, UpdateUserLoginPayload, UserInfo, UserRecord, FamilityDetailsPayload, NotificationChannels, GenerateLinkPayload, OpenFamilyDemands, VolunteerInfo, VolunteerInfoPayload, GetDemandsPayload, Errors, Status } from "../src/types";
export const DATE_AT = "YYYY-MM-DD";
const DATE_TIME = "YYYY-MM-DD HH:mm";

import { getFirestore, FieldValue, QueryDocumentSnapshot, DocumentSnapshot, FieldPath } from "firebase-admin/firestore";
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
});

export const db = getFirestore();


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

class AirTableQuery<T> {
    private tableName: string;
    private mapper: (record: AirTableRecord) => T;

    constructor(tableName: string, mapper: (record: AirTableRecord) => T) {
        this.tableName = tableName;
        this.mapper = mapper;
    }

    async execute(filters?: string[]): Promise<T[]> {
        const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(this.tableName)}`;

        let offset: string | undefined;
        const apiKey = born2winApiKey.value();

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

            offset = response.data.offset;
            if (response.data.records) {
                results = results.concat(response.data.records.map((record: AirTableRecord) => this.mapper(record)));
            }
        } while (offset);

        return results;
    }
}


class CachedAirTable<T> {
    private cachedData: T[] | undefined = undefined;
    private cacheDurationMinutes: number = 60;
    private lastFetched: number = 0;
    private filters: string[];
    private query: AirTableQuery<T>;

    constructor(tableName: string, mapper: (record: AirTableRecord) => T, filters: string[], cacheDurationMinutes?: number) {
        this.filters = filters;

        if (cacheDurationMinutes !== undefined) {
            this.cacheDurationMinutes = cacheDurationMinutes;
        }
        this.query = new AirTableQuery<T>(tableName, mapper);
    }

    async get(filterFromCache?: (t: T) => boolean): Promise<T[]> {
        const now = dayjs();
        if (this.cachedData && this.lastFetched && dayjs(this.lastFetched).add(this.cacheDurationMinutes, "minutes").isAfter(now)) {
            return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
        }

        this.cachedData = await this.query.execute(this.filters);
        this.lastFetched = now.valueOf();
        return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
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

interface Holiday {
    id: string;
    date: string;
    name: string;
    familyId?: string;
    alternateDate?: string
    addAvailability: boolean; // when true, it means the main "date" should be added to family
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

function holidayAirtable2Holiday(holiday: AirTableRecord): Holiday {
    return {
        id: holiday.id,
        name: holiday.fields.Name,
        date: holiday.fields["תאריך"],
        alternateDate: holiday.fields["תאריך חלופי"],
        addAvailability: holiday.fields["זמין"],
        familyId: holiday.fields["משפחה"],
    }
}

function mealAirtable2FamilyDemand(demand: AirTableRecord, familyCityName: string, volunteerCityName: string, active: boolean): FamilyDemand {
    return {
        id: demand.id,
        date: demand.fields["DATE"],
        familyCityName,
        //city: familyCityName,
        familyLastName: demand.fields.Name,
        district: getSafeFirstArrayElement(demand.fields["מחוז"], ""),
        status: Status.Occupied,
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""),
        districtBaseFamilyId: "N/A",
        volunteerId: getSafeFirstArrayElement(demand.fields["מתנדב"], undefined),
        volunteerCityName,
        isFamilyActive: active,
        transpotingVolunteerId: getSafeFirstArrayElement(demand.fields["מתנדב משנע"], undefined),
    };
}


const activeFamilies = new CachedAirTable<Family>("משפחות רשומות", familyAirtable2Family, [`{סטטוס בעמותה}='${Status.Active}'`]);
const cities = new CachedAirTable<City>("ערים", (city => {
    return {
        id: city.id,
        name: city.fields["שם"].replaceAll("\n", ""),
        district: city.fields["מחוז"][0],
    }
}), ["{כמות משפחות פעילות בעיר}>0"], 60 * 24);

function getCities() {
    return cities.get();
}

const holidays = new CachedAirTable<Holiday>("חגים וחריגים", holidayAirtable2Holiday, ["AND(IS_AFTER({תאריך}, DATEADD(TODAY(), -1, 'days')))"], 1);



export async function getDemands2(
    district: string | string[] | undefined,
    status: Status.Occupied | Status.Available | undefined,
    dateStart: string,
    dateEnd: string,
    volunteerId?: string
): Promise<FamilyDemand[]> {
    const checkDistrict = ((districtId: string) => Array.isArray(district) ? district.some(d => d == districtId) : !district || district == districtId);

    const families = await activeFamilies.get((f => checkDistrict(f.district)));
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
    const startDateParam = dayjs(dateStart).format(DATE_AT);
    const endDateParam = dayjs(dateEnd).format(DATE_AT);


    filters.push("{סטטוס}!='בוטל'");

    // eslint-disable-next-line quotes
    filters.push(`{DATE}>='${startDateParam}'`);
    filters.push(`IS_BEFORE({DATE}, '${dayjs(dateEnd).add(1, "day").format(DATE_AT)}')`);

    if (volunteerId) {
        filters.push(`OR(${airtableArrayCondition("vol_id", volunteerId)}, ${airtableArrayCondition("transport_vol_id", volunteerId)})`);
    }

    const meals = await mealsQuery.execute(filters);
    const filteredMeals = meals.filter(m => checkDistrict(m.district));

    if (status === Status.Occupied) {
        // no need to calculate dates
        return filteredMeals;
    }

    // calculate dates
    const relevantHolidays = await holidays.get(h => dateInRange(h.date, dateStart, dateEnd));

    const endDate = dayjs(dateEnd);
    const addedOpenDemands: FamilyDemand[] = [];
    const startVacant = dayjs(dateStart);
    for (let date = startVacant; endDate.isAfter(date); date = date.add(1, "day")) {
        if (date.format(DATE_AT) < startDateParam) continue;
        if (date.format(DATE_AT) > endDateParam) break;
        const holidays = relevantHolidays.filter(h => dayjs(h.date).format(DATE_AT) == date.format(DATE_AT));

        // Skip if this date is blocked for all and no alternate exists
        if (holidays.length && holidays.some(h => !h.familyId && !h.alternateDate)) continue;

        const day = date.day();
        const familiesInDay = families.filter(f => f.days.length > 0 && f.days[0] == day); // ignore more than one day of cooking - take the first

        // Now check if this date for this family does not exist
        for (const family of familiesInDay) {
            // skip if this family is blocked for this date with no alternate
            if (holidays.length && holidays.some(h => h.familyId == family.id && !h.addAvailability && !h.alternateDate)) continue;
            const alternate = holidays.length > 0 ? holidays.find(h => (!h.familyId || h.familyId == family.id) && h.alternateDate) : undefined;
            const actualDate = alternate ?
                dayjs(alternate.alternateDate).format(DATE_AT) :
                date.format(DATE_AT);

            if (!dateInRange(actualDate, startVacant, endDate)) continue;

            // Find meals in this day, or any other day in the same week.
            // The reason for the week range, is that when a family's cooking days change, and a meal is already scheduled, we
            // do not want another day to be openned

            if (!meals.find(m => dayjs(m.date).locale("he").isSame(actualDate, "week") && m.mainBaseFamilyId == family.id)) {
                addedOpenDemands.push({
                    id: getCalcDemandID(family.id, actualDate, family.cityId),
                    date: actualDate,
                    familyCityName: getCityName(family.cityId),
                    district: family.district,
                    status: Status.Available,
                    familyLastName: family.name,
                    mainBaseFamilyId: family.id,
                    districtBaseFamilyId: "N/A",
                    volunteerId: "",
                    volunteerCityName: "",
                    isFamilyActive: family.active,
                });
            }
        }

        // Add special added holidays:
        relevantHolidays.filter(h => dayjs(h.date).format(DATE_AT) == date.format(DATE_AT))
            .forEach(holiday => {
                if (holiday.addAvailability && holiday.familyId) {
                    // find family
                    const family = families.find(f => f.id == holiday.familyId);
                    if (family) {
                        const holidayDate = dayjs(holiday.date).format(DATE_AT);
                        if (!meals.find(m => dayjs(m.date).format(DATE_AT) == holidayDate && m.mainBaseFamilyId == family.id)) {
                            addedOpenDemands.push({
                                id: family.id + holidayDate,
                                date: holidayDate,
                                familyCityName: getCityName(family.cityId),
                                district: family.district,
                                status: Status.Available,
                                familyLastName: family.name,
                                mainBaseFamilyId: family.id,
                                districtBaseFamilyId: "N/A",
                                volunteerId: "",
                                volunteerCityName: "",
                                isFamilyActive: family.active,
                            });
                        }
                    }
                }
            });
    }

    if (status == Status.Available) {
        return addedOpenDemands;
    }
    return filteredMeals.concat(addedOpenDemands);
}

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


// getDemands2(["recLbwpPC80SdRmPO"], Status.Occupied, "2024-10-22", "2024-11-12").then(demands=>{
//     demands
//     //.filter(d=>d.mainBaseFamilyId == "recwVL742srgkzO0u$$2024")
//     .forEach(d=>console.log(d.date, d.status))
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
                filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
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
    db.collection(Collections.Users).get().then(res=>{
        for (const doc of res.docs) {
            if (!doc.data().mahoz) {
                console.log("missing", doc.id)
                doc.ref.update({
                         districts: []
                })
                
            }
            // doc.ref.update({
            //     districts: [doc.data().mahoz]
            // })
        }
        console.log("Done migrating users")
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