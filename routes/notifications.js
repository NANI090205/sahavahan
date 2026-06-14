const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");

router.get("/count/:username", async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      username: req.params.username,
      isRead: false
    });

    res.json({
      count
    });
  } catch (error) {
    console.error("Count notifications error:", error);
    res.status(500).json({
      count: 0
    });
  }
});

router.put("/read/:id", async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(
      req.params.id,
      {
        isRead: true
      }
    );

    res.json({
      message: "Read"
    });
  } catch (error) {
    console.error("Read notification error:", error);
    res.status(500).json({
      message: "Failed"
    });
  }
});

router.get("/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ username })
        .sort({ createdAt: -1 }),
      Notification.countDocuments({ username, isRead: false })
    ]);

    res.json({
      unreadCount,
      notifications
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);
    res.status(500).json({
      message: "Failed to load notifications"
    });
  }
});

router.patch("/read-all/:username", async (req, res) => {
  try {
    const { username } = req.params;

    await Notification.updateMany(
      { username, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({
      message: "Notifications marked as read"
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    res.status(500).json({
      message: "Failed to mark notifications as read"
    });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found"
      });
    }

    res.json({
      message: "Notification marked as read",
      notification
    });
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({
      message: "Failed to mark notification as read"
    });
  }
});

module.exports = router;
