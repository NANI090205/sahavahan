const express = require("express");
const router = express.Router();

const PickupPoint = require("../models/PickupPoint");

// GET: /api/pickup-points/:city
// Returns: ["PNBS Bus Stand", "Benz Circle", ...]
router.get("/:city", async (req, res) => {
  try {
    const city = req.params.city;
    if (!city) return res.status(400).json({ message: "City is required" });

    const points = await PickupPoint.find({ city })
      .sort({ name: 1 })
      .select("name latitude longitude -_id")
      .lean();

    // Backward-compatible response shape: just array of names
    const names = points.map((p) => p.name);
    res.json(names);
  } catch (err) {
    console.error("pickup points error:", err);
    res.status(500).json({ message: "Failed to load pickup points" });
  }
});

module.exports = router;

