import axios from "axios";
import { manyChatApiKey } from ".";
import { normilizePhone } from "../../src/utils";
import { logger } from "firebase-functions/v2";

const manyChatToDeleteTag = 54902569;
const manyChatWAIDFieldId = 9103827;

export async function findManyChatSubscriber(phone: string): Promise<string | undefined> {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
        },
    };

    logger.info("Search Manychat contact:", normilizePhone(phone));

    const res = await axios.get(`https://api.manychat.com/fb/subscriber/findByCustomField?field_id=${manyChatWAIDFieldId}&field_value=${normilizePhone(phone, false)}`, httpOptions);
    if (res.data?.status != "success" || res.data?.data.length == 0) {
        return undefined;
    }
    return res.data.data[0].id;
}

export async function createManyChatSubscriber(first_name: string, last_name: string, phone: string, gender: string): Promise<string> {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };

    // verify if exists already
    const existingId = await findManyChatSubscriber(phone);
    if (existingId) {
        // remove deleted tag
        await axios.post("https://api.manychat.com/fb/subscriber/removeTag", {
            "subscriber_id": existingId,
            "tag_id": manyChatToDeleteTag,
        }, httpOptions).catch((e) => {
            logger.warn("Cannot delete manychat deleted_tag", e, existingId);
        });

        await axios.post("https://api.manychat.com/fb/subscriber/updateSubscriber", {
            subscriber_id: existingId,
            first_name,
            last_name,
            gender,
        }, httpOptions).catch((e) => logger.error("Cannot update manychat details", e, existingId, first_name, last_name, gender));


        return existingId;
    }

    const res = await axios.post("https://api.manychat.com/fb/subscriber/createSubscriber", {
        first_name,
        last_name,
        whatsapp_phone: normilizePhone(phone, false),
        gender,
    }, httpOptions);

    if (res.data?.status != "success") {
        throw new Error("Error creating Manychat subscriber");
    }
    return res.data.data.id;
}

export async function deleteManyChatSubscriber(manychatId: string) {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };

    const res = await axios.post("https://api.manychat.com/fb/subscriber/addTag", {
        "subscriber_id": manychatId,
        "tag_id": manyChatToDeleteTag,
    }, httpOptions);

    if (res.data?.status != "success") {
        throw new Error("Error marking for deletion " + manychatId);
    }
}

export async function updateManyChatSubscriber(manychatId: string,
    first_name: string, last_name: string, phone: string, gender: string): Promise<string> {
    await deleteManyChatSubscriber(manychatId);
    return createManyChatSubscriber(first_name, last_name, phone, gender);
}

export function sendOTPViaManychat(manySubscriberId: string, otp: string) {
    const apiKey = manyChatApiKey.value();
    const httpOptions = {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    };

    return axios.post("https://api.manychat.com/fb/subscriber/setCustomFieldByName", {
        subscriber_id: manySubscriberId,
        field_name: "verificationCode",
        field_value: otp,
    }, httpOptions);
}