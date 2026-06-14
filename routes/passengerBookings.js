const express = require('express');
const router = express.Router();

const BookedRide = require('../models/BookedRide');

// GET: /api/passenger-bookings/:rideId?username=...
// Returns the passenger's booking for a ride (includes boardingPoint/dropPoint)
router.get('/:rideId', async (req, res) => {
  try {
    const { rideId } = req.params;
    const username = req.query.username;

    if (!rideId) return res.status(400).json({ message: 'rideId is required' });
    if (!username) return res.status(400).json({ message: 'username is required' });

    const booking = await BookedRide.findOne({ rideId, username }).lean();

    if (!booking) return res.status(404).json({ message: 'Booking not found for passenger' });

    return res.json({
      rideId,
      bookingId: booking._id,
      boardingPoint: booking.boardingPoint || booking.source || '',
      dropPoint: booking.dropPoint || booking.destination || '',
      boardingLat: booking.boardingLat,
      boardingLng: booking.boardingLng,
      dropLat: booking.dropLat,
      dropLng: booking.dropLng
    });
  } catch (e) {
    console.error('passenger booking fetch error:', e);
    res.status(500).json({ message: 'Failed to fetch passenger booking' });
  }
});

module.exports = router;

