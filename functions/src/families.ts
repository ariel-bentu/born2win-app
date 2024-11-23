import {
    AirTableRecord, Contact, FamilyCompact, FamilyDetails,
    Status,
} from "../../src/types";
import { AirTableDelete, AirTableGet, AirTableInsert, AirTableQuery, AirTableUpdate, CachedAirTable } from "./airtable";
import { airtableArrayCondition, DATE_AT, getSafeFirstArrayElement, normilizePhone } from "../../src/utils";
import { getCities } from ".";
import { createManyChatSubscriber, deleteManyChatSubscriber, updateManyChatSubscriber } from "./manychat";
import dayjs = require("dayjs");


const tables = {
    Contacts: "אנשי קשר",
};

export interface Family {
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
    Saturday: 6,
};

function familyAirtable2Family(family: AirTableRecord): Family {
    return {
        id: family.id,
        name: family.fields.Name,
        district: getSafeFirstArrayElement(family.fields["מחוז"], ""),
        days: family.fields["Days of the Week"] ? family.fields["Days of the Week"].map((d: string) => daysMap[d]) : [],
        cityId: getSafeFirstArrayElement(family.fields["עיר"], ""),
        active: family.fields["סטטוס בעמותה"] == Status.Active,
    };
}

// Families Cache (60 min)
export const activeFamilies = new CachedAirTable<Family>("משפחות רשומות", familyAirtable2Family, [`{סטטוס בעמותה}='${Status.Active}'`]);


function familyAirtable2FamilyDetails(rec: AirTableRecord, cityName: string, includeContacts = false): FamilyDetails {
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
        importantNotice: rec.fields["נא לשים לב"] || "",
        adultsCount: getSafeFirstArrayElement(rec.fields["מספר נפשות הגרים בבית"], 1), // todo fix name of field
        familyStructure: getSafeFirstArrayElement(rec.fields["הרכב הורים"], ""),
        familyMembersAge: getSafeFirstArrayElement(rec.fields["גילאים של הרכב המשפחה"], ""),
        cookingDays: rec.fields["ימים"],

        street: rec.fields["רחוב"],
        floor: rec.fields["קומה"],
        appartment: rec.fields["דירה"],
        streatNumber: rec.fields["מספר הרחוב"],
        contactName: includeContacts ? getSafeFirstArrayElement(rec.fields["שם איש קשר לוגיסטי"], "") : "",
        phone: includeContacts ? getSafeFirstArrayElement(rec.fields["טלפון איש קשר לוגיסטי"], "") : "",
        relationToPatient: "", // todo
    };
}

export async function getFamilyDetails2(familyId: string, includeContacts: boolean): Promise<FamilyDetails> {
    const _cities = await getCities();
    const getCityName = (id: string) => {
        const city = _cities.find(c => c.id == id);
        if (!city) {
            console.log("can't find city", id);
        }
        return city?.name || "";
    };

    // eslint-disable-next-line new-cap
    return AirTableGet<FamilyDetails>("משפחות רשומות", familyId, (rec) =>
        familyAirtable2FamilyDetails(rec, getCityName(getSafeFirstArrayElement(rec.fields["עיר"], "")), includeContacts));
}


export async function searchFamilies(searchStr: string): Promise<FamilyCompact[]> {
    const familyQuery = new AirTableQuery<FamilyCompact>("משפחות רשומות", (m) => {
        return {
            districtBaseFamilyId: "N/A",
            mainBaseFamilyId: m.id,
            district: getSafeFirstArrayElement(m.fields["מחוז"], ""),
            familyLastName: m.fields.Name,
            city: getSafeFirstArrayElement(m.fields["עיר"], ""), // todo it is ID
            active: true,
        };
    });
    const prefix = "משפחת ";

    return familyQuery.execute([
        `LEFT({Name}, ${searchStr.length + prefix.length}) = "${prefix + searchStr}"`,
        "{סטטוס בעמותה}='פעיל'",
    ]);
}

