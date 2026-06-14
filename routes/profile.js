const express = require("express");
const router = express.Router();

const multer = require("multer");

const User = require("../models/User");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Review = require("../models/Review");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

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

    // Phone verified (project stores phoneNumber)
    if (user.phoneNumber) score += 20;
    else missing.push("Verify Phone");

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
router.post("/upload/:username", upload.single("photo"), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.profilePhoto = "/uploads/" + req.file.filename;
    await user.save();

    res.json({ message: "Photo uploaded", photo: user.profilePhoto });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Upload failed" });
  }
});

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


module.exports = router;
