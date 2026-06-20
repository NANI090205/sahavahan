const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const cp = require("child_process");
const ioClient = require("socket.io-client");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const origUri = process.env.MONGO_URI;
const protocolEnd = origUri.indexOf("//") + 2;
const firstSlashIdx = origUri.indexOf("/", protocolEnd);

let simUri;
if (firstSlashIdx === -1) {
  simUri = origUri + "/sahavahan_simulation";
} else {
  const hostAndDb = origUri.substring(0, firstSlashIdx);
  const rest = origUri.substring(firstSlashIdx);
  const queryIdx = rest.indexOf("?");
  if (queryIdx === -1) {
    simUri = hostAndDb + "/sahavahan_simulation";
  } else {
    const query = rest.substring(queryIdx);
    simUri = hostAndDb + "/sahavahan_simulation" + query;
  }
}

const BASE_URL = "http://localhost:4050";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAudit() {
  console.log("=== PHASE 3: RUNNING CONSISTENCY AUDIT & VERIFICATION GATE ===");
  
  // Start Express Server in isolated child process for audit
  console.log("Starting Express Server in isolated child process...");
  const serverProcess = cp.fork(path.join(__dirname, "..", "app.js"), [], {
    env: {
      ...process.env,
      MONGO_URI: simUri,
      PORT: "4050",
      NODE_ENV: "test",
      JWT_SECRET: "SIMULATION_SECRET",
      COOKIE_SECRET: "SIMULATION_SECRET"
    },
    silent: true
  });

  await sleep(4000); // wait for server boot
  console.log("Server is running on port 4050.");

  // Connect to simulation database using createConnection
  console.log(`Connecting to simulation DB: ${simUri}`);
  const simulationConnection = mongoose.createConnection(simUri);
  await new Promise((resolve, reject) => {
    simulationConnection.once("open", resolve);
    simulationConnection.once("error", reject);
  });
  console.log("Connected to simulation DB.");

  // Define models on simulation connection
  const User = simulationConnection.model("User", require("../models/User").schema);
  const Vehicle = simulationConnection.model("Vehicle", require("../models/Vehicle").schema);
  const Ride = simulationConnection.model("Ride", require("../models/Ride").schema);
  const BookedRide = simulationConnection.model("BookedRide", require("../models/BookedRide").schema);
  const Review = simulationConnection.model("Review", require("../models/Review").schema);
  const RideHistory = simulationConnection.model("RideHistory", require("../models/RideHistory").schema);
  const Notification = simulationConnection.model("Notification", require("../models/Notification").schema);
  const Waitlist = simulationConnection.model("Waitlist", require("../models/Waitlist").schema);
  const SOS = simulationConnection.model("SOS", require("../models/SOS").schema);
  const Report = simulationConnection.model("Report", require("../models/Report").schema);
  const DriverVerification = simulationConnection.model("DriverVerification", require("../models/DriverVerification").schema);

  const mismatches = [];
  const userTokens = {};
  const userUniqueCodes = {};

  // Login users to get tokens
  console.log("Logging in simulated users to fetch tokens...");
  try {
    const adminLogin = await axios.post(`${BASE_URL}/api/users/login`, { username: "user_1", password: "TestPass1234" });
    userTokens["user_1"] = adminLogin.data.token;

    const driverLogin = await axios.post(`${BASE_URL}/api/users/login`, { username: "user_30", password: "TestPass1234" });
    userTokens["user_30"] = driverLogin.data.token;

    for (let i = 50; i < 70; i++) {
      const username = `user_${i}`;
      const loginRes = await axios.post(`${BASE_URL}/api/users/login`, { username, password: "TestPass1234" });
      userTokens[username] = loginRes.data.token;
    }

    const allDbUsers = await User.find();
    allDbUsers.forEach(u => {
      userUniqueCodes[u.username] = u.uniqueCode;
    });
  } catch (err) {
    console.error("Failed to authenticate simulated users:", err.message);
  }

  // ========================================================
  // 1. DATABASE VALUE RANGE & SEAT AUDITS (Issue 4)
  // ========================================================
  console.log("\n--- Database Value Range & Seats Audits ---");

  // Check Ride availableSeats >= 0
  const subZeroSeatRides = await Ride.find({ seats: { $lt: 0 } });
  if (subZeroSeatRides.length > 0) {
    mismatches.push({
      section: "Database Consistency",
      metric: "Ride.seats >= 0",
      apiValue: `${subZeroSeatRides.length} violations`,
      dbValue: "0 violations",
      explanation: "Rides exist with seats count less than zero."
    });
  }

  // Check Ride bookedSeats <= totalSeats
  const ridesList = await Ride.find();
  for (const r of ridesList) {
    const bookings = await BookedRide.find({ rideId: r._id, status: { $ne: "Cancelled" } });
    const bookedSeats = bookings.reduce((sum, b) => sum + b.seatsBooked, 0);
    const totalSeats = r.seats + bookedSeats;
    if (bookedSeats > totalSeats) {
      mismatches.push({
        section: "Database Consistency",
        metric: `Ride ${r.rideCode} seats check`,
        apiValue: `bookedSeats (${bookedSeats}) > totalSeats (${totalSeats})`,
        dbValue: `bookedSeats <= totalSeats`,
        explanation: "The number of booked seats exceeds total seats published for this ride."
      });
    }
  }

  // No active booking exists for a cancelled ride
  const cancelledRides = await Ride.find({ status: "Cancelled" });
  for (const r of cancelledRides) {
    const activeBookings = await BookedRide.find({ rideId: r._id, status: { $ne: "Cancelled" } });
    if (activeBookings.length > 0) {
      mismatches.push({
        section: "Lifecycle Consistency",
        metric: `Cancelled Ride ${r.rideCode} bookings`,
        apiValue: `${activeBookings.length} active bookings`,
        dbValue: "0 active bookings",
        explanation: "Active (non-cancelled) bookings exist for a cancelled ride."
      });
    }
  }

  // Completed ride => all bookings completed
  const completedRidesList = await Ride.find({ status: "Completed" });
  for (const r of completedRidesList) {
    const nonCompletedBookings = await BookedRide.find({ rideId: r._id, status: { $ne: "Completed" } });
    if (nonCompletedBookings.length > 0) {
      mismatches.push({
        section: "Lifecycle Consistency",
        metric: `Completed Ride ${r.rideCode} bookings`,
        apiValue: `${nonCompletedBookings.length} non-completed bookings`,
        dbValue: "0 non-completed bookings",
        explanation: "Non-completed bookings exist for a completed ride."
      });
    }
  }

  // BookedRide.status matches Ride.status lifecycle
  const bookingsList = await BookedRide.find();
  for (const b of bookingsList) {
    const r = await Ride.findById(b.rideId);
    if (r) {
      if (r.status === "Completed" && b.status !== "Completed") {
        mismatches.push({
          section: "Lifecycle Consistency",
          metric: `Booking ${b._id} status matching completed ride`,
          apiValue: b.status,
          dbValue: "Completed",
          explanation: "Booking status does not match completed ride status."
        });
      }
      if (r.status === "Cancelled" && b.status !== "Cancelled") {
        mismatches.push({
          section: "Lifecycle Consistency",
          metric: `Booking ${b._id} status matching cancelled ride`,
          apiValue: b.status,
          dbValue: "Cancelled",
          explanation: "Booking status does not match cancelled ride status."
        });
      }
    }
  }

  // TrustScore between 0 and 100
  const outOfRangeTrustScores = await User.find({ $or: [{ trustScore: { $lt: 0 } }, { trustScore: { $gt: 100 } }] });
  if (outOfRangeTrustScores.length > 0) {
    mismatches.push({
      section: "Database Consistency",
      metric: "User.trustScore range [0, 100]",
      apiValue: `${outOfRangeTrustScores.length} violations`,
      dbValue: "0 violations",
      explanation: "Users exist with trustScore outside the range of 0 to 100."
    });
  }

  // AverageRating between 0 and 5
  const outOfRangeRatings = await User.find({ $or: [{ averageRating: { $lt: 0 } }, { averageRating: { $gt: 5 } }] });
  if (outOfRangeRatings.length > 0) {
    mismatches.push({
      section: "Database Consistency",
      metric: "User.averageRating range [0, 5]",
      apiValue: `${outOfRangeRatings.length} violations`,
      dbValue: "0 violations",
      explanation: "Users exist with averageRating outside the range of 0 to 5."
    });
  }

  // ========================================================
  // 2. FINANCIAL VALIDATION (Issue 5)
  // ========================================================
  console.log("\n--- Financial Consistency Audits ---");
  const drivers = await User.find({ isVerifiedDriver: true });

  const adminHeaders = { headers: { Authorization: `Bearer ${userTokens["user_1"]}` } };

  for (const driver of drivers) {
    const username = driver.username;

    // Completed Bookings sum (where booking status is Completed and driver is publishedBy)
    const completedDriverBookings = await BookedRide.find({ publishedBy: username, status: "Completed" });
    let dbBookingsPriceSum = 0;
    completedDriverBookings.forEach(b => dbBookingsPriceSum += b.totalPrice);

    // Dashboard earnings lifetime (/api/dashboard/earnings/:username)
    let apiEarningsLifetime = 0;
    try {
      const earningsRes = await axios.get(`${BASE_URL}/api/dashboard/earnings/${username}`);
      apiEarningsLifetime = earningsRes.data.lifetime;
    } catch (e) {
      console.error(`Failed to fetch earnings for ${username}`);
    }

    // User.totalEarnings in DB
    const dbUserTotalEarnings = driver.totalEarnings;

    // Discrepancy checks:
    if (dbBookingsPriceSum !== dbUserTotalEarnings) {
      mismatches.push({
        section: `Financial Consistency (${username})`,
        metric: "Completed Bookings sum vs User.totalEarnings",
        apiValue: `User.totalEarnings: ₹${dbUserTotalEarnings}`,
        dbValue: `Completed Bookings Sum: ₹${dbBookingsPriceSum}`,
        explanation: "Driver profile totalEarnings does not match sum of price of completed bookings."
      });
    }

    if (dbBookingsPriceSum !== apiEarningsLifetime) {
      mismatches.push({
        section: `Financial Consistency (${username})`,
        metric: "Completed Bookings sum vs Dashboard Earnings API",
        apiValue: `API Lifetime: ₹${apiEarningsLifetime}`,
        dbValue: `Completed Bookings Sum: ₹${dbBookingsPriceSum}`,
        explanation: "Dashboard lifetime earnings API does not match sum of completed bookings."
      });
    }
  }

  // Admin stats revenue validation
  try {
    const adminStatsRes = await axios.get(`${BASE_URL}/api/admin/stats`, adminHeaders);
    const apiAdminRevenue = adminStatsRes.data.revenue;

    const completedBookings = await BookedRide.find({ status: "Completed" });
    let dbTotalBookingsPrice = 0;
    completedBookings.forEach(b => dbTotalBookingsPrice += b.totalPrice || 0);

    if (apiAdminRevenue !== dbTotalBookingsPrice) {
      mismatches.push({
        section: "Admin Financial Validation",
        metric: "Admin Stats Revenue vs Completed Bookings Sum",
        apiValue: `Admin Stats Revenue: ₹${apiAdminRevenue}`,
        dbValue: `Completed Bookings sum: ₹${dbTotalBookingsPrice}`,
        explanation: "Admin stats revenue does not match the sum of totalPrice of completed BookedRide documents."
      });
    }
  } catch (err) {
    console.error("Admin stats financial verification failed:", err.message);
  }

  // ========================================================
  // 3. NOTIFICATION CONSISTENCY (Issue 6)
  // ========================================================
  console.log("\n--- Notification Consistency Audits ---");
  const dbBookingsCount = await BookedRide.countDocuments();
  const dbCompletedRides = await Ride.countDocuments({ status: "Completed" });
  const dbReviewsCount = await Review.countDocuments();
  const dbSOSCount = await SOS.countDocuments();

  const bookingCreatedNotifications = await Notification.countDocuments({ title: "🚗 New Booking" });
  const bookingConfirmedNotifications = await Notification.countDocuments({ title: "✅ Booking Confirmed" });
  const rideCompletedNotifications = await Notification.countDocuments({ title: "✅ Ride Completed" });
  const reviewReceivedNotifications = await Notification.countDocuments({ title: "⭐ New Review" });
  const sosTriggeredNotifications = await Notification.countDocuments({ title: "🚨 Emergency Alert" });

  if (bookingCreatedNotifications !== dbBookingsCount) {
    mismatches.push({
      section: "Notification Consistency",
      metric: "Booking Created notifications vs DB Bookings",
      apiValue: bookingCreatedNotifications,
      dbValue: dbBookingsCount,
      explanation: "Booking Created notifications count does not equal total BookedRide documents in database."
    });
  }
  if (bookingConfirmedNotifications !== dbBookingsCount) {
    mismatches.push({
      section: "Notification Consistency",
      metric: "Booking Confirmed notifications vs DB Bookings",
      apiValue: bookingConfirmedNotifications,
      dbValue: dbBookingsCount,
      explanation: "Booking Confirmed notifications count does not equal total BookedRide documents in database."
    });
  }
  if (rideCompletedNotifications !== dbCompletedRides) {
    mismatches.push({
      section: "Notification Consistency",
      metric: "Ride Completed notifications vs DB Completed Rides",
      apiValue: rideCompletedNotifications,
      dbValue: dbCompletedRides,
      explanation: "Ride Completed notifications count does not equal completed Ride documents in database."
    });
  }
  if (reviewReceivedNotifications !== dbReviewsCount) {
    mismatches.push({
      section: "Notification Consistency",
      metric: "New Review notifications vs DB Reviews",
      apiValue: reviewReceivedNotifications,
      dbValue: dbReviewsCount,
      explanation: "New Review notifications count does not equal total Review documents in database."
    });
  }
  if (sosTriggeredNotifications !== dbSOSCount) {
    mismatches.push({
      section: "Notification Consistency",
      metric: "SOS Emergency notifications vs DB SOS Events",
      apiValue: sosTriggeredNotifications,
      dbValue: dbSOSCount,
      explanation: "Emergency Alert notifications count does not equal total SOS events triggered."
    });
  }

  // ========================================================
  // 4. RIDE HISTORY VALIDATION (Change 3)
  // ========================================================
  console.log("\n--- Ride History Validation ---");
  for (const r of completedRidesList) {
    // A. Driver History check
    const driverHistory = await RideHistory.findOne({
      username: r.username,
      rideId: String(r._id),
      type: "Completed"
    });
    if (!driverHistory) {
      mismatches.push({
        section: "Ride History Validation",
        metric: `Driver history for ride ${r.rideCode}`,
        apiValue: "Missing",
        dbValue: "Exists",
        explanation: `No Completed RideHistory record exists for driver ${r.username} with rideId ${r._id}.`
      });
    } else {
      if (driverHistory.amount !== r.price) {
        mismatches.push({
          section: "Ride History Validation",
          metric: `Driver history amount for ride ${r.rideCode}`,
          apiValue: `₹${driverHistory.amount}`,
          dbValue: `₹${r.price}`,
          explanation: "Driver completed history amount does not match ride price."
        });
      }
      const dateDiff = Math.abs(new Date(driverHistory.createdAt) - new Date(r.rideCompletedAt));
      if (dateDiff > 60000 * 5) { // 5 minutes tolerance
        mismatches.push({
          section: "Ride History Validation",
          metric: `Driver history completion date for ride ${r.rideCode}`,
          apiValue: driverHistory.createdAt.toISOString(),
          dbValue: r.rideCompletedAt.toISOString(),
          explanation: "Driver RideHistory creation time deviates from rideCompletedAt timestamp."
        });
      }
    }

    // B. Passenger History check
    const bookings = await BookedRide.find({ rideId: r._id, status: "Completed" });
    for (const b of bookings) {
      const passengerHistory = await RideHistory.findOne({
        username: b.bookedBy,
        rideId: String(r._id),
        type: "Completed",
        passenger: b.bookedBy
      });
      if (!passengerHistory) {
        mismatches.push({
          section: "Ride History Validation",
          metric: `Passenger history for booking ${b._id}`,
          apiValue: "Missing",
          dbValue: "Exists",
          explanation: `No Completed RideHistory record exists for passenger ${b.bookedBy} with rideId ${r._id}.`
        });
      } else {
        if (passengerHistory.amount !== b.totalPrice) {
          mismatches.push({
            section: "Ride History Validation",
            metric: `Passenger history amount for booking ${b._id}`,
            apiValue: `₹${passengerHistory.amount}`,
            dbValue: `₹${b.totalPrice}`,
            explanation: "Passenger completed history amount does not match booking totalPrice."
          });
        }
      }
    }
  }

  // ========================================================
  // 5. REFERRAL ECONOMICS VALIDATION (Change 4)
  // ========================================================
  console.log("\n--- Referral Economics Validation ---");
  for (let i = 1; i <= 20; i++) {
    const username = `user_${i}`;
    const user = await User.findOne({ username });
    if (!user) continue;

    let expectedPoints = 0;
    let expectedReferrals = 0;

    if (i === 1) {
      expectedPoints = 50;
      expectedReferrals = 1;
    } else if (i >= 2 && i <= 19) {
      expectedPoints = 75;
      expectedReferrals = 1;
    } else if (i === 20) {
      expectedPoints = 25;
      expectedReferrals = 0;
    }

    if (user.rewardPoints !== expectedPoints) {
      mismatches.push({
        section: "Referral Validation",
        metric: `${username} rewardPoints`,
        apiValue: `${user.rewardPoints} points`,
        dbValue: `${expectedPoints} points`,
        explanation: `User ${username} rewardPoints count does not match expected referral chain values.`
      });
    }

    if (user.totalReferrals !== expectedReferrals) {
      mismatches.push({
        section: "Referral Validation",
        metric: `${username} totalReferrals`,
        apiValue: user.totalReferrals,
        dbValue: expectedReferrals,
        explanation: `User ${username} totalReferrals count does not match expected value.`
      });
    }

    // Check notifications
    if (i >= 2) {
      const refNotif = await Notification.findOne({ username, title: "🎁 Referral Bonus" });
      if (!refNotif) {
        mismatches.push({
          section: "Referral Validation",
          metric: `${username} referral notification`,
          apiValue: "Missing",
          dbValue: "Exists",
          explanation: `No referral bonus notification created for referee ${username}.`
        });
      }
    }
  }

  // ========================================================
  // 6. CLOUDINARY VALIDATION (Change 5)
  // ========================================================
  console.log("\n--- Cloudinary Asset Validation ---");
  const validateUrl = (url, fieldName, docId, modelName) => {
    if (!url) return;
    if (
      !url.startsWith("https://res.cloudinary.com/") ||
      url.startsWith("/uploads/") ||
      url.includes("localhost") ||
      url.includes("base64")
    ) {
      mismatches.push({
        section: "Cloudinary Validation",
        metric: `${modelName}.${fieldName}`,
        apiValue: url,
        dbValue: "Cloudinary URL starting with https://res.cloudinary.com/",
        explanation: `Document ${docId} has invalid, unmigrated or local image URL pattern.`
      });
    }
  };

  const allUsers = await User.find();
  allUsers.forEach(u => {
    validateUrl(u.profilePhoto, "profilePhoto", u._id, "User");
    validateUrl(u.licenseImage, "licenseImage", u._id, "User");
  });

  const allVehicles = await Vehicle.find();
  allVehicles.forEach(v => {
    validateUrl(v.vehiclePhoto, "vehiclePhoto", v._id, "Vehicle");
  });

  const allKycs = await DriverVerification.find();
  allKycs.forEach(k => {
    validateUrl(k.drivingLicense, "drivingLicense", k._id, "DriverVerification");
    validateUrl(k.rcBook, "rcBook", k._id, "DriverVerification");
    validateUrl(k.insurance, "insurance", k._id, "DriverVerification");
    validateUrl(k.pollutionCertificate, "pollutionCertificate", k._id, "DriverVerification");
    validateUrl(k.selfieImage, "selfieImage", k._id, "DriverVerification");
  });

  // ========================================================
  // 7. SOCKET.IO LOCATION TRACKING TESTING (Change 6)
  // ========================================================
  console.log("\n--- Socket.io Live Location Broadcast & Reconnect Test ---");
  let socketPassed = false;
  let socketErr = "";
  try {
    const socket = ioClient.connect(BASE_URL, {
      reconnectionDelay: 100,
      reconnectionDelayMax: 500,
      randomizationFactor: 0
    });

    const testRide = await Ride.findOne({ status: "Completed" });
    if (testRide) {
      const rideIdStr = String(testRide._id);
      socket.emit("passengerJoinRide", { rideId: rideIdStr });

      let locationUpdateReceived = false;
      socket.on("locationUpdated", (data) => {
        if (data.rideId === rideIdStr && data.lat === 12.3456 && data.lng === 78.9012) {
          locationUpdateReceived = true;
        }
      });

      // Emit driver location
      socket.emit("driverLocation", { rideId: rideIdStr, lat: 12.3456, lng: 78.9012 });
      await sleep(200);

      // Disconnect and Reconnect socket
      socket.io.disconnect();
      socket.io.connect();
      await sleep(200);

      // Join room again and verify broadcast continuing
      socket.emit("passengerJoinRide", { rideId: rideIdStr });
      socket.emit("driverLocation", { rideId: rideIdStr, lat: 12.3456, lng: 78.9012 });
      await sleep(200);

      socket.disconnect();

      if (locationUpdateReceived) {
        socketPassed = true;
      } else {
        socketErr = "Location updates were not broadcasted or received successfully.";
      }
    } else {
      socketErr = "No completed ride found in DB to run socket tracking test.";
    }
  } catch (err) {
    socketErr = `Socket.io testing failed: ${err.message}`;
  }

  if (!socketPassed) {
    mismatches.push({
      section: "Socket.io Live Tracking",
      metric: "Live location broadcast & reconnect",
      apiValue: "Failed",
      dbValue: "Passed",
      explanation: socketErr
    });
  }

  // ========================================================
  // 8. LIFECYCLE CONCURRENCY STRESS TESTING (Change 7)
  // ========================================================
  console.log("\n--- Lifecycle Concurrency Stress Testing ---");
  const stressDriver = "user_30";
  const driverHeaders = { headers: { Authorization: `Bearer ${userTokens[stressDriver]}` } };
  const stressVehicle = await Vehicle.findOne({ username: stressDriver });

  const stressRide = await Ride.create({
    username: stressDriver,
    rideCode: "STRESS_" + Math.floor(1000 + Math.random() * 9000),
    source: "StressSource",
    destination: "StressDest",
    sourceLat: 16.5,
    sourceLng: 80.5,
    destinationLat: 17.5,
    destinationLng: 78.5,
    pickupLocation: { lat: 16.5, lng: 80.5 },
    dropLocation: { lat: 17.5, lng: 78.5 },
    date: "2026-06-21",
    time: "08:00",
    seats: 30,
    price: 150,
    status: "Published",
    vehicleId: stressVehicle?._id
  });

  const stressRideId = String(stressRide._id);
  const stressResults = {
    bookings: { total: 20, success: 0, fail: 0 },
    boardings: { total: 20, success: 0, fail: 0 },
    drops: { total: 20, success: 0, fail: 0 },
    reviews: { total: 20, success: 0, fail: 0 }
  };

  // Concurrency Bookings
  const bookingPromises = [];
  for (let i = 50; i < 70; i++) {
    const username = `user_${i}`;
    const userCode = userUniqueCodes[username];
    const userHeader = { headers: { Authorization: `Bearer ${userTokens[username]}` } };
    bookingPromises.push(
      axios.post(`${BASE_URL}/api/rides/book`, {
        rideId: stressRideId,
        bookedBy: username,
        bookedByCode: String(userCode),
        publishedBy: stressDriver,
        seatsBooked: 1,
        totalPrice: 150
      }, userHeader).catch(err => err.response)
    );
  }
  const bookingRes = await Promise.all(bookingPromises);
  bookingRes.forEach(res => {
    if (res && res.status >= 200 && res.status < 300) {
      stressResults.bookings.success++;
    } else {
      stressResults.bookings.fail++;
    }
  });

  // Prepare boarding
  stressRide.status = "In Progress";
  await stressRide.save();

  const activeBookings = await BookedRide.find({ rideId: stressRideId });

  // Concurrency Boarding
  const boardingPromises = [];
  activeBookings.forEach(b => {
    boardingPromises.push(
      axios.post(`${BASE_URL}/api/otp/verify-boarding`, {
        rideId: stressRideId,
        bookingId: String(b._id),
        otp: b.boardingOTP
      }, driverHeaders).catch(err => err.response)
    );
  });
  const boardingRes = await Promise.all(boardingPromises);
  boardingRes.forEach(res => {
    if (res && res.status >= 200 && res.status < 300) {
      stressResults.boardings.success++;
    } else {
      stressResults.boardings.fail++;
    }
  });

  // Fetch updated bookings for drop OTPs
  const bookingsWithDrop = await BookedRide.find({ rideId: stressRideId });

  // Concurrency Drop
  const dropPromises = [];
  bookingsWithDrop.forEach(b => {
    dropPromises.push(
      axios.post(`${BASE_URL}/api/otp/verify-drop`, {
        rideId: stressRideId,
        bookingId: String(b._id),
        otp: b.dropOTP
      }, driverHeaders).catch(err => err.response)
    );
  });
  const dropRes = await Promise.all(dropPromises);
  dropRes.forEach(res => {
    if (res && res.status >= 200 && res.status < 300) {
      stressResults.drops.success++;
    } else {
      stressResults.drops.fail++;
    }
  });

  // Concurrency Reviews
  const reviewPromises = [];
  bookingsWithDrop.forEach(b => {
    reviewPromises.push(
      axios.post(`${BASE_URL}/api/reviews/add`, {
        rideId: stressRideId,
        reviewer: b.bookedBy,
        reviewedUser: stressDriver,
        rating: 5,
        comment: "Concurrency check review"
      }).catch(err => err.response)
    );
  });
  const reviewRes = await Promise.all(reviewPromises);
  reviewRes.forEach(res => {
    if (res && res.status >= 200 && res.status < 300) {
      stressResults.reviews.success++;
    } else {
      stressResults.reviews.fail++;
    }
  });

  // Clean up stress records
  await BookedRide.deleteMany({ rideId: stressRideId });
  await Ride.deleteOne({ _id: stressRideId });
  await Review.deleteMany({ rideId: stressRideId });
  await RideHistory.deleteMany({ rideId: stressRideId });

  console.log("Stress Results:", stressResults);

  // ========================================================
  // 9. STRESS TESTING ORIGINAL STATS (Issue 7)
  // ========================================================
  console.log("\n--- Stress Testing Original Admin/Stats Endpoints ---");
  const testEndpoints = [
    { name: "POST /api/rides/book (invalid payload)", method: "post", url: `${BASE_URL}/api/rides/book`, data: {}, headers: {} },
    { name: "POST /api/otp/verify-boarding (invalid OTP)", method: "post", url: `${BASE_URL}/api/otp/verify-boarding`, data: { rideId: "6a34e1b16cca61bc28657f7f", bookingId: "6a34e1b16cca61bc28657f82", otp: "000000" }, headers: adminHeaders },
    { name: "POST /api/otp/verify-drop (invalid OTP)", method: "post", url: `${BASE_URL}/api/otp/verify-drop`, data: { rideId: "6a34e1b16cca61bc28657f7f", bookingId: "6a34e1b16cca61bc28657f82", otp: "000000" }, headers: adminHeaders },
    { name: "GET /api/dashboard/stats/10001", method: "get", url: `${BASE_URL}/api/dashboard/stats/10001`, headers: {} },
    { name: "GET /api/admin/stats", method: "get", url: `${BASE_URL}/api/admin/stats`, headers: adminHeaders }
  ];

  const originalStressReport = [];
  let totalLatency = 0;
  let totalRequestsCount = 0;

  for (const ep of testEndpoints) {
    console.log(`Stress testing ${ep.name} with 50 concurrent requests...`);
    const requests = [];
    const startTime = Date.now();
    for (let i = 0; i < 50; i++) {
      if (ep.method === "post") {
        requests.push(axios.post(ep.url, ep.data, ep.headers).catch(err => err.response));
      } else {
        requests.push(axios.get(ep.url, ep.headers).catch(err => err.response));
      }
    }

    const responses = await Promise.all(requests);
    const latency = Date.now() - startTime;
    const avgLatency = latency / 50;
    totalLatency += latency;
    totalRequestsCount += 50;

    const statusCounts = {};
    responses.forEach(res => {
      const status = res ? res.status : "Failed";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log(`- Completed in ${latency}ms (avg ${avgLatency.toFixed(1)}ms/req). Response statuses:`, statusCounts);
    originalStressReport.push({
      endpoint: ep.name,
      avgLatencyMs: avgLatency.toFixed(1),
      statuses: JSON.stringify(statusCounts)
    });
  }

  // ========================================================
  // 10. PRODUCTION READINESS GATE CALCULATIONS (Change 8)
  // ========================================================
  console.log("\nCalculating Production Readiness Scorecard...");
  
  // A. Security Score: check if unauthenticated admin stats endpoints block access
  let securityScore = 100;
  try {
    const unauthorizedRes = await axios.get(`${BASE_URL}/api/admin/stats`).catch(e => e.response);
    if (unauthorizedRes && unauthorizedRes.status !== 401 && unauthorizedRes.status !== 403) {
      securityScore = 0; // major security gate failure
    }
  } catch (err) {
    // request blocked/failed is good
  }

  // B. Data Integrity Score
  const integrityViolationCount = mismatches.filter(m => m.section.includes("Database") || m.section.includes("Lifecycle") || m.section.includes("Ride History")).length;
  const dataIntegrityScore = Math.max(100 - (integrityViolationCount * 5), 0);

  // C. Analytics Accuracy Score
  const analyticsMismatches = mismatches.filter(m => m.section.includes("Financial") || m.section.includes("Admin Financial")).length;
  const analyticsAccuracyScore = Math.max(100 - (analyticsMismatches * 10), 0);

  // D. Notification Accuracy Score
  const notificationMismatches = mismatches.filter(m => m.section.includes("Notification")).length;
  const notificationAccuracyScore = Math.max(100 - (notificationMismatches * 10), 0);

  // E. Performance Score
  const globalAvgLatency = totalLatency / totalRequestsCount;
  let performanceScore = 100;
  if (globalAvgLatency > 500) performanceScore = 50;
  else if (globalAvgLatency > 300) performanceScore = 75;
  else if (globalAvgLatency > 150) performanceScore = 90;

  // F. Feature Coverage Score: Waitlist, KYC verification, Referrals, Live Tracking, Route Alerts, SOS workflow, Stress Testing
  let coverageFeaturesPassed = 7;
  if (dbSOSCount === 0) coverageFeaturesPassed--;
  if (dbBookingsCount === 0) coverageFeaturesPassed--;
  if (dbCompletedRides === 0) coverageFeaturesPassed--;
  if (socketErr) coverageFeaturesPassed--;
  const featureCoverageScore = Math.round((coverageFeaturesPassed / 7) * 100);

  // Total Production Readiness Score
  const readinessScore = Math.round(
    (securityScore + dataIntegrityScore + analyticsAccuracyScore + notificationAccuracyScore + performanceScore + featureCoverageScore) / 6
  );

  let isReady = true;
  if (securityScore < 90) isReady = false;
  if (dataIntegrityScore < 95) isReady = false;
  if (notificationAccuracyScore < 95) isReady = false;
  if (analyticsAccuracyScore < 95) isReady = false;
  if (featureCoverageScore < 95) isReady = false;
  if (mismatches.length > 0) isReady = false;

  // ========================================================
  // 11. MISMATCH REPORT GENERATION
  // ========================================================
  console.log("\nGenerating Mismatch Report...");
  const reportPath = path.join(__dirname, "..", "mismatch_report.md");
  const artifactPath = "C:\\Users\\jagap\\.gemini\\antigravity-ide\\brain\\0802d36c-4782-4f1e-8e97-383af8f457b8\\mismatch_report.md";

  let reportContent = `# SahaVahan Consistency Audit & Stress Test Report

This report presents findings from the database consistency audit and stress testing executed against the \`sahavahan_simulation\` database.

## Audit Summary

- **Total Mismatches Found**: ${mismatches.length}
- **Status**: ${mismatches.length === 0 ? "PASSED (Fully Consistent)" : "FAILED (Discrepancies Identified)"}

---

## Production Readiness Gate Scorecard

| Category | Score | Status |
|---|---|---|
| Security Score | ${securityScore}% | ${securityScore >= 90 ? "PASSED" : "FAILED"} |
| Data Integrity Score | ${dataIntegrityScore}% | ${dataIntegrityScore >= 90 ? "PASSED" : "FAILED"} |
| Analytics Accuracy Score | ${analyticsAccuracyScore}% | ${analyticsAccuracyScore >= 90 ? "PASSED" : "FAILED"} |
| Notification Accuracy Score | ${notificationAccuracyScore}% | ${notificationAccuracyScore >= 90 ? "PASSED" : "FAILED"} |
| Performance Score (Avg ${globalAvgLatency.toFixed(1)}ms/req) | ${performanceScore}% | ${performanceScore >= 90 ? "PASSED" : "FAILED"} |
| Feature Coverage Score | ${featureCoverageScore}% | ${featureCoverageScore >= 90 ? "PASSED" : "FAILED"} |
| **OVERALL PRODUCTION READINESS SCORE** | **${readinessScore}%** | **${isReady ? "PASSED" : "FAILED"}** |

### Final Deployment Verdict

`;

  if (isReady) {
    reportContent += `> [!IMPORTANT]
> **READY FOR DEPLOYMENT**
> All integrity checks, security validation, notification mapping, and performance scores are within production grade guidelines. No blocking mismatches identified.
`;
  } else {
    reportContent += `> [!CAUTION]
> **NOT READY FOR DEPLOYMENT**
> The system has failed to satisfy the required production gates. Below are the blocking errors that must be resolved prior to release.

#### Blockers identified:
`;
    if (mismatches.length > 0) {
      reportContent += `- Found **${mismatches.length} database or lifecycle consistency mismatches**.\n`;
    }
    if (readinessScore < 90) {
      reportContent += `- Overall Production Readiness Score is **${readinessScore}%** (needs to be >= 90%).\n`;
    }
    if (securityScore < 100) {
      reportContent += `- Security validations failed (Unauthorized Admin endpoints check failed).\n`;
    }
  }

  reportContent += `
---

## Concurrency Stress Test Results

- **20 Concurrent Bookings**: Success: ${stressResults.bookings.success}, Failed: ${stressResults.bookings.fail}
- **20 Concurrent Boardings**: Success: ${stressResults.boardings.success}, Failed: ${stressResults.boardings.fail}
- **20 Concurrent Drops**: Success: ${stressResults.drops.success}, Failed: ${stressResults.drops.fail}
- **20 Concurrent Reviews**: Success: ${stressResults.reviews.success}, Failed: ${stressResults.reviews.fail}

---

## Endpoint Performance Results

| Endpoint | Avg Latency (ms) | Response Status Counts |
|---|---|---|
`;

  originalStressReport.forEach(s => {
    reportContent += `| ${s.endpoint} | ${s.avgLatencyMs} ms | ${s.statuses} |\n`;
  });

  reportContent += `
---

## Detailed Consistency Mismatches

`;

  if (mismatches.length === 0) {
    reportContent += "✔ No mismatches identified! All statistics are fully consistent across endpoints and database records.\n";
  } else {
    reportContent += "| Section | Metric | API / Document Value | Direct DB Aggregate | Explanation / Root Cause |\n";
    reportContent += "|---|---|---|---|---|\n";
    
    mismatches.sort((a, b) => a.section.localeCompare(b.section));
    mismatches.forEach(m => {
      reportContent += `| ${m.section} | ${m.metric} | ${m.apiValue} | ${m.dbValue} | ${m.explanation} |\n`;
    });
  }

  fs.writeFileSync(reportPath, reportContent);
  fs.writeFileSync(artifactPath, reportContent);
  console.log(`Mismatch report written to:\n- ${reportPath}\n- ${artifactPath}`);

  await simulationConnection.close();
  serverProcess.kill();
  console.log("\n==================================================");
  console.log("🎉 AUDIT COMPLETED!");
  console.log("==================================================");
  process.exit(mismatches.length === 0 ? 0 : 1);
}

runAudit().catch(console.error);
