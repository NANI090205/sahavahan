const express = require("express");
const router = express.Router();

const { vehicleUpload } = require("../middleware/cloudinaryUpload");
const Vehicle = require("../models/Vehicle");

// POST: Add vehicle for a user
router.post("/add", vehicleUpload, async (req, res) => {
  try {
    const acRaw = req.body.acAvailable;
    const acAvailable =
      acRaw === true || acRaw === "true" || acRaw === "1" || acRaw === 1;

    const existingVehicle = await Vehicle.findOne({ vehicleNumber: req.body.vehicleNumber });
    if (existingVehicle) {
      return res.status(400).json({ message: "Vehicle number already registered" });
    }

    const vehicle = new Vehicle({
      username: req.body.username,
      vehicleType: req.body.vehicleType,
      vehicleModel: req.body.vehicleModel,
      vehicleNumber: req.body.vehicleNumber,
      vehicleColor: req.body.vehicleColor,
      acAvailable,
      vehiclePhoto: req.file ? req.file.path : "",
    });

    await vehicle.save();

    res.json({ message: "Vehicle Added Successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed To Add Vehicle" });
  }
});

// GET: Get vehicles by username
router.get("/:username", async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(vehicles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed To Fetch Vehicle" });
  }
});

module.exports = router;


