/*
Seed script for PickupPoint collection.
Run:
  node scripts/seedPickupPoints.js

Requires env var:
  MONGO_URI
*/

require("dotenv").config();
const mongoose = require("mongoose");

const PickupPoint = require("../models/PickupPoint");

const points = [
  { city: "Vijayawada", name: "Benz Circle", latitude: null, longitude: null },
  { city: "Vijayawada", name: "Ramavarappadu Ring", latitude: null, longitude: null },
  { city: "Vijayawada", name: "PNBS Bus Stand", latitude: null, longitude: null },
  { city: "Vijayawada", name: "Railway Station", latitude: null, longitude: null },
  // Optional: If you later add more cities, append here.
];

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Upsert by (city,name)
  for (const p of points) {
    await PickupPoint.updateOne(
      { city: p.city, name: p.name },
      {
        $set: {
          city: p.city,
          name: p.name,
          latitude: p.latitude ?? undefined,
          longitude: p.longitude ?? undefined,
        },
      },
      { upsert: true }
    );
  }

  const count = await PickupPoint.countDocuments();
  console.log(`✅ Seed complete. Total pickup points: ${count}`);
}

main()
  .then(() => {
    mongoose.connection.close();
  })
  .catch((e) => {
    console.error("Seed failed:", e);
    mongoose.connection.close();
    process.exit(1);
  });

