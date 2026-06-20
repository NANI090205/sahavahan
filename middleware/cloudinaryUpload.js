const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "sahavahan/profile-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }]
  }
});

const vehicleStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "sahavahan/vehicle-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }]
  }
});

const verificationStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "sahavahan/verification",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }]
  }
});

const memoriesStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "sahavahan/memories",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }]
  }
});

const profileUpload = multer({ storage: profileStorage }).single("photo");
const vehicleUpload = multer({ storage: vehicleStorage }).single("vehiclePhoto");
const verificationUpload = multer({ storage: verificationStorage }).fields([
  { name: "drivingLicense", maxCount: 1 },
  { name: "rcBook", maxCount: 1 },
  { name: "insurance", maxCount: 1 },
  { name: "pollutionCertificate", maxCount: 1 },
  { name: "selfieImage", maxCount: 1 },
  { name: "licenseImage", maxCount: 1 },
  { name: "rcImage", maxCount: 1 },
  { name: "insuranceImage", maxCount: 1 }
]);
const memoriesUpload = multer({ storage: memoriesStorage }).array("images", 5);

module.exports = {
  profileUpload,
  vehicleUpload,
  verificationUpload,
  memoriesUpload
};
