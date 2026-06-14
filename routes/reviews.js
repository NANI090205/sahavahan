const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const User = require('../models/User');
const { createNotification } = require('../utils/notifications');
const calculateTrustScore = require('../utils/calculateTrustScore');

const recalculateTrustScoreForUser = async (username) => {
  if (!username) return;
  const user = await User.findOne({ username });
  if (!user) return;
  user.trustScore = calculateTrustScore(user);
  await user.save();
};

// POST: Add a review
router.post('/add', async (req, res) => {
  try {
    const { rideId, reviewer, reviewedUser, rating, comment, review } = req.body;

    const resolvedComment = typeof comment === 'string'
      ? comment
      : (typeof review === 'string' ? review : '');

    if (!rideId || !reviewer || !reviewedUser || rating == null) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

// Only allow rating after ride completion
    const Ride = require('../models/Ride');

    // Prevent duplicate reviews
    const existingReview = await Review.findOne({ rideId, reviewer, reviewedUser });
    if(existingReview){
      return res.status(400).json({ message: 'Review already submitted' });
    }

    const ride = await Ride.findById(rideId);

    if (!ride) return res.status(404).json({ message: 'Ride not found.' });

    // Legacy: map old statuses to lifecycle
    if (ride.status === 'Published' || ride.status === 'Booked' || ride.status === 'Started') {
      return res.status(400).json({ message: 'Ride must be completed to rate.' });
    }

    if (ride.status !== 'Completed') {
      return res.status(400).json({ message: 'Ride must be completed to rate.' });
    }

    const newReview = new Review({ rideId, reviewer, reviewedUser, rating, comment: resolvedComment, review });
    await newReview.save();

    const targetUser = await User.findOne({ username: reviewedUser });
    // Recalculate trust score using canonical rules
    await recalculateTrustScoreForUser(reviewedUser);


    await createNotification({
      username: reviewedUser,
      title: "⭐ New Review",
      message: `${reviewer} rated your ride`,
      type: "review"
    });

    // Achievement badges refresh (passengerRating updates)
    try {
      const calculateBadges = require("../utils/badgeHelper");
      const totalRides = await Ride.countDocuments({ username: reviewedUser, status: "Completed" });

      const passengerRatingAgg = await Review.aggregate([
        { $match: { reviewedUser } },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } }
      ]);

      const passengerRating = passengerRatingAgg[0]?.avgRating
        ? Number(passengerRatingAgg[0].avgRating.toFixed(2))
        : 0;

      const user = await User.findOne({ username: reviewedUser });
      if (user) {
        user.badges = calculateBadges({
          totalRides,
          passengerRating,
          isVerified: !!user.isVerified
        });
        await user.save();
      }
    } catch (e) {
      console.error("Badge refresh on review add failed:", e);
    }


    res.status(201).json({ message: 'Review added successfully', review: newReview });
  } catch (err) {
    console.error('Add review error:', err);
    res.status(500).json({ message: 'Error adding review' });
  }
});

// GET: Get reviews for a user
router.get('/user/:username', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewedUser: req.params.username }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ message: 'Failed to load reviews' });
  }
});

// GET: Get average rating and count for a user
router.get('/rating/:username', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewedUser: req.params.username });
    let avg = 0;
    if (reviews.length) {
      avg = reviews.reduce((a, b) => a + b.rating, 0) / reviews.length;
    }
    res.json({ rating: Number(avg.toFixed(1)), count: reviews.length });
  } catch (err) {
    console.error('Rating error:', err);
    res.status(500).json({ message: 'Failed to compute rating' });
  }
});

// GET: Leaderboard - top drivers by average rating and review count
router.get('/leaderboard', async (req, res) => {
  try {
    const reviews = await Review.aggregate([
      {
        $group: {
          _id: '$reviewedUser',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      },
      { $sort: { averageRating: -1, totalReviews: -1 } },
      { $limit: 10 }
    ]);

    res.json(reviews);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ message: 'Failed to load leaderboard' });
  }
});

// GET: Driver score (avg rating + total reviews)
router.get('/driver-score/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const reviews = await Review.find({ reviewedUser: username });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    const totalReviews = reviews.length;

    res.json({ rating: Number(avgRating.toFixed(1)), reviews: totalReviews });
  } catch (error) {
    console.error('Driver score error:', error);
    res.status(500).json({ message: 'Failed' });
  }
});

module.exports = router;
