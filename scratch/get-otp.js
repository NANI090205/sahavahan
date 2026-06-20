// scratch/get-otp.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");

const email = process.argv[2];
if (!email) {
  console.error("Email required");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sahavahan")
  .then(async () => {
    const user = await User.findOne({ email });
    if (user) {
      process.stdout.write(String(user.emailOtp || "").trim());
    } else {
      console.error("User not found");
      process.exit(1);
    }
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error("DB connection error:", err);
    process.exit(1);
  });
