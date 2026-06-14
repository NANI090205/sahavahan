const express = require("express");
const router = express.Router();

const User = require("../models/User");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Review = require("../models/Review");

// Dashboard Stats
router.get("/stats", async (req, res) => {

  try {

    const users =
      await User.countDocuments();

    const rides =
      await Ride.countDocuments();

    const bookings =
      await BookedRide.countDocuments();

    const bookedRides =
      await BookedRide.find();

    let revenue = 0;

    bookedRides.forEach((ride) => {
      revenue += ride.totalPrice || 0;
    });

    res.json({
      users,
      rides,
      bookings,
      revenue
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to load stats"
    });

  }

});

// All Users
router.get("/users", async (req, res) => {

  try {

    const users = await User.find();

    res.json(users);

  } catch (error) {

    res.status(500).json({
      message: "Failed to load users"
    });

  }

});

// All Rides
router.get("/rides", async (req, res) => {

  try {

    const rides = await Ride.find();

    res.json(rides);

  } catch (error) {

    res.status(500).json({
      message: "Failed to load rides"
    });

  }

});

// All Bookings
router.get("/bookings", async (req, res) => {

  try {

    const bookings =
      await BookedRide.find();

    res.json(bookings);

  } catch (error) {

    res.status(500).json({
      message: "Failed to load bookings"
    });

  }

});

// Delete User
router.delete("/user/:id", async (req, res) => {

  try {

    await User.findByIdAndDelete(
      req.params.id
    );

    res.json({
      message:
        "User deleted successfully"
    });

  } catch (error) {

    res.status(500).json({
      message:
        "Failed to delete user"
    });

  }

});

// Delete Ride
router.delete("/ride/:id", async (req, res) => {

  try {

    await Ride.findByIdAndDelete(
      req.params.id
    );

    res.json({
      message:
        "Ride deleted successfully"
    });

  } catch (error) {

    res.status(500).json({
      message:
        "Failed to delete ride"
    });

  }

});

router.get("/fraud-users", async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "admin" } }).lean();


    const rideCounts = await Ride.aggregate([
      { $group: { _id: "$username", count: { $sum: 1 } } }
    ]);

    const reviewStats = await Review.aggregate([
      { $group: { _id: "$reviewedUser", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);

    const bookingActivity = await BookedRide.aggregate([
      { $group: { _id: "$publishedBy", count: { $sum: 1 } } }
    ]);

    const rideCountMap = Object.fromEntries(rideCounts.map((item) => [item._id, item.count]));
    const reviewMap = Object.fromEntries(reviewStats.map((item) => [item._id, { avgRating: item.avgRating, reviewCount: item.count }]));
    const bookingMap = Object.fromEntries(bookingActivity.map((item) => [item._id, item.count]));

    const suspiciousUsers = users
      .map((user) => {
        const rideCount = rideCountMap[user.username] || 0;
        const bookingCount = bookingMap[user.username] || 0;
        const reviewData = reviewMap[user.username] || { avgRating: 0, reviewCount: 0 };
        const trustScore = user.trustScore != null ? user.trustScore : 100;
        const reasons = [];

        if (trustScore < 70) reasons.push("Low trust score");
        if (reviewData.reviewCount >= 3 && reviewData.avgRating < 3.5) reasons.push("Poor average review rating");
        if (bookingCount >= 20 && trustScore < 85) reasons.push("High booking activity with below-average trust score");
        if (rideCount >= 15 && trustScore < 80) reasons.push("Large route volume with low trust score");

        return {
          username: user.username,
          email: user.email,
          role: user.role,
          trustScore,
          publishedRides: rideCount,
          bookingsAsPublisher: bookingCount,
          avgRating: Number(reviewData.avgRating?.toFixed(1) || 0),
          reviewCount: reviewData.reviewCount,
          warnings: reasons.join(", "),
          suspicious: reasons.length > 0
        };
      })
      .filter((entry) => entry.suspicious)
      .sort((a, b) => a.trustScore - b.trustScore);

    res.json(suspiciousUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load suspicious users" });
  }
});

router.get("/analytics", async (req, res) => {

  try {

    const bookings =
      await BookedRide.find();

    const monthlyData = {};

    bookings.forEach((booking) => {

      const month =
        new Date(
          booking.createdAt
        ).toLocaleString(
          "default",
          {
            month: "short"
          }
        );

      monthlyData[month] =
        (monthlyData[month] || 0) + 1;

    });

    res.json(monthlyData);

  } catch (error) {

    res.status(500).json({
      message:
        "Analytics Error"
    });

  }

});

const DriverVerification = require("../models/DriverVerification");

// ✅ Driver Verification Requests (Documents)
router.get("/verification-requests", async (_req, res) => {
  try {
    const requests = await DriverVerification.find({ status: "Pending" })
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

// If you still have old routes/UI, you can also hit this alias.
router.get("/pending-verifications", async (_req, res) => {
  return router.handle({
    method: "GET",
    url: "/verification-requests"
  }, res, () => {});
});


// POST /api/admin/verify-driver
// Body: { verificationId, decision }
// decision: "Approved" | "Rejected"
router.post("/verify-driver", async (req, res) => {
  try {
    const { verificationId, decision } = req.body;

    if (!verificationId) return res.status(400).json({ message: "verificationId is required" });
    if (!decision || !["Approved", "Rejected"].includes(decision)) {
      return res.status(400).json({ message: "decision must be Approved or Rejected" });
    }

    const verification = await DriverVerification.findById(verificationId);
    if (!verification) return res.status(404).json({ message: "Verification request not found" });

    const user = await User.findOne({ username: verification.username });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (decision === "Approved") {
      const wasVerified = !!user.isVerifiedDriver;

      user.isVerifiedDriver = true;
      user.verificationStatus = "Approved";

      const calculateTrustScore = require("../utils/calculateTrustScore");

      // Recalculate trust score using canonical rules after verification.
      user.trustScore = calculateTrustScore(user);


      const { createNotification } = require("../utils/notifications");


      await createNotification({
        username: user.username,
        title: "✅ Driver Verification Approved",
        message: "Your driver account is now verified. You can now accept rides.",
        type: "verification"
      });

      await user.save();

      verification.status = "Approved";
      await verification.save();


      // Achievement badges refresh (verification approved)
      try {
        const calculateBadges = require("../utils/badgeHelper");
        const Ride = require("../models/Ride");
        const Review = require("../models/Review");

        const totalRides = await Ride.countDocuments({ username: user.username, status: "Completed" });
        const passengerRatingAgg = await Review.aggregate([
          { $match: { reviewedUser: user.username } },
          { $group: { _id: null, avgRating: { $avg: "$rating" } } }
        ]);

        const passengerRating = passengerRatingAgg[0]?.avgRating
          ? Number(passengerRatingAgg[0].avgRating.toFixed(2))
          : 0;

        user.badges = calculateBadges({
          totalRides,
          passengerRating,
          isVerified: true
        });
        await user.save();
      } catch (e) {
        console.error("Badge refresh on verify approved failed:", e);
      }
    } else {
      user.isVerifiedDriver = false;
      user.verificationStatus = "Rejected";
      await user.save();

      verification.status = "Rejected";
      await verification.save();
    }

    res.json({ message: `Driver ${decision}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

module.exports = router;


