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
        if (!result.find(f => f.districtBaseFamilyId === fd.districtBaseFamilyId)) {
            result.push({
                districtBaseFamilyId: fd.districtBaseFamilyId,
                familyLastName: fd.familyLastName,
                city: fd.city,
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

export function getReferenceDays(date:string) {
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
export const sortByDateDesc = (a: string, b: string) => dayjs(a).isBefore(b) ? 1 : -1;

export function replaceAll(str: string, find: string, replace: string) {
    const regex = new RegExp(find, "g");

    return str.replace(regex, replace);
}


export function normilizePhone(phone: string): string {
    if (phone.startsWith("0")) {
        phone = "+972" + phone.substring(1);
    } else {
        if (phone.startsWith("972")) {
            phone = "+" + phone;
        }
    }

    phone = replaceAll(phone, " ", "");
    phone = replaceAll(phone, "-", "");
    return phone;
}

export function nicePhone(phone: string): string {
    if (phone.startsWith("972")) {
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