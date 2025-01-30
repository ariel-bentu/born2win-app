import dayjs = require("dayjs");

import axios from "axios";
import { addNotificationToQueue, chunkArray, DATE_AT, db, manyChatApiKey } from ".";
import { FieldPath } from "firebase-admin/firestore";
import localeData = require("dayjs/plugin/localeData");
import { Collections, NotificationChannels, Status, VolunteerType } from "../../src/types";
import { AirTableQuery } from "./airtable";
import { getDemands, getDemands2 } from "./demands";

require("dayjs/locale/he");
dayjs.extend(localeData);
dayjs.locale("he");

interface NotificationDate {
    date: string;
    volunteerId?: string | undefined;
    status: string;
    volunteerName?: string;
}

interface Notification {
    mainBaseFamilyId: string;
    familyLastName: string;
    dates: NotificationDate[];

}

enum ManyChatFlows {
    FamilyFourWeekSummary = "content20241008192343_098603",
    SendOldLink = "content20230824123136_725765",
    SendInstallMessage = "content20241013201532_353172",
    RegisterToMessages = "content20241130162157_600222",
}

export async function weeklyNotifyFamilies() {
    const tomorrow = dayjs().add(1, "days");
    const notifications: Notification[] = [];
    const volunteers: { [key: string]: string } = {};
    const upcomingDemands = await getDemands2(undefined, undefined, VolunteerType.Meal, tomorrow.format(DATE_AT), tomorrow.add(28, "days").format(DATE_AT));
    for (const demand of upcomingDemands) {
        let notification = notifications.find(n => n.mainBaseFamilyId === demand.mainBaseFamilyId);
        if (!notification) {
            notification = {
                mainBaseFamilyId: demand.mainBaseFamilyId,
                familyLastName: demand.familyLastName,
                dates: [],
            } as Notification;
            notifications.push(notification);
        }
        if (demand.volunteerId) {
            volunteers[demand.volunteerId] = "";
        }

        notification.dates.push({
            date: demand.date,
            status: demand.status,
            volunteerId: demand.volunteerId,
        } as NotificationDate);
    }

    await getVolunteersNames(volunteers);

    const activeFamilies = await db.collection("families").where("active", "==", true).get();
    const waitFor = [];
    let count = 0;
    for (const notification of notifications) {
        const family = activeFamilies.docs.find(af => af.id === notification.mainBaseFamilyId);
        if (family) {
            // Add volunteer names
            notification.dates.forEach(d => {
                if (d.volunteerId) {
                    d.volunteerName = volunteers[d.volunteerId];
                }
            });

            waitFor.push(sendToManychat(family.data().manychat_id,
                ManyChatFlows.FamilyFourWeekSummary,
                { coordinator_name: family.data().contactName, ...categorizeDatesByWeek(notification.dates) }));

            // avoid hitting rate limit
            count++;
            if (count == 5) {
                await delay(2000);
                count = 0;
            }
        }
    }

    return Promise.all(waitFor);
}

// Helper function to categorize dates into weekly summaries
function categorizeDatesByWeek(dates: NotificationDate[]) {
    const today = dayjs();
    const thisWeek: string[] = [];
    const nextWeek: string[] = [];
    const weekAfterNext: string[] = [];
    const in3Weeks: string[] = [];

    dates.forEach(d => {
        const date = dayjs(d.date);
        const diffInWeeks = date.diff(today, "week");
        const name = d.volunteerId ? d.volunteerName : "טרם שובץ - עדיין עובדים על זה";
        if (diffInWeeks === 0) {
            thisWeek.push(date.format("dddd, DD-MM") + " - " + name); // Dates for this week
        } else if (diffInWeeks === 1) {
            nextWeek.push(date.format("dddd, DD-MM") + " - " + name); // Dates for next week
        } else if (diffInWeeks === 2) {
            weekAfterNext.push(date.format("dddd, DD-MM") + " - " + name); // Dates for the week after next
        } else if (diffInWeeks === 3) {
            in3Weeks.push(date.format("dddd, DD-MM") + " - " + name); // Dates for 3 weeks ahead
        }
    });

    const noneMsg = "אין ימי בישול";
    return {
        this_week_sum: thisWeek.length ? thisWeek.join("\n") : noneMsg,
        next_week_sum: nextWeek.length ? nextWeek.join("\n") : noneMsg,
        week_after_next_sum: weekAfterNext.length ? weekAfterNext.join("\n") : noneMsg,
        in_3_weeks_sum: in3Weeks.length ? in3Weeks.join("\n") : noneMsg,
    };
}

