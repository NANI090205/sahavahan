const mongoose = require("mongoose");

const favoriteRouteSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true
    },

    source: {
      type: String,
      required: true
    },

    destination: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "FavoriteRoute",
  favoriteRouteSchema
);
