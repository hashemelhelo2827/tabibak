// firebase-messaging-sw.js
// This service worker runs in the background to handle push notifications even when the app is closed.

// Import Firebase App and Messaging Compat SDKs
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// FIREBASE CONFIGURATION
// Initialize Firebase inside the service worker using the same credentials as your main app
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

// Retrieve FCM messaging instance
const messaging = firebase.messaging();

// NOTIFICATION DELIVERY LOGIC
// This handler processes messages received when the app is in the background or closed
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  // Extract notification details from the payload
  const notificationTitle = payload.notification?.title || 'Medication Reminder';
  const notificationOptions = {
    body: payload.notification?.body || 'It is time to take your scheduled dose.',
    icon: payload.notification?.icon || 'https://cdn-icons-png.flaticon.com/512/1930/1930985.png', // Fallback icon
    badge: 'https://cdn-icons-png.flaticon.com/512/1930/1930985.png',
    tag: payload.data?.medicationId || 'medication-reminder',
    renotify: true,
    data: payload.data || {}
  };

  // Show the notification on the device
  return self.registration.showNotification(notificationTitle, notificationOptions);
});
