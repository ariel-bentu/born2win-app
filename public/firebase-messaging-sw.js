self.addEventListener('push', function (event) {
    event.stopImmediatePropagation();
    console.log('[Service Worker] Push Received.');
    const payload = event.data.json();
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        ...payload.notification,
        data: {
            ...payload.data,
            click_url: payload.notification.click_action,
        }
    };
    event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.preventDefault();
    console.log('[Born2Win] Notification click Received.', event.notification.data);

    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
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
                clients.openWindow(event.notification.data.click_url).then((windowClient) => {
                    windowClient.postMessage(event.notification.data);
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

