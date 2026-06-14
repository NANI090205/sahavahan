const express = require("express");
const router = express.Router();

const RouteSubscription = require("../models/RouteSubscription");
const { createNotification } = require("../utils/notifications");

// Subscribe to a route
router.post("/subscribe", async (req, res) => {
  try {
    const { username, source, destination } = req.body;

    if (!username || !source || !destination) {
      return res.status(400).json({ message: "username, source and destination are required" });
    }

    const exists = await RouteSubscription.findOne({ username, source, destination });

    if (exists) {
      return res.json({ message: "Already subscribed" });
    }

    await RouteSubscription.create({ username, source, destination });

    // Push in-app notification (optional, but helpful UX)
    await createNotification({
      username,
      title: "🔔 Route Alert Enabled",
      message: `${source} → ${destination}`,
      type: "general"
    });

    res.json({ message: "Subscription created" });
  } catch (error) {
    console.error("Subscribe error:", error);
    res.status(500).json({ message: "Failed" });
  }
});

// Get subscriptions by username
router.get("/:username", async (req, res) => {
  try {
    const data = await RouteSubscription.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(data);
  } catch (error) {
    console.error("Fetch subscriptions error:", error);
    res.status(500).json({ message: "Failed" });
  }
});

// Delete subscription by id
router.delete("/:id", async (req, res) => {
  try {
    await RouteSubscription.findByIdAndDelete(req.params.id);
    res.json({ message: "Removed" });
  } catch (error) {
    console.error("Delete subscription error:", error);
    res.status(500).json({ message: "Failed" });
  }
});

module.exports = router;

