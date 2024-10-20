import axios from "axios";
import dayjs from "dayjs";

import { AirTableRecord, Collections, FamilityDemandUpdatePayload, FamilyDemand, FamilyDetails, LoginInfo, NotificationActions, NotificationUpdatePayload, Recipient, SearchUsersPayload, SendMessagePayload, SendNotificationStats, TokenInfo, UpdateUserLoginPayload, UserInfo, UserRecord, FamilityDetailsPayload, NotificationChannels, GenerateLinkPayload, OpenFamilyDemands, VolunteerInfo, VolunteerInfoPayload, GetDemandsPayload, Errors, Status } from "../src/types";
export const DATE_AT = "YYYY-MM-DD";

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
const serviceAccountPath = path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'firebase', 'born2win-prod-firebase-adminsdk-dltch-7d0cd3c9f4.json');

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
        isFamilyActive: demand.fields["סטטוס בעמותה"] == Status.Active,
    };
}

async function getDemands(
    district: string,
    status: Status.Occupied | Status.Available | undefined,
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
        const filters: string[] = [];

        if (!includeNonActiveFamily) {
            filters.push(`({סטטוס בעמותה} = '${Status.Active}')`);
        }

        if (districtBaseFamilyId) {
            filters.push(`FIND("${districtBaseFamilyId}",  ARRAYJOIN({record_id (from משפחה)})) > 0`);
        }
        if (status) {
            filters.push(`{זמינות שיבוץ}='${status}'`);
        }
        if (dateStart !== undefined) {
            // eslint-disable-next-line quotes
            filters.push(`{תאריך}>='${dateStart}'`);
        }
        if (dateEnd != undefined) {
            filters.push(`{תאריך}<='${dateEnd}'`);
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

function mealAirtable2FamilyDemand(demand: AirTableRecord, cityName: string, active: boolean): FamilyDemand {
    return {
        id: demand.id,
        date: demand.fields["DATE"],
        city: cityName, // id and needs to be name
        familyLastName: demand.fields.Name,
        district: getSafeFirstArrayElement(demand.fields["מחוז"], ""),
        status: Status.Occupied,
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""),
        districtBaseFamilyId: "N/A",
        volunteerId: getSafeFirstArrayElement(demand.fields["מתנדב"], undefined),
        isFamilyActive: active,
    };
    // return {
    //     id: holiday.id,
    //     date: holiday.fields["DATE"],
    //     status: holiday.fields["סטטוס"],
    //     volunteerId: holiday.fields["מתנדב"],
    //     district: getSafeFirstArrayElement(holiday.fields["מחוז"], ""),
    // }
}


const activeFamilies = new CachedAirTable<Family>("משפחות רשומות", familyAirtable2Family, [`{סטטוס בעמותה}='${Status.Active}'`]);
const cities = new CachedAirTable<City>("ערים", (city => {
    return {
        id: city.id,
        name: city.fields["שם"].replaceAll("\n", ""),
        district: city.fields["מחוז"][0],
    }
}), ["{כמות משפחות פעילות בעיר}>0"], 60 * 24);


const holidays = new CachedAirTable<Holiday>("חגים וחריגים", holidayAirtable2Holiday, ["AND(IS_AFTER({תאריך}, DATEADD(TODAY(), -1, 'days')))"], 1);



async function getDemands2(
    district: string | string[],
    status: Status.Occupied | Status.Available | undefined,
    dateStart: string,
    dateEnd: string,
    volunteerId?: string
): Promise<FamilyDemand[]> {

    const checkDistrict = ((districtId: string) => Array.isArray(district) ? district.some(d => d == districtId) : district == districtId);

    const families = await activeFamilies.get((f => checkDistrict(f.district)));
    const _cities = await cities.get();
    const getCityName = (id: string) => _cities.find(c => c.id == id)?.name || "";

    const mealsQuery = new AirTableQuery<FamilyDemand>("ארוחות", (m) => {
        const family = families.find(f => f.id == getSafeFirstArrayElement(m.fields["משפחה"], ""));
        return mealAirtable2FamilyDemand(m, getCityName(getSafeFirstArrayElement(m.fields["עיר"], "")), family ? family.active : false);
    });

    const filters: string[] = [];
    const startDateParam = dayjs(dateStart).format(DATE_AT);
    const endDateParam = dayjs(dateEnd).format(DATE_AT);


    filters.push("{סטטוס}!='בוטל'");

    // eslint-disable-next-line quotes
    filters.push(`{DATE}>='${startDateParam}'`);
    filters.push(`IS_BEFORE({DATE}, '${dayjs(dateEnd).add(1, "day").format(DATE_AT)}')`);

    if (volunteerId) {
        filters.push(airtableArrayCondition("vol_id", volunteerId));
    }

    const meals = await mealsQuery.execute(filters);
    const filteredMeals = meals.filter(m => checkDistrict(m.district)); // && (volunteerId == undefined || m.volunteerId == volunteerId));

    if (status === Status.Occupied) {
        // no need to calculate dates
        return filteredMeals;
    }

    // calculate dates
    const relevantHolidays = await holidays.get();


    const endDate = dayjs().add(45, "days");
    const addedOpenDemands: FamilyDemand[] = [];
    for (let date = dayjs(); endDate.isAfter(date); date = date.add(1, "day")) {
        if (date.format(DATE_AT) < startDateParam) continue;
        if (date.format(DATE_AT) > endDateParam) break;
        const holidays = relevantHolidays.filter(h => dayjs(h.date).format(DATE_AT) == date.format(DATE_AT));

        // Skip if this date is blocked for all and no alternate exists
        if (holidays.length && holidays.some(h => !h.familyId && !h.alternateDate)) continue;

        const day = date.day()
        const familiesInDay = families.filter(f => f.days.some(d => d == day));
        // Now check if this date for this family does not exist
        for (const family of familiesInDay) {

            if (family.name.indexOf("בירנ") > 0) {
                console.log("a")
            }

            // skip if this family is blocked for this date with no alternate
            if (holidays.length && holidays.some(h => h.familyId == family.id && !h.addAvailability && !h.alternateDate)) continue;
            const alternate = holidays.length > 0 ? holidays.find(h => (!h.familyId || h.familyId == family.id) && h.alternateDate) : undefined;
            const actualDate = alternate ?
                dayjs(alternate.alternateDate).format(DATE_AT) :
                date.format(DATE_AT);

            if (!meals.find(m => dayjs(m.date).format(DATE_AT) == actualDate && m.mainBaseFamilyId == family.id)) {

                addedOpenDemands.push({
                    id: family.id + actualDate,
                    date: actualDate,
                    city: getCityName(family.cityId),
                    district: family.district,
                    status: Status.Available,
                    familyLastName: family.name,
                    mainBaseFamilyId: family.id,
                    districtBaseFamilyId: "N/A",
                    volunteerId: "",
                    isFamilyActive: family.active,
                });
            }
        }


        // Add special added holidays:
        relevantHolidays.filter(h => h.date == date.format(DATE_AT)).forEach(holiday => {
            if (holiday.addAvailability && holiday.familyId) {
                // find family
                const family = families.find(f => f.id == holiday.familyId)
                if (family) {
                    const holidayDate = dayjs(holiday.date).format(DATE_AT);
                    if (!meals.find(m => dayjs(m.date).format(DATE_AT) == holidayDate && m.mainBaseFamilyId == family.id)) {
                        addedOpenDemands.push({
                            id: family.id + holidayDate,
                            date: holidayDate,
                            city: getCityName(family.cityId),
                            district: family.district,
                            status: Status.Available,
                            familyLastName: family.name,
                            mainBaseFamilyId: family.id,
                            districtBaseFamilyId: "N/A",
                            volunteerId: "",
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
// שרון recmLo9MWRxmrLEsM
// מרכז recP17rsfOseG3Frx
// getDemands2(["recP17rsfOseG3Frx"], Status.Available, "2024-11-11", "2024-11-14", undefined).then(demands => {
//     demands.forEach(d => console.log(d.date, d.status))

// });


// getDemands2(["recxuE1Cwav0kfA7g"], Status.Available, "2024-10-31", "2024-10-31").then(demands=>{
//     demands.filter(d=>d.mainBaseFamilyId == "recwVL742srgkzO0u$$2024").forEach(d=>console.log(d.date, d.status))
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

    const users = await db.collection(Collections.Users).where("active", "==", true).get();
    const relevantUsers = users.docs.filter(u => u.data().uid == undefined && u.data().manychat_id !== undefined && u.data().sendWeeklyMessage !== date);

    const usersForInstallMsg = relevantUsers.filter(u => u.data().mahoz === "recmLo9MWRxmrLEsM");
    const usersForLink = relevantUsers.filter(u => u.data().mahoz !== "recmLo9MWRxmrLEsM");


    let bulk: Promise<any>[] = [];
    let totalInstall = 0;
    let totalLinks = 0;
    let errCount = 0;
    for (const user of usersForInstallMsg) {
        if (bulk.length == 10) {
            await Promise.all(bulk);
            console.log("10 more send", totalInstall, "of", usersForInstallMsg.length);
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
    for (const user of usersForLink) {
        if (bulk.length == 10) {
            await Promise.all(bulk);
            await delay(1000);
            console.log("10 more send", totalLinks, "of", usersForLink.length);
            bulk = [];
        }
        bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendOldLink, {})
            .then(() => user.ref.update({ sendWeeklyMessage: date }))
            .catch(error => {
                console.log("Error sending old link", error.message, "man_id", user.data().manychat_id);
                errCount++;
                return { user, error };
            }));

        totalLinks++;
    }
    await Promise.all(bulk);

    console.log("Finish running. err", errCount, "install", totalInstall, "links", totalLinks);
}

//SendLinkOrInstall()