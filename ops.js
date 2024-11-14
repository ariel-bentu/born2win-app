require("dotenv").config({ path: "./functions/.env.born2win-prod" });
const os = require('os');
const path = require('path');

const homeDirectory = os.homedir();

const axios = require("axios");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const serviceAccountPath = path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'firebase', 'born2win-prod-firebase-adminsdk-dltch-7d0cd3c9f4.json');
const manualUsersPath = path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'users.json');

var admin = require("firebase-admin");
const NICE_DATE = "[יום ]dddd, D [ב]MMMM";
const IL_DATE = "DD-MM-YYYY";
const {
    FieldPath,
    FieldValue,
} = require("@google-cloud/firestore");
dayjs.extend(utc);
dayjs.extend(timezone);
const JERUSALEM = "Asia/Jerusalem";

const DATE_AT = "YYYY-MM-DD";

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
});


const db = admin.firestore();

const baseId = process.env.BORM2WIN_MAIN_BASE;
const apiKey = process.env.BORN2WIN_API_KEY;
const manychatKey = process.env.BORN2WIN_MANYCHAT_API_KEY;

const NotificationActions = {
    RegistrationDetails: "registration-details",
    StartConversation: "start-conversation"
}

const NotificationChannels = {
    General: "general",
    Alerts: "alerts",
    Links: "links",
    Greetings: "greetings",
    Registrations: "registrations",
};


const manualUsers = require(manualUsersPath);

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

async function addNotificationToQueue(title, body, channel, toDistricts, toRecipients, data) {
    const docRef = db.collection("notifications").doc();
    data = { channel, ...data }
    return docRef.create({
        title,
        body,
        data: JSON.stringify(data),
        toDistricts,
        toRecipients,
        created: dayjs().format("YYYY-MM-DD HH:mm"),
    }).then(() => docRef.id);
}

async function updateAllUsers() {
    let offset = null;
    let count = 0;
    let countActive = 0
    const url = `https://api.airtable.com/v0/${baseId}/מתנדבים`;
    // const modifiedSince = dayjs().subtract(2, "day");


    const batch = db.batch();
    do {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            params: {
                //filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${modifiedSince}')`,
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון", "אמייל", "manychat_id", "phone_e164", "תאריך לידה", "מגדר", "חתם על שמירת סודיות", "תעודת זהות"],
                offset: offset,
            }
        }).catch(e => console.log(e));
        offset = response.data.offset;
        count += response.data.records.length;
        countActive += response.data.records.filter(user => user.fields["פעיל"] == "פעיל").length;

        response.data.records.forEach(user => {
            const userId = user.fields.record_id;
            const userRecord = {
                active: user.fields["פעיל"] == "פעיל",
                firstName: user.fields["שם פרטי"],
                lastName: user.fields["שם משפחה"],
                mahoz: user.fields["מחוז"][0],
                birthDate: user.fields["תאריך לידה"] ? dayjs(user.fields["תאריך לידה"]).format("DD-MM") : "",
                gender: (user.fields["מגדר"] || "לא ידוע"),
                phone: user.fields.phone_e164,
                volId: user.id,
                needToSignConfidentiality: (user.fields["חתם על שמירת סודיות"] !== "חתם" ?
                    generateSignConfidentialityURL(user.fields["שם פרטי"], user.fields["תעודת זהות"], userId) :
                    FieldValue.delete()),
            }

            if (user.fields.manychat_id) {
                userRecord.manychat_id = user.fields.manychat_id
            }

            if (user.fields["אמייל"]) {
                userRecord.email = user.fields["אמייל"];
            }

            //console.log("add", userId, userRecord);
            const docRef = db.collection("users").doc(userId);
            batch.update(docRef, userRecord);
        })
    } while (offset);

    // // Add manual users
    // manualUsers.forEach(mu => {
    //     const userRecord = {
    //         active: true,
    //         firstName: mu.firstName,
    //         lastName: mu.lastName,
    //         mahoz: mu.mahoz,
    //         phone: mu.phone,
    //         volId: mu.id,
    //     }
    //     //console.log("add", userId, userRecord);
    //     const docRef = db.collection("users").doc(mu.id);
    //     batch.create(docRef, userRecord);
    // });




    batch.commit();

    console.log("count", count, "countActive", countActive);
}


