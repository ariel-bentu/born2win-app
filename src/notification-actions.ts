import { NavigationStep, NotificationActions } from "./types"
export const WhatsAppPhoneNumber = "+972522229135";
let setNavigationRequest: undefined | ((ns: NavigationStep) => void);

export const AppTabs = {
    notifications: 0,
    registration: 1,
    commitments: 2,
}

export function openWhatsApp(phone: string, text: string) {
    console.log("send to whatsapp", phone, text)
    if (phone.startsWith("0")) {
        phone = "+972" + phone.substring(1);
    }
    phone = phone.replaceAll(" ", "");
    phone = phone.replaceAll("-", "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

export function initializeNavigationRequester(setNavRequest: (ns: NavigationStep) => void) {
    setNavigationRequest = setNavRequest;
}
export function DisposeNavigationRequester() {
    setNavigationRequest = undefined;
}


export function NotificationActionHandler(action: string, params: string[]) {
    switch (action) {
        case NotificationActions.StartConversation:
            const message = "שלום רב";
            //const phone = params && params.length && params[0] || WhatsAppPhoneNumber;
            const phone = WhatsAppPhoneNumber;
            const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank');
            break;
        case NotificationActions.RegistrationDetails:
            if (setNavigationRequest) {
                setNavigationRequest({
                    tab: AppTabs.commitments,
                    params
                });
            }
            break;
    }
}
