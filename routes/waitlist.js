const express = require("express");
const router = express.Router();

const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const User = require("../models/User");
const Waitlist = require("../models/Waitlist");
const { createNotification } = require("../utils/notifications");

// POST /api/waitlist/join
// Body: { rideId, username }
router.post("/join", async (req, res) => {
  try {
    const { rideId, username } = req.body || {};

    if (!rideId) return res.status(400).json({ message: "rideId is required" });
    if (!username) return res.status(400).json({ message: "username is required" });

    const ride = await Ride.findById(rideId).lean();
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    const user = await User.findOne({ username }).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // If user already has a confirmed booking for this ride, don't add to waitlist.
    const alreadyBooked = await BookedRide.findOne({ rideId, bookedByCode: user.uniqueCode });
    if (alreadyBooked) {
      return res.status(200).json({ message: "Already booked for this ride" });
    }

    const existing = await Waitlist.findOne({ rideId, username }).lean();
    if (existing) {
      return res.status(200).json({ message: "Already in waitlist", position: existing.position });
    }

    const count = await Waitlist.countDocuments({ rideId });

    // If seats are actually available now, avoid waitlist and let booking handle it.
    // Note: this MVP uses waitlist only when seats are 0.
    if (Number(ride.seats || 0) > 0) {
      return res.status(409).json({
        message: "Seats available now. Book the ride instead.",
        rideId
      });
    }


    const entry = await Waitlist.create({
      rideId,
      username,
      position: count + 1
    });

    return res.status(201).json({
      message: "Added To Waitlist",
      position: entry.position,
      rideId
    });
  } catch (e) {
    console.error("Waitlist join error:", e);
    return res.status(500).json({ message: "Failed to join waitlist" });
  }
});

// GET /api/waitlist/by-user/:username
router.get("/by-user/:username", async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ message: "username is required" });

    const items = await Waitlist.find({ username })
      .sort({ createdAt: 1 })
      .lean();

    const rideIds = items.map((x) => x.rideId).filter(Boolean);
    const rides = await Ride.find({ _id: { $in: rideIds } }).lean();
    const rideById = Object.fromEntries(rides.map((r) => [String(r._id), r]));

    const enriched = items.map((w) => {
      const ride = rideById[String(w.rideId)] || null;
      return {
        _id: w._id,
        rideId: w.rideId,
        position: w.position,
        createdAt: w.createdAt,
        ride: ride
          ? {
              _id: ride._id,
              source: ride.source,
              destination: ride.destination,
              date: ride.date,
              time: ride.time,
              price: ride.price,
              seats: ride.seats,
              rideCode: ride.rideCode,
              status: ride.status
            }
          : null
      };
    });

    res.json({ items: enriched });
  } catch (e) {
    console.error("Waitlist fetch error:", e);
    res.status(500).json({ message: "Failed to load waitlisted rides" });
  }
});

module.exports = router;

