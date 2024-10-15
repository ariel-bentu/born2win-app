import { addNotificationToQueue, DATE_AT, db, getCities } from ".";
import dayjs = require("dayjs");

import {
    AirTableRecord, Collections, FamilyDemand, NotificationChannels, Status,
} from "../../src/types";
import { airtableArrayCondition, getSafeFirstArrayElement } from "../../src/utils";
import { AirTableGet, AirTableInsert, AirTableQuery, AirTableUpdate, CachedAirTable } from "./airtable";
import { activeFamilies } from "./families";
import { Lock } from "./lock";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

// function demandAirtable2FamilyDemand(demand: AirTableRecord, district: string): FamilyDemand {
//     return {
//         id: demand.id,
//         date: demand.fields["תאריך"],
//         city: getSafeFirstArrayElement(demand.fields["עיר"], ""),
//         familyLastName: demand.fields.Name,
//         district: district,
//         status: demand.fields["זמינות שיבוץ"],
//         mainBaseFamilyId: getSafeFirstArrayElement(demand.fields.Family_id, ""), // The record ID of the main base table משפחות רשומות
//         districtBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""), // The record ID in the district table of משפחות במחוז
//         volunteerId: demand.fields.volunteer_id,
//         isFamilyActive: demand.fields["סטטוס בעמותה"] == Status.Active,
//     };
// }


interface Holiday {
    id: string;
    date: string;
    name: string;
    familyId?: string;
    alternateDate?: string
    addAvailability: boolean; // when true, it means the main "date" should be added to family
}


function holidayAirtable2Holiday(holiday: AirTableRecord): Holiday {
    return {
        id: holiday.id,
        name: holiday.fields.Name,
        date: holiday.fields["תאריך"],
        alternateDate: holiday.fields["תאריך חלופי"],
        addAvailability: holiday.fields["זמין"],
    };
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
}

// Holidays cache - 5 min
const holidays = new CachedAirTable<Holiday>("חגים וחריגים", holidayAirtable2Holiday, ["AND(IS_AFTER({תאריך}, DATEADD(TODAY(), -1, 'days')))"], 5);

