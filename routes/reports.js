const express = require("express");
const router = express.Router();

const Report = require("../models/Report");
const User = require("../models/User");

// POST: Create report
router.post("/create", async (req, res) => {
  try {
    const { reportedBy, reportedUser, reason, description } = req.body || {};

    if (!reportedBy || !reportedUser || !reason) {
      return res.status(400).json({ message: "reportedBy, reportedUser, reason are required" });
    }

    const report = new Report({
      reportedBy,
      reportedUser,
      reason,
      description: description || ""
    });

    await report.save();

    // Auto increment reportCount
    await User.findOneAndUpdate(
      { username: reportedUser },
      { $inc: { reportCount: 1 } },
      { new: true }
    );

    // Recalculate trust score using canonical rules
    const calculateTrustScore = require("../utils/calculateTrustScore");
    const user = await User.findOne({ username: reportedUser });
    if (user) {
      user.trustScore = calculateTrustScore(user);
      await user.save();
    }

    return res.json({ message: "Report Submitted" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed" });
  }
});

// GET: All reports for admin
router.get("/all", async (_req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load reports" });
  }
});

module.exports = router;

