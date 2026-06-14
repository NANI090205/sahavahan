const express = require("express");
const router = express.Router();

const SOS = require("../models/SOS");
const sendMail = require("../utils/mailer");

// Legacy endpoint kept
router.post("/create", async (req, res) => {
  try {
    const sos = await SOS.create(req.body);
    const { username, source, destination } = req.body;

    await sendMail(
      "admin@sahavahan.com",
      "🚨 Emergency Alert",
      `${username} triggered SOS\n\nRoute:\n\n${source}\n→\n${destination}`
    ).catch(console.error);

    res.json({ message: "Emergency Alert Sent", sos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

// Production endpoint (spec): { username, lat, lng, rideId }
router.post("/trigger", async (req, res) => {
  try {
    const { username, lat, lng, rideId } = req.body || {};

    if (!username || typeof lat !== "number" || typeof lng !== "number" || !rideId) {
      return res.status(400).json({ message: "username, lat, lng, rideId are required" });
    }

    const sos = await SOS.create({
      username,
      rideId,
      latitude: lat,
      longitude: lng,
      status: "Active",
    });

    // In-app notification (also triggers FCM via utils/notifications.js)
    try {
      const { createNotification } = require("../utils/notifications");
      await createNotification({
        username,
        title: "🚨 Emergency Alert",
        message: "SOS triggered. Immediate attention required.",
        type: "general",
      });
    } catch (e) {
      // ignore
    }

    // Notify admin (email)
    await sendMail(
      "admin@sahavahan.com",
      "🚨 Emergency Alert",
      `${username} has triggered an SOS.\n\nLocation:\nhttps://maps.google.com/?q=${lat},${lng}`
    ).catch(console.error);

    // Notify emergency contacts (email) if available
    try {
      const User = require("../models/User");
      const user = await User.findOne({ username }).lean();
      const contacts = user?.emergencyContacts || [];

      if (contacts.length) {
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
        for (const c of contacts) {
          // We only have phone in schema; email-based notification can be added later.
          // For now, send admin a consolidated contact list.
          if (c?.phone) {
            await sendMail(
              "admin@sahavahan.com",
              "🚨 SOS - Emergency contact recorded",
              `SOS by: ${username}\nRide: ${rideId}\nContact: ${c.name} (${c.relation})\nPhone: ${c.phone}\nLocation: ${mapsUrl}`
            ).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("Emergency contact notify failed:", e);
    }

    res.json({ message: "SOS Triggered", sos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

router.get("/all", async (req, res) => {
  try {
    const alerts = await SOS.find()
      .sort({
        createdAt: -1,
      });

    res.json(alerts);
  } catch (error) {
    res.status(500).json({
      message: "Failed",
    });
  }
});

module.exports = router;