export async function getDemands2(
    district: string | string[],
    status: Status.Occupied | Status.Available | undefined,
    dateStart: string,
    dateEnd: string,
    volunteerId?: string
): Promise<FamilyDemand[]> {
    const checkDistrict = ((districtId: string) => Array.isArray(district) ? district.some(d => d == districtId) : district == districtId);

    const families = await activeFamilies.get((f => checkDistrict(f.district)));
    const _cities = await getCities();
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
    const filteredMeals = meals.filter(m => checkDistrict(m.district));

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

        const day = date.day();
        const familiesInDay = families.filter(f => f.days.some(d => d == day));
        // Now check if this date for this family does not exist
        for (const family of familiesInDay) {
            // skip if this family is blocked for this date with no alternate
            if (holidays.length && holidays.some(h => h.familyId == family.id && !h.addAvailability && !h.alternateDate)) continue;
            const alternate = holidays.length > 0 ? holidays.find(h => (!h.familyId || h.familyId == family.id) && h.alternateDate) : undefined;
            const actualDate = alternate ?
                dayjs(alternate.alternateDate).format(DATE_AT) :
                date.format(DATE_AT);

            if (!meals.find(m => dayjs(m.date).format(DATE_AT) == actualDate && m.mainBaseFamilyId == family.id)) {
                addedOpenDemands.push({
                    id: getCalcDemandID(family.id, actualDate, family.cityId),
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

            // Add special added holidays:
            holidays.forEach(holiday => {
                if (holiday.addAvailability && holiday.familyId == family.id) {
                    const holidayDate = dayjs(holiday.date).format(DATE_AT);
                    if (!meals.find(m => dayjs(m.date).format(DATE_AT) == holidayDate && m.mainBaseFamilyId == family.id)) {
                        addedOpenDemands.push({
                            id: getCalcDemandID(family.id, holidayDate, family.cityId),
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
            });
        }
    }

    if (status == Status.Available) {
        return addedOpenDemands;
    }
    return filteredMeals.concat(addedOpenDemands);
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


// exports.UpdateFamilityDemand = onCall({ cors: true }, async (request) => {
//     const doc = await authenticate(request);
//     const mahoz = doc.data().mahoz;
//     const fdup = request.data as FamilityDemandUpdatePayload;

//     const districts = await getDestricts();

//     const demandDistrictId = (fdup.district || mahoz);
//     const volunteerId = (fdup.volunteerId || doc.id);

//     const demandDistrict = districts.find(d => d.id == demandDistrictId);
//     if (!demandDistrict) throw new HttpsError("not-found", "District " + demandDistrictId + " not found");

//     const apiKey = born2winApiKey.value();

//     if (!fdup.isRegistering && !(fdup.reason && fdup.reason.trim().length > 0)) {
//         throw new HttpsError("invalid-argument", "Missing reason to cancellation");
//     }

export async function updateFamilityDemand(demandId: string, demandDistrict: string,
    isRegistering: boolean, volunteerId: string, performingUser: string, cancelReason?: string) {
    // Add Locking - so only one user can update the same family & date
    const lock = await Lock.acquire(db, demandId);
    if (!lock) {
        throw new HttpsError("already-exists", "מתנדב אחר מעדכן את הרשומה הזו ממש עכשיו");
    }

    // First read the recod to verify it is indeed free
    let demand = undefined;
    if (isCalcDemandId(demandId)) {
        const { familyId, date } = parseDemandID(demandId);
        const possibleDemands = await getDemands2(demandDistrict, Status.Occupied, date, date);
        demand = possibleDemands.find(d => d.mainBaseFamilyId == familyId && d.date == date);
    } else {
        // eslint-disable-next-line new-cap
        demand = await AirTableGet<FamilyDemand>("ארוחות", demandId, (rec) => {
            return mealAirtable2FamilyDemand(rec, "N/A", true);
        });
    }

    if ((!demand && !isRegistering) || demand && isRegistering) {
        logger.info("Attept to a duplicated update family demand", demandId);
        await lock.release();

        logger.error("תפוס", demand, demandId);

        // record does not fit expected state, reject the action
        throw new HttpsError("already-exists", isRegistering ?
            "התאריך המבוקש עבור משפחה זו נתפס" :
            "התאריך המבוטל כבר מסומן כפנוי"
        );
    }

    // Update main base
    if (isRegistering) {
        const { familyId, date, cityId } = parseDemandID(demandId);

        const newRegistrationRec = {
            "records": [
                {
                    "fields": {
                        "משפחה": [
                            familyId,
                        ],
                        "מתנדב": [
                            volunteerId,
                        ],
                        "עיר": [
                            cityId,
                        ],
                        "DATE": date,
                    },
                },
            ],
        };
        // eslint-disable-next-line new-cap
        await AirTableInsert("ארוחות", newRegistrationRec);
        logger.info("New registration added", volunteerId, familyId, date);
    } else if (demand) {
        const updateCancelFields = {
            fields: {
                "סטטוס": "בוטל",
                "סיבת ביטול": cancelReason,
            },
        };
        // eslint-disable-next-line new-cap
        await AirTableUpdate("ארוחות", demandId, updateCancelFields);
        logger.info("Existing registration was cancelled", demand.id, "main-base-family", demand.mainBaseFamilyId, "vid", volunteerId);

        // send notification to admins - if date is less than 10 days:
        const daysDiff = dayjs().diff(demand.date, "days");
        if (Math.abs(daysDiff) <= 10) {
            const admins = await db.collection(Collections.Admins).get();
            const adminsIds = admins.docs.map(doc => doc.id);

            await addNotificationToQueue("שיבוץ בוטל!", `תאריך: ${demand.date}
משפחה: ${demand.familyLastName}
בוטל ע״י: ${performingUser}
עיר: ${demand.city}
`, NotificationChannels.Registrations, [], adminsIds);
        }
    } else {
        logger.info("Unable to find registration in ארוחות table", demandId);
    }

    await lock.release().catch(err => {
        logger.error("Error releasing lock", lock.lockId, err);
        return;
    });
    logger.info("Lock released for ", lock.lockId);
    return;
}
