const mongoose = require("mongoose");

const pickupPointSchema = new mongoose.Schema({
  city: {
    type: String,
    required: true,
  },

  name: {
    type: String,
    required: true,
    index: true,
  },

  latitude: {
    type: Number,
    required: false,
  },

  longitude: {
    type: Number,
    required: false,
  },
});

module.exports = mongoose.model("PickupPoint", pickupPointSchema);

