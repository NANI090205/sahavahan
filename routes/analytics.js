const express = require('express');
const router = express.Router();

const BookedRide = require('../models/BookedRide');
const RideHistory = require('../models/RideHistory');

// GET: Homepage /platform stats (genuine)
// Used by public/index.html to populate hero stats + platform metrics.
router.get('/home-stats', async (req, res) => {
  try {
    const [
      users,
      rides,
      bookings,
      completedRides,
      activeListings,
      avgRatingAgg,
      communitySavingsAgg,
    ] = await Promise.all([
      // total users
      require('../models/User').countDocuments(),
      // total rides published
      require('../models/Ride').countDocuments(),
      // total bookings
      require('../models/BookedRide').countDocuments(),

      // completed rides (completed status)
      RideHistory.countDocuments({ type: 'Completed' }),

      // Active listings = rides not expired/cancelled/completed.
      // (Best-effort: if your Ride schema uses different fields, adjust here.)
      require('../models/Ride').countDocuments({ status: { $in: ['Active', 'Published', 'Available'] } }),

      // Average rating from Review model (fallback to users rating if absent)
      require('../models/Review')
        .aggregate([{ $group: { _id: null, avgRating: { $avg: '$rating' } } }]),

      // Community savings (sum of savings if present)
      require('../models/BookedRide')
        .aggregate([{ $group: { _id: null, savings: { $sum: { $ifNull: ['$savings', 0] } } } }]),

    ]);

    const avgRating = avgRatingAgg?.[0]?.avgRating;
    const communitySavings = communitySavingsAgg?.[0]?.savings;

    res.json({
      users,
      rides,
      bookings,
      completedRides,
      activeListings,
      avgRating: avgRating == null ? 0 : Number(avgRating.toFixed(1)),
      communitySavings: communitySavings == null ? 0 : Number(communitySavings),
    });
  } catch (error) {
    console.error('Home stats error:', error);
    res.status(500).json({ message: 'Failed to load home stats' });
  }
});

// GET: Popular routes by bookings count (top 10)
router.get('/popular-routes', async (req, res) => {
  try {
    const routes = await BookedRide.aggregate([
      {
        $group: {
          _id: { source: '$source', destination: '$destination' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { bookings: -1 } },
      { $limit: 10 },
    ]);

    res.json(routes);
  } catch (error) {
    console.error('Popular routes error:', error);
    res.status(500).json({ message: 'Failed to load popular routes' });
  }
});


// Backward compatibility: keep existing trending endpoint
router.get('/trending-routes', async (req, res) => {
  try {
    const routes = await BookedRide.aggregate([
      {
        $group: {
          _id: { source: '$source', destination: '$destination' },
          totalBookings: { $sum: 1 },
        },
      },
      { $sort: { totalBookings: -1 } },
      { $limit: 5 },
    ]);

    res.json(routes);
  } catch (error) {
    console.error('Trending routes error:', error);
    res.status(500).json({ message: 'Failed to load trending routes' });
  }
});


// GET: Hall of Fame (Top drivers)
// Sorted by:
//   1) totalCompletedRides (desc)
//   2) trustScore (desc)
// Returns top 10.
router.get('/hall-of-fame', async (req, res) => {
  try {
    const leaders = await RideHistory.aggregate([
      { $match: { type: 'Completed' } },
      {
        $group: {
          _id: '$username',
          totalCompletedRides: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'username',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          trustScore: { $ifNull: ['$user.trustScore', 100] },
        },
      },
      {
        $project: {
          _id: 0,
          username: '$_id',
          totalCompletedRides: 1,
          trustScore: 1,
        },
      },
      {
        $sort: {
          totalCompletedRides: -1,
          trustScore: -1,
        },
      },
      { $limit: 10 },
    ]);

    res.json(leaders);
  } catch (error) {
    console.error('Hall of Fame error:', error);
    res.status(500).json({ message: 'Failed to load hall of fame' });
  }
});

module.exports = router;


