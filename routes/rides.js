const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { memoriesUpload } = require('../middleware/cloudinaryUpload');
const path = require('path');

const Ride = require('../models/Ride');
const BookedRide = require('../models/BookedRide');
const RidePhoto = require('../models/RidePhoto');
const User = require('../models/User');
const RideHistory = require('../models/RideHistory');
const transporter = require('../utils/mailer');
const { createNotification } = require('../utils/notifications');
const RouteSubscription = require('../models/RouteSubscription');

const Vehicle = require('../models/Vehicle');
const checkProfileCompletion = require('../utils/checkProfileCompletion');
const Waitlist = require('../models/Waitlist');

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const MAX_RIDE_PHOTOS = 5;

const calculateTrustScore = require('../utils/calculateTrustScore');
const recalculateTrustScoreForUser = async (username) => {
  if (!username) return;
  const user = await User.findOne({ username });
  if (!user) return;
  user.trustScore = calculateTrustScore(user);
  await user.save();
};

const adjustUserTrustScore = async (username, change) => {
  if (!username) return;
  const user = await User.findOne({ username });
  if (!user) return;
  user.trustScore = Math.max(0, Math.min(100, (user.trustScore || 50) + change));
  await user.save();
};

const generateRideCode = () => {
  return 'RIDE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

// POST: Publish a Ride
router.post('/publish', async (req, res) => {
  try {
    const {
      username,
      uniqueCode,
      phoneNumber,
      source,
      destination,
      sourceLat,
      sourceLng,
      pickupLocation,
      dropLocation,
      pickupPoints,
      dropPoints,
      vehicleId,
      date,
      time,
      seats,
      price,
      stops,
      isRecurring,
      recurringType,
      repeatDays,
      preferences,
    } = req.body;

    if (
      !username ||
      !uniqueCode ||
      !vehicleId ||
      !source ||
      !destination ||
      !date ||
      !time ||
      !seats ||
      !price
    ) {
      return res
        .status(400)
        .json({ message: 'All required fields are required (including vehicleId)' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const profileOk = checkProfileCompletion(user);
    if (!profileOk) {
      return res.status(400).json({
        message: 'Please verify your email and add at least one vehicle before publishing.',
      });
    }

    const selectedVehicle = await Vehicle.findOne({ _id: vehicleId, username });
    if (!selectedVehicle) {
      return res.status(400).json({ message: 'Please add a vehicle before publishing.' });
    }

    const pickupLocationNormalized =
      pickupLocation && typeof pickupLocation === 'object'
        ? { lat: Number(pickupLocation.lat), lng: Number(pickupLocation.lng) }
        : undefined;

    const dropLocationNormalized =
      dropLocation && typeof dropLocation === 'object'
        ? { lat: Number(dropLocation.lat), lng: Number(dropLocation.lng) }
        : undefined;

    const normalizedIsRecurring = !!isRecurring;
    const normalizedRecurringType = normalizedIsRecurring ? recurringType || '' : '';

    const normalizedRepeatDays =
      normalizedIsRecurring && Array.isArray(repeatDays)
        ? repeatDays
            .map((d) => String(d).trim())
            .filter(Boolean)
            .map((d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
        : [];

    let ridePhoneNumber = phoneNumber;
    if (!ridePhoneNumber) {
      const u = await User.findOne({ uniqueCode });
      ridePhoneNumber = u?.phoneNumber || '';
    }

    const rideCode = generateRideCode();

    const newRide = new Ride({
      username,
      uniqueCode,
      phoneNumber: ridePhoneNumber,
      vehicleId,
      source,
      destination,
      sourceLat,
      sourceLng,
      pickupLocation: pickupLocationNormalized,
      dropLocation: dropLocationNormalized,
      stops: Array.isArray(stops) ? stops : [],

      distance: 0,
      eta: '',

      date,
      time,
      seats,
      price,

      rideCode,
      status: 'Scheduled',
      isRecurring: normalizedIsRecurring,
      recurringType: normalizedRecurringType,
      repeatDays: normalizedRepeatDays,
      preferences: preferences || {},
    });

    // Distance/ETA heuristic
    try {
      const { getDistance } = require('geolib');

      const hasPickup =
        pickupLocationNormalized &&
        typeof pickupLocationNormalized.lat === 'number' &&
        typeof pickupLocationNormalized.lng === 'number';

      const hasDrop =
        dropLocationNormalized &&
        typeof dropLocationNormalized.lat === 'number' &&
        typeof dropLocationNormalized.lng === 'number';

      if (hasPickup && hasDrop) {
        const distanceMeters = getDistance(
          {
            latitude: pickupLocationNormalized.lat,
            longitude: pickupLocationNormalized.lng,
          },
          {
            latitude: dropLocationNormalized.lat,
            longitude: dropLocationNormalized.lng,
          }
        );

        const distanceKm = distanceMeters / 1000;
        const averageSpeedKmH = 65;
        const etaHours = distanceKm / averageSpeedKmH;
        const etaTotalMinutes = Math.round(etaHours * 60);

        const etaH = Math.floor(etaTotalMinutes / 60);
        const etaM = etaTotalMinutes % 60;
        newRide.distance = distanceKm;
        newRide.eta = `${etaH}h ${etaM}m`;
      }
    } catch (e) {
      console.error('Distance/ETA calculation failed:', e);
    }

    await newRide.save();

    await createNotification({
      username,
      title: '🗓️ Ride Scheduled',
      message: normalizedIsRecurring
        ? `Your ${normalizedRecurringType} recurring ride from ${source} to ${destination} is scheduled. Next occurrence will be created automatically.`
        : `Your ride from ${source} to ${destination} on ${date} at ${time} is scheduled.`,
      type: 'ride_published',
    });

    const subscribers = await RouteSubscription.find({ source, destination });
    for (const sub of subscribers) {
      await createNotification({
        username: sub.username,
        title: '🚗 New Ride Available',
        message: `${source} → ${destination}`,
        type: 'general',
      });
    }

    res.status(201).json({ message: 'Ride published successfully', rideCode });
  } catch (err) {
    console.error('❌ Publish ride error:', err);
    res.status(500).json({ message: 'Error while publishing ride' });
  }
});



// GET: Fetch rides published by a user
router.get('/user/:uniqueCode', async (req, res) => {
  try {
    const rides = await Ride.find({ uniqueCode: req.params.uniqueCode });

    const enriched = await Promise.all(
      rides.map(async (ride) => {
        const bookings = await BookedRide.find({ rideId: ride._id });
        const rideData = ride.toObject();

        rideData.bookings = bookings.map((booking) => ({
          _id: booking._id,
          bookedBy: booking.bookedBy,
          bookedByCode: booking.bookedByCode,
          seatsBooked: booking.seatsBooked,
          totalPrice: booking.totalPrice
        }));

        return rideData;
      })
    );

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Fetch user rides error:', err);
    res.status(500).json({ message: 'Error fetching user rides' });
  }
});

// GET: Fetch booked rides for a user
router.get('/booked/:uniqueCode', async (req, res) => {

  try {
    const bookings = await BookedRide.find({ bookedByCode: req.params.uniqueCode });

    const enriched = await Promise.all(
      bookings.map(async (booking) => {
        const ride = await Ride.findById(booking.rideId);
        return {
          _id: booking._id,
          rideId: booking.rideId,
          source: booking.source,
          destination: booking.destination,
          date: booking.date,
          time: booking.time,
          seatsBooked: booking.seatsBooked,
          totalPrice: booking.totalPrice,
          publishedBy: booking.publishedBy,
          rideCode: ride?.rideCode || 'N/A',
          status: booking.status || 'Booked',
          rideOTP: booking.rideOTP || ride?.rideOTP || '',
          boardingOTP: booking.boardingOTP || booking.rideOTP || ride?.rideOTP || '',
          dropOTP: booking.dropOTP || '',
          otpVerified: booking.otpVerified || false
        };

      })
    );

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Fetch booked rides error:', err);
    res.status(500).json({ message: 'Error fetching booked rides' });
  }
});

// GET: Fetch available rides (Scheduled + In Progress)
router.get('/all', async (_req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const rides = await Ride.find({
      status: { $in: ["Scheduled", "In Progress"] },
      date: { $gte: today.toISOString().split("T")[0] }
    }).sort({ date: 1 });

    res.status(200).json(rides);
  } catch (err) {
    console.error('❌ Fetch available rides error:', err);
    res.status(500).json({ message: 'Error fetching available rides' });
  }
});


// GET: Recommended price for a route
// Contract for frontend: { recommendedPrice }
// Uses demand prediction multiplier applied on a base "normal fare".
router.get('/recommended-price/:source/:destination', async (req, res) => {
  try {
    const { source, destination } = req.params;

    if (!source || !destination) {
      return res.status(400).json({ message: 'source and destination are required' });
    }

    // Base fare: average published ride price for this route
    const rides = await Ride.find({ source, destination }).select('price');

    const baseFare = rides && rides.length
      ? rides.reduce((sum, r) => sum + (Number(r.price) || 0), 0) / rides.length
      : 300;

    // Demand: use existing predictive logic
    const BookedRide = require('../models/BookedRide');
    const bookings = await BookedRide.countDocuments({ source, destination });

    const predictDemand = require('../utils/demandPrediction');
    const prediction = predictDemand(bookings);

    const recommendedPrice = Math.round(baseFare * prediction.recommendedPriceMultiplier);

    res.json({ recommendedPrice });
  } catch (error) {
    console.error('Recommended price error:', error);
    res.status(500).json({ message: 'Price prediction failed' });
  }
});




// GET: Demand prediction for a route (low/medium/high)
// Used by public/ridepublish.html via /api/rides/demand/:source/:destination
router.get('/demand/:source/:destination', async (req, res) => {
  try {
    const { source, destination } = req.params;

    if (!source || !destination) {
      return res.status(400).json({ message: 'source and destination are required' });
    }

    const bookings = await BookedRide.countDocuments({ source, destination });

    // Reuse the same prediction thresholds used in /utils/demandPrediction.js
    const predictDemand = require('../utils/demandPrediction');
    const prediction = predictDemand(bookings);

    res.json({
      demand: prediction.level,
      totalBookings: bookings,
      recommendedPriceMultiplier: prediction.recommendedPriceMultiplier,
    });
  } catch (error) {
    console.error('Demand error:', error);
    res.status(500).json({ message: 'Demand prediction failed' });
  }
});


// POST: Book a ride
router.post('/book', async (req, res) => {
  try {
    const { rideId, bookedBy, bookedByCode, publishedBy, seatsBooked, totalPrice } = req.body;

    if (!rideId || !bookedBy || !bookedByCode || !publishedBy || !seatsBooked || !totalPrice) {
      return res.status(400).json({ message: 'All fields are required for booking.' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found.' });

    if (ride.seats < seatsBooked) {
      return res.status(409).json({
        message: 'Ride full',
        rideId,
        seatsAvailable: ride.seats,
        waitlistEligible: true
      });
    }

    ride.seats -= seatsBooked;
    await ride.save();


    const boardingOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const dropOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Legacy ride OTP keeps existing flows working
    ride.rideOTP = boardingOtp;
    await ride.save();

    const bookedRide = new BookedRide({
      rideId,
      bookedBy,
      bookedByCode,
      publishedBy,
      username: bookedBy,
      uniqueCode: bookedByCode,
      source: ride.source,
      destination: ride.destination,
      boardingPoint: (req.body && req.body.boardingPoint) ? req.body.boardingPoint : (req.body && req.body.boardingPoint === "" ? "" : (ride?.source ? ride.source : "")),
      boardingLat: (req.body && req.body.boardingLat !== undefined && req.body.boardingLat !== null) ? Number(req.body.boardingLat) : undefined,
      boardingLng: (req.body && req.body.boardingLng !== undefined && req.body.boardingLng !== null) ? Number(req.body.boardingLng) : undefined,

      dropPoint: (req.body && req.body.dropPoint) ? req.body.dropPoint : (req.body && req.body.dropPoint === "" ? "" : (ride?.destination ? ride.destination : "")),
      dropLat: (req.body && req.body.dropLat !== undefined && req.body.dropLat !== null) ? Number(req.body.dropLat) : undefined,
      dropLng: (req.body && req.body.dropLng !== undefined && req.body.dropLng !== null) ? Number(req.body.dropLng) : undefined,


      date: ride.date,
      time: ride.time,
      price: ride.price,
      seatsBooked,
      totalPrice,
      rideOTP: boardingOtp,
      boardingOTP: boardingOtp,
      dropOTP: dropOtp,
      boardingOTPExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dropOTPExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      boardingOtpAttempts: 0,
      dropOtpAttempts: 0,
      status: "Booked"
    });


    await bookedRide.save();


    // Notify both users
    const publisherUser = await User.findOne({ username: publishedBy });
    const bookerUser = await User.findOne({ username: bookedBy });

    if (publisherUser?.email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: publisherUser.email,
        subject: '🚗 Your Ride Has Been Booked!',
        text: `Hello ${publishedBy}, your ride was booked by ${bookedBy}.`,
        html: `<h2>Hi ${publishedBy},</h2>
     <p>Your ride has been booked:</p>
     <ul>
        <li><strong>From:</strong> ${ride.source}</li>
        <li><strong>To:</strong> ${ride.destination}</li>
        <li><strong>Date:</strong> ${ride.date}</li>
        <li><strong>Time:</strong> ${ride.time}</li>
        <li><strong>Seats Booked:</strong> ${seatsBooked}</li>
        <li><strong>Total Price:</strong> ₹${totalPrice}</li>
     </ul>`
      }).catch(console.error);
    }

    if (bookerUser?.email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: bookerUser.email,
        subject: '✅ Booking Confirmed',
        text: `Hello ${bookedBy}, your ride has been successfully booked.`,
        html: `<h2>Hi ${bookedBy},</h2>
     <p>Your booking is confirmed:</p>
     <ul>
        <li><strong>From:</strong> ${ride.source}</li>
        <li><strong>To:</strong> ${ride.destination}</li>
        <li><strong>Date:</strong> ${ride.date}</li>
        <li><strong>Time:</strong> ${ride.time}</li>
        <li><strong>Seats:</strong> ${seatsBooked}</li>
        <li><strong>Total Price:</strong> ₹${totalPrice}</li>
     </ul>
     <p>– Carpooling Team</p>`
      }).catch(console.error);
    }

    await Promise.all([
      createNotification({
        username: publishedBy,
        title: "🚗 New Booking",
        message: `${bookedBy} booked your ride`,
        type: "booking"
      }),
      createNotification({
        username: bookedBy,
        title: "✅ Booking Confirmed",
        message: `Your booking for ${ride.source} to ${ride.destination} on ${ride.date} is confirmed.`,
        type: "booking"
      })
    ]);

    res.status(200).json({
      message: 'Ride booked successfully.',
      rideDetails: {
        bookedBy,
        source: ride.source,
        destination: ride.destination,
        date: ride.date,
        time: ride.time,
        seatsBooked,
        totalPrice
      }
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ message: 'Error while booking ride.' });
  }
});

//DELETE: Cancel a published ride (by Publisher)
router.delete('/cancel/published/:rideId', async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    const bookings = await BookedRide.find({ rideId });

    for (const booking of bookings) {
      const bookerUser = await User.findOne({ username: booking.bookedBy });
      if (bookerUser?.email) {
        await sendMail(
          bookerUser.email,
          'Ride Cancelled by Publisher',
          `Your ride has been cancelled.`,
          `<h3>Hi ${bookerUser.username},</h3>
           <p>Your booking from <strong>${ride.source}</strong> to <strong>${ride.destination}</strong> on <strong>${ride.date}</strong> has been cancelled by the publisher.</p>
           <p>Sorry for the inconvenience.</p>`
        );
      }
    }

    await adjustUserTrustScore(ride.username, -5);

    await Promise.all(
      bookings.map(async (booking) => {
        await createNotification({
          username: booking.bookedBy,
          title: "⚠ Booking Cancelled",
          message: `Your booking for ${ride.source} to ${ride.destination} on ${ride.date} was cancelled by the publisher.`,
          type: "cancellation"
        });
      })
    );

    await createNotification({
      username: ride.username,
      title: "⚠ Ride Cancelled",
      message: `Your published ride from ${ride.source} to ${ride.destination} on ${ride.date} was cancelled.`,
      type: "cancellation"
    });

    await BookedRide.deleteMany({ rideId });
    await Ride.findByIdAndDelete(rideId);

    res.status(200).json({ message: 'Ride and related bookings cancelled successfully' });
  } catch (err) {
    console.error('Cancel published ride error:', err);
    res.status(500).json({ message: 'Error cancelling ride' });
  }
});

// ❌ DELETE: Cancel a booked ride (by User)
router.delete('/cancel/booked/:bookingId', async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    console.log("BookingId received:", bookingId);

    if (!bookingId || bookingId === 'undefined') {
      return res.status(400).json({ message: '! Booking ID is missing or invalid.' });
    }

    const booking = await BookedRide.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: '! Booking not found.' });
    }

    const ride = await Ride.findById(booking.rideId);
    if (ride) {
      ride.seats += booking.seatsBooked;
      await ride.save();

      // Auto-promote waitlist (MVP: promote 1 seat per waitlist entry)
      // Only promote if ride is not yet full
      let seatsToPromote = Number(ride.seats || 0);
      while (seatsToPromote > 0) {
        const nextWaitlisted = await Waitlist.findOne({
          rideId: booking.rideId
        }).sort({ position: 1 });

        if (!nextWaitlisted) break;

        // Ensure still has seat
        if (Number(ride.seats || 0) <= 0) break;

        // Load ride + publish fields
        const freshRide = await Ride.findById(booking.rideId);
        if (!freshRide) break;

        const passenger = await User.findOne({ username: nextWaitlisted.username });
        if (!passenger) {
          // If user missing, drop waitlist entry
          await Waitlist.findByIdAndDelete(nextWaitlisted._id);
          continue;
        }

        // Create booking for 1 seat
        const seatsBooked = 1;
        const boardingOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const dropOtp = Math.floor(100000 + Math.random() * 900000).toString();

        freshRide.rideOTP = boardingOtp;
        freshRide.seats = Number(freshRide.seats || 0) - seatsBooked;
        await freshRide.save();


        const bookedRide = new BookedRide({
          rideId: freshRide._id,
          bookedBy: passenger.username,
          bookedByCode: passenger.uniqueCode?.toString?.() || String(passenger.uniqueCode),
          publishedBy: freshRide.username,
          username: passenger.username,
          uniqueCode: passenger.uniqueCode?.toString?.() || String(passenger.uniqueCode),
          source: freshRide.source,
          destination: freshRide.destination,
          date: freshRide.date,
          time: freshRide.time,
          price: freshRide.price,
          seatsBooked,
          totalPrice: Number(freshRide.price || 0) * seatsBooked,
          rideOTP: boardingOtp,
          boardingOTP: boardingOtp,
          dropOTP: dropOtp,
          otpVerified: false,
          dropOTPVerified: false

        });

        await bookedRide.save();
        await Waitlist.findByIdAndDelete(nextWaitlisted._id);

        // Notifications
        await Promise.all([
          createNotification({
            username: nextWaitlisted.username,
            title: "🎉 Seat Available!",
            message: `Your waitlist booking has been confirmed for ${freshRide.source} to ${freshRide.destination} on ${freshRide.date}.`,
            type: "general"
          }),
          createNotification({
            username: freshRide.username,
            title: "🚗 New Waitlist Booking",
            message: `${nextWaitlisted.username} was promoted from waitlist.`,
            type: "booking"
          })
        ]);

        seatsToPromote -= 1;
      }
    }


    const publisherUser = await User.findOne({ username: booking.publishedBy });
    if (publisherUser?.email) {
      await sendMail(
        publisherUser.email,
        '❌ Booking has been Cancelled by User',
        `${booking.bookedBy} cancelled the booking.`,
        `<h3>Hi ${publisherUser.username},</h3>
         <p><strong>${booking.bookedBy}</strong> has cancelled their booking for your ride.</p>
         <p>Freed Seats: ${booking.seatsBooked}</p>`
      );
    }

    await adjustUserTrustScore(booking.bookedBy, -3);

    await createNotification({
      username: booking.publishedBy,
      title: "⚠ Booking Cancelled",
      message: `${booking.bookedBy} cancelled their booking for ${booking.source} to ${booking.destination} on ${booking.date}.`,
      type: "cancellation"
    });

    await createNotification({
      username: booking.bookedBy,
      title: "⚠ Booking Cancelled",
      message: `You cancelled your booking for ${booking.source} to ${booking.destination} on ${booking.date}.`,
      type: "cancellation"
    });

    await RideHistory.create({
      username: booking.bookedBy,
      type: "Cancelled",
      source: booking.source,
      destination: booking.destination,
      date: booking.date,
      amount: booking.totalPrice,
      rideId: String(booking.rideId),
      passenger: booking.bookedBy
    });

    await BookedRide.findByIdAndDelete(bookingId);
    res.status(200).json({ message: 'Booking cancelled successfully.' });
  } catch (err) {
    console.error('Cancel booked ride error:', err);
    res.status(500).json({ message: 'Error cancelling booking.' });
  }
});

