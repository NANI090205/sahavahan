const mongoose = require("mongoose");

const rideHistorySchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: [
        "Completed",
        "Cancelled",
        "Published"
      ]
    },

    source: String,

    destination: String,

    date: String,

    amount: Number
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "RideHistory",
  rideHistorySchema
);
