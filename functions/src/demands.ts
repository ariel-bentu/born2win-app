import { addNotificationToQueue, DATE_AT, DATE_TIME, db, getCities } from ".";
import dayjs = require("dayjs");

import {
    AirTableRecord, Collections, EventType, FamilyDemand, Holiday, NotificationChannels, Status,
    VolunteerType,
} from "../../src/types";
import { airtableArrayCondition, dateInRange, getSafeFirstArrayElement, toSunday } from "../../src/utils";
import { AirTableGet, AirTableInsert, AirTableQuery, AirTableUpdate } from "./airtable";
import { activeFamilies, Family } from "./families";
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
        status: demand.fields["סטטוס"] == Status.Cancelled ? Status.Cancelled : Status.Occupied,
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""),
        districtBaseFamilyId: "N/A",
        volunteerId: getSafeFirstArrayElement(demand.fields["מתנדב"], undefined),
        volunteerCityName,
        isFamilyActive: active,
        transpotingVolunteerId: getSafeFirstArrayElement(demand.fields["מתנדב משנע"], undefined),
        type: demand.fields["סוג"] || VolunteerType.Meal,
        expandDays: [0],
        modifiedDate: dayjs(demand.createdTime).format(DATE_TIME),
    };
}

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
    const checkFamily = ((fId: string) => !familyId || fId == familyId);

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
    const filteredMeals = meals.filter(m => checkDistrict(m.district) && checkFamily(m.mainBaseFamilyId));

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

    const allowAdd = familyMealsInRange.length == 0 || (familyMealsInRange.length == 1 && twoCookingDays);

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
            modifiedDate: "",
        });
    }
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

export async function updateFamilyDemand(demandId: string, registrationDate: string | undefined, demandDistrict: string,
    isRegistering: boolean, type: VolunteerType, volunteerId: string, performingUser: string, cancelReason?: string) {
    // Add Locking - so only one user can update the same family & date
    const lock = await Lock.acquire(db, demandId);
    if (!lock) {
        throw new HttpsError("already-exists", "מתנדב אחר מעדכן את הרשומה הזו ממש עכשיו");
    }

    // First read the recod to verify it is indeed free
    let demand = undefined;
    if (isCalcDemandId(demandId)) {
        const { familyId, date } = parseDemandID(demandId);
        // expand the date to sunday - friday - must avoid holiday-treats that span more than one week!!
        const startDate = toSunday(date).format(DATE_AT);
        const endDate = dayjs(startDate).add(5, "day").format(DATE_AT);

        const possibleDemands = await getDemands2(demandDistrict, undefined, Status.Occupied, type, startDate, endDate);
        demand = possibleDemands.find(d => d.mainBaseFamilyId == familyId);
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
        logger.warn("Attept to a duplicated-update of family demand", demandId, demand);
        await lock.release();

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
                        "DATE": registrationDate || date, // we ignore the date in the ID as it is the anchor date of the demand and then there's expandDays
                        "סוג": type,
                    },
                },
            ],
        };
        // eslint-disable-next-line new-cap
        await AirTableInsert("ארוחות", newRegistrationRec);
        logger.info("New registration added", { volunteerId, familyId, date, registrationDate });
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
            const notifyTo = admins.docs.map(doc => doc.id);
            if (demand.volunteerId) {
                notifyTo.push(demand.volunteerId);
            }
            if (demand.transpotingVolunteerId) {
                notifyTo.push(demand.transpotingVolunteerId);
            }

            await addNotificationToQueue("שיבוץ בוטל!", `תאריך: ${demand.date}
משפחה: ${demand.familyLastName}
בוטל ע״י: ${performingUser}
עיר: ${demand.familyCityName}
`, NotificationChannels.Registrations, [], notifyTo);
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
