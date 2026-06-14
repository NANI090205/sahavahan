const express = require("express");
const router = express.Router();

const User = require("../models/User");

// Top drivers by average rating
router.get("/drivers", async (req, res) => {
  try {
    const users = await User.find({ role: "driver" })
      .sort({ averageRating: -1 })
      .select({ username: 1, averageRating: 1, completedRides: 1 })
      .limit(10)
      .lean();

    // Ensure numeric defaults for UI stability
    const normalized = (users || []).map((u) => ({
      username: u.username,
      averageRating: Number(u.averageRating || 0),
      completedRides: Number(u.completedRides || 0)
    }));

    res.json(normalized);
  } catch (err) {
    console.error("/api/leaderboard/drivers error:", err);
    res.status(500).json({ message: "Failed to load drivers leaderboard" });
  }
});

module.exports = router;

