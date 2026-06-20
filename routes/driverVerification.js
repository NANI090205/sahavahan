const express = require("express");
const router = express.Router();

const { verificationUpload } = require("../middleware/cloudinaryUpload");
const User = require("../models/User");
const DriverVerification = require("../models/DriverVerification");

// Driver submits documents
// Accepts BOTH:
// Legacy fields: drivingLicense/rcBook/insurance/pollutionCertificate/selfieImage (task requested)
// Canonical fields in this repo already exist: drivingLicense, rcBook, insurance, pollutionCertificate, selfieImage (canonical)
// Also accepts legacy already-used fields: licenseImage/rcImage/insuranceImage/selfieImage.
router.post(
  "/submit",
  verificationUpload,
  async (req, res) => {
    try {
      const username = (req.body.username || "").trim();
      if (!username) return res.status(400).json({ message: "username is required" });

      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ message: "User not found" });

      const getUrl = (field) => {
        const file = req.files?.[field]?.[0];
        return file ? file.path : "";
      };

      // Prefer canonical names if provided; otherwise fall back to legacy, and then req.body for test scripting.
      const drivingLicense =
        getUrl("drivingLicense") || getUrl("licenseImage") || req.body.drivingLicense || req.body.licenseImage;
      const rcBook = getUrl("rcBook") || getUrl("rcImage") || req.body.rcBook || req.body.rcImage;
      const insurance = getUrl("insurance") || getUrl("insuranceImage") || req.body.insurance || req.body.insuranceImage;
      const pollutionCertificate = getUrl("pollutionCertificate") || req.body.pollutionCertificate;
      const selfieImage = getUrl("selfieImage") || req.body.selfieImage;

      // For backward compatibility, also compute legacy fields.
      const licenseImage = drivingLicense;
      const rcImage = rcBook;
      const insuranceImage = insurance;

      if (
        !drivingLicense ||
        !rcBook ||
        !insurance ||
        !pollutionCertificate ||
        !selfieImage
      ) {
        return res.status(400).json({
          message:
            "All documents are required: drivingLicense (or licenseImage), rcBook (or rcImage), insurance (or insuranceImage), pollutionCertificate, selfieImage"
        });
      }

      const verification = await DriverVerification.create({
        username,

        // Canonical fields
        drivingLicense,
        rcBook,
        insurance,
        pollutionCertificate,
        selfieImage,

        // Legacy fields
        licenseImage,
        rcImage,
        insuranceImage,

        status: "Pending",
        adminRemarks: ""
      });

      // Update user-facing status immediately
      user.verificationStatus = "Pending";
      user.isVerifiedDriver = false;
      await user.save({ validateBeforeSave: false });

      res.status(201).json({ message: "Verification submitted", verification });
    } catch (e) {
      console.error("Driver verification submit failed:", e);
      res.status(500).json({ message: "Failed to submit verification" });
    }
  }
);

// GET /api/driver-verification/status/:username
// Returns the latest verification record for the user
router.get("/status/:username", async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ message: "username required" });

    // Find the most recent verification record
    const record = await DriverVerification.findOne({ username }).sort({ createdAt: -1 });
    if (!record) {
      return res.json({ status: "Not Started", record: null });
    }

    return res.json({
      status: record.status,
      adminRemarks: record.adminRemarks || "",
      record: {
        _id: record._id,
        drivingLicense: record.drivingLicense,
        rcBook: record.rcBook,
        insurance: record.insurance,
        pollutionCertificate: record.pollutionCertificate,
        selfieImage: record.selfieImage,
        createdAt: record.createdAt
      }
    });
  } catch (e) {
    console.error("Driver verification status fetch failed:", e);
    res.status(500).json({ message: "Failed to fetch verification status" });
  }
});

module.exports = router;


