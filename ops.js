require("dotenv").config({ path: "./functions/.env.born2win-1" });
const axios = require("axios");
const dayjs = require("dayjs");

const baseId = process.env.BORM2WIN_MAIN_BASE;
const apiKey = process.env.BORN2WIN_API_KEY;
// const modifiedSince = dayjs().subtract(2, "day");


async function fetchAllUsers() {
    let offset = null;
    let count = 0;
    let countActive = 0
    const url = `https://api.airtable.com/v0/${baseId}/מתנדבים`;

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
        }).catch(e=>console.log(e));
        offset = response.data.offset;
        count += response.data.records.length;
        countActive += response.data.records.filter(u => u.fields["פעיל"] == "פעיל").length;
    } while (offset);

    console.log("count", count, "countActive", countActive);
}


fetchAllUsers();