// POST: Verify passenger OTP and start ride
router.post('/verify-otp', auth, async (req, res) => {
  try {
    const { rideId, otp } = req.body;

    if (!rideId || !otp) {
      return res.status(400).json({ message: 'rideId and otp are required' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    // Must be in Scheduled before starting
    if (ride.status !== 'Scheduled' && ride.status !== 'Published' && ride.status !== 'Booked') {
      return res.status(400).json({
        message: `Ride cannot be started from status: ${ride.status}`
      });
    }

    // Booking is tied to OTP, pick the most relevant booking not yet verified
    const booking = await BookedRide.findOne({
      rideId,
      rideOTP: String(otp),
      otpVerified: { $ne: true }
    });

    // If not found by exact otp match, fallback to any booking for ride and compare manually
    const fallbackBooking = booking ? null : await BookedRide.findOne({ rideId, otpVerified: { $ne: true } });

    const targetBooking = booking || fallbackBooking;
    if (!targetBooking) {
      return res.status(400).json({ message: 'Booking not found for this ride' });
    }

    // Expiry Check
    if (targetBooking.boardingOTPExpiry && new Date() > targetBooking.boardingOTPExpiry) {
      return res.status(400).json({ message: 'OTP Expired' });
    }

    // Attempt limit Check
    if (targetBooking.boardingOtpAttempts >= 5) {
      targetBooking.rideOTP = "";
      targetBooking.boardingOTP = "";
      targetBooking.boardingOTPExpiry = null;
      await targetBooking.save();
      return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
    }

    const expectedOtp = String(targetBooking.rideOTP || targetBooking.boardingOTP || '');
    if (expectedOtp !== String(otp)) {
      targetBooking.boardingOtpAttempts = (targetBooking.boardingOtpAttempts || 0) + 1;
      if (targetBooking.boardingOtpAttempts >= 5) {
        targetBooking.rideOTP = "";
        targetBooking.boardingOTP = "";
        targetBooking.boardingOTPExpiry = null;
      }
      await targetBooking.save();
      if (targetBooking.boardingOtpAttempts >= 5) {
        return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
      }
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // OTP verified
    targetBooking.otpVerified = true;
    targetBooking.boardedAt = new Date();
    targetBooking.boardingOtpAttempts = 0;
    targetBooking.status = 'Boarded';
    await targetBooking.save();

    // Start ride
    ride.status = 'In Progress';
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
    const passengerUsername = targetBooking.bookedBy;

    if (passengerUsername) {
      await createNotification({
        username: passengerUsername,
        title: "🔔 Driver Started Ride",
        message: "OTP Verified Successfully. Your driver has started the ride.",
        type: "general"
      });
    }

    await createNotification({
      username: ride.username,
      title: "🚗 Ride Started",
      message: `Driver ${ride.username} started the ride after OTP verification.`,
      type: "general"
    });

    // Keep old socket/live tracking behavior working
    await createNotification({
      username: ride.username,
      title: "✅ Ride In Progress",
      message: "Your ride status is now In Progress.",
      type: "general"
    });

    res.json({ message: 'Ride Started' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to verify OTP' });
  }
});

// Passenger Boarding OTP verification (bookingId + otp)
router.post('/verify-boarding-otp', auth, async (req, res) => {
  try {
    const { bookingId, otp } = req.body;


    if (!bookingId || !otp) {
      return res.status(400).json({ message: 'bookingId and otp are required' });
    }

    const booking = await BookedRide.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const ride = await Ride.findById(booking.rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    // If already verified, keep idempotent
    if (booking.otpVerified) {
      return res.json({ message: 'Passenger Boarded' });
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

    const expectedOtp = String(booking.boardingOTP || booking.rideOTP || '');

    if (expectedOtp !== String(otp)) {
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
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    booking.otpVerified = true;
    booking.boardedAt = new Date();
    booking.boardingOtpAttempts = 0;
    booking.status = 'Boarded';
    await booking.save();

    await createNotification({
      username: booking.bookedBy,
      title: '✅ Boarding Confirmed',
      message: `You have successfully boarded the ride.`,
      type: 'general'
    });

    return res.json({ message: 'Passenger Boarded' });
  } catch (e) {
    console.error('verify-boarding-otp error:', e);
    return res.status(500).json({ message: 'Failed to verify OTP' });
  }
});

// Driver Start Ride API
router.put('/start/:rideId', auth, async (req, res) => {
  try {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    // Backward compatibility: map legacy statuses to Scheduled
    if (ride.status === 'Published' || ride.status === 'Booked') {
      ride.status = 'Scheduled';
    }

    if (ride.status !== 'Scheduled') {
      return res.status(400).json({
        message: `Ride cannot be started from status: ${ride.status}`
      });
    }

    ride.status = 'In Progress';
    ride.rideStartedAt = new Date();
    await ride.save();

    // Update all boarded bookings of this ride to In Progress
    const bookings = await BookedRide.find({ rideId });
    for (const b of bookings) {
      if (b.status === 'Boarded' || b.otpVerified) {
        b.status = 'In Progress';
        await b.save();
      }
    }

    // Passenger notification (if any booking exists)
    const booking = await BookedRide.findOne({ rideId });
    const passengerUsername = booking?.bookedBy;

    if (passengerUsername) {
      await createNotification(
        passengerUsername,
        "Ride Started",
        "Your ride is now in progress",
        "ride"
      );
    }

    await createNotification({
      username: ride.username,
      title: "🚗 Ride Started",
      message: `Driver ${ride.username} started the ride.`,
      type: "general"
    });

    return res.json({ message: 'Ride Started' });
  } catch (err) {
    console.error('Start ride error:', err);
    res.status(500).json({ message: 'Error starting ride' });
  }
});


// GET: Ride status + driver coords (for live tracking UI)
router.get('/status/:rideId', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId).lean();
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    res.json({
      rideId: ride._id,
      username: ride.username,
      status: ride.status,
      driverLat: ride.driverLat,
      driverLng: ride.driverLng
    });
  } catch (err) {
    console.error('Ride status fetch error:', err);
    res.status(500).json({ message: 'Failed to load ride status' });
  }
});

// POST: Verify passenger Drop OTP
router.post('/verify-drop-otp', auth, async (req, res) => {
  try {
    const { bookingId, otp } = req.body;

    if (!bookingId || !otp) {
      return res.status(400).json({ message: 'bookingId and otp are required' });
    }

    const booking = await BookedRide.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const ride = await Ride.findById(booking.rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    // idempotent
    if (booking.dropOTPVerified) {
      return res.json({ message: 'Passenger Dropped Successfully' });
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

    if (String(booking.dropOTP) !== String(otp)) {
      booking.dropOtpAttempts = (booking.dropOtpAttempts || 0) + 1;
      if (booking.dropOtpAttempts >= 5) {
        booking.dropOTP = "";
        booking.dropOTPExpiry = null;
      }
      await booking.save();
      if (booking.dropOtpAttempts >= 5) {
        return res.status(400).json({ message: 'OTP has been invalidated due to too many failed attempts. Please contact support.' });
      }
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    booking.dropOTPVerified = true;
    booking.droppedAt = new Date();
    booking.dropOtpAttempts = 0;
    booking.status = 'Completed';
    await booking.save();

    // Auto-complete ride when all passengers are dropped
    const pendingPassengers = await BookedRide.countDocuments({
      rideId: booking.rideId,
      dropOTPVerified: false
    });

    if (pendingPassengers === 0) {
      if (ride.status === 'In Progress' || ride.status === 'Started' || ride.status === 'Scheduled' || ride.status === 'Published' || ride.status === 'Ongoing') {
        ride.status = 'Completed';
        ride.rideCompletedAt = new Date();
        await ride.save();

        await recalculateTrustScoreForUser(ride.username);

        await createNotification({
          username: ride.username,
          title: "✅ Ride Completed",
          message: `Thank you for traveling with SahaVahan.`,
          type: "general"
        });

        await RideHistory.create({
          username: ride.username,
          type: "Completed",
          source: ride.source,
          destination: ride.destination,
          date: ride.date,
          amount: ride.price,
          rideId: String(ride._id),
          passenger: ""
        });

        // Record history for passengers
        const bookingsForHistory = await BookedRide.find({ rideId: ride._id });
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

        // Trigger review - current system already creates reviews via /api/reviews; we only notify here.
        await createNotification({
          username: booking.bookedBy,
          title: "⭐ Rate your Ride",
          message: "Passenger dropped successfully. Please rate your driver.",
          type: "general"
        });
      }
    }

    res.json({ message: 'Passenger Dropped Successfully' });
  } catch (err) {
    console.error('verify-drop-otp error:', err);
    res.status(500).json({ message: 'Failed to verify drop otp' });
  }
});

// PUT: Complete a ride (publisher action)
router.put('/complete/:rideId', auth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // BOLA Check
    if (ride.username !== req.username) {
      return res.status(403).json({ message: 'Access denied: You are not the ride owner' });
    }

    // Legacy mapping: Started/Published/Ongoing -> In Progress
    if (ride.status === 'Started' || ride.status === 'Published' || ride.status === 'Booked' || ride.status === 'Ongoing') {
      ride.status = 'In Progress';
    }

    if (ride.status === 'Completed') {
      return res.json({ message: 'Ride completed' });
    }

    if (ride.status !== 'In Progress') {
      return res.status(400).json({
        message: `Ride cannot be completed from status: ${ride.status}`
      });
    }

    // Prevent early completion: all passengers must complete drop verification
    const pendingPassengers = await BookedRide.countDocuments({
      rideId,
      dropOTPVerified: false
    });

    // If there are bookings, enforce verification
    if (pendingPassengers > 0) {
      return res.status(400).json({
        message: 'All passengers must complete drop verification'
      });
    }

    ride.status = 'Completed';
    ride.rideCompletedAt = new Date();
    await ride.save();

    // Mark remaining active bookings (if any) to Completed
    const bookings = await BookedRide.find({ rideId });
    for (const b of bookings) {
      if (b.status === 'In Progress' || b.status === 'Boarded') {
        b.status = 'Completed';
        await b.save();
      }
    }

    // Recalculate trust score based on canonical rules
    await recalculateTrustScoreForUser(ride.username);



    // Achievement badges refresh (driver)
    try {
      const calculateBadges = require("../utils/badgeHelper");
      const User = require("../models/User");
      const Review = require("../models/Review");

      const driverUsername = ride.username;
      const totalRides = await Ride.countDocuments({ username: driverUsername, status: "Completed" });
      const passengerRatingAgg = await Review.aggregate([
        { $match: { reviewedUser: driverUsername } },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } }
      ]);
      const passengerRating = passengerRatingAgg[0]?.avgRating ? Number(passengerRatingAgg[0].avgRating.toFixed(2)) : 0;

      const user = await User.findOne({ username: driverUsername });
      if (user) {
        user.badges = calculateBadges({ totalRides, passengerRating, isVerified: !!user.isVerifiedDriver });
        await user.save();
      }
    } catch (e) {
      console.error("Badge refresh on ride complete failed:", e);
    }

    await createNotification({
      username: ride.username,
      title: "✅ Ride Completed",
      message: `Thank you for traveling with SahaVahan.`,
      type: "general"
    });

    await RideHistory.create({
      username: ride.username,
      type: "Completed",
      source: ride.source,
      destination: ride.destination,
      date: ride.date,
      amount: ride.price,
      rideId: String(ride._id),
      passenger: ""
    });

    // Record history for passengers
    const bookingsForHistory = await BookedRide.find({ rideId: ride._id });
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

    // Update driver lifetime earnings + CO2 savings
    try {
      const driver = await User.findOne({ username: ride.username });
      if (driver) {
        driver.totalEarnings = Number(driver.totalEarnings || 0) + Number(ride.price || 0);

        // Carbon footprint computation
        // - No stored distance in Ride model, so use a proxy based on price.
        //   proxyDistanceKm = ride.price / 10
        // - Passengers sharing is derived from verified seat bookings.
        const bookings = await BookedRide.find({ rideId });
        const passengers = bookings.reduce(
          (sum, b) => sum + Number(b.seatsBooked || 0),
          0
        );

        const proxyDistanceKm = Number(ride.price || 0) / 10;
        const co2Saved = proxyDistanceKm * Math.max(passengers - 1, 0) * 0.12;

        driver.co2Saved = Number(driver.co2Saved || 0) + Number(co2Saved || 0);
        await driver.save();
      }
    } catch (e) {
      console.error('Failed to update driver totalEarnings/co2Saved:', e);
    }

    res.status(200).json({ message: 'Ride completed', ride });



  } catch (err) {
    console.error('Complete ride error:', err);
    res.status(500).json({ message: 'Error completing ride' });
  }
});

// GET: Generate ticket PDF for a booking
router.get('/ticket/:bookingId', async (req, res) => {
  try {
    const booking = await BookedRide.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const qrData = `
Booking ID: ${booking._id}
Passenger: ${booking.bookedBy}
Driver: ${booking.publishedBy}
Route: ${booking.source} -> ${booking.destination}
Amount: ₹${booking.totalPrice}
`;

    const qrImage = await QRCode.toDataURL(qrData);

    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=SahaVahan-Ticket-${booking._id}.pdf`
    );

    doc.pipe(res);

    doc
      .fontSize(24)
      .text(
        "🚗 SAHAVAHAN E-TICKET",
        {
          align: "center",
        }
      );

    doc.moveDown();

    doc.fontSize(14).text(`Booking ID: SVH-${booking._id}`);
    doc.text(`Passenger: ${booking.bookedBy}`);
    doc.text(`Driver: ${booking.publishedBy}`);

    doc.moveDown();

    doc.text(`Route: ${booking.source} → ${booking.destination}`);
    doc.text(`Date: ${booking.date}`);
    doc.text(`Time: ${booking.time}`);
    doc.text(`Seats: ${booking.seatsBooked}`);
    doc.text(`Amount: ₹${booking.totalPrice}`);
    doc.moveDown();
    doc.text(`Ride OTP: ${booking.rideOTP || ""}`);


    doc.moveDown();

    doc.fillColor("green").text("STATUS: CONFIRMED");
    doc.fillColor("black");

    const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");
    const qrBuffer = Buffer.from(base64Data, "base64");

    doc.moveDown();

    doc.image(qrBuffer, {
      fit: [150, 150],
      align: "center",
    });

    doc.moveDown();

    doc.text("Thank you for choosing SahaVahan", { align: "center" });
    doc.text("Safe Journey 🚗", { align: "center" });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate ticket' });
  }
});

// GET: Recommend rides for a user based on past bookings
router.get('/recommend/:username', async (req, res) => {
  try {
    const username = req.params.username;

    const previousBookings = await BookedRide.find({ bookedBy: username });

    if (!previousBookings || previousBookings.length === 0) {
      const rides = await Ride.find().limit(5);
      return res.json(rides);
    }

    const preferredSources = previousBookings.map((b) => b.source).filter(Boolean);
    const preferredDestinations = previousBookings.map((b) => b.destination).filter(Boolean);

    const recommendations = await Ride.find({
      $or: [
        { source: { $in: preferredSources } },
        { destination: { $in: preferredDestinations } }
      ]
    }).limit(10);

    res.json(recommendations);
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ message: 'Recommendation failed' });
  }
});

// GET: Smart search / ranking for rides
// Example: /api/rides/smart-search?source=Vijayawada&destination=Hyderabad
router.get('/smart-search', async (req, res) => {
  try {
    const { source, destination } = req.query;

    // (Route photo endpoints are defined below. This block is unchanged.)


    const match = {};
    if (source) match.source = source;
    if (destination) match.destination = destination;

    const pipeline = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });

    pipeline.push(
      // lookup reviews for driver
      {
        $lookup: {
          from: 'reviews',
          localField: 'username',
          foreignField: 'reviewedUser',
          as: 'reviews'
        }
      },
      // lookup user document for trustScore + verification
      {
        $lookup: {
          from: 'users',
          localField: 'username',
          foreignField: 'username',
          as: 'user'
        }
      },
      // compute avgRating and trustScore + isVerifiedDriver
      {
        $addFields: {
          avgRating: { $ifNull: [{ $avg: '$reviews.rating' }, 0] },
          trustScore: { $ifNull: [{ $arrayElemAt: ['$user.trustScore', 0] }, 100] },
          isVerifiedDriver: { $ifNull: [{ $arrayElemAt: ['$user.isVerifiedDriver', 0] }, false] }
        }
      },

      // compute ranking score: (rating*10) + trustScore - (price/10)
      {
        $addFields: {
          score: {
            $subtract: [
              { $add: [{ $multiply: ['$avgRating', 10] }, '$trustScore'] },
              { $divide: ['$price', 10] }
            ]
          }
        }
      },
      { $sort: { score: -1 } },
      { $limit: 50 }
    );

    const results = await Ride.aggregate(pipeline);

    // tidy results: include only useful fields
    const output = results.map(r => ({
      _id: r._id,
      username: r.username,
      source: r.source,
      destination: r.destination,
      date: r.date,
      time: r.time,
      seats: r.seats,
      price: r.price,
      avgRating: Number((r.avgRating || 0).toFixed(1)),
      trustScore: r.trustScore || 100,
      score: Number((r.score || 0).toFixed(2)),
      isVerifiedDriver: !!r.isVerifiedDriver
    }));


    res.json(output);
  } catch (error) {
    console.error('Smart search error:', error);
    res.status(500).json({ message: 'Smart search failed' });
  }
});

// ------------------------------
// Trip Memories / Ride Photos
// ------------------------------

// POST: Upload trip photos for a completed ride
// Field name in form-data: images
router.post(
  '/:rideId/photos',
  memoriesUpload,
  async (req, res) => {
    try {
      const { rideId } = req.params;
      const { uploadedBy } = req.body;

      if (!rideId) return res.status(400).json({ message: 'rideId is required' });
      if (!uploadedBy) return res.status(400).json({ message: 'uploadedBy is required' });
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded' });
      }

      const ride = await Ride.findById(rideId);
      if (!ride) return res.status(404).json({ message: 'Ride not found' });
      if (ride.status !== 'Completed') {
        return res.status(400).json({ message: 'Photos can be uploaded only for completed rides' });
      }

      const existingCount = await RidePhoto.countDocuments({ rideId });
      const remaining = Math.max(0, MAX_RIDE_PHOTOS - existingCount);

      if (remaining <= 0) {
        return res.status(400).json({ message: 'Photo limit reached for this ride' });
      }

      const filesToSave = req.files.slice(0, remaining);

      const created = await RidePhoto.insertMany(
        filesToSave.map((file) => ({
          rideId,
          uploadedBy,
          imageUrl: file.path
        }))
      );

      await createNotification({
        username: ride.username,
        title: '📸 Trip Memories Uploaded',
        message: `${uploadedBy} uploaded ${created.length} photo(s) for ${ride.source} → ${ride.destination}.`,
        type: 'general'
      });

      res.status(201).json({ message: 'Photos uploaded', photos: created });
    } catch (e) {
      console.error('Upload photos error:', e);
      res.status(500).json({ message: 'Failed to upload photos' });
    }
  }
);

// GET: Fetch gallery for a ride
router.get('/:rideId/photos', async (req, res) => {
  try {
    const { rideId } = req.params;

    const photos = await RidePhoto.find({ rideId })
      .sort({ createdAt: -1 })
      .select('imageUrl uploadedBy createdAt');

    res.status(200).json({ photos });
  } catch (e) {
    console.error('Fetch photos error:', e);
    res.status(500).json({ message: 'Failed to fetch photos' });
  }
});

module.exports = router;