//updateAllUsers();


let districts
async function getDestricts() {
    if (!districts) {
        // districts are cached
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };

        const districtResponse = await axios.get(`https://api.airtable.com/v0/${baseId}/מחוז`, {
            headers,
        });
        districts = districtResponse.data.records.map((r) => ({
            id: r.id,
            name: r.fields["מחוז"],
            base_id: r.fields.base_id,
            demandsTable: r.fields.table_id,
            familiesTable: r.fields.table_familyid,
        }));
    }
    return districts || [];
}
async function testRegistrations() {
    // temp fixed data
    volunteerId = "recpvp2E7B5yEywPi";
    mahoz = "recP17rsfOseG3Frx";

    if (mahoz && mahoz.length > 0) {
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
        };
        //const mahuzRec = (await getDestricts()).find((d) => d.id === mahoz);
        //if (mahuzRec) {
        const baseId = "appLTxCrbOFaAjmtW";
        const formula = encodeURIComponent(`{volunteer_id}='${volunteerId}'`);
        const userRegistrations = await axios.get(`https://api.airtable.com/v0/appLTxCrbOFaAjmtW/%D7%93%D7%A8%D7%99%D7%A9%D7%95%D7%AA%20%D7%9C%D7%A9%D7%99%D7%91%D7%95%D7%A6%D7%99%D7%9D?filterByFormula=${formula}&sort[0][field]=תאריך&sort[0][direction]=desc`
            , {
                headers,
            });
        return userRegistrations.data;
        //}
    }
    return [];
}

//testRegistrations();



function sendNotification(title, body, data, token) {
    const imageUrl = "https://born2win-prod.web.app/favicon.ico";
    const actionUrl = "https://born2win-prod.web.app";
    const message = {
        token,
        notification: {
            title,
            body,
            imageUrl,
            // TODO actions:Array<{ action: string; icon?: string; title: string; }> An array of notification actions representing the actions available to the user when the notification is presented.
        },
        // data,
        webpush: {
            notification: {
                title: title,
                body: body,
                icon: imageUrl,
                click_action: actionUrl,
                data,
            },
            fcmOptions: {
                link: actionUrl,
            },
        },
    };
    return admin.messaging().send(message).then(() => {
        console.log("success")
    }).catch(err => console.log("error", err.message))

}

//sendNotification("hi", "1", {},"")

async function searchMeals() {
    const urlMainBase = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("ארוחות")}`;

    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };
    const filterFormula = `DATETIME_FORMAT({DATE}, 'YYYY-MM-DD')="2024-09-24"`;


    const findResult = await axios.get(urlMainBase, {
        ...httpOptions,
        params: {
            filterByFormula: filterFormula,
            maxRecords: 1000,
        },
    });

    if (findResult.data.records.length > 0) {
        const rec = findResult.data.records.find(r => r.fields["משפחה"][0] == "recwVL742srgkzO0u" && r.fields["מתנדב"][0] == "recqAUvw8rqaiMiX4");
        if (rec) {
            console.log("id", rec.id);
        }
    }
}
//searchMeals()


async function alertUpcomingCookingOld() {
    const districts = await getDestricts();
    const daysBefore = 7;
    for (let i = 0; i < districts.length; i++) {
        if (districts[i].id !== "recxuE1Cwav0kfA7g") continue; // only in test for now
        const upcomingDemands = await getDemands(districts[i].id, "תפוס", daysBefore);
        for (let j = 0; j < upcomingDemands.length; j++) {
            const demand = upcomingDemands[j];
            const daysLeft = -dayjs().diff(demand.date, "days");

            if (daysLeft === daysBefore) {
                const msgBody = `תאריך הבישול: ${dayjs(demand.date).format(IL_DATE)}
