const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User"); // Adjust path if needed

require("dotenv").config();

async function resetPasswords() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const newPassword = "Password@123";
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    console.log("Updating password for AdminNani and admin...");
    
    const res1 = await User.updateOne({ username: "AdminNani" }, { $set: { password: hashedPassword } });
    console.log("AdminNani update result:", res1);

    const res2 = await User.updateOne({ username: "admin" }, { $set: { password: hashedPassword } });
    console.log("admin update result:", res2);

    console.log("Passwords have been reset successfully!");
    console.log(`The new password for both 'AdminNani' and 'admin' is: ${newPassword}`);
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

resetPasswords();
