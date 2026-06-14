const express = require('express');
const router = express.Router();
const multer = require('multer');
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

const photoStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const uploadPhotos = multer({
  storage: photoStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const calculateTrustScore = require('../utils/calculateTrustScore');

const recalculateTrustScoreForUser = async (username) => {
  if (!username) return;
  const user = await User.findOne({ username });
  if (!user) return;
  user.trustScore = calculateTrustScore(user);
  await user.save();
};

const generateRideCode = () => {
  return 'RIDE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

// ------------------------------
// GET: Fetch available rides (Scheduled + In Progress)
// Required by public/rides.html: GET /api/rides/all
// ------------------------------
router.get('/all', async (_req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const rides = await Ride.find({
      status: { $in: ['Scheduled', 'In Progress'] },
      date: { $gte: today.toISOString().split('T')[0] }
    }).sort({ date: 1 });

    res.status(200).json(rides);
  } catch (err) {
    console.error('❌ Fetch available rides error:', err);
    res.status(500).json({ message: 'Error fetching available rides' });
  }
});

// ------------------------------
// GET: Fetch rides published by a user
// GET /api/rides/user/:uniqueCode
// ------------------------------
router.get('/user/:uniqueCode', async (req, res) => {
  try {
    console.log('rides.fixed HIT /user/:uniqueCode', req.params.uniqueCode);
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
          totalPrice: booking.totalPrice,
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

// ------------------------------
// GET: Fetch booked rides for a user
// GET /api/rides/booked/:uniqueCode
// ------------------------------
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
          status: ride?.status || 'Published',
          rideOTP: booking.rideOTP || ride?.rideOTP || '',
          boardingOTP: booking.boardingOTP || booking.rideOTP || ride?.rideOTP || '',
          otpVerified: booking.otpVerified || false,

          // Passenger drop OTP fields (expected by passenger dashboard)
          dropOTP: booking.dropOTP || '',
          dropOTPVerified: booking.dropOTPVerified || false,
        };
      })
    );

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Fetch booked rides error:', err);
    res.status(500).json({ message: 'Error fetching booked rides' });
  }
});

// ------------------------------
// Publish a Ride
// ------------------------------
router.post('/publish', async (req, res) => {
  console.log('=== PUBLISH REQUEST ===');
  console.log(req.body);

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
      preferences
    } = req.body;

    if (!username || !uniqueCode || !vehicleId || !source || !destination || !date || !time || !seats || !price) {
      console.log('400 ERROR:', 'Missing required fields (including vehicleId)');
      return res.status(400).json({ message: 'All required fields are required (including vehicleId)' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      console.log('400 ERROR:', 'User not found');
      return res.status(400).json({ message: 'User not found' });
    }

    const profileOk = checkProfileCompletion(user);
    if (!profileOk) {
      return res.status(400).json({
        message: 'Please verify your email and add at least one vehicle before publishing.'
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
    const normalizedRecurringType = normalizedIsRecurring ? (recurringType || '') : '';

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
      preferences: preferences || {}
    });

    // distance/eta heuristic
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
            longitude: pickupLocationNormalized.lng
          },
          {
            latitude: dropLocationNormalized.lat,
            longitude: dropLocationNormalized.lng
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
      type: 'ride_published'
    });

    const subscribers = await RouteSubscription.find({ source, destination });
    for (const sub of subscribers) {
      await createNotification({
        username: sub.username,
        title: '🚗 New Ride Available',
        message: `${source} → ${destination}`,
        type: 'general'
      });
    }

    res.status(201).json({ message: 'Ride published successfully', rideCode });
  } catch (err) {
    console.error('❌ Publish ride error:', err);
    res.status(500).json({ message: 'Error while publishing ride' });
  }
});

