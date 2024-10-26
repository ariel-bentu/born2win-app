import dayjs = require("dayjs");
import { DATE_AT } from ".";
import { AirTableRecord, Holiday } from "../../src/types";
import { AirTableDelete, AirTableInsert, AirTableQuery, AirTableUpdate, CachedAirTable } from "./airtable";
import { getSafeFirstArrayElement } from "../../src/utils";


function holidayAirtable2Holiday(holiday: AirTableRecord): Holiday {
    return {
        id: holiday.id,
        name: holiday.fields.Name,
        date: holiday.fields["תאריך"],
        alternateDate: holiday.fields["תאריך חלופי"],
        addAvailability: holiday.fields["זמין"] == true,
        familyId: getSafeFirstArrayElement(holiday.fields["משפחה"], undefined),
        familyName: getSafeFirstArrayElement(holiday.fields["שם משפחה"], undefined),
    };
}

// Holidays cache - 5 min
export const holidays = new CachedAirTable<Holiday>("חגים וחריגים", holidayAirtable2Holiday, ["AND(IS_AFTER({תאריך}, DATEADD(TODAY(), -1, 'days')))"], 5);


export async function upsertHoliday(holiday: Holiday) {
    // todo: update cache, verify new holiday is not already existing

    const upsertHolidayFields: any = {
        fields: {
            "Name": holiday.name,
            "תאריך": dayjs(holiday.date).format(DATE_AT),
            "זמין": holiday.addAvailability,
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
}

export async function getHolidays(from: string, to: string): Promise<Holiday[]> {
    const holidayQuery = new AirTableQuery<Holiday>("חגים וחריגים", holidayAirtable2Holiday);
    return holidayQuery.execute([
        `{תאריך}>='${dayjs(from).format(DATE_AT)}'`,
        `IS_BEFORE({תאריך}, '${dayjs(to).add(1, "day").format(DATE_AT)}')`,
    ]);
}

export async function deleteHoliday(id: string) {
    return AirTableDelete("חגים וחריגים", id);
}