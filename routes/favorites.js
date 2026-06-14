const express = require("express");
const router = express.Router();

const FavoriteRoute = require("../models/FavoriteRoute");

router.post("/save", async (req, res) => {
  try {
    const {
      username,
      source,
      destination
    } = req.body;

    const exists = await FavoriteRoute.findOne({
      username,
      source,
      destination
    });

    if (exists) {
      return res.json({
        message: "Already Saved"
      });
    }

    await FavoriteRoute.create({
      username,
      source,
      destination
    });

    res.json({
      message: "Route Saved"
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed"
    });
  }
});

router.get("/:username", async (req, res) => {
  try {
    const routes = await FavoriteRoute.find({
      username: req.params.username
    });

    res.json(routes);
  } catch (error) {
    res.status(500).json({
      message: "Failed"
    });
  }
});

module.exports = router;
