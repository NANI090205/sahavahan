const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: String,
      required: true,
      trim: true
    },

    reportedUser: {
      type: String,
      required: true,
      trim: true
    },

    reason: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      default: "Pending",
      enum: ["Pending", "Resolved"]
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Report", reportSchema);

