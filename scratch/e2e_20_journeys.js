const axios = require("axios");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = "http://localhost:4040";

// Import Models
const User = require("../models/User");
const BookedRide = require("../models/BookedRide");

async function runJourney(index) {
  const ts = Date.now() + "_" + index;
  const driverUn = `drv_${ts}`;
  const driverEm = `drv_${ts}@test.com`;
  const passengerUn = `pax_${ts}`;
  const passengerEm = `pax_${ts}@test.com`;
  const password = "TestPass1234";

  console.log(`\n--- Starting Journey ${index} ---`);

  // 1. Signup Driver & Passenger
  const drvSignup = await axios.post(`${BASE_URL}/api/users/signup`, {
    username: driverUn,
    email: driverEm,
    phoneNumber: "+919876543001",
    password,
  });
  const drvUniqueCode = drvSignup.data.uniqueCode;

  const paxSignup = await axios.post(`${BASE_URL}/api/users/signup`, {
    username: passengerUn,
    email: passengerEm,
    phoneNumber: "+919876543002",
    password,
  });
  const paxUniqueCode = paxSignup.data.uniqueCode;

  // Fetch OTPs from DB
  const drvUser = await User.findOne({ email: driverEm });
  const paxUser = await User.findOne({ email: passengerEm });
  const drvOtp = drvUser.emailOtp;
  const paxOtp = paxUser.emailOtp;

  // 2. Verify Email
  await axios.post(`${BASE_URL}/api/users/verify-email`, { email: driverEm, otp: drvOtp });
  await axios.post(`${BASE_URL}/api/users/verify-email`, { email: passengerEm, otp: paxOtp });

  // 3. Login
  const drvLogin = await axios.post(`${BASE_URL}/api/users/login`, { username: driverUn, password });
  const drvToken = drvLogin.data.token;

  const paxLogin = await axios.post(`${BASE_URL}/api/users/login`, { username: passengerUn, password });
  const paxToken = paxLogin.data.token;

  // 4. Add Vehicle (required for publishing)
  const plateNum = `AP39AB${Math.floor(1000 + Math.random() * 9000)}`;
  const vehicle = await axios.post(`${BASE_URL}/api/vehicles/add`, {
    username: driverUn,
    vehicleType: "Car",
    vehicleModel: "Swift",
    vehicleNumber: plateNum,
    vehicleColor: "Blue",
    acAvailable: true,
  });

  const getVehicles = await axios.get(`${BASE_URL}/api/vehicles/${driverUn}`);
  const vehicleId = getVehicles.data[0]._id;

  // Approve driver verification via Admin (mock)
  await User.updateOne({ username: driverUn }, { isVerifiedDriver: true, verificationStatus: "Approved" });

  // 5. Publish Ride
  const rideDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const pubRide = await axios.post(`${BASE_URL}/api/rides/publish`, {
    username: driverUn,
    uniqueCode: String(drvUniqueCode),
    source: "Vijayawada",
    destination: "Hyderabad",
    sourceLat: 16.5062,
    sourceLng: 80.648,
    pickupLocation: { lat: 16.5062, lng: 80.648 },
    dropLocation: { lat: 17.385, lng: 78.4867 },
    date: rideDate,
    time: "08:00",
    seats: 4,
    price: 300,
    vehicleId,
    phoneNumber: "+919876543001",
  });
  const rideCode = pubRide.data.rideCode;

  // Fetch Ride ID
  const driverRides = await axios.get(`${BASE_URL}/api/rides/user/${drvUniqueCode}`);
  const rideId = driverRides.data[0]._id;

  // 6. Book Ride
  const bookRide = await axios.post(`${BASE_URL}/api/rides/book`, {
    rideId,
    bookedBy: passengerUn,
    bookedByCode: String(paxUniqueCode),
    publishedBy: driverUn,
    seatsBooked: 1,
    totalPrice: 300,
  });

  // Fetch Booking Details from DB
  const booking = await BookedRide.findOne({ rideId });
  const bookingId = booking._id;
  const boardOtp = booking.boardingOTP;
  const dropOtp = booking.dropOTP;

  const authHeaders = { headers: { Authorization: `Bearer ${drvToken}` } };

  // 7. Verify Boarding OTP
  await axios.post(
    `${BASE_URL}/api/rides/verify-boarding-otp`,
    { bookingId, otp: boardOtp, username: passengerUn },
    authHeaders
  );

  // 8. Start Ride
  await axios.put(`${BASE_URL}/api/rides/start/${rideId}`, { username: driverUn }, authHeaders);

  // 9. Verify Drop OTP
  await axios.post(
    `${BASE_URL}/api/rides/verify-drop-otp`,
    { bookingId, otp: dropOtp, username: passengerUn },
    authHeaders
  );

  // 10. Complete Ride
  await axios.put(`${BASE_URL}/api/rides/complete/${rideId}`, { username: driverUn }, authHeaders);

  // 11. Add Review
  await axios.post(`${BASE_URL}/api/reviews/add`, {
    rideId,
    reviewer: passengerUn,
    reviewedUser: driverUn,
    rating: 5,
    comment: "Awesome ride!",
  });

  console.log(`✔ Journey ${index} Completed Successfully! (Driver: ${driverUn}, Passenger: ${passengerUn})`);
}

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sahavahan");
  console.log("Connected to MongoDB.");

  const totalJourneys = 20;
  for (let i = 1; i <= totalJourneys; i++) {
    await runJourney(i);
  }

  await mongoose.disconnect();
  console.log("\n==================================================");
  console.log(`🎉 ALL ${totalJourneys} JOURNEYS COMPLETED SUCCESSFULLY!`);
  console.log("==================================================");
}

main().catch((err) => {
  console.error("E2E journey execution error:", err.message);
  if (err.response) {
    console.error("API response error data:", err.response.data);
  }
  process.exit(1);
});
