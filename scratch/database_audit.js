const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Models
const User = require("../models/User");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Vehicle = require("../models/Vehicle");
const Review = require("../models/Review");
const Report = require("../models/Report");

async function main() {
  console.log("Connecting to MongoDB for DB Audit...");
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sahavahan");
  console.log("Connected.\n");

  console.log("==================================================");
  console.log("             SAHAVAHAN DATABASE AUDIT");
  console.log("==================================================");

  // 1. Check Collection Sizes
  const collections = ["users", "rides", "bookedrides", "vehicles", "reviews", "reports"];
  console.log("\n[Collection Sizes]");
  for (const collName of collections) {
    const count = await mongoose.connection.db.collection(collName).countDocuments();
    console.log(`- ${collName}: ${count} documents`);
  }

  // 2. Check Duplicate Users
  console.log("\n[Integrity: User Duplicates]");
  const duplicateUsers = await User.aggregate([
    { $group: { _id: "$username", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  if (duplicateUsers.length === 0) {
    console.log("✔ No duplicate usernames found.");
  } else {
    console.log(`⚠ Found ${duplicateUsers.length} duplicate usernames!`);
  }

  // 3. Check Duplicate Vehicles
  console.log("\n[Integrity: Vehicle Duplicates]");
  const duplicateVehicles = await Vehicle.aggregate([
    { $group: { _id: "$vehicleNumber", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  if (duplicateVehicles.length === 0) {
    console.log("✔ No duplicate vehicle numbers found.");
  } else {
    console.log(`⚠ Found ${duplicateVehicles.length} duplicate vehicle numbers!`);
  }

  // 4. Check Orphan Bookings & Rides
  console.log("\n[Integrity: Orphans & Broken References]");
  const bookings = await BookedRide.find().lean();
  let orphanBookings = 0;
  for (const b of bookings) {
    const r = await Ride.findById(b.rideId);
    if (!r) orphanBookings++;
  }
  console.log(`- Orphan BookedRides (pointing to non-existent Rides): ${orphanBookings}`);

  const rides = await Ride.find().lean();
  let orphanRides = 0;
  for (const r of rides) {
    if (r.vehicleId) {
      const v = await Vehicle.findById(r.vehicleId);
      if (!v) orphanRides++;
    }
  }
  console.log(`- Rides with broken vehicleId references: ${orphanRides}`);

  // 5. Index Audits
  console.log("\n[Index Verification]");
  const userIndexes = await mongoose.connection.db.collection("users").indexes();
  console.log(`- users collection has ${userIndexes.length} indexes:`, userIndexes.map(idx => Object.keys(idx.key).join(",")));

  const rideIndexes = await mongoose.connection.db.collection("rides").indexes();
  console.log(`- rides collection has ${rideIndexes.length} indexes:`, rideIndexes.map(idx => Object.keys(idx.key).join(",")));

  console.log("\n[Recommendations]");
  console.log("- Recommend unique index on User.email and User.username (Mongoose handles this but DB level enforcement is advised).");
  console.log("- Recommend compound index on Ride { source: 1, destination: 1 } to optimize search querying.");
  console.log("- Recommend index on BookedRide { rideId: 1 } to speed up boarding and completion verification lookups.");

  await mongoose.disconnect();
  console.log("\n==================================================");
  console.log("🎉 DATABASE AUDIT COMPLETED!");
  console.log("==================================================");
}

main().catch(console.error);
