import { getDB } from '../src/db';
import { countUnreadNotifications } from '../src/notifications';

// Type definitions for the push and notification event data
interface NotificationPayload {
    notification: {
        title: string;
        body?: string;
        icon?: string;
        badge?: string;
        click_action: string;
    };
    data?: any;
}

declare const clients: any; // Add this line to declare `clients`

self.addEventListener('push', async (event: any) => {

    event.stopImmediatePropagation();
    console.log('[Service Worker] Push Received.');

    if (!event.data) {
        return;
    }

    const payload = event.data.json() as NotificationPayload;
    let notificationTitle = payload.notification.title;

    const db = await getDB();
    await db.put('notifications', {
        id: Date.now() + "",
        title: notificationTitle,
        body: payload.notification.body || "",
        read: 0,
        timestamp: Date.now(),
    });
    const unreadCount = await countUnreadNotifications();

    const notificationOptions: NotificationOptions = {
        requireInteraction: true,
        ...payload.notification,
        data: {
            ...payload.data,
            click_url: payload.notification.click_action,
        }
    };

    const promises: Promise<void>[] = [];

    if ('setAppBadge' in self.navigator) {
        const badgeCount = unreadCount;
        promises.push((self.navigator as any).setAppBadge(badgeCount));
    }


    promises.push((self as any).registration.showNotification(notificationTitle, notificationOptions));

    promises.push(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList: any) => {
        for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].visibilityState !== "hidden") {
                return clientList[i].postMessage({ type: "newMessage" });
            }
        }
    }));

    // Finally...
    event.waitUntil(Promise.all(promises));
});

self.addEventListener('notificationclick', function (event: any) {
    event.preventDefault();
    console.log('[Born2Win] Notification click Received.', event.notification.data);

    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList: any) => {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.startsWith(event.notification.data.click_url) && client.focus) {
                    client.focus();
                    client.postMessage(event.notification.data);
                    return;
                }
            }
            // If not, then open a new window/tab with the target URL
            if (clients.openWindow) {
                clients.openWindow(event.notification.data.click_url).then((windowClient: any) => {
                    if (windowClient) {
                        windowClient.postMessage(event.notification.data);
                    }
                });
            }
        })
    );

});
// self.addEventListener('message', async (event) => {
//   if (event.data && event.data.type === 'SAVE_DATA') {
//     // Save data sent from the browser
//     try {
//       await setItem('volunteerId', event.data.volunteerId);
//       console.log('Volunteer ID saved:', event.data.volunteerId);
//     } catch (error) {
//       console.error('Error saving volunteer ID:', error);
//     }
//   } else if (event.data && event.data.type === 'GET_DATA') {
//     // Retrieve data requested by the PWA
//     try {
//       const volunteerId = await getItem('volunteerId');
//       event.ports[0].postMessage({ volunteerId });
//       console.log('Volunteer ID retrieved:', volunteerId);
//     } catch (error) {
//       console.error('Error retrieving volunteer ID:', error);
//     }
//   }
// });