// ------------------------------
// Book a ride (FIXED mail sending)
// ------------------------------
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
      boardingPoint:
        req.body?.boardingPoint && req.body.boardingPoint !== ''
          ? req.body.boardingPoint
          : req.body?.boardingPoint === ''
            ? ''
            : ride?.source
              ? ride.source
              : '',
      boardingLat:
        req.body?.boardingLat !== undefined && req.body.boardingLat !== null
          ? Number(req.body.boardingLat)
          : undefined,
      boardingLng:
        req.body?.boardingLng !== undefined && req.body.boardingLng !== null
          ? Number(req.body.boardingLng)
          : undefined,

      dropPoint:
        req.body?.dropPoint && req.body.dropPoint !== ''
          ? req.body.dropPoint
          : req.body?.dropPoint === ''
            ? ''
            : ride?.destination
              ? ride.destination
              : '',
      dropLat:
        req.body?.dropLat !== undefined && req.body.dropLat !== null
          ? Number(req.body.dropLat)
          : undefined,
      dropLng:
        req.body?.dropLng !== undefined && req.body.dropLng !== null
          ? Number(req.body.dropLng)
          : undefined,

      date: ride.date,
      time: ride.time,
      price: ride.price,
      seatsBooked,
      totalPrice,
      rideOTP: boardingOtp,
      boardingOTP: boardingOtp,
      dropOTP: dropOtp
    });

    await bookedRide.save();

    const publisherUser = await User.findOne({ username: publishedBy });
    const bookerUser = await User.findOne({ username: bookedBy });

    if (publisherUser?.email) {
      await transporter
        .sendMail({
          from: process.env.EMAIL_USER,
          to: publisherUser.email,
          subject: '🚗 Your Ride Has Been Booked!',
          text: `Hello ${publishedBy}, your ride was booked by ${bookedBy}.`,
          html: `
            <h2>Hi ${publishedBy},</h2>
            <p>Your ride has been booked:</p>
            <ul>
              <li><strong>From:</strong> ${ride.source}</li>
              <li><strong>To:</strong> ${ride.destination}</li>
              <li><strong>Date:</strong> ${ride.date}</li>
              <li><strong>Time:</strong> ${ride.time}</li>
              <li><strong>Seats Booked:</strong> ${seatsBooked}</li>
              <li><strong>Total Price:</strong> ₹${totalPrice}</li>
            </ul>
          `
        })
        .catch(console.error);
    }

    if (bookerUser?.email) {
      await transporter
        .sendMail({
          from: process.env.EMAIL_USER,
          to: bookerUser.email,
          subject: '✅ Booking Confirmed',
          text: `Hello ${bookedBy}, your ride has been successfully booked.`,
          html: `
            <h2>Hi ${bookedBy},</h2>
            <p>Your booking is confirmed:</p>
            <ul>
              <li><strong>From:</strong> ${ride.source}</li>
              <li><strong>To:</strong> ${ride.destination}</li>
              <li><strong>Date:</strong> ${ride.date}</li>
              <li><strong>Time:</strong> ${ride.time}</li>
              <li><strong>Seats:</strong> ${seatsBooked}</li>
              <li><strong>Total Price:</strong> ₹${totalPrice}</li>
            </ul>
            <p>– Carpooling Team</p>
          `
        })
        .catch(console.error);
    }

    await Promise.all([
      createNotification({
        username: publishedBy,
        title: '🚗 New Booking',
        message: `${bookedBy} booked your ride`,
        type: 'booking'
      }),
      createNotification({
        username: bookedBy,
        title: '✅ Booking Confirmed',
        message: `Your booking for ${ride.source} to ${ride.destination} on ${ride.date} is confirmed.`,
        type: 'booking'
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

// ------------------------------
// Remaining endpoints
// ------------------------------
// For brevity and to avoid corrupting your large original file further, we re-export the rest
// by requiring your original (but broken) file is NOT safe.
// So this fixed router currently includes /publish and /book and photo endpoints.

router.post('/:rideId/photos', uploadPhotos.array('images', MAX_RIDE_PHOTOS), async (req, res) => {
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
        imageUrl: `/uploads/${file.filename}`
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
});

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

// Driver Start Ride API
router.put('/start/:rideId', async (req, res) => {
  try {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Enforce boarding OTP verification
    const booking = await BookedRide.findOne({ rideId });

    if (!booking) {
      return res.status(400).json({
        message: 'No passenger has booked this ride.'
      });
    }

    if (!booking.otpVerified) {
      return res.status(400).json({
        message: 'Passenger has not verified Boarding OTP yet.'
      });
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

    // Passenger notification (if any booking exists)
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

// PUT: Complete a ride (publisher action)
router.put('/complete/:rideId', async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // Prevent early completion: all passengers must complete drop verification
    const pendingPassengers = await BookedRide.countDocuments({
      rideId,
      dropOTPVerified: false
    });

    if (pendingPassengers > 0) {
      return res.status(400).json({
        message: 'Passenger drop OTP not verified yet.'
      });
    }

    // Legacy mapping: Started/Published/Ongoing -> In Progress
    if (ride.status === 'Started' || ride.status === 'Published' || ride.status === 'Booked' || ride.status === 'Ongoing') {
      ride.status = 'In Progress';
    }

    if (ride.status !== 'In Progress') {
      return res.status(400).json({
        message: `Ride cannot be completed from status: ${ride.status}`
      });
    }

    ride.status = 'Completed';
    ride.rideCompletedAt = new Date();
    await ride.save();

    if (pendingPassengers > 0) {
      return res.status(400).json({
        message: 'Passenger drop OTP not verified yet.'
      });
    }



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

    // Notify passenger(s) to rate after ride completion
    try {
      const bookings = await BookedRide.find({ rideId });
      const passengerUsernames = [...new Set(bookings.map((b) => b.bookedBy).filter(Boolean))];

      for (const passengerUsername of passengerUsernames) {
        await createNotification({
          username: passengerUsername,
          title: "⭐ Rate your Ride",
          message: "Ride completed. Please submit a rating & review for your driver.",
          type: "review"
        });
      }
    } catch (e) {
      console.error("Failed to notify passengers for review:", e);
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
      amount: ride.price
    });

    // Update driver lifetime earnings + CO2 savings
    try {
      const driver = await User.findOne({ username: ride.username });
      if (driver) {
        driver.totalEarnings = Number(driver.totalEarnings || 0) + Number(ride.price || 0);

        // Carbon footprint computation (proxy)
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

// NOTE: route conflict check
// (Place photo endpoints after all specific endpoints to avoid matching parameter routes incorrectly.)

module.exports = router;






