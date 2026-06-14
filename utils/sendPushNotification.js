const admin = require("firebase-admin");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return;
  if (admin.apps && admin.apps.length) {
    initialized = true;
    return;
  }

  // Recommended: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file path
  // OR set FIREBASE_ADMIN_SDK_JSON with the JSON string.
  const jsonStr = process.env.FIREBASE_ADMIN_SDK_JSON;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (jsonStr) {
    const parsed = JSON.parse(jsonStr);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
  } else if (credPath) {
    admin.initializeApp({
      credential: admin.credential.cert(require(credPath)),
    });
  } else {
    // Last resort: try default credentials (may work in some hosting environments)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  initialized = true;
}

async function sendPushNotification({ token, title, body, data = {} }) {
  if (!token) return null;
  initFirebaseAdmin();

  const payload = {
    token,
    notification: {
      title,
      body,
    },
    data: Object.entries(data).reduce((acc, [k, v]) => {
      // FCM data values must be strings
      acc[k] = typeof v === "string" ? v : JSON.stringify(v);
      return acc;
    }, {}),
  };

  try {
    return await admin.messaging().send(payload);
  } catch (err) {
    console.error("FCM send error:", err);
    return null;
  }
}

module.exports = {
  sendPushNotification,
};

