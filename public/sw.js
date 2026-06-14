const CACHE_NAME = "sahavahan-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/ridepublish.html",
  "/rides.html",
  "/profile.html",
  "/styles.css",
  "/hallOfFame.css",
  "/publish.css"
];

// -----------------------------
// Firebase Messaging (background)
// -----------------------------
// NOTE: this project uses a single service worker at /sw.js.
// Replace the config values below with your Firebase project config.
// You can alternatively inject them at build time.

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  try {
    const title = payload?.notification?.title || "SahaVahan";
    const body = payload?.notification?.body || "You have a new notification";

    self.registration.showNotification(title, {
      body,
      // You can add icon/image if you have it cached/hosted
      // icon: "/logo.png",
    });
  } catch (e) {
    // no-op
  }
});

// -----------------------------
// PWA cache handlers (existing)
// -----------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // addAll throws if any entry 404s; filter to existing URLs only if needed.
        return cache.addAll(urlsToCache);
      })
      .catch(() => {
        // Fallback: try caching what we can.
        return Promise.all(
          urlsToCache.map((url) =>
            fetch(url, { cache: "no-store" })
              .then((r) => {
                if (!r.ok) return null;
                return cache.put(url, r);
              })
              .catch(() => null)
          )
        );
      })
  );
});

self.addEventListener("fetch", (event) => {

  event.respondWith(

    caches.match(event.request)

      .then((cachedResponse) => {

        return cachedResponse ||

        fetch(event.request)
          .catch(() => {

            return new Response(
              "Offline"
            );

          });

      })

  );

});

// Optional: activate handler to clean old caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});