עוד: ${daysBefore} ימים
משפחה: ${demand.name}
עיר: ${demand.city}
לא לשכוח לתאם עוד היום בשיחה או הודעה את שעת מסירת האוכל.
אם אין באפשרותך לבשל יש לבטל באפליקציה, או ליצור קשר.`;


                await addNotificationToQueue("תזכורת לבישול!", msgBody, "alerts", [], [demand.volunteerId], {
                    buttons: JSON.stringify([
                        { label: "צפה בפרטים", action: "registration-details", params: [demand.id] },
                        { label: "צור קשר עם עמותה", action: "start-conversation", params: ["Eh00Vs81taq5dv8QOvP0qS", "hello"] },
                    ]),
                }
                );
            }
        }
        // TODO send summary notification to admin?
    }
}


async function weeklyNotifyFamilies() {
    const manychat4weekSummaryFlow = "content20241008192343_098603";
    const tomorrow = dayjs().add(1, "days");
    const notifications = [];
    const volunteers = {};
    const districts = await getDestricts();
    for (let i = 0; i < districts.length; i++) {
        const upcomingDemands = await getDemands(districts[i].id, undefined, true, tomorrow.format(DATE_AT), tomorrow.add(28, "days").format(DATE_AT));
        for (let j = 0; j < upcomingDemands.length; j++) {
            const demand = upcomingDemands[j];
            if (demand.status === "חג") continue;

            let notification = notifications.find(n => n.mainBaseFamilyId === demand.mainBaseFamilyId);
            if (!notification) {
                notification = {
                    mainBaseFamilyId: demand.mainBaseFamilyId,
                    familyLastName: demand.familyLastName,
                    dates: [],
                }
                notifications.push(notification);
            }
            if (demand.volunteerId) {
                volunteers[demand.volunteerId] = "";
            }

            notification.dates.push({
                date: demand.date,
                status: demand.status,
                volunteerId: demand.volunteerId,
            });
        }
    }

    await getVolunteersNames(volunteers);


    const activeFamilies = await db.collection("families").where("active", "==", true).get();
    const waitFor = [];
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
                manychat4weekSummaryFlow,
                categorizeDatesByWeek(notification.dates)));
            break;
        }
    }

    return Promise.all(waitFor);
}

// Helper function to categorize dates into weekly summaries
function categorizeDatesByWeek(dates) {
    const today = dayjs();
    const thisWeek = [];
    const nextWeek = [];
    const weekAfterNext = [];
    const in3Weeks = [];

    dates.forEach(d => {
        const date = dayjs(d.date);
        const diffInWeeks = date.diff(today, 'week');
        const name = d.volunteerId ? d.volunteerName : "טרם שובץ";
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
        this_week_sum: thisWeek.length ? thisWeek.join(", ") : noneMsg,
        next_week_sum: nextWeek.length ? nextWeek.join(", ") : noneMsg,
        week_after_next_sum: weekAfterNext.length ? weekAfterNext.join(", ") : noneMsg,
        in_3_weeks_sum: in3Weeks.length ? in3Weeks.join(", ") : noneMsg,
    };
}

async function getVolunteersNames(volunteers) {
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

async function sendToManychat(manySubscriberId, manyChatFlowId, fields) {
    console.log("sendToManychat", fields);

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
            field_value: fields[fieldName]
        };
    });

    const payload = {
        subscriber_id: manySubscriberId,
        fields: fieldsArray
    };

    await axios.post("https://api.manychat.com/fb/subscriber/setCustomFields", payload, httpOptions).catch(err => {
        console.log(err)
    });


    return axios.post("https://api.manychat.com/fb/sending/sendFlow", {
        subscriber_id: manySubscriberId,
        flow_ns: manyChatFlowId,
    }, httpOptions);
}

//weeklyNotifyFamilies()

async function alertUpcomingCooking() {
    const districts = await getDestricts();
    const daysBefore = 3;
    for (let i = 0; i < districts.length; i++) {
        if (districts[i].id !== "recxuE1Cwav0kfA7g") continue; // only in test for now
        const upcomingDemands = await getDemands(districts[i].id, "תפוס", true, dayjs().format(DATE_AT), dayjs().add(daysBefore + 1, "days").format(DATE_AT));
        for (let j = 0; j < upcomingDemands.length; j++) {
            const demand = upcomingDemands[j];
            const daysLeft = -dayjs().startOf("day").diff(demand.date, "days");

            if (daysLeft === daysBefore) {
                const msgBody = `תאריך הבישול: ${dayjs(demand.date).format(IL_DATE)}
עוד: ${daysBefore} ימים
משפחה: ${demand.familyLastName}
עיר: ${demand.city}
לא לשכוח לתאם עוד היום בשיחה או הודעה את שעת מסירת האוכל.
אם אין באפשרותך לבשל יש לבטל באפליקציה, או ליצור קשר.`;
                await addNotificationToQueue("תזכורת לבישול!", msgBody, NotificationChannels.Alerts, [], [demand.volunteerId], {
                    buttons: JSON.stringify([
                        { label: "צפה בפרטים", action: NotificationActions.RegistrationDetails, params: [demand.id] },
                        { label: "צור קשר עם עמותה", action: NotificationActions.StartConversation },
                    ]),
                }
                );
            }
        }
        // TODO send summary notification to admin?
    }
}

async function getDemands(
    district,
    status,
    includeNonActiveFamily,
    dateStart,
    dateEnd,
    volunteerId,
    districtBaseFamilyId
) {
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const mahuzRec = (await getDestricts()).find((d) => d.id === district);
    if (mahuzRec) {
        let demantsResult = [];
        const baseId = mahuzRec.base_id;
        const demandsTable = mahuzRec.demandsTable;
        const filters = [];

        if (!includeNonActiveFamily) {
            filters.push("({סטטוס בעמותה} = 'פעיל')");
        }

        if (districtBaseFamilyId) {
            filters.push(`FIND("${districtBaseFamilyId}",  ARRAYJOIN({record_id (from משפחה)})) > 0`);
        }
        if (status) {
            filters.push(`{זמינות שיבוץ}='${status}'`);
        }
        if (dateStart !== undefined) {
            // eslint-disable-next-line quotes
            filters.push(`{תאריך}>='${dateStart}'`);
        }
        if (dateEnd != undefined) {
            filters.push(`{תאריך}<='${dateEnd}'`);
        }
        if (volunteerId) {
            filters.push(`{volunteer_id}='${volunteerId}'`);
        }

        const formula = `AND(${filters.join(",")})`;
        const query = `https://api.airtable.com/v0/${baseId}/${demandsTable}`;
        let offset;
        do {
            const demandsRespose = await axios.get(query, {
                headers,
                params: {
                    offset: offset,
                    filterByFormula: formula,
                },
            });
            offset = demandsRespose.data.offset;
            if (demandsRespose.data.records) {
                demantsResult = demantsResult.concat(demandsRespose.data.records.map((demand) => demandAirtable2FamilyDemand(demand, district)));
            }
        } while (offset);

        return demantsResult;
    }
    throw ("not-found", "District not found");
}

function demandAirtable2FamilyDemand(demand, district) {
    return {
        id: demand.id,
        date: demand.fields["תאריך"],
        city: getSafeFirstArrayElement(demand.fields["עיר"], ""),
        familyLastName: demand.fields.Name,
        district: district,
        status: demand.fields["זמינות שיבוץ"],
        mainBaseFamilyId: getSafeFirstArrayElement(demand.fields.Family_id, ""), // The record ID of the main base table משפחות רשומות
        districtBaseFamilyId: getSafeFirstArrayElement(demand.fields["משפחה"], ""), // The record ID in the district table of משפחות במחוז
        volunteerId: demand.fields.volunteer_id,
        isFamilyActive: demand.fields["סטטוס בעמותה"] == "פעיל",
    };
}
function getSafeFirstArrayElement(arr, defaultValue) {
    return arr && arr.length && arr[0] || defaultValue;
}




