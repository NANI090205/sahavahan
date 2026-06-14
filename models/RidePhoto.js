const mongoose = require("mongoose");

const ridePhotoSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true
    },

    uploadedBy: {
      type: String,
      required: true
    },

    imageUrl: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("RidePhoto", ridePhotoSchema);

