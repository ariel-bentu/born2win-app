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


admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
});


const db = admin.firestore();

const baseId = process.env.BORM2WIN_MAIN_BASE;
const apiKey = process.env.BORN2WIN_API_KEY;


const manualUsers = require(manualUsersPath);


async function addNotificationToQueue(title, body, channel, toDistricts, toRecipients, data) {
    const docRef = db.collection("notifications").doc();
    data = {channel, ...data}
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
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון", "אמייל", "manychat_id","phone_e164", "תאריך לידה", "מגדר"],
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
                birthDate: user.fields["תאריך לידה"]  ? dayjs(user.fields["תאריך לידה"]).format("DD-MM") : "",
                gender: (user.fields["מגדר"] || "לא ידוע"),
                phone: user.fields.phone_e164,
                volId: user.id,
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
        districts = districtResponse.data.records.map((r) => ({ id: r.id, base_id: r.fields.base_id, name: r.fields["מחוז"] }));
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


async function alertUpcomingCooking() {
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
                        { label: "צור קשר עם עמותה", action: "start-conversation", params:["Eh00Vs81taq5dv8QOvP0qS", "hello"] },
                    ]),
                }
                );
            }
        }
        // TODO send summary notification to admin?
    }
}

async function getDemands(district, status, daysAhead) {
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
    };
    const mahuzRec = (await getDestricts()).find((d) => d.id === district);
    if (mahuzRec) {
        const baseId = mahuzRec.base_id;
        const formula = encodeURIComponent(`AND(({זמינות שיבוץ}='${status}'),IS_AFTER({תאריך},TODAY()),IS_BEFORE({תאריך},DATEADD(TODAY(),${daysAhead+2},'days')))`);
        const query = `https://api.airtable.com/v0/${baseId}/דרישות לשיבוצים?filterByFormula=${formula}`;
        const demands = await axios.get(query, {
            headers,
        });
        if (demands.data.records) {
            return demands.data.records.map((demand) => ({
                id: demand.id,
                date: demand.fields["תאריך"],
                city: demand.fields["עיר"][0],
                familyLastName: demand.fields.Name,
                district: district,
                status: demand.fields["זמינות שיבוץ"],
                mainBaseFamilyId: demand.fields.Family_id[0],
                districtBaseFamilyId: demand.fields["משפחה"][0],
                volunteerId: demand.fields.volunteer_id,
            }));
        }
    }
    return [];
}


async function updateAirTableAppinstalled() {
    const users = await db.collection("users").where("notificationOn", "==", true).get();

    const url = `https://api.airtable.com/v0/${baseId}/מתנדבים/`;
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };


    for (let i = 0;i<users.docs.length;i++) {
        const user = users.docs[i];

        if (user.id.startsWith("rec")) {
            const loginInfo = user.data()?.loginInfo;
            if (loginInfo && loginInfo.length) {
                const date = loginInfo[0].createdAt;

                const updatedFields = {
                    fields: {
                        "תאריך התקנת אפליקציה": dayjs(date).format("YYYY-MM-DD"),
                    },
                };
                
                await axios.patch(url + user.id, updatedFields, httpOptions).catch(err=>{
                    console.log(err)
                })

            }
        }
    }    
}

async function greetingsToBirthdays() {
    const today = "01-06"// dayjs().add(3,"d").format("DD-MM");
    const users = await db.collection("users").where("birthDate", "==", today).get();

    for (let i = 0; i < users.docs.length; i++) {
        const user = users.docs[i];
        if (user.data().notificationOn === true) {
            console.log("birthday", user.data().firstName,user.data().gender )
            // await addNotificationToQueue(`יום הולדת שמח ${user.data().firstName}`, "", NotificationChannels.Greetings,
            //     [], [user.id], { fullImage: user.data().gender === "אישה" ? "birthday-female" : "birthday-male" });
        }
    }
    const districts = await getDestricts();

    // Notify Managers
    const usersList = users.docs.map(user => `- ${user.data().firstName} ${user.data().lastName} (${districts.find(d => d.id === user.data().mahoz)?.name || ""})`).join("\n");
    return addNotificationToQueue(`ימי הולדת היום 💜`, `הנה רשימת המתנדבים שהיום יום הולדתם\n${usersList}`, "alerts",
        [], ["kereng"]);
}
//updateAirTableAppinstalled()


//alertUpcomingCooking()

//sendNotification("hi", "2", { "a": "b" }, "")

// מחוז דרום
// getDemands("rechovsphUJb3r6hS", "תפוס", 45).then(d=>{
//     console.log(d)
// })

//addNotificationToQueue("יום הולדת שמח קרן", "", "greetings", [],["kereng"],{fullImage:"birthday-female"});




//updateAllUsers();
//greetingsToBirthdays()