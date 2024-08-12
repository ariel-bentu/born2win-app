require("dotenv").config({ path: "./functions/.env.born2win-1" });
const os = require('os');
const path = require('path');

const homeDirectory = os.homedir();

const axios = require("axios");
const dayjs = require("dayjs");

const serviceAccountPath = path.join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-SAPSE', 'Documents', 'born2win', 'firebase', 'born2win-1-firebase-adminsdk-i4v9g-17dd373de0.json');

var admin = require("firebase-admin");


admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
});


const db = admin.firestore();

const baseId = process.env.BORM2WIN_MAIN_BASE;
const apiKey = process.env.BORN2WIN_API_KEY;


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
                fields: ["record_id", "שם פרטי", "שם משפחה", "מחוז", "פעיל"],
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
            }
            //console.log("add", userId, userRecord);
            const docRef = db.collection("users").doc(userId);
            batch.update(docRef, userRecord);
        })

    } while (offset);
    batch.commit();

    console.log("count", count, "countActive", countActive);
}


//fetchAllUsers();

