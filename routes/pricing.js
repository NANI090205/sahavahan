const express = require("express");
const router = express.Router();

const BookedRide = require("../models/BookedRide");
const calculateDynamicPrice = require("../utils/dynamicPricing");

router.post("/suggest-price", async (req, res) => {
  try {
    const { source, destination, basePrice, availableSeats } = req.body;

    if (!source || !destination) {
      return res.status(400).json({ message: "source and destination are required" });
    }

    if (!Number.isFinite(Number(basePrice)) || Number(basePrice) <= 0) {
      return res.status(400).json({ message: "basePrice must be a positive number" });
    }

    if (!Number.isFinite(Number(availableSeats)) || Number(availableSeats) <= 0) {
      return res.status(400).json({ message: "availableSeats must be a positive number" });
    }

    const bookings = await BookedRide.countDocuments({
      source,
      destination,
    });

    let demandLevel = "Low";
    if (bookings >= 50) {
      demandLevel = "High";
    } else if (bookings >= 20) {
      demandLevel = "Medium";
    }

    const suggestedPrice = calculateDynamicPrice(
      Number(basePrice),
      demandLevel,
      Number(availableSeats)
    );

    res.json({ demandLevel, suggestedPrice });
  } catch (error) {
    console.error("pricing/suggest-price error:", error);
    res.status(500).json({ message: "Failed" });
  }
});

module.exports = router;

