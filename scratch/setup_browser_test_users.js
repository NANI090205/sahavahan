const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Ride = require('../models/Ride');
const BookedRide = require('../models/BookedRide');
const DriverVerification = require('../models/DriverVerification');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/carpooling';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected to seed browser test users.');

    const PASS_PW = 'TestPass1234';
    const hashedPassword = await bcrypt.hash(PASS_PW, 10);

    // Helper to setup a user safely
    const setupUser = async (username, email, uniqueCode, role) => {
      let u = await User.findOne({ username });
      if (u) {
        await User.deleteOne({ _id: u._id });
        console.log(`Deleted existing user: ${username}`);
      }
      
      const referralCode = username.toUpperCase() + uniqueCode;
      u = new User({
        username,
        email,
        password: hashedPassword,
        phoneNumber: '+91987654' + uniqueCode,
        isEmailVerified: true,
        role,
        uniqueCode,
        referralCode
      });
      await u.save({ validateBeforeSave: false });
      console.log(`Seeded user: ${username}`);
      return u;
    };

    // 1. Setup Admin
    await setupUser('admin_browser_test', 'admin_browser_test@test.com', 11111, 'admin');

    // 2. Setup Driver
    await setupUser('drv_browser_test', 'drv_browser_test@test.com', 22222, 'user');

    // Add Vehicle for Driver
    let vehicle = await Vehicle.findOne({ username: 'drv_browser_test' });
    if (vehicle) {
      await Vehicle.deleteOne({ _id: vehicle._id });
      console.log('Deleted existing vehicle for drv_browser_test');
    }
    
    vehicle = new Vehicle({
      username: 'drv_browser_test',
      vehicleType: 'Car',
      vehicleModel: 'Hyundai i20',
      vehicleNumber: 'AP39XY1234',
      vehicleColor: 'Red',
      acAvailable: true,
      vehiclePhoto: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    });
    await vehicle.save();
    console.log('Vehicle added for Driver.');

    // 3. Setup Passenger
    await setupUser('pax_browser_test', 'pax_browser_test@test.com', 33333, 'user');

    // Clean up any old rides/bookings/verifications for these test users to start fresh
    await Ride.deleteMany({ username: 'drv_browser_test' });
    await BookedRide.deleteMany({ bookedBy: 'pax_browser_test' });
    await DriverVerification.deleteMany({ username: 'drv_browser_test' });
    console.log('Cleaned up previous rides, bookings, and KYC verifications for browser test users.');

    console.log('--- SEEDING COMPLETED ---');
    console.log(`Admin    : admin_browser_test / ${PASS_PW}`);
    console.log(`Driver   : drv_browser_test / ${PASS_PW}`);
    console.log(`Passenger: pax_browser_test / ${PASS_PW}`);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

run();
