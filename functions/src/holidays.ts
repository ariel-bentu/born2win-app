import dayjs = require("dayjs");
import { DATE_AT, getCities } from ".";
import { AirTableRecord, Holiday } from "../../src/types";
import { AirTableDelete, AirTableInsert, AirTableQuery, AirTableUpdate, CachedAirTable } from "./airtable";
import { getSafeFirstArrayElement } from "../../src/utils";


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

// Holidays cache - 5 min
export const holidays = new CachedAirTable<Holiday>("חגים וחריגים", (rec) => {
    return holidayAirtable2Holiday(rec);
}, ["AND(IS_AFTER({תאריך}, DATEADD(TODAY(), -8, 'days')))"]);


export async function upsertHoliday(holiday: Holiday) {
    // todo: update cache, verify new holiday is not already existing

    const upsertHolidayFields: any = {
        fields: {
            "Name": holiday.name,
            "תאריך": dayjs(holiday.date).format(DATE_AT),
            "סוג": holiday.type,
        },
    };

    if (holiday.familyId && holiday.familyId.length > 0) {
        upsertHolidayFields.fields["משפחה"] = [holiday.familyId];
    }

    if (holiday.alternateDate && holiday.alternateDate.length > 0) {
        upsertHolidayFields.fields["תאריך חלופי"] = holiday.alternateDate;
    }

    if (holiday.id.length > 0) {
        await AirTableUpdate("חגים וחריגים", holiday.id, upsertHolidayFields);
    } else {
        await AirTableInsert("חגים וחריגים", upsertHolidayFields);
    }
    holidays.evict();
}

export async function getHolidays(from: string, to: string): Promise<Holiday[]> {
    const cities = await getCities();

    const holidayQuery = new AirTableQuery<Holiday>("חגים וחריגים", rec => {
        const city = cities.find(c => c.id === getSafeFirstArrayElement(rec.fields["עיר"], ""));
        return holidayAirtable2Holiday(rec, city?.name, city?.district);
    });
    return holidayQuery.execute([
        `{תאריך}>='${dayjs(from).format(DATE_AT)}'`,
        `IS_BEFORE({תאריך}, '${dayjs(to).add(1, "day").format(DATE_AT)}')`,
    ]);
}

export async function deleteHoliday(id: string) {
    await AirTableDelete("חגים וחריגים", id);
    holidays.evict();
}