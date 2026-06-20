require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const User = require('../models/User');
  const Vehicle = require('../models/Vehicle');
  const Ride = require('../models/Ride');
  const BookedRide = require('../models/BookedRide');
  const Review = require('../models/Review');
  const Waitlist = require('../models/Waitlist');

  const users = await User.find({});
  console.log(`\n--- USERS (${users.length}) ---`);
  users.forEach(u => {
    console.log(`- Username: ${u.username}, Email: ${u.email}, Role: ${u.role}, VerifiedDriver: ${u.isVerifiedDriver}, EmailVerified: ${u.isEmailVerified}, TrustScore: ${u.trustScore}, rewardPoints: ${u.rewardPoints}`);
  });

  const vehicles = await Vehicle.find({});
  console.log(`\n--- VEHICLES (${vehicles.length}) ---`);
  vehicles.forEach(v => {
    console.log(`- Driver: ${v.username}, Type: ${v.vehicleType}, Model: ${v.vehicleModel}, Number: ${v.vehicleNumber}, Color: ${v.vehicleColor}`);
  });

  const rides = await Ride.find({});
  console.log(`\n--- RIDES (${rides.length}) ---`);
  rides.forEach(r => {
    console.log(`- ID: ${r._id}, Driver: ${r.username}, Route: ${r.source} -> ${r.destination}, Status: ${r.status}`);
  });

  const bookings = await BookedRide.find({});
  console.log(`\n--- BOOKINGS (${bookings.length}) ---`);
  bookings.forEach(b => {
    console.log(`- ID: ${b._id}, RideId: ${b.rideId}, Passenger: ${b.bookedBy}, Status: ${b.status}, BoardingOTPVerified: ${b.otpVerified}, DropOTPVerified: ${b.dropOTPVerified}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
