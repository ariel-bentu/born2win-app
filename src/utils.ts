export const isNotEmpty = (val: string | null | undefined): val is string => {
    return !!val && val.trim().length > 0;
};

export const NICE_DATE = "[יום ]dddd, D [ב]MMMM";
export const IL_DATE = "DD-MM-YYYY";