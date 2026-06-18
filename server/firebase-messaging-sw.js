// firebase-messaging-sw.js
// This service worker runs in the background to handle push notifications even when the app is closed.
 
// Import Firebase App and Messaging Compat SDKs
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
 
// FIREBASE CONFIGURATION
// Must exactly match the firebaseConfig object used in tabibak.html.
// If these two ever drift apart, the service worker silently fails to
// authenticate with Firebase and background (tab-closed) notifications
// stop working, even though everything looks fine while the tab is open.
const firebaseConfig = {
  apiKey: "AIzaSyAEz3mVDyuZCJZwKlBnDuWd1JARbMAI6S0",
  authDomain: "tabibak-b4a37.firebaseapp.com",
  projectId: "tabibak-b4a37",
  storageBucket: "tabibak-b4a37.firebasestorage.app",
  messagingSenderId: "130423014476",
  appId: "1:130423014476:web:03b7cfb841cc48fd1320e9",
  measurementId: "G-YV2DHXCGDH"
};
 
firebase.initializeApp(firebaseConfig);
 
// Retrieve FCM messaging instance
const messaging = firebase.messaging();
 
// NOTIFICATION DELIVERY LOGIC
// This handler processes messages received when the app is in the background or closed.
// Note: the server (scheduler.js) sends a "data-only" message (no "notification" key),
// so payload.notification will be undefined here — read from payload.data instead.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);
 
  const notificationTitle = payload.data?.title || payload.notification?.title || 'تذكير بموعد الدواء';
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || 'حان الوقت لتناول جرعتك الدوائية المجدولة.',
    icon: 'https://cdn-icons-png.flaticon.com/512/1930/1930985.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/1930/1930985.png',
    tag: payload.data?.medicationId || 'medication-reminder',
    renotify: true,
    requireInteraction: true,
    data: payload.data || {}
  };
 
  // Show the notification on the device
  return self.registration.showNotification(notificationTitle, notificationOptions);
});
