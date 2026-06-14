const mongoose = require("mongoose");

const routeSubscriptionSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      index: true
    },

    source: {
      type: String,
      required: true,
      index: true
    },

    destination: {
      type: String,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicates per user+route
routeSubscriptionSchema.index({ username: 1, source: 1, destination: 1 }, { unique: true });

module.exports = mongoose.model("RouteSubscription", routeSubscriptionSchema);