async function greetingsToBirthdays() {
    const today = "01-06"// dayjs().add(3,"d").format("DD-MM");
    const users = await db.collection("users").where("birthDate", "==", today).get();

    for (let i = 0; i < users.docs.length; i++) {
        const user = users.docs[i];
        if (user.data().notificationOn === true) {
            console.log("birthday", user.data().firstName, user.data().gender)
            // await addNotificationToQueue(`יום הולדת שמח ${user.data().firstName}`, "", NotificationChannels.Greetings,
            //     [], [user.id], { fullImage: user.data().gender === "אישה" ? "birthday-female" : "birthday-male" });
        }
    }
    const districts = await getDestricts();

    // Notify Managers
    const usersList = users.docs.map(user => `- ${user.data().firstName} ${user.data().lastName} (${districts.find(d => d.id === user.data().mahoz)?.name || ""})  tel:+${user.data().phone}`).join("\n");
    return addNotificationToQueue(`ימי הולדת היום 💜`, `הנה רשימת המתנדבים שהיום יום הולדתם\n${usersList}`, "alerts",
        [], ["arielb"]);
}


async function syncBorn2WinFamilies() {
    let offset = null;
    let count = 0;
    let countActive = 0;
    const airTableMainBase = baseId// mainBase.value();
    //const apiKey = born2winApiKey.value();

    const sinceDate = dayjs().subtract(25, "hour");

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss[z]");


    const url = `https://api.airtable.com/v0/${airTableMainBase}/${encodeURI("משפחות רשומות")}`;
    const batch = db.batch();
    do {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            params: {
                //filterByFormula: `IS_AFTER(LAST_MODIFIED_TIME(), '${sinceDate.format("YYYY-MM-DDTHH:MM:SSZ")}')`,
                fields: ["סטטוס בעמותה", "מחוז", "מאניצט לוגיסטי", "שם איש קשר לוגיסטי"],
                offset: offset,
            },
        }).catch(err => {
            console.log(err)
        });
        offset = response.data.offset;
        for (let i = 0; i < response.data.records.length; i++) {
            const family = response.data.records[i];
            const familyId = family.id;

            const docRef = db.collection("families").doc(familyId);
            const familyDoc = await docRef.get();

            const familyRecord = {
                active: family.fields["סטטוס בעמותה"] == "פעיל",
                lastModified: now,
                mahoz: family.fields["מחוז"][0],
                mainBaseFamilyId: family.id,
                contactName: family.fields["שם איש קשר לוגיסטי"][0],
                manychat_id: family.fields["מאניצט לוגיסטי"][0],
            };

            if (familyRecord.active) {
                countActive++;
            }

            if (familyDoc && familyDoc.exists) {
                // const prevFamilyRecord = familyDoc.data();
                // if (prevFamilyRecord && familyRecord.active === prevFamilyRecord.active) {
                //     // No change!
                //     continue;
                // }
                count++;
                batch.update(familyDoc.ref, familyRecord);
            } else {
                count++;
                batch.create(docRef, familyRecord);
            }

            if (familyRecord.active) {
                // A new active family, or a family that has changed to active


            }

        }
    } while (offset);

    return batch.commit().then(async () => {
        console.log("Sync Families: observed modified:", count, "observed Active", countActive);
        return;
    });
}

//syncBorn2WinFamilies()

// alertUpcomingCooking()

//sendNotification("hi", "2", { "a": "b" }, "")

// מחוז דרום
// getDemands("rechovsphUJb3r6hS", "תפוס", 45).then(d=>{
//     console.log(d)
// })

//addNotificationToQueue("יום הולדת שמח קרן", "", "greetings", [],["kereng"],{fullImage:"birthday-female"});




//updateAllUsers();
//greetingsToBirthdays()


function generateSignConfidentialityURL(firstName, identificationId, volunteerId) {
    const entry = {
        identitycard: identificationId,
        name: firstName,
        recordid: volunteerId,
    };

    return `https://born2win.org.il/confidentiality-and-privacy/?entry=${encodeURI(JSON.stringify(entry))}`;
}



