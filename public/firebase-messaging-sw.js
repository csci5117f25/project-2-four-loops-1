/* public/firebase-messaging-sw.js */
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCqZTmlLBWhx7awpLJ1Uuls9pVhRS_tey0",
  projectId: "project2-e9097",
  messagingSenderId: "356904850",
  appId: "1:356904850:web:b621dc69626ba76cc3db4b"
  // ... other keys ...
});

const messaging = firebase.messaging();

// 1. SHOW NOTIFICATION (When App is Closed)
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background Message:", payload);
  
  const notificationTitle = payload.notification?.title || "MediMate Reminder";
  const notificationOptions = {
    body: payload.notification?.body,
    icon: "/icons/icon-192.png",
    // CRITICAL: Pass data (mapUrl) to the notification so click listener can use it
    data: payload.data 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. HANDLE CLICK (When User Clicks the System Notification)
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Close the popup

  const data = event.notification.data;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      
      // CASE A: Stock Alert (Has Map URL) -> Open Map in New Tab
      if (data && data.mapUrl) {
        return self.clients.openWindow(data.mapUrl);
      }

      // CASE B: Medication Reminder (No Map URL) -> Focus/Open App
      // 1. Try to focus an existing tab
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. If no tab open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});