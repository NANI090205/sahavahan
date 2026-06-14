const mongoose = require("mongoose");

const driverVerificationSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true
    },

    // Canonical KYC fields (requested in task)
    drivingLicense: {
      type: String,
      default: ""
    },

    rcBook: {
      type: String,
      default: ""
    },

    insurance: {
      type: String,
      default: ""
    },

    pollutionCertificate: {
      type: String,
      default: ""
    },

    selfieImage: {
      type: String,
      default: ""
    },

    // Legacy fields (already existing in the project)
    licenseImage: {
      type: String,
      default: ""
    },

    rcImage: {
      type: String,
      default: ""
    },

    insuranceImage: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      default: "Pending",
      enum: ["Pending", "Approved", "Rejected"]
    },

    adminRemarks: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "DriverVerification",
  driverVerificationSchema
);


