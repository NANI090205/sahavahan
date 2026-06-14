const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema(
  {
    username: String,

    rideId: String,

    source: String,

    destination: String,

    message: String,

    // Live location
    latitude: {
      type: Number,
      required: false
    },

    longitude: {
      type: Number,
      required: false
    },

    status: {
      type: String,
      default: "Active",
      enum: ["Active", "Resolved"]
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SOS", sosSchema);

