const express = require('express');
const router = express.Router();

const Ride = require('../models/Ride');
const BookedRide = require('../models/BookedRide');
const RideHistory = require("../models/RideHistory");
const Review = require("../models/Review");
const User = require("../models/User");


function getDriverLevel(completedRides) {
  if (completedRides >= 100) return "💎 Platinum";
  if (completedRides >= 51) return "🥇 Gold";
  if (completedRides >= 11) return "🥈 Silver";
  return "🥉 Bronze";
}

router.get('/stats/:userCode', async (req, res) => {
  try {

    const userCode = req.params.userCode;

    const publishedRides = await Ride.find({
      uniqueCode: userCode
    });

    const bookedRides = await BookedRide.find({
      bookedByCode: userCode
    });

    let totalEarnings = 0;

    publishedRides.forEach((ride) => {
      totalEarnings += Number(ride.price || 0);
    });

    let totalSpent = 0;

    bookedRides.forEach((ride) => {
      totalSpent += Number(
        ride.totalPrice || ride.price || 0
      );
    });

    res.json({
      totalPublished: publishedRides.length,
      totalBooked: bookedRides.length,
      totalEarnings,
      totalSpent
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to load stats"
    });

  }
});

router.get("/analytics/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const published = await Ride.countDocuments({ username });
    const completed = await Ride.countDocuments({ username, status: "Completed" });
    const cancelled = await Ride.countDocuments({ username, status: "Cancelled" });

    const bookings = await BookedRide.find({ publishedBy: username }).lean();
    const passengers = bookings.reduce((sum, b) => sum + Number(b.seatsBooked || 0), 0);

    const reviews = await Review.find({ reviewedUser: username }).lean();
    const reviewCount = reviews.length;
    const totalRating = reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    const averageRating =
      reviewCount ? (totalRating / reviewCount).toFixed(1) : "0";

    const successRate = published
      ? ((completed / published) * 100).toFixed(1)
      : "0";

    const lifetime = await RideHistory.aggregate([
      { $match: { username, type: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const lifetimeEarnings = lifetime?.[0]?.total
      ? Number(lifetime[0].total)
      : 0;

    const user = await User.findOne({ username }).lean();
    const trustScore = user?.trustScore != null ? user.trustScore : 100;

    const level = getDriverLevel(completed);

    res.json({
      published,
      completed,
      cancelled,
      passengers,
      averageRating,
      successRate,
      lifetimeEarnings,
      trustScore,
      level
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

router.get("/history/:username", async (req, res) => {
  try {
    const history = await RideHistory.find({
      username: req.params.username
    }).sort({
      createdAt: -1
    });

    res.json(history);
  } catch (error) {
    res.status(500).json({
      message: "Failed"
    });
  }
});

// GET: Driver Earnings (completed rides only)
router.get('/earnings/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const completed = await RideHistory.find({
      username,
      type: 'Completed'
    });

    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    let today = 0;
    let thisMonth = 0;
    let lifetime = 0;

    for (const h of completed) {
      const createdAt = h.createdAt ? new Date(h.createdAt) : null;
      const amount = Number(h.amount || 0);

      lifetime += amount;

      if (createdAt && createdAt >= startOfToday) today += amount;
      if (createdAt && createdAt >= startOfMonth) thisMonth += amount;
    }

    res.json({ today, thisMonth, lifetime });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to load earnings' });
  }
});

module.exports = router;