async function testGetDamands() {
    //rec7m86Ovsxgc5YPW
    const demands = await getDemands("recLbwpPC80SdRmPO", undefined, false, "2024-10-14", "2024-10-31");
    console.log(demands);
}
//testGetDamands()


async function QueryAirtable(isMainBase, tableName, filterArray) {
    const base = isMainBase ? baseId : "";

    const url = `https://api.airtable.com/v0/${base}/${encodeURI(tableName)}`;
    const response = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        params: {
            filterByFormula: `AND(${filterArray.join(",")})`,
        },
    }).catch(err => {
        console.log(err)

    });
    const t = response.data.records.find(d => d.fields.Name.indexOf("בדיקה") >= 0)
    console.log(response.data);
}




// QueryAirtable(true, "ארוחות", [
//     "DATETIME_FORMAT({DATE}, 'YYYY-MM-DD')='2024-10-10'",
//     //"{DATE}='2024-10-13'",
//     //"{משפחה}='recwVL742srgkzO0u'"
//     //`'recwVL742srgkzO0u'={משפחה}`
//     //`FIND('recwVL742srgkzO0u',ARRAYJOIN({משפחה}))`,
//     //"{REC}='recdAjtkUZwVhwZ7A'",
// ]);

// QueryAirtable(true, "משפחות רשומות", [
//     //"DATETIME_FORMAT({DATE}, 'YYYY-MM-DD')='2024-10-13'",
//     //"{DATE}='2024-10-13'",
//     //"{משפחה}='recwVL742srgkzO0u'"
//     //`'recwVL742srgkzO0u'={משפחה}`
//     //`FIND('recwVL742srgkzO0u',ARRAYJOIN({משפחה}))`,
//     //"{familyid}='recwVL742srgkzO0u'",
// ]);



async function sendToManychat(manySubscriberId, manyChatFlowId, fields) {
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${manychatKey}`,
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
    if (fields.length > 0) {
        await axios.post("https://api.manychat.com/fb/subscriber/setCustomFields", payload, httpOptions);
    }

    return axios.post("https://api.manychat.com/fb/sending/sendFlow", {
        subscriber_id: manySubscriberId,
        flow_ns: manyChatFlowId,
    }, httpOptions);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


async function SendLinkOrInstall() {

    const users = await db.collection("users").where("active", "==", true).get();
    const relevantUsers = users.docs.filter(u => u.data().uid == undefined && u.data().manychat_id !== undefined);

    const usersForInstallMsg = relevantUsers.filter(u => u.data().mahoz === "recmLo9MWRxmrLEsM");
    const usersForLink = relevantUsers.filter(u => u.data().mahoz !== "recmLo9MWRxmrLEsM");

    let count = 0;
    let totalInstall = 0;
    let totalLinks = 0;
    for (const user of usersForInstallMsg) {
        if (count == 10) {
            await delay(1000);
            count = 0;
        }
        //await sendToManychat(user.data().manychat_id, ManyChatFlows.SendInstallMessage, {});
        console.log("sendInstall", user.data().manychat_id)
        count++;
        totalInstall++;
    }

    for (const user of usersForLink) {
        if (count == 10) {
            await delay(1000);
            count = 0;
        }
        //await sendToManychat(user.data().manychat_id, ManyChatFlows.SendOldLink, {});
        console.log("sendLink", user.data().manychat_id)
        count++;
        totalLinks++;
    }

    const admins = await db.collection(Collections.Admins).get();
    const adminsIds = admins.docs.map(doc => doc.id);

//     await addNotificationToQueue("נשלחו לינקים!", `סה״כ הודעות התקנה: ${totalInstall}
// סה״כ לינקים: ${totalLinks}
// מותקני אפליקציה: ${users.docs.length - totalInstall - totalLinks}`, NotificationChannels.Alerts, [], adminsIds);
}

//SendLinkOrInstall()