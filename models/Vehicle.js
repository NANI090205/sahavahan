const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },

    vehicleType: {
      type: String,
      required: true,
    },

    vehicleModel: {
      type: String,
      required: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
    },

    vehicleColor: {
      type: String,
      required: true,
    },

    acAvailable: {
      type: Boolean,
      default: false,
    },

    vehiclePhoto: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);

