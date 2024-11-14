import dayjs = require("dayjs");

import axios from "axios";
import { addNotificationToQueue, chunkArray, DATE_AT, db, manyChatApiKey } from ".";
import { FieldPath } from "firebase-admin/firestore";
import localeData = require("dayjs/plugin/localeData");
import { Collections, NotificationChannels } from "../../src/types";
import { getDemands2 } from "./demands";
import { AirTableQuery } from "./airtable";

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
}

export async function weeklyNotifyFamilies() {
    const tomorrow = dayjs().add(1, "days");
    const notifications: Notification[] = [];
    const volunteers: { [key: string]: string } = {};
    const upcomingDemands = await getDemands2(undefined, undefined, tomorrow.format(DATE_AT), tomorrow.add(28, "days").format(DATE_AT));
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


export async function SendLinkOrInstall() {
    const date = dayjs().format(DATE_AT);

    const query = new AirTableQuery<{ id: string, familyCount: number }>("מחוז", (rec) => ({
        id: rec.id,
        familyCount: rec.fields["כמות משפחות פעילות במחוז"],
    }));
    const districtsIdsWithFamilies = (await query.execute()).filter(d => d.familyCount > 0).map(d => d.id);

    const users = await db.collection(Collections.Users).where("active", "==", true).get();
    let relevantUsers = users.docs.filter(u =>
        u.data().uid == undefined &&
        u.data().manychat_id !== undefined &&
        u.data().sendWeeklyMessage !== date);
    const potentialUsers = relevantUsers.length;
    relevantUsers = relevantUsers.filter(u => districtsIdsWithFamilies.some((did: string) => u.data().districts.includes(did)));
    const usersWithNoAvtiveFamilies = potentialUsers - relevantUsers.length;

    let bulk: Promise<any>[] = [];
    let totalInstall = 0;
    for (const user of relevantUsers) {
        if (bulk.length == 10) {
            await Promise.all(bulk);
            await delay(1000);
            bulk = [];
        }
        bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendInstallMessage, {})
            .then(() => user.ref.update({ sendWeeklyMessage: date }))
            .catch(error => {
                console.log("Error sending install app message", error.message, "man_id", user.data().manychat_id);
                return { user, error };
            }));

        totalInstall++;
    }
    await Promise.all(bulk);
    // bulk = [];
    // for (const user of usersForLink) {
    //     if (bulk.length == 10) {
    //         await Promise.all(bulk);
    //         await delay(1000);
    //         console.log("10 more send", totalLinks, "of", usersForLink.length);
    //         bulk = [];
    //     }
    //     bulk.push(sendToManychat(user.data().manychat_id, ManyChatFlows.SendOldLink, {})
    //         .then(() => user.ref.update({ sendWeeklyMessage: date }))
    //         .catch(error => {
    //             console.log("Error sending old link", error.message, "man_id", user.data().manychat_id);
    //             return { user, error };
    //         }));

    //     totalLinks++;
    // }
    // await Promise.all(bulk);

    const admins = await db.collection(Collections.Admins).get();
    const adminsIds = admins.docs.map(doc => doc.id);

    await addNotificationToQueue("נשלחו הודעות בווטסאפ!", `סה״כ הודעות התקנה: ${totalInstall}
סה״כ לינקים: 0
מותקני אפליקציה: ${users.docs.length - totalInstall - usersWithNoAvtiveFamilies}
מתנדבים במחוז ללא משפחות: ${usersWithNoAvtiveFamilies}`, NotificationChannels.Alerts, [], adminsIds);
}
