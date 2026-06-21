const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

require("dotenv").config();

async function testLogin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const username = "AdminNani";
    const password = "Password@123";

    const user = await User.findOne({ username });
    if (!user) {
      console.log("User not found by username:", username);
    } else {
      console.log("User found:", user.username);
      console.log("Actual Email in DB:", `"${user.email}"`, "length:", user.email.length);
      const isMatch = await bcrypt.compare(password, user.password);
      console.log("Password match?", isMatch);
      if (isMatch) {
         console.log("Login would SUCCEED.");
      } else {
         console.log("Login would FAIL. Hash in DB:", user.password);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

testLogin();
