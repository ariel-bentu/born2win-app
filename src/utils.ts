import { Dayjs } from "dayjs";
import { FamilyCompact, FamilyDemand } from "./types";
const dayjs = require("dayjs");

export const isNotEmpty = (val: string | null | undefined): val is string => {
    return !!val && val.trim().length > 0;
};

export const NICE_DATE = "[יום ]dddd, D [ב]MMMM";
export const IL_DATE = "DD-MM-YYYY";

export const getUniqueFamilies = (records: FamilyDemand[]): FamilyCompact[] => {
    const result = [] as FamilyCompact[];
    records.forEach(fd => {
        if (!result.find(f => f.mainBaseFamilyId === fd.mainBaseFamilyId)) {
            result.push({
                districtBaseFamilyId: fd.districtBaseFamilyId,
                mainBaseFamilyId: fd.mainBaseFamilyId,
                familyLastName: fd.familyLastName,
                city: fd.familyCityName,
                district: fd.district,
                active: fd.isFamilyActive,
            })
        }
    })
    return result;
};

export function limitText(val: string, length: number): string {
    if (val.length > length) {
        return val.substring(0, length) + "...";
    }
    return val;
}

export function getNiceDate(d: number | string) {
    const theDate = dayjs(d);
    return theDate.format("[יום ]dddd, D [ב]MMMM");
}

export function getNiceDateTime(d: number | string) {
    const theDate = dayjs(d);
    if (theDate.isToday()) {
        return theDate.format("HH:mm");
    } else if (theDate.isYesterday()) {
        return "אתמול ב " + theDate.format("HH:mm");
    }
    return theDate.format("[יום ]dddd, D [ב]MMMM HH:mm");
}

export function getReferenceDays(date: string) {
    const d = dayjs(date);
    const today = dayjs();
    if (d.isAfter(today)) {
        return `עוד ${d.diff(today, "days")} ימים`;
    } else if (d.diff(today, "days") === 0) {
        return "היום";
    } else {
        return `לפני ${d.diff(today, "days")} ימים`;
    }
}

export const sortByDate = (a: string, b: string) => dayjs(a).isBefore(b) ? -1 : 1;
export const sortByStringField = (a: any, b: any, field: string) => {
    const d1 = a[field];
    const d2 = b[field];
    if (d1 && !d2) return 1;
    if (d2 && !d1) return -1;
    if (d1 && d2) {
        if (d1 > d2) return 1;
        if (d1 < d2) return -1;
    }
    return 0
}


export const sortByDateDesc = (a: string, b: string) => dayjs(a).isBefore(b) ? 1 : -1;

export function replaceAll(str: string, find: string, replace: string) {
    const regex = new RegExp(find, "g");

    return str.replace(regex, replace);
}


export function normilizePhone(phone: string, addplus = true): string {
    if (!phone) return "";
    const plus = addplus ? "+" : ""

    if (phone.startsWith("0")) {
        phone = plus + "972" + phone.substring(1);
    } else {
        if (phone.startsWith("972")) {
            phone = plus + phone;
        }
    }

    phone = replaceAll(phone, " ", "");
    phone = replaceAll(phone, "-", "");
    return phone;
}

export function nicePhone(phone: string): string {
    if (!phone) return "";

    if (phone.startsWith("+972")) {
        phone = "0" + phone.substring(4);
    } else if (phone.startsWith("972")) {
        phone = "0" + phone.substring(3);
    }
    return phone;
}

export function simplifyFamilyName(name: string): string {
    if (!name) return "";
    const match = name.match(/משפחת\s(.+?)\s-/);
    if (match) {
        return match[1]; // Extracted family name
    }
    return name;
}

export function getSafeFirstArrayElement(arr: any[], defaultValue: any) {
    return arr && arr.length && arr[0] || defaultValue;
}

export function airtableArrayCondition(fieldName: string, value: string): string {
    return `FIND("${value}", ARRAYJOIN({${fieldName}}))> 0`;
}
export const DATE_AT = "YYYY-MM-DD";

export function dateInRange(date: string | Dayjs, start: string | Dayjs, end: string | Dayjs) {
    const dateS = dayjs(date).format(DATE_AT);
    const startS = dayjs(start).format(DATE_AT);
    const endS = dayjs(end).format(DATE_AT);

    return dateS >= startS && dateS <= endS;
}

export function getDatesBetween(startDateIn: string, endDateIn: string) {
    const dates = [];
    let currentDate = dayjs(startDateIn);
    const endDate = dayjs(endDateIn);

    // Loop until the current date is after the end date
    while (currentDate.isSame(endDate) || currentDate.isBefore(endDate)) {
        dates.push(currentDate.format("YYYY-MM-DD"));
        currentDate = currentDate.add(1, "day");
    }

    return dates;
}

export function isValidIsraeliIdentificationNumber(id: string | undefined) {
    if (!id) return false;
    if (id.length < 9) return false;

    const idNum = parseInt(id);
    id = String(id).trim();
    if (id.length > 9 || isNaN(idNum)) return false;

    id = id.length < 9 ? ("00000000" + id).slice(-9) : id;
    return Array.from(id, Number).reduce((counter, digit, i) => {
        const step = digit * ((i % 2) + 1);
        return counter + (step > 9 ? step - 9 : step);
    }) % 10 === 0;
}