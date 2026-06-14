const express = require("express");
const router = express.Router();

const RideHistory = require("../models/RideHistory");
const BookedRide = require("../models/BookedRide");
const Ride = require("../models/Ride");

const forecastRevenue = require("../utils/revenueForecast");

function monthKeyFromDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  // YYYY-MM for stable grouping
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

router.get("/test", (req, res) => {
  return res.json({ prediction: 10000 });
});

router.get("/:username", async (req, res) => {
  console.log("[forecast] hit username:", req.params.username);

  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ message: "username is required" });

    const completed = await RideHistory.find({
      username,
      type: "Completed"
    }).lean();

    const monthlyRevenueMap = {};
    const monthlyRideCountMap = {};

    completed.forEach((h) => {
      const key = monthKeyFromDate(h.createdAt || h.date);
      if (!key) return;
      monthlyRevenueMap[key] = (monthlyRevenueMap[key] || 0) + Number(h.amount || 0);
      monthlyRideCountMap[key] = (monthlyRideCountMap[key] || 0) + 1;
    });

    const months = Object.keys(monthlyRevenueMap).sort();
    const monthlyRevenue = months.map((k) => monthlyRevenueMap[k]);
    const prediction = forecastRevenue(monthlyRevenue);

    const expectedRides = months.length
      ? Math.round(
          monthlyRevenue
            .map((_, idx) => monthlyRideCountMap[months[idx]] || 0)
            .reduce((a, b) => a + b, 0) / months.length
        )
      : 0;

    // Expected passengers: best-effort
    // - fetch booked rides publishedBy=username
    // - group by booking date/month using linked ride.date (string)
    // - sum seatsBooked
    let expectedPassengers = 0;
    try {
      const bookings = await BookedRide.find({ publishedBy: username }).lean();

      if (bookings.length) {
        // Group passengers by month where possible
        const passengerByMonth = {};

        // We need ride.date from Ride model; do it in batches
        const rideIds = [...new Set(bookings.map((b) => String(b.rideId)).filter(Boolean))];
        const rides = await Ride.find({ _id: { $in: rideIds } }).select("date").lean();
        const rideDateById = {};
        rides.forEach((r) => {
          rideDateById[String(r._id)] = r.date;
        });

        bookings.forEach((b) => {
          const rid = String(b.rideId || "");
          const rideDate = rideDateById[rid];
          const key = monthKeyFromDate(rideDate);
          if (!key) return;
          passengerByMonth[key] = (passengerByMonth[key] || 0) + Number(b.seatsBooked || 0);
        });

        const passengerValues = Object.values(passengerByMonth);
        if (passengerValues.length) {
          expectedPassengers = Math.round(
            passengerValues.reduce((a, b) => a + (Number(b) || 0), 0) /
              passengerValues.length
          );
        }
      }
    } catch (e) {
      // fallback to 0
      expectedPassengers = 0;
    }

    res.json({
      monthlyRevenue: monthlyRevenueMap,
      prediction,
      expectedRides,
      expectedPassengers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed" });
  }
});

module.exports = router;

