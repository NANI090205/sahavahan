const express = require("express");
const router = express.Router();

const { profileUpload } = require("../middleware/cloudinaryUpload");

const User = require("../models/User");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Review = require("../models/Review");

router.get("/stats/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const published = await Ride.countDocuments({
      username
    });

    const booked = await BookedRide.countDocuments({
      bookedBy: username
    });

    const reviews = await Review.find({
      reviewedUser: username
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce(
        (sum, r) => sum + r.rating,
        0
      ) / reviews.length
      : 0;

    res.json({
      published,
      booked,
      reviews: reviews.length,
      rating: avgRating.toFixed(1)
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed"
    });
  }
});

// Update Phone Number
router.post("/update-phone", async (req, res) => {
  try {
    const { username, phoneNumber } = req.body;
    if (!username || !phoneNumber) {
      return res.status(400).json({ message: "Username and phone number are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.phoneNumber = phoneNumber;

    // Recalculate trust score using canonical rules
    const calculateTrustScore = require("../utils/calculateTrustScore");
    user.trustScore = calculateTrustScore(user);

    await user.save({ validateBeforeSave: false });

    res.json({
      message: "Phone number updated successfully",
      phoneNumber: user.phoneNumber,
      trustScore: user.trustScore
    });
  } catch (error) {
    console.error("Update phone error:", error);
    res.status(500).json({ message: "Failed to update phone number" });
  }
});

// Leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const users = await User.find()
      .sort({ co2Saved: -1 })
      .limit(10);

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed" });
  }
});

// Get Profile
router.get("/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed" });
  }
});

// Public: Trust Score only
router.get("/trust/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ trustScore: user.trustScore ?? 50 });
  } catch (error) {
    res.status(500).json({ message: "Failed" });
  }
});

// Profile Completion
router.get("/completion/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: "User not found" });

    const [vehicleCount] = await Promise.all([
      // Vehicles are stored in Vehicle model
      (async () => {
        const Vehicle = require("../models/Vehicle");
        return Vehicle.countDocuments({ username });
      })()
    ]);

    // 5 checks x 20 = 100
    const missing = [];
    let score = 0;

    // Name/username (schema always has username, but keep robust)
    if (user.username) score += 20;
    else missing.push("Complete Name");

    // Profile image
    if (user.profilePhoto) score += 20;
    else missing.push("Add Profile Photo");

    // Email verified
    if (user.isEmailVerified) score += 20;
    else missing.push("Verify Email");

    // Phone added (verification removed)
    if (user.phoneNumber) score += 20;
    else missing.push("Add Phone Number");

    // Vehicle added
    if (vehicleCount > 0) score += 20;
    else missing.push("Vehicle Added");

    // Clamp just in case
    const percentage = Math.max(0, Math.min(100, score));

    res.json({
      percentage,
      missing
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

// Upload Profile Photo
router.post("/upload/:username", profileUpload, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.profilePhoto = req.file ? req.file.path : "";
    await user.save({ validateBeforeSave: false });

    res.json({ message: "Photo uploaded", photo: user.profilePhoto });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Upload failed" });
  }
});



module.exports = router;
