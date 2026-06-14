const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendPushNotification } = require("./sendPushNotification");

function getIo() {
  try {
    // app.js attaches `global.__io` (safe even if not present yet)
    return global.__io;
  } catch (_e) {
    return null;
  }
}

async function createNotification({ username, title, message, type }) {
  if (!username || !title || !message) return null;

  try {
    const notification = await Notification.create({
      username,
      title,
      message,
      type: type || "general",
    });

    const io = getIo();
    if (io) {
      // Emit to a user room keyed by username
      // (connected clients should join this room; implemented in app.js)
      io.to(String(username)).emit("newNotification", notification);
    }

    // Firebase Cloud Messaging (real push)
    try {
      const user = await User.findOne({ username }).lean();
      const token = user?.fcmToken;

      if (token) {
        await sendPushNotification({
          token,
          title,
          body: message,
          data: {
            type: type || "general",
            username: String(username),
            notificationId: String(notification?._id || ""),
          },
        });
      }
    } catch (fcmErr) {
      // Do not break app notification flow
      console.error("FCM push error:", fcmErr);
    }

    return notification;
  } catch (error) {
    console.error("Notification create error:", error);
    return null;
  }
}

module.exports = {
  createNotification,
};