function contactAirtable2Contact(rec: AirTableRecord): Contact {
    return {
        id: rec.id,
        firstName: rec.fields["שם פרטי"],
        lastName: rec.fields["שם משפחה"],
        role: rec.fields["תפקיד"],
        email: rec.fields["email"],
        phone: rec.fields["טלפון"],
        age: rec.fields["גיל"],
        gender: rec.fields["מגדר"],
        dateOfBirth: rec.fields["תאריך לידה"],
        idNumber: rec.fields["תעודת זהות"],
        manychatId: rec.fields.manychat_id,
        relationToPatient: rec.fields["סוג הקשר לחולה"],
    };
}

export async function getFamilyContacts(familyId: string): Promise<Contact[]> {
    // eslint-disable-next-line new-cap
    const query = new AirTableQuery<Contact>(tables.Contacts, contactAirtable2Contact);
    return query.execute([airtableArrayCondition("families", familyId)]);
}

// Only delete if no other family is attached to it
export async function deleteContact(id: string, familyId: string) {
    const existingContact = await AirTableGet<any>(tables.Contacts, id, (rec) => ({
        families: rec.fields["משפחות רשומות"],
        manychatId: rec.fields.manychat_id,
    }));
    const leftFamilies = existingContact.families.filter((f: string) => f != familyId);
    if (leftFamilies.length == 0) {
        await deleteManyChatSubscriber(existingContact.manychatId);
        return AirTableDelete(tables.Contacts, id);
    } else {
        return AirTableUpdate(tables.Contacts, id, {
            fields: {
                "משפחות רשומות": leftFamilies,
            },
        });
    }
}

export async function upsertContact(contact: Contact, familyId: string) {
    if (contact.id.length == 0) {
        // creates manychatid:
        contact.manychatId = await createManyChatSubscriber(contact.firstName, contact.lastName, contact.phone,
            contact.gender == "אישה" ? "female" : "male",);
        let cities: string[] = [];
        const family = await activeFamilies.get(f => f.id == familyId);
        if (family.length == 1) {
            cities = [family[0].cityId];
        }

        const newContacts: any = {
            "records": [
                {
                    "fields": {
                        "שם פרטי": contact.firstName,
                        "שם משפחה": contact.lastName,
                        "תפקיד": contact.role,
                        "email": contact.email,
                        "טלפון": contact.phone,
                        "גיל": contact.age,
                        "מגדר": contact.gender,
                        "תאריך לידה": dayjs(contact.dateOfBirth).format(DATE_AT),
                        "תעודת זהות": contact.idNumber,
                        "manychat_id": contact.manychatId,
                        "סוג הקשר לחולה": contact.relationToPatient,
                        "משפחות רשומות": [familyId],
                        "ערים": cities,
                        "בדיקת התאמה": ["reccWsx2UZJf0x0Vs"],
                    },
                },
            ],
        };
        await AirTableInsert(tables.Contacts, newContacts);
    } else {
        // First read the current contact:
        const existingContact = await AirTableGet<Contact>(tables.Contacts, contact.id, contactAirtable2Contact);
        if (existingContact.phone !== contact.phone) {
            contact.manychatId = await updateManyChatSubscriber(contact.manychatId, contact.firstName, contact.lastName,
                contact.gender == "אישה" ? "female" : "male", normilizePhone(contact.phone));
        }

        await AirTableUpdate(tables.Contacts, contact.id, {
            fields: {
                "שם פרטי": contact.firstName,
                "שם משפחה": contact.lastName,
                "תפקיד": contact.role,
                "email": contact.email,
                "גיל": contact.age,
                "מגדר": contact.gender,
                "תאריך לידה": contact.dateOfBirth,
                "תעודת זהות": contact.idNumber,
                "סוג הקשר לחולה": contact.relationToPatient,
                "manychat_id": contact.manychatId,
            },
        });
    }
}