const express = require('express');
const router = express.Router();

const Ride = require('../models/Ride');
const BookedRide = require('../models/BookedRide');
const calculateMatchScore = require('../utils/matchScore');

// POST: Smart Search (rank rides with match percentage)
// Body: { username, source, destination }
router.post('/smart-search', async (req, res) => {
  try {
    const { username, source, destination } = req.body;

    if (!username || !source || !destination) {
      return res.status(400).json({
        message: 'username, source, destination are required'
      });
    }

    const rides = await Ride.find({ status: 'Scheduled' });

    // user history (booking history) - used for score boosts
    const historyDocs = await BookedRide.find({ bookedBy: username }).select(
      'source destination'
    );

    const history = (historyDocs || []).map((b) => ({
      source: b.source,
      destination: b.destination
    }));

    const scoredRides = rides
      .map((ride) => {
        const score = calculateMatchScore(
          source,
          destination,
          ride.source,
          ride.destination,
          history
        );

        return {
          ...ride.toObject(),
          matchScore: score
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);

    res.json(scoredRides);
  } catch (error) {
    console.error('Smart-search error:', error);
    res.status(500).json({ message: 'Failed' });
  }
});

module.exports = router;

