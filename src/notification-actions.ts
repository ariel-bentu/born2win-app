import { NavigationStep, NotificationActions } from "./types"
const WhatsAppPhoneNumber = "+972522229135";
let setNavigationRequest: undefined | ((ns: NavigationStep) => void);

export const AppTabs = {
    notifications: 0,
    registration: 1,
    commitments: 2,
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
