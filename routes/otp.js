// ============================================================
// routes/otp.js  — SahaVahan OTP Verification Routes
// ============================================================
// Mount in server.js / app.js:
//   const otpRoutes = require('./routes/otp');
//   app.use('/api/otp', otpRoutes);
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

const Ride       = require('../models/Ride');
const BookedRide = require('../models/BookedRide');
const User       = require('../models/User');
const RideHistory = require('../models/RideHistory');
const { createNotification } = require('../utils/notifications');

// ── helpers ──────────────────────────────────────────────────
const tryBadgeRefresh = async (driverUsername) => {
  try {
    const calculateBadges = require('../utils/badgeHelper');
    const Review = require('../models/Review');
    const totalRides = await Ride.countDocuments({ username: driverUsername, status: 'Completed' });
    const agg = await Review.aggregate([
      { $match: { reviewedUser: driverUsername } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);
    const passengerRating = agg[0]?.avg ? Number(agg[0].avg.toFixed(2)) : 0;
    const user = await User.findOne({ username: driverUsername });
    if (user) {
      user.badges = calculateBadges({ totalRides, passengerRating, isVerified: !!user.isVerifiedDriver });
      await user.save();
    }
  } catch (e) {
    console.error('Badge refresh error:', e);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/otp/verify-boarding
// Body: { rideId, bookingId, otp }
// Called by driver after passenger gives boarding OTP
// ─────────────────────────────────────────────────────────────
router.post('/verify-boarding', auth, async (req, res) => {
  try {
    const { rideId, bookingId, otp } = req.body;

    if (!rideId || !bookingId || !otp) {
      return res.status(400).json({ message: 'rideId, bookingId, and otp are required.' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found.' });

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    if (ride.status !== 'Scheduled') {
      return res.status(400).json({
        message: `Boarding OTP can only be verified for Scheduled rides. Current status: ${ride.status}`
      });
    }

    const booking = await BookedRide.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });

    if (booking.rideId.toString() !== rideId) {
      return res.status(400).json({ message: 'Booking does not belong to this ride.' });
    }


    if (booking.otpVerified) {
      return res.status(400).json({ message: 'Boarding OTP already verified for this booking.' });
    }

    // Expiry Check
    if (booking.boardingOTPExpiry && new Date() > booking.boardingOTPExpiry) {
      return res.status(400).json({ message: 'OTP Expired' });
    }

    // Attempt limit Check
    if (booking.boardingOtpAttempts >= 5) {
      booking.rideOTP = "";
      booking.boardingOTP = "";
      booking.boardingOTPExpiry = null;
      await booking.save();
      return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
    }

    const storedOtp = booking.boardingOTP || booking.rideOTP || '';

    if (!storedOtp) {
      return res.status(400).json({ message: 'No boarding OTP found for this booking.' });
    }

    if (String(otp).trim() !== String(storedOtp).trim()) {
      booking.boardingOtpAttempts = (booking.boardingOtpAttempts || 0) + 1;
      if (booking.boardingOtpAttempts >= 5) {
        booking.rideOTP = "";
        booking.boardingOTP = "";
        booking.boardingOTPExpiry = null;
      }
      await booking.save();
      if (booking.boardingOtpAttempts >= 5) {
        return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
      }
      return res.status(400).json({ message: 'Invalid Boarding OTP. Please check and try again.' });
    }

    // ✅ OTP correct — mark booking verified
    booking.otpVerified = true;
    booking.boardingOtpAttempts = 0;
    booking.status = 'Boarded';
    await booking.save();


    // Transition ride: Scheduled → In Progress
    ride.status       = 'In Progress';
    ride.rideStartedAt = new Date();
    await ride.save();

    // Set all boarded bookings of this ride to In Progress
    const bookings = await BookedRide.find({ rideId });
    for (const b of bookings) {
      if (b.status === 'Boarded' || b.otpVerified) {
        b.status = 'In Progress';
        await b.save();
      }
    }

    // Notifications
    await Promise.all([
      createNotification({
        username: ride.username,
        title:   '🚗 Ride Started',
        message: `Boarding OTP verified. Your ride from ${ride.source} to ${ride.destination} is now In Progress.`,
        type:    'ride_started'
      }),
      createNotification({
        username: booking.bookedBy,
        title:   '✅ Boarding Confirmed',
        message: `You've boarded the ride from ${ride.source} to ${ride.destination}. Have a safe journey!`,
        type:    'boarding_confirmed'
      })
    ]);

    return res.status(200).json({
      message: 'Boarding OTP verified. Ride is now In Progress.',
      rideStatus: 'In Progress',
      otpVerified: true
    });

  } catch (err) {
    console.error('verify-boarding error:', err);
    return res.status(500).json({ message: 'Server error during boarding OTP verification.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/otp/verify-drop
// Body: { rideId, bookingId, otp }
// Called by passenger at drop point
// Automatically completes ride after all passengers verify
// ─────────────────────────────────────────────────────────────
router.post('/verify-drop', auth, async (req, res) => {
  try {
    const { rideId, bookingId, otp } = req.body;

    if (!rideId || !bookingId || !otp) {
      return res.status(400).json({ message: 'rideId, bookingId, and otp are required.' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found.' });

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    if (ride.status !== 'In Progress') {
      return res.status(400).json({
        message: `Drop OTP can only be verified while ride is In Progress. Current status: ${ride.status}`
      });
    }

    const booking = await BookedRide.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });

    if (booking.rideId.toString() !== rideId) {
      return res.status(400).json({ message: 'Booking does not belong to this ride.' });
    }

    if (booking.dropOTPVerified) {
      return res.status(400).json({ message: 'Drop OTP already verified for this booking.' });
    }

    // Expiry Check
    if (booking.dropOTPExpiry && new Date() > booking.dropOTPExpiry) {
      return res.status(400).json({ message: 'OTP Expired' });
    }

    // Attempt limit Check
    if (booking.dropOtpAttempts >= 5) {
      booking.dropOTP = "";
      booking.dropOTPExpiry = null;
      await booking.save();
      return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
    }

    const storedDropOtp = booking.dropOTP || '';
    if (!storedDropOtp) {
      return res.status(400).json({ message: 'No drop OTP found for this booking.' });
    }

    console.log("===== VERIFY DROP =====");
    console.log("rideId:", rideId);
    console.log("bookingId:", bookingId);
    console.log("entered OTP:", otp);
    console.log("stored OTP:", booking?.dropOTP);
    console.log("ride status:", ride?.status);

    if (String(otp).trim() !== String(storedDropOtp).trim()) {
      booking.dropOtpAttempts = (booking.dropOtpAttempts || 0) + 1;
      if (booking.dropOtpAttempts >= 5) {
        booking.dropOTP = "";
        booking.dropOTPExpiry = null;
      }
      await booking.save();
      if (booking.dropOtpAttempts >= 5) {
        return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
      }
      return res.status(400).json({ message: 'Invalid Drop OTP. Please check and try again.' });
    }


    // ✅ Drop OTP correct
    booking.dropOTPVerified = true;
    booking.droppedAt = new Date();
    booking.dropOtpAttempts = 0;
    booking.status = 'Completed';
    await booking.save();

    // Check if ALL bookings for this ride have drop OTP verified
    const pendingDropBookings = await BookedRide.countDocuments({
      rideId,
      dropOTPVerified: { $ne: true }
    });

    let rideCompleted = false;

    if (pendingDropBookings === 0) {
      // All passengers dropped — complete the ride
      ride.status           = 'Completed';
      ride.rideCompletedAt  = new Date();
      await ride.save();
      rideCompleted = true;

      // Record history for driver
      await RideHistory.create({
        username:    ride.username,
        type:        'Completed',
        source:      ride.source,
        destination: ride.destination,
        date:        ride.date,
        amount:      ride.price,
        rideId:      String(ride._id),
        passenger:   ""
      });

      // Record history for passengers
      const bookingsForHistory = await BookedRide.find({ rideId });
      for (const booking of bookingsForHistory) {
        if (booking.status === 'Completed') {
          await RideHistory.create({
            username:    booking.bookedBy,
            type:        'Completed',
            source:      ride.source,
            destination: ride.destination,
            date:        ride.date,
            amount:      booking.totalPrice,
            rideId:      String(ride._id),
            passenger:   booking.bookedBy
          });
        }
      }

      // Update driver earnings + CO2
      try {
        const driver = await User.findOne({ username: ride.username });
        if (driver) {
          driver.totalEarnings = Number(driver.totalEarnings || 0) + Number(ride.price || 0);
          const allBookings   = await BookedRide.find({ rideId });
          const passengers    = allBookings.reduce((s, b) => s + Number(b.seatsBooked || 0), 0);
          const proxyDistKm   = Number(ride.price || 0) / 10;
          const co2Saved      = proxyDistKm * Math.max(passengers - 1, 0) * 0.12;
          driver.co2Saved     = Number(driver.co2Saved || 0) + co2Saved;
          await driver.save();
        }
      } catch (e) {
        console.error('Driver stats update error:', e);
      }

      // Badge refresh
      await tryBadgeRefresh(ride.username);

      // Notify driver
      await createNotification({
        username: ride.username,
        title: "🏁 Ride Completed",
        message: `Your ride from ${ride.source} to ${ride.destination} has been completed.`,
        type: "ride"
      });

      // Notify all passengers to rate
      const allBookings = await BookedRide.find({ rideId });
      const passengerUsernames = [...new Set(allBookings.map(b => b.bookedBy).filter(Boolean))];
      for (const p of passengerUsernames) {
        await createNotification({
          username: p,
          title:   '🏁 Ride Completed',
          message: `Your ride from ${ride.source} to ${ride.destination} has been completed.`,
          type:    'ride'
        });

        // keep existing review prompt behavior as well
        await createNotification({
          username: p,
          title:   '⭐ Rate Your Ride',
          message: 'Ride completed! Please rate your driver and share your experience.',
          type:    'review'
        });
      }
    }

    // Notify the passenger whose drop was just verified
    await createNotification({
      username: booking.bookedBy,
      title: rideCompleted ? '🏁 Journey Complete' : '📍 Drop Confirmed',
      message: rideCompleted
        ? `You've arrived at ${ride.destination}. Please rate your driver!`
        : `Your drop at ${ride.destination} has been confirmed.`,
      type: rideCompleted ? 'ride_completed' : 'drop_confirmed'
    });

    return res.status(200).json({
      message: rideCompleted
        ? 'Drop OTP verified. Ride has been completed!'
        : 'Drop OTP verified. Waiting for other passengers.',
      dropOTPVerified: true,
      rideCompleted,
      rideStatus: rideCompleted ? 'Completed' : 'In Progress'
    });

  } catch (err) {
    console.error('verify-drop error:', err);
    return res.status(500).json({ message: 'Server error during drop OTP verification.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/otp/booking-info/:rideId
// Used by driver dashboard to see passenger boarding status
// ─────────────────────────────────────────────────────────────
router.get('/booking-info/:rideId', async (req, res) => {
  try {
    const { rideId } = req.params;
    const bookings = await BookedRide.find({ rideId });

    const info = bookings.map(b => ({
      bookingId:       b._id,
      passengerName:   b.bookedBy,
      passengerCode:   b.bookedByCode,
      seatsBooked:     b.seatsBooked,
      boardingOTP:     b.boardingOTP || b.rideOTP || '',
      dropOTP:         b.dropOTP || '',
      otpVerified:     !!b.otpVerified,
      dropOTPVerified: !!b.dropOTPVerified,
      boardingPoint:   b.boardingPoint || '',
      dropPoint:       b.dropPoint || ''
    }));

    return res.status(200).json({ bookings: info });
  } catch (err) {
    console.error('booking-info error:', err);
    return res.status(500).json({ message: 'Failed to fetch booking info.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/otp/passenger-otps/:bookingId
// Used by passenger dashboard to retrieve their OTPs
// ─────────────────────────────────────────────────────────────
router.get('/passenger-otps/:bookingId', async (req, res) => {
  try {
    const booking = await BookedRide.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });

    const ride = await Ride.findById(booking.rideId);

    return res.status(200).json({
      bookingId:       booking._id,
      rideId:          booking.rideId,
      rideStatus:      ride?.status || 'Unknown',
      boardingOTP:     booking.otpVerified     ? null : (booking.boardingOTP || booking.rideOTP || ''),
      dropOTP:         booking.dropOTPVerified ? null : (booking.dropOTP     || ''),
      otpVerified:     !!booking.otpVerified,
      dropOTPVerified: !!booking.dropOTPVerified
    });
  } catch (err) {
    console.error('passenger-otps error:', err);
    return res.status(500).json({ message: 'Failed to fetch OTPs.' });
  }
});

module.exports = router;



