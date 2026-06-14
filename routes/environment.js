const express = require("express");

const router = express.Router();

const User = require("../models/User");

router.get("/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const user = await User.findOne({ username }).lean();

    const co2Saved = Number(user?.co2Saved || 0);

    const fuelSaved = (co2Saved / 2.3);
    const trees = (co2Saved / 21);

    res.json({
      co2Saved,
      fuelSaved: Number(fuelSaved.toFixed(2)),
      trees: Math.round(trees),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load environment data" });
  }
});

module.exports = router;

