import { FamilyCompact, FamilyDemand } from "./types";

export const isNotEmpty = (val: string | null | undefined): val is string => {
    return !!val && val.trim().length > 0;
};

export const NICE_DATE = "[יום ]dddd, D [ב]MMMM";
export const IL_DATE = "DD-MM-YYYY";

export const getUniqueFamilies = (records: FamilyDemand[]): FamilyCompact[] => {
    const result = [] as FamilyCompact[];
    records.forEach(fd => {
        if (!result.find(f => f.familyId === fd.familyRecordId)) {
            result.push({
                familyId: fd.familyRecordId,
                familyLastName: fd.familyLastName,
                city: fd.city,
            })
        }
    })
    return result;
};