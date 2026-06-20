// Firebase + FCM client initialization
// This file is intended to be loaded on pages where user is logged in.

// ---- Firebase config ----
// Replace these values with your Firebase project settings.
// You can also inject these values server-side.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// ---- VAPID key (from Firebase Console -> Cloud Messaging -> Web Push certificates) ----
const VAPID_KEY = "YOUR_VAPID_KEY";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = reject;
    document.head.appendChild(el);
  });
}

async function ensureFirebaseMessaging() {
  // Only load once
  if (window.firebase && window.firebase.messaging) return;

  await loadScript(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
  );
  await loadScript(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
  );

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }
}

async function registerForFcmAndSaveToken() {
  try {
    const username = localStorage.getItem("username");
    if (!username) return;

    if (!("Notification" in window)) return;
    if (!("serviceWorker" in navigator)) return;

    await ensureFirebaseMessaging();

    // Initialize messaging
    const messaging = window.firebase.messaging();

    // Ask permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("FCM permission not granted:", permission);
      return;
    }

    const swReg = await navigator.serviceWorker.ready;

    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.log("No FCM token returned.");
      return;
    }

    // Save token to backend
    await fetch("/api/users/save-fcm-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, fcmToken: token }),
    });
  } catch (err) {
    console.error("FCM setup error:", err);
  }
}

// Auto-run after page load (works well for login/dashboard pages)
window.addEventListener("load", () => {
  registerForFcmAndSaveToken();
});