async function getVolunteersNames(volunteers: { [key: string]: string }) {
    const users = Object.keys(volunteers);
    const usersRef = db.collection("users");

    const chunks = chunkArray(users, 10);
    for (const chunk of chunks) {
        const chunkedUsersSnapshot = await usersRef.where(FieldPath.documentId(), "in", chunk).get();
        chunkedUsersSnapshot.forEach(user => {
            volunteers[user.id] = user.data().firstName + " " + user.data().lastName;
        });
    }
}

async function sendToManychat(manySubscriberId: string, manyChatFlowId: string, fields: { [key: string]: string }) {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };

    const fieldsArray = Object.keys(fields).map(fieldName => {
        return {
            field_name: fieldName,
            field_value: fields[fieldName],
        };
    });

    const payload = {
        subscriber_id: manySubscriberId,
        fields: fieldsArray,
    };

    if (fieldsArray.length > 0) {
        await axios.post("https://api.manychat.com/fb/subscriber/setCustomFields", payload, httpOptions);
    }

    return axios.post("https://api.manychat.com/fb/sending/sendFlow", {
        subscriber_id: manySubscriberId,
        flow_ns: manyChatFlowId,
    }, httpOptions);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


export async function SendReminderOrInstallMsg() {
    const date = dayjs().format(DATE_AT);

    const openMeals = await getDemands(undefined, Status.Available, VolunteerType.Meal, dayjs().add(1, "day").format(DATE_AT),
        dayjs().add(30, "days").format(DATE_AT));

    const query = new AirTableQuery<{ id: string, familyCount: number, name: string }>("מחוז", (rec) => ({
        id: rec.id,
        familyCount: rec.fields["כמות משפחות פעילות במחוז"],
        name: rec.fields.Name,
    }));
    const districtsIdsWithFamilies = (await query.execute()).filter(d => d.familyCount > 0);

    // remove districts with too few open meals: les than 1/2 meal per family
    const districtsWithEnoughOpenMeals = [] as string[];
    const districtsWithTooFewOpenMeals = [] as any[];
    for (const district of districtsIdsWithFamilies) {
        const openMealsInDistrict = openMeals.filter(om => om.district == district.id).length;
        if (openMealsInDistrict > 0 && district.familyCount / openMealsInDistrict > .5) {
            districtsWithEnoughOpenMeals.push(district.id);
        } else {
            const ratio = openMealsInDistrict == 0 ? 0 : parseFloat((district.familyCount / openMealsInDistrict).toFixed(1));
            districtsWithTooFewOpenMeals.push(`${district.name}: ${ratio} ארוחה לכל משפחה`);
        }
    }

    const users = await db.collection(Collections.Users).where("active", "==", true).get();

    const usersWithNoActiveFamilies = users.docs.filter(u => !districtsWithEnoughOpenMeals.some((did: string) => u.data().districts.includes(did)));
    const allUsersInActiveDistricts = users.docs.filter(u => districtsWithEnoughOpenMeals.some((did: string) => u.data().districts.includes(did)) &&
        u.data().manychat_id !== undefined);

    const usersNotInApp = users.docs.filter(u => u.data().uid == undefined);
    const usersInApp = allUsersInActiveDistricts.filter(u => u.data().uid != undefined);

    let bulk: Promise<any>[] = [];
    for (const user of usersNotInApp) {
        if (bulk.length == 10) {
            await Promise.all(bulk);
            await delay(1000);
            bulk = [];
        }
        bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendInstallMessage, {})
            .then(() => user.ref.update({ sendWeeklyMessage: date }))
            .catch(error => {
                console.log("Error sending install whatsApp message", error.message, "man_id", user.data().manychat_id);
                return { user, error };
            }));
    }
    await Promise.all(bulk);

    bulk = [];
    for (const user of usersInApp) {
        if (bulk.length == 10) {
            await Promise.all(bulk);
            await delay(1000);
            bulk = [];
        }
        bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendInstallMessage, {})
            .then(() => user.ref.update({ sendWeeklyMessage: date }))
            .catch(error => {
                console.log("Error sending reminder whatsApp message", error.message, "man_id", user.data().manychat_id);
                return { user, error };
            }));
    }
    await Promise.all(bulk);


    const admins = await db.collection(Collections.Admins).get();
    const adminsIds = admins.docs.map(doc => doc.id);

    await addNotificationToQueue("נשלחו הודעות בווטסאפ!", `סה״כ הודעות התקנה: ${usersNotInApp.length}
סה״כ הודעות תזכורת למותקני אפליקציה: ${usersInApp.length}
מתנדבים במחוז ללא משפחות: ${usersWithNoActiveFamilies.length}
מחוזות שלא נשלחה הודעה: ${districtsWithTooFewOpenMeals.map(d=>`\n - ${d}`)}
`, NotificationChannels.Alerts, [], adminsIds);
}
