const express = require("express");
const router = express.Router();

const BookedRide = require("../models/BookedRide");
const predictDemand = require("../utils/demandPrediction");

// GET: Demand prediction for a route
// Example: /api/prediction/Vijayawada/Hyderabad
router.get("/:source/:destination", async (req, res) => {
  try {
    const { source, destination } = req.params;

    if (!source || !destination) {
      return res.status(400).json({ message: "source and destination are required" });
    }

    const count = await BookedRide.countDocuments({
      source,
      destination,
    });

    const prediction = predictDemand(count);

    res.json({
      bookings: count,
      ...prediction,
    });
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({ message: "Demand prediction failed" });
  }
});

module.exports = router;

