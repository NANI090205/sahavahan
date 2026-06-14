const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true
    },

    message: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: [
        "booking",
        "cancellation",
        "message",
        "ride_published",
        "review",
        "verification",
        "general",
        // Ride/OTP flow notification types
        "ride_started",
        "boarding_confirmed",
        "drop_confirmed",
        // These two are used by routes/otp.js
        "ride",
        "ride_completed"
      ],
      default: "general"
    },

    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
