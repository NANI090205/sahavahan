const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const User = require("../models/User");
const DriverVerification = require("../models/DriverVerification");

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, "uploads/documents");
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});


// Driver submits documents
// Accepts BOTH:
// Legacy fields: drivingLicense/rcBook/insurance/pollutionCertificate/selfieImage (task requested)
// Canonical fields in this repo already exist: drivingLicense, rcBook, insurance, pollutionCertificate, selfieImage (canonical)
// Also accepts legacy already-used fields: licenseImage/rcImage/insuranceImage/selfieImage.
router.post(
  "/submit",
  upload.fields([
    // Canonical (task)
    { name: "drivingLicense", maxCount: 1 },
    { name: "rcBook", maxCount: 1 },
    { name: "insurance", maxCount: 1 },
    { name: "pollutionCertificate", maxCount: 1 },
    { name: "selfieImage", maxCount: 1 },

    // Legacy (already existing)
    { name: "licenseImage", maxCount: 1 },
    { name: "rcImage", maxCount: 1 },
    { name: "insuranceImage", maxCount: 1 },
    // selfieImage already declared above
  ]),
  async (req, res) => {
    try {
      const username = (req.body.username || "").trim();
      if (!username) return res.status(400).json({ message: "username is required" });

      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ message: "User not found" });

      const getUrl = (field) => {
        const file = req.files?.[field]?.[0];
        return file ? `/uploads/${file.filename}` : "";
      };

      // Prefer canonical names if provided; otherwise fall back to legacy.
      const drivingLicense =
        getUrl("drivingLicense") || getUrl("licenseImage");
      const rcBook = getUrl("rcBook") || getUrl("rcImage");
      const insurance = getUrl("insurance") || getUrl("insuranceImage");
      const pollutionCertificate = getUrl("pollutionCertificate");
      const selfieImage = getUrl("selfieImage");

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
      await user.save();

      res.status(201).json({ message: "Verification submitted", verification });
    } catch (e) {
      console.error("Driver verification submit failed:", e);
      res.status(500).json({ message: "Failed to submit verification" });
    }
  }
);

module.exports = router;


