require("dotenv").config({ path: "./functions/.env.born2win-prod" });
const os = require('os');
const path = require('path');

const homeDirectory = os.homedir();

const axios = require("axios");
const dayjs = require("dayjs");

const serviceAccountPath = path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'firebase', 'born2win-prod-firebase-adminsdk-dltch-7d0cd3c9f4.json');
const manualUsersPath = path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'users.json');

var admin = require("firebase-admin");

const {
    FieldPath,
    FieldValue,
} = require("@google-cloud/firestore");


admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
});


const db = admin.firestore();

const baseId = process.env.BORM2WIN_MAIN_BASE;
const apiKey = process.env.BORN2WIN_API_KEY;


const manualUsers = require(manualUsersPath);

async function fetchAllUsers() {
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
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל", "טלפון", "אמייל", "manychat_id"],
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
                phone: user.fields["טלפון"],
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
            batch.create(docRef, userRecord);
        })



    } while (offset);

    // Add manual users
    manualUsers.forEach(mu => {
        const userRecord = {
            active: true,
            firstName: mu.firstName,
            lastName: mu.lastName,
            mahoz: mu.mahoz,
            phone: mu.phone,
            volId: mu.id,
        }
        //console.log("add", userId, userRecord);
        const docRef = db.collection("users").doc(mu.id);
        batch.create(docRef, userRecord);
    });




    batch.commit();

    console.log("count", count, "countActive", countActive);
}


//fetchAllUsers();


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
        districts = districtResponse.data.records.map((r) => ({ id: r.id, base_id: r.fields.base_id }));
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


function sendNotification(title, body,data, token) {
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
        data,
        webpush: {
            notification: {
                title: title,
                body: body,
                icon: imageUrl,
                click_action: actionUrl,
            },
            fcmOptions: {
                link: actionUrl,
            },
        },
    };
    return admin.messaging().send(message).then(()=>{
        console.log("success")
    }).catch(err=>console.err(err.message))

}

//sendNotification("hi", "1", {},"")