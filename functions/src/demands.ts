import { addNotificationToQueue, DATE_AT, db, getCities } from ".";
import dayjs = require("dayjs");

import {
    AirTableRecord, Collections, FamilyDemand, NotificationChannels, Status,
} from "../../src/types";
import { airtableArrayCondition, dateInRange, getSafeFirstArrayElement } from "../../src/utils";
import { AirTableGet, AirTableInsert, AirTableQuery, AirTableUpdate } from "./airtable";
import { activeFamilies } from "./families";
import { Lock } from "./lock";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { holidays } from "./holidays";

function mealAirtable2FamilyDemand(demand: AirTableRecord, familyCityName: string, volunteerCityName: string, active: boolean): FamilyDemand {
    return {
        id: demand.id,
        date: demand.fields["DATE"],
        familyCityName,
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
        const _cities = await getCities();
        const getCityName = (id: string) => _cities.find(c => c.id == id)?.name || "";

        // eslint-disable-next-line new-cap
        demand = await AirTableGet<FamilyDemand>("ארוחות", demandId, (m) => mealAirtable2FamilyDemand(m,
            getCityName(getSafeFirstArrayElement(m.fields["עיר"], "")),
            getCityName(getSafeFirstArrayElement(m.fields["עיר מתנדב"], "")),
            true)
        );
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
עיר: ${demand.familyCityName}
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
