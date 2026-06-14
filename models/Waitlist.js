const mongoose = require("mongoose");

const waitlistSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride"
    },

    username: {
      type: String,
      required: true,
      trim: true
    },

    // position in the waitlist (1 = first)
    position: {
      type: Number,
      required: true,
      min: 1
    }
  },
  {
    timestamps: true
  }
);

// Helpful index for retrieving earliest entries
waitlistSchema.index({ rideId: 1, position: 1 });

module.exports = mongoose.model("Waitlist", waitlistSchema);

