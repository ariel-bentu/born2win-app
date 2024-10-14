import axios from "axios";
import dayjs from "dayjs";

import { AirTableRecord, Collections, FamilityDemandUpdatePayload, FamilyDemand, FamilyDetails, LoginInfo, NotificationActions, NotificationUpdatePayload, Recipient, SearchUsersPayload, SendMessagePayload, SendNotificationStats, TokenInfo, UpdateUserLoginPayload, UserInfo, UserRecord, FamilityDetailsPayload, NotificationChannels, GenerateLinkPayload, OpenFamilyDemands, VolunteerInfo, VolunteerInfoPayload, GetDemandsPayload, Errors } from "../src/types";
export const DATE_AT = "YYYY-MM-DD";


interface District {
    id: string;
    name: string;
    base_id: string;
    demandsTable: string;
    familiesTable: string;
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
        isFamilyActive: demand.fields["סטטוס בעמותה"] == "פעיל",
    };
}

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
        const filters: string[] = [];

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
        return this.cachedData;
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
}

// interface Meal {
//     id: string;
//     date: string;
//     status: string;
//     volunteerId: string;
//     district: string;

// }
function familyAirtable2Family(family: AirTableRecord): Family {
    return {
        id: family.id,
        name: family.fields["שם"],
        district: getSafeFirstArrayElement(family.fields["מחוז"], ""),
        days: family.fields["Days of the Week"]? family.fields["Days of the Week"].map((d: string) => daysMap[d]):[],
        cityId: getSafeFirstArrayElement(family.fields["עיר"], ""),
        active: family.fields["סטטוס בעמותה"] == "פעיל",
    }
}

function holidayAirtable2Holiday(holiday: AirTableRecord): Holiday {
    return {
        id: holiday.id,
        name: holiday.fields["שם"],
        date: holiday.fields["תאריך"],
    }
}

function mealAirtable2FamilyDemand(demand: AirTableRecord, cityName: string): FamilyDemand {
    return {
        id: demand.id,
        date: demand.fields["DATE"],
        city: cityName, // id and needs to be name
        familyLastName: demand.fields.Name,
        district: getSafeFirstArrayElement(demand.fields["מחוז"], ""),
        status: "תפוס",
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""),
        districtBaseFamilyId: "N/A",
        volunteerId: getSafeFirstArrayElement(demand.fields["מתנדב"], undefined),
        isFamilyActive: demand.fields["סטטוס בעמותה"] == "פעיל",
    };
    // return {
    //     id: holiday.id,
    //     date: holiday.fields["DATE"],
    //     status: holiday.fields["סטטוס"],
    //     volunteerId: holiday.fields["מתנדב"],
    //     district: getSafeFirstArrayElement(holiday.fields["מחוז"], ""),
    // }
}


const families = new CachedAirTable<Family>("משפחות רשומות", familyAirtable2Family, []);//"{סטאטוס בעמותה}='פעיל'"]);
const cities = new CachedAirTable<City>("ערים", (city => {
    return {
        id: city.id,
        name: city.fields["שם"].replaceAll("\n", ""),
        district: city.fields["מחוז"][0],
    }
}), ["{כמות משפחות פעילות בעיר}>0"], 60 * 24);

//const holidays = new CachedAirTable<Holiday>("חופשות", holidayAirtable2Holiday, ["AND(IS_AFTER({date}, DATEADD(TODAY(), -1, 'days')))"]);
const holidays = {
    get: () => {
        return [
            { id: "1", date: "2024-10-16", name: "ערב חג" },
            { id: "2", date: "2024-10-17", name: "סוכות" },
        ];
    }
}

// read meals (no cache)
// ignores status = בוטל
// calculates days

async function getDemands2(
    district: string,
    status: "תפוס" | "זמין" | undefined,
    includeNonActiveFamily: boolean,
    dateStart: string,
    dateEnd: string,
    volunteerId?: string,
    districtBaseFamilyId?: string
): Promise<FamilyDemand[]> {

    const activeFamilies = await families.get((f => f.district === district));
    const _cities = await cities.get();
    const getCityName = (id: string) => _cities.find(c => c.id == id)?.name || "";

    const mealsQuery = new AirTableQuery<FamilyDemand>("ארוחות", (m) => {
        return mealAirtable2FamilyDemand(m, getCityName(getSafeFirstArrayElement(m.fields["עיר"], "")));
    });

    const filters: string[] = [];

    filters.push("{סטטוס}!='בוטל'");
    //filters.push(`FIND('${district}', ARRAYJOIN({מחוז}))>0`);

    if (dateStart !== undefined) {
        // eslint-disable-next-line quotes
        filters.push(`{DATE}>='${dateStart}'`);
    }
    if (dateEnd != undefined) {
        filters.push(`{DATE}<='${dateEnd}'`);
    }
    // if (volunteerId) {
    //     // filters.push(`{מתנדב}='${volunteerId}'`);
    //     filters.push(airtableArrayCondition("REC (from מחוז)", volunteerId));
    // }

    const meals = await mealsQuery.execute(filters);
    const filteredMeals = meals.filter(m => m.district === district && (volunteerId == undefined || m.volunteerId == volunteerId));

    if (status === "תפוס") {
        // no need to calculate dates
        return filteredMeals;
    }

    // calculate dates
    const relevantHolidays = await holidays.get();

    const endDate = dayjs().add(45, "days");
    const addedOpenDemands: FamilyDemand[] = [];
    for (let date = dayjs(); endDate.isAfter(date); date = date.add(1, "day")) {
        if (date.format(DATE_AT) < dateStart) continue;
        if (date.format(DATE_AT) > dateEnd) break;
        if (relevantHolidays.find(h => h.date == date.format(DATE_AT))) continue;

        const day = date.day()
        const familiesInDay = activeFamilies.filter(f => f.days.some(d => d == day));
        // Now check if this date for this family does not exist
        for (const family of familiesInDay) {
            if (!meals.find(m => m.date == date.format(DATE_AT) && m.mainBaseFamilyId == family.id)) {
                addedOpenDemands.push({
                    id: family.id + date,
                    date: date.format(DATE_AT),
                    city: getCityName(family.cityId),
                    district: family.district,
                    status: "פנוי",
                    familyLastName: family.name,
                    mainBaseFamilyId: family.id,
                    districtBaseFamilyId: "N/A",
                    volunteerId: "",
                    isFamilyActive: family.active,
                });
            }
        }
    }

    if (status == "זמין") {
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
getDemands2("recxuE1Cwav0kfA7g", "זמין", false, "2024-09-10", "2024-11-10", "recqAUvw8rqaiMiX4").then(demands=>{
    for (let i = 0;i<3;i++) {
        GetFamilyDetails2(demands[i].mainBaseFamilyId, true).then(fd=>console.log(fd));
    }
});


