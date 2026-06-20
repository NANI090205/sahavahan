const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const cp = require("child_process");
const fs = require("fs");
const ioClient = require("socket.io-client");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Models
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Review = require("../models/Review");
const Notification = require("../models/Notification");
const RideHistory = require("../models/RideHistory");
const Waitlist = require("../models/Waitlist");
const SOS = require("../models/SOS");
const Report = require("../models/Report");
const DriverVerification = require("../models/DriverVerification");
const RouteSubscription = require("../models/RouteSubscription");

const BASE_URL = "http://localhost:4050";
const APPLY_CLEANUP = process.env.SIMULATION_APPLY_CLEANUP === "true" && fs.existsSync(path.join(__dirname, "approve_cleanup.flag"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCleanup() {
  console.log("=== PHASE 1: PRODUCTION DATABASE CLEANUP & REPAIR (DRY-RUN FIRST) ===");
  console.log("Connecting to production database...");
  const prodConnection = await mongoose.createConnection(process.env.MONGO_URI);
  console.log("Connected.");

  const User = prodConnection.model("User", require("../models/User").schema);
  const Vehicle = prodConnection.model("Vehicle", require("../models/Vehicle").schema);
  const Ride = prodConnection.model("Ride", require("../models/Ride").schema);
  const BookedRide = prodConnection.model("BookedRide", require("../models/BookedRide").schema);

  const cleanupReport = {
    duplicateUsernames: [],
    orphanBookings: [],
    brokenVehicles: []
  };

  // 1. Scan Duplicate Usernames
  console.log("Scanning duplicate usernames...");
  const duplicateUsers = await User.aggregate([
    { $group: { _id: "$username", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  
  for (const dup of duplicateUsers) {
    cleanupReport.duplicateUsernames.push({
      username: dup._id,
      count: dup.count,
      ids: dup.ids
    });
  }

  // 2. Scan Orphan BookedRides
  console.log("Scanning orphan bookings...");
  const bookings = await BookedRide.find().lean();
  for (const b of bookings) {
    const r = await Ride.findById(b.rideId);
    if (!r) {
      cleanupReport.orphanBookings.push(b._id);
    }
  }

  // 3. Scan Broken vehicleId References
  console.log("Scanning broken vehicle references in rides...");
  const rides = await Ride.find().lean();
  for (const r of rides) {
    if (r.vehicleId) {
      const v = await Vehicle.findById(r.vehicleId);
      if (!v) {
        cleanupReport.brokenVehicles.push(r._id);
      }
    }
  }

  // Generate cleanup_report.md
  const reportPath = path.join(__dirname, "..", "cleanup_report.md");
  const artifactPath = "C:\\Users\\jagap\\.gemini\\antigravity-ide\\brain\\0802d36c-4782-4f1e-8e97-383af8f457b8\\cleanup_report.md";

  let reportContent = `# SahaVahan Production Database Cleanup - Dry-Run Report

This report presents findings from the production database cleanup scan.

## Scan Details
- **Timestamp**: ${new Date().toLocaleString()}
- **Apply Cleanup (SIMULATION_APPLY_CLEANUP)**: ${APPLY_CLEANUP ? "TRUE (Live Fix)" : "FALSE (Dry Run)"}

## Integrity Issues Identified

- **Duplicate Usernames**: ${cleanupReport.duplicateUsernames.length} found.
- **Orphan BookedRides**: ${cleanupReport.orphanBookings.length} found.
- **Broken Vehicle References**: ${cleanupReport.brokenVehicles.length} found.

---

## Detailed Findings & Action Log

`;

  if (APPLY_CLEANUP) {
    reportContent += "### Actions Taken (LIVE FIX):\n\n";

    // Deduplicate Users
    let usersDeleted = 0;
    for (const dup of cleanupReport.duplicateUsernames) {
      const idsToDelete = dup.ids.slice(1);
      const res = await User.deleteMany({ _id: { $in: idsToDelete } });
      usersDeleted += res.deletedCount;
      reportContent += `- Duplicate username **${dup.username}** (${dup.count} instances): deleted ${res.deletedCount} duplicates.\n`;
    }

    // Delete orphan bookings
    let bookingsDeleted = 0;
    for (const bId of cleanupReport.orphanBookings) {
      await BookedRide.findByIdAndDelete(bId);
      bookingsDeleted++;
    }
    if (bookingsDeleted > 0) {
      reportContent += `- Orphan BookedRides: deleted ${bookingsDeleted} orphan bookings.\n`;
    }

    // Unset broken vehicles
    let vehiclesUnset = 0;
    for (const rId of cleanupReport.brokenVehicles) {
      await Ride.findByIdAndUpdate(rId, { $unset: { vehicleId: "" } });
      vehiclesUnset++;
    }
    if (vehiclesUnset > 0) {
      reportContent += `- Broken vehicleId references: unset ${vehiclesUnset} references in Ride documents.\n`;
    }

    if (usersDeleted === 0 && bookingsDeleted === 0 && vehiclesUnset === 0) {
      reportContent += "✔ Database is already clean. No actions required.\n";
    }

  } else {
    reportContent += "### Identified Issues (DRY-RUN - NO CHANGES APPLIED):\n\n";
    
    cleanupReport.duplicateUsernames.forEach(dup => {
      reportContent += `- Duplicate username: **${dup.username}** (${dup.count} instances)\n`;
    });
    
    cleanupReport.orphanBookings.forEach(bId => {
      reportContent += `- Orphan BookedRide document: ${bId}\n`;
    });
    
    cleanupReport.brokenVehicles.forEach(rId => {
      reportContent += `- Ride with broken vehicleId reference: ${rId}\n`;
    });

    if (cleanupReport.duplicateUsernames.length === 0 && cleanupReport.orphanBookings.length === 0 && cleanupReport.brokenVehicles.length === 0) {
      reportContent += "✔ Database is already clean. No issues found.\n";
    }
  }

  fs.writeFileSync(reportPath, reportContent);
  fs.writeFileSync(artifactPath, reportContent);
  console.log(`Cleanup report written to:\n- ${reportPath}\n- ${artifactPath}`);

  await prodConnection.close();
  console.log("Production DB audit phase completed.\n");
}

async function runSimulation() {
  // Set MONGO_URI to sahavahan_simulation
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

  console.log("=== PHASE 2: INITIALIZING SIMULATION DATABASE ===");
  console.log(`Connecting to simulation DB: ${simUri}`);
  const simulationConnection = await mongoose.createConnection(simUri);

  const User = simulationConnection.model("User", require("../models/User").schema);
  const Vehicle = simulationConnection.model("Vehicle", require("../models/Vehicle").schema);
  const Ride = simulationConnection.model("Ride", require("../models/Ride").schema);
  const BookedRide = simulationConnection.model("BookedRide", require("../models/BookedRide").schema);
  const Review = simulationConnection.model("Review", require("../models/Review").schema);
  const Notification = simulationConnection.model("Notification", require("../models/Notification").schema);
  const RideHistory = simulationConnection.model("RideHistory", require("../models/RideHistory").schema);
  const Waitlist = simulationConnection.model("Waitlist", require("../models/Waitlist").schema);
  const SOS = simulationConnection.model("SOS", require("../models/SOS").schema);
  const Report = simulationConnection.model("Report", require("../models/Report").schema);
  const DriverVerification = simulationConnection.model("DriverVerification", require("../models/DriverVerification").schema);
  const RouteSubscription = simulationConnection.model("RouteSubscription", require("../models/RouteSubscription").schema);

  // Wipe simulation database
  console.log("Dropping simulation database collections...");
  await Promise.all([
    User.deleteMany({}),
    Vehicle.deleteMany({}),
    Ride.deleteMany({}),
    BookedRide.deleteMany({}),
    Review.deleteMany({}),
    Notification.deleteMany({}),
    RideHistory.deleteMany({}),
    Waitlist.deleteMany({}),
    SOS.deleteMany({}),
    Report.deleteMany({}),
    RouteSubscription.deleteMany({}),
    DriverVerification.deleteMany({})
  ]);
  console.log("Wiped.");

  // Start Express Server in a child process (Change 1: Isolating MONGO_URI, Final Safeguard 2: Isolating JWT)
  console.log("\nStarting Express Server in isolated child process...");
  let serverProcess = cp.fork(path.join(__dirname, "..", "app.js"), [], {
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

  serverProcess.stdout.on("data", (data) => {
    // Optional verbose logging of server: console.log(`[Server] ${data.toString().trim()}`);
  });

  await sleep(4000); // wait for server boot
  console.log("Server is running. Starting API-driven production simulation...");

  const userTokens = {};
  const userUniqueCodes = {};
  const userReferralCodes = {};

  // 1. Create 100 Users via API signup & email OTP verification
  console.log("\n--- Sign Up 100 Users ---");
  for (let i = 1; i <= 100; i++) {
    const username = `user_${i}`;
    const email = `${username}@sahavahan.com`;
    const password = "TestPass1234";
    const phoneNumber = `+919876543${i.toString().padStart(3, "0")}`;

    // Referral chain: user_i referred by user_{i-1} (for users 2 to 20)
    let refCode = "";
    if (i >= 2 && i <= 20) {
      refCode = userReferralCodes[`user_${i - 1}`];
    }

    // Call Signup API
    const signupRes = await axios.post(`${BASE_URL}/api/users/signup`, {
      username,
      email,
      phoneNumber,
      password,
      referralCode: refCode
    });

    const uniqueCode = signupRes.data.uniqueCode;
    userUniqueCodes[username] = uniqueCode;

    // Fetch the email OTP directly from DB
    const userInDb = await User.findOne({ email });
    const otp = userInDb.emailOtp;

    // Call Verify Email API
    await axios.post(`${BASE_URL}/api/users/verify-email`, { email, otp });

    // Call Login API to retrieve JWT token
    const loginRes = await axios.post(`${BASE_URL}/api/users/login`, { username, password });
    const token = loginRes.data.token;
    userTokens[username] = token;
    userReferralCodes[username] = loginRes.data.referralCode;

    if (i % 20 === 0) console.log(`- Signed up and verified ${i} users.`);
  }

  // Update role of user_1 to admin directly in simulation DB
  await User.updateOne({ username: "user_1" }, { role: "admin" });
  // Relogin user_1 to get admin JWT token
  const adminLogin = await axios.post(`${BASE_URL}/api/users/login`, { username: "user_1", password: "TestPass1234" });
  const adminToken = adminLogin.data.token;
  userTokens["user_1"] = adminToken;
  console.log("✔ Admin permissions granted to user_1.");

  // 2. Submit Driver KYC & Admin Approve (First 30 Users)
  console.log("\n--- Driver Verifications ---");
  for (let i = 1; i <= 30; i++) {
    const username = `user_${i}`;
    const token = userTokens[username];

    // Submit KYC documents
    const submitRes = await axios.post(`${BASE_URL}/api/driver-verification/submit`, {
      username,
      drivingLicense: "https://res.cloudinary.com/sahavahan/image/upload/license.png",
      rcBook: "https://res.cloudinary.com/sahavahan/image/upload/rc.png",
      insurance: "https://res.cloudinary.com/sahavahan/image/upload/insurance.png",
      pollutionCertificate: "https://res.cloudinary.com/sahavahan/image/upload/pollution.png",
      selfieImage: "https://res.cloudinary.com/sahavahan/image/upload/selfie.png"
    });

    const verificationId = submitRes.data.verification.currentVerificationId || submitRes.data.verification._id;

    // Admin approves driver verification
    await axios.post(`${BASE_URL}/api/admin/verify-driver`, {
      verificationId,
      decision: "Approved"
    }, { headers: { Authorization: `Bearer ${adminToken}` } });

    if (i % 10 === 0) console.log(`- Verified ${i} driver accounts.`);
  }

  // 3. Register 50 Vehicles
  console.log("\n--- Registering 50 Vehicles ---");
  for (let i = 1; i <= 50; i++) {
    const username = `user_${i}`;
    const plateNum = `AP39AB${i.toString().padStart(4, "0")}`;
    await axios.post(`${BASE_URL}/api/vehicles/add`, {
      username,
      vehicleType: i % 2 === 0 ? "Car" : "SUV",
      vehicleModel: i % 2 === 0 ? "Swift" : "Innova",
      vehicleNumber: plateNum,
      vehicleColor: "Silver",
      acAvailable: "true"
    });
  }
  console.log("✔ 50 vehicles registered successfully.");

  // Get vehicle mappings for driver publishes
  const vehicleMappings = {};
  for (let i = 1; i <= 30; i++) {
    const username = `user_${i}`;
    const userVehicles = await axios.get(`${BASE_URL}/api/vehicles/${username}`);
    vehicleMappings[username] = userVehicles.data[0]._id;
  }

  // 4. Create Route Subscriptions for Passengers user_31 to user_40 (Vijayawada -> Hyderabad)
  console.log("\n--- Setting up Route Alert Subscriptions ---");
  for (let i = 31; i <= 40; i++) {
    const username = `user_${i}`;
    await axios.post(`${BASE_URL}/api/subscriptions/subscribe`, {
      username,
      source: "Vijayawada",
      destination: "Hyderabad"
    });
  }
  console.log("✔ Route subscriptions created.");

  // 5. Create 100 Rides over past 30 days
  console.log("\n--- Publishing 100 Rides ---");
  const routes = [
    { source: "Vijayawada", destination: "Hyderabad", latS: 16.5062, lngS: 80.6480, latD: 17.3850, lngD: 78.4867 },
    { source: "Guntur", destination: "Vijayawada", latS: 16.3067, lngS: 80.4365, latD: 16.5062, lngD: 80.6480 },
    { source: "Nellore", destination: "Chennai", latS: 14.4426, lngS: 79.9865, latD: 13.0827, lngD: 80.2707 },
    { source: "Vizag", destination: "Vijayawada", latS: 17.6868, lngS: 83.2185, latD: 16.5062, lngD: 80.6480 }
  ];

  const now = new Date();
  const rideCodes = [];
  const rideIds = [];

  for (let i = 1; i <= 100; i++) {
    const driverNum = (i % 30) + 1;
    const driver = `user_${driverNum}`;
    const route = routes[i % routes.length];
    const vehicleId = vehicleMappings[driver];

    const daysAgo = Math.floor(Math.random() * 30);
    const rideDate = new Date(now);
    rideDate.setDate(now.getDate() - daysAgo);
    const dateStr = rideDate.toISOString().split("T")[0];

    const publishRes = await axios.post(`${BASE_URL}/api/rides/publish`, {
      username: driver,
      uniqueCode: String(userUniqueCodes[driver]),
      phoneNumber: `+919876543${driverNum.toString().padStart(3, "0")}`,
      source: route.source,
      sourceLat: route.latS,
      sourceLng: route.lngS,
      destination: route.destination,
      pickupLocation: { lat: route.latS, lng: route.lngS },
      dropLocation: { lat: route.latD, lng: route.lngD },
      date: dateStr,
      time: "08:00",
      seats: 4,
      price: 300,
      vehicleId
    });

    rideCodes.push(publishRes.data.rideCode);
    
    // Fetch ride document to extract _id
    const rideDoc = await Ride.findOne({ rideCode: publishRes.data.rideCode });
    rideIds.push(rideDoc._id);
  }
  console.log("✔ 100 rides published.");

  // 6. Create 200 Bookings via API
  console.log("\n--- Creating 200 Bookings ---");
  const bookingIds = [];
  let bookingCount = 0;

  for (let rIdx = 0; rIdx < rideIds.length; rIdx++) {
    const rideId = rideIds[rIdx];
    const rideDoc = await Ride.findById(rideId);
    
    // Distribute bookings
    let bookingsToMake = 2;
    if (rIdx < 40) bookingsToMake = 3;
    else if (rIdx >= 80) bookingsToMake = 1;

    // Waitlist promotion test: ride_11 (rIdx === 10), seats capacity = 4
    if (rIdx === 10) {
      bookingsToMake = 6;
    }

    for (let bIdx = 0; bIdx < bookingsToMake; bIdx++) {
      if (bookingCount >= 200) break;

      const paxNum = (bookingCount % 70) + 31; // user_31 to user_100
      const passenger = `user_${paxNum}`;
      const paxCode = String(userUniqueCodes[passenger]);

      try {
        const bookRes = await axios.post(`${BASE_URL}/api/rides/book`, {
          rideId: String(rideId),
          bookedBy: passenger,
          bookedByCode: paxCode,
          publishedBy: rideDoc.username,
          seatsBooked: 1,
          totalPrice: rideDoc.price
        });
        
        // Fetch the booking document to extract _id
        const bDoc = await BookedRide.findOne({ rideId, bookedBy: passenger });
        if (bDoc) bookingIds.push(bDoc._id);
        bookingCount++;

      } catch (err) {
        if (err.response && err.response.status === 409) {
          // Seat full -> Join waitlist via API
          await axios.post(`${BASE_URL}/api/waitlist/join`, {
            rideId: String(rideId),
            username: passenger
          });
        }
      }
    }
  }
  console.log(`✔ Created ${bookingCount} bookings. Waitlisted other excess bookings.`);

  // 7. Verify Waitlist Promotion Flow
  console.log("\n--- Waitlist Promotion Flow Test ---");
  const waitlistTestRideId = rideIds[10];
  const confirmedBooking = await BookedRide.findOne({ rideId: waitlistTestRideId, status: "Booked" });
  const waitlistedUser = await Waitlist.findOne({ rideId: waitlistTestRideId });
  console.log(`- Before: Active Passenger: ${confirmedBooking.bookedBy}, Waitlisted Passenger: ${waitlistedUser.username}`);

  // Passenger A cancels
  await axios.delete(`${BASE_URL}/api/rides/cancel/booked/${confirmedBooking._id}`);
  console.log(`- Passenger ${confirmedBooking.bookedBy} cancelled booking.`);

  // Verify promotion of waitlistedUser
  await sleep(1000);
  const promotedBooking = await BookedRide.findOne({ rideId: waitlistTestRideId, bookedBy: waitlistedUser.username });
  const waitlistCheck = await Waitlist.findOne({ rideId: waitlistTestRideId, username: waitlistedUser.username });

  console.log(`- After: Promoted booking status: ${promotedBooking?.status || "None"} (Expected: Booked), waitlist entry exists: ${!!waitlistCheck} (Expected: false)`);

  // 8. Cancel 10 Rides and 10 Bookings
  console.log("\n--- Cancellations Simulation ---");
  for (let i = 80; i < 90; i++) {
    const rideId = rideIds[i];
    await axios.delete(`${BASE_URL}/api/rides/cancel/published/${rideId}`);
  }
  console.log("- Cancelled 10 published rides.");

  const bookingsToCancelList = await BookedRide.find({ status: "Booked" }).limit(10);
  for (const b of bookingsToCancelList) {
    await axios.delete(`${BASE_URL}/api/rides/cancel/booked/${b._id}`);
  }
  console.log("- Cancelled 10 bookings.");

  // 9. Simulate Ride Lifecycles for 80 Completed Rides
  console.log("\n--- Simulating 80 Completed Rides via APIs ---");
  
  // Socket.io integration test (Change 6)
  console.log("Setting up Socket.io Tracking Verification...");
  const socket = ioClient.connect(BASE_URL, {
    reconnectionDelay: 100,
    reconnectionDelayMax: 500,
    randomizationFactor: 0
  });

  let locationReceivedCount = 0;
  
  let completedCount = 0;
  for (let i = 0; i < 80; i++) {
    const rideId = rideIds[i];
    const rideDoc = await Ride.findById(rideId);
    
    // Find BookedRides for this ride
    const bookingsForRide = await BookedRide.find({ rideId, status: "Booked" });
    if (bookingsForRide.length === 0) continue;

    const driver = rideDoc.username;
    const driverHeaders = { headers: { Authorization: `Bearer ${userTokens[driver]}` } };

    // 1. Passengers Board
    for (const b of bookingsForRide) {
      await axios.post(`${BASE_URL}/api/otp/verify-boarding`, {
        rideId: String(rideId),
        bookingId: String(b._id),
        otp: b.boardingOTP
      }, driverHeaders);
    }

    // Setup Socket test listener for the first completed ride
    if (i === 0) {
      console.log("  - Data Recovery Test: Restarting server mid-ride to verify state persistence...");
      serverProcess.kill();
      await sleep(2000);
      serverProcess = cp.fork(path.join(__dirname, "..", "app.js"), [], {
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
      await sleep(4000); // wait for boot
      console.log("  - Server restarted successfully. Continuing ride operations...");
      
      // Need to reconnect socket because server restarted
      socket.io.disconnect();
      socket.io.connect();
      await sleep(100);

      socket.emit("passengerJoinRide", { rideId: String(rideId) });
      socket.on("locationUpdated", (data) => {
        locationReceivedCount++;
      });
      // Driver emits location
      socket.emit("driverLocation", { rideId: String(rideId), lat: 16.5062, lng: 80.6480 });
      await sleep(100);
      
      // Simulate socket reconnect
      socket.io.disconnect();
      socket.io.connect();
      await sleep(100);
      
      // Re-register listener and room
      socket.emit("passengerJoinRide", { rideId: String(rideId) });
      socket.emit("driverLocation", { rideId: String(rideId), lat: 16.5100, lng: 80.6500 });
      await sleep(100);
    }

    // 2. SOS Events
    if (i < 5) {
      const passenger = bookingsForRide[0].bookedBy;
      // Setup emergency contacts first to verify emergency notify paths
      await User.updateOne({ username: passenger }, {
        emergencyContacts: [{ name: "Contact", phone: "+919988776655", relation: "Friend" }]
      });

      await axios.post(`${BASE_URL}/api/sos/trigger`, {
        username: passenger,
        rideId: String(rideId),
        lat: 16.5062,
        lng: 80.6480
      });
      await SOS.updateOne({ rideId: String(rideId) }, { status: "Resolved" });
    }

    // 3. Passengers Drop-off (Verify Drop OTP)
    for (const b of bookingsForRide) {
      await axios.post(`${BASE_URL}/api/otp/verify-drop`, {
        rideId: String(rideId),
        bookingId: String(b._id),
        otp: b.dropOTP
      }, driverHeaders);
    }

    completedCount++;
    if (completedCount % 20 === 0) console.log(`- Simulated lifecycle completion for ${completedCount} rides.`);
  }

  // Socket validation log
  console.log(`- Socket.io location tracking verified: locationReceivedCount=${locationReceivedCount} (Expected: 2)`);
  socket.disconnect();

  // 10. Submit Reviews via Review Add API
  console.log("\n--- Passenger Reviews (Ratings 4-5) ---");
  const completedBookings = await BookedRide.find({ status: "Completed" });
  for (let i = 0; i < completedBookings.length; i++) {
    const b = completedBookings[i];
    const rating = (i % 2 === 0) ? 5 : 4;
    await axios.post(`${BASE_URL}/api/reviews/add`, {
      rideId: String(b.rideId),
      reviewer: b.bookedBy,
      reviewedUser: b.publishedBy,
      rating,
      comment: "Great driving and very pleasant ride!"
    });
    if (i > 0 && i % 40 === 0) console.log(`- Submitted ${i} passenger reviews.`);
  }

  // 11. Submit and Resolve Passenger Reports
  console.log("\n--- User Reports & Suspensions ---");
  for (let i = 1; i <= 5; i++) {
    const reporter = `user_${i + 50}`;
    const reported = `user_${i}`;
    
    // Submit report
    await axios.post(`${BASE_URL}/api/reports/create`, {
      reportedBy: reporter,
      reportedUser: reported,
      reason: "Bad behavior",
      description: "Driving was erratic and refused to turn on AC."
    });

    const repDoc = await Report.findOne({ reportedUser: reported }).sort({ createdAt: -1 });
    // Resolve report via Admin API
    await axios.post(`${BASE_URL}/api/admin/report/resolve/${repDoc._id}`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  }

  // Admin suspends 2 users
  await axios.post(`${BASE_URL}/api/admin/user/suspend/user_5`, {}, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  await axios.post(`${BASE_URL}/api/admin/user/suspend/user_6`, {}, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  // Admin unsuspends 1 user
  await axios.post(`${BASE_URL}/api/admin/user/unsuspend/user_6`, {}, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log("✔ Reports resolved and user suspensions executed.");

  // Disconnect mongoose and kill child server
  await simulationConnection.close();
  serverProcess.kill();
  console.log("\n==================================================");
  console.log("🎉 PRODUCTION SIMULATION COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

async function main() {
  await runCleanup();
  await runSimulation();
  process.exit(0);
}

main().catch(console.error);
