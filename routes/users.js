const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const transporter = require("../utils/mailer");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

// Forgot Password (Send OTP)
router.post("/forgot-password", async (req, res) => {

  try {

    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    user.resetOtp = otp;

    user.otpExpiry = new Date(
      Date.now() + 10 * 60 * 1000
    );

    await user.save();

    await transporter.sendMail({
      from: "onboarding@resend.dev",
      to: email,
      subject: "SahaVahan Password Reset OTP",
      html: `

<div style="font-family:Arial;padding:20px;">

<h2>🔐 SahaVahan</h2>

<p>Your OTP is:</p>

<h1>${otp}</h1>

<p>
Valid for 10 minutes.
</p>

</div>

`
    });

    res.json({
      message: "OTP Sent Successfully"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed To Send OTP"
    });

  }
});

// Verify OTP
router.post("/verify-reset-otp", async (req, res) => {

  try {

    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.resetOtp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP"
      });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({
        message: "OTP Expired"
      });
    }

    res.json({
      message: "OTP Verified"
    });

  } catch (error) {

    res.status(500).json({
      message: "Verification Failed"
    });

  }
});

// Reset Password
router.post("/reset-password", async (req, res) => {

  try {

    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.resetOtp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP"
      });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({
        message: "OTP Expired"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    user.resetOtp = "";
    user.otpExpiry = null;

    await user.save();

    res.json({
      message: "Password Updated Successfully"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Password Reset Failed"
    });

  }
});

// (end OTP routes)

// Generate a random 5-digit code
const generateUserCode = () => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

// Signup route
router.post("/signup", async (req, res) => {
    console.log(">>> /signup hit (handler start)");
    const { username, email, phoneNumber, password, referralCode } = req.body;

    // referralCode coming from the frontend sometimes arrives as {}. Ensure it's a string or falsy.
    const referralCodeValue = typeof referralCode === "string" ? referralCode : undefined;


    console.log("Signup payload:", req.body);

    // Defensive: if email is already registered, return a clear 409.
    // Note: A DB unique index may still throw E11000 due to race/double-submit,
    // so we also handle E11000 in the catch block below.
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    try {

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already in use."
      });
    }


    const uniqueCode =
      Math.floor(
        10000 + Math.random() * 90000
      );

const hashedPassword =
  await bcrypt.hash(password, 10);

const newUser = new User({
  username,
  email,
  password: hashedPassword,
  phoneNumber,
  uniqueCode
});

    // Create user first (so OTP fields are persisted)
    const savedUser =
      await newUser.save();

    // Generate email verification OTP
    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    savedUser.emailOtp = otp;
    savedUser.emailOtpExpiry = new Date(
      Date.now() + 10 * 60 * 1000
    );

    await savedUser.save();

    // Send verification email
    console.log("[OTP] Sending OTP to:", email);
    console.log("[OTP] Generated OTP:", otp);
    console.log("[Resend] RESEND_API_KEY present:", !!process.env.RESEND_API_KEY);

    try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER || "",
      to: email,
        subject: "SahaVahan Email Verification",
        html: `
    <h2>Welcome to SahaVahan 🚗</h2>
    <p>Your Email Verification OTP:</p>
    <h1>${otp}</h1>
    <p>This OTP expires in 10 minutes.</p>
  `,
      });

      console.log("OTP Email Sent Successfully");
    } catch (sendErr) {
      console.error("[OTP] Email send failed:", sendErr);
      return res.status(500).json({
        message: "Failed To Send OTP"
      });
    }

    const userReferralCode = username.toUpperCase() + uniqueCode;

    const userWithReferralCode = await User.findOne({ _id: savedUser._id });
    userWithReferralCode.referralCode = userReferralCode;
    await userWithReferralCode.save();

    if (referralCodeValue) {
      const referrer = await User.findOne({ referralCode: referralCodeValue });
      // If referralCodeValue is still somehow an object, treat as missing.


      if (referrer) {
        referrer.rewardPoints += 50;
        referrer.totalReferrals += 1;
        await referrer.save();

        userWithReferralCode.rewardPoints += 25;
        userWithReferralCode.referredBy = referralCode;
        await userWithReferralCode.save();
      }
    }

    console.log(
      "User saved successfully:",
      savedUser
    );

    const totalUsers =
      await User.countDocuments();

    console.log(
      "Total users in DB:",
      totalUsers
    );

    res.status(200).json({
      success: true,
      message: "Signup successful"
    });

  } catch (err) {

    console.error(
      "Signup Error:",
      err
    );

    // If email uniqueness fails, return a clear conflict response.
    if (err && err.code === 11000) {
      const key = err.keyValue && err.keyValue.email ? "email" : "field";
      return res.status(409).json({
        message: `Account with that ${key} already exists.`
      });
    }

    res.status(500).json({
      message:
        "Server error during signup."
    });

  }
});


// Verify Email OTP
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.emailOtp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP"
      });
    }

    if (new Date() > user.emailOtpExpiry) {
      return res.status(400).json({
        message: "OTP Expired"
      });
    }

    user.isEmailVerified = true;
    user.emailOtp = "";
    user.emailOtpExpiry = null;

    await user.save();

    res.json({
      message: "Email Verified"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Verification Failed"
    });
  }
});

// Resend OTP
router.post("/resend-email-otp", async (req, res) => {
  try {
    const { email } = req.body;

    console.log("[RESEND-OTP] resend-email-otp called for:", email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    user.emailOtp = otp;
    user.emailOtpExpiry = new Date(
      Date.now() + 10 * 60 * 1000
    );

    await user.save();

    console.log("[OTP-RESEND] Sending OTP to:", email);
    console.log("[OTP-RESEND] Generated OTP:", otp);
    console.log("[Resend] RESEND_API_KEY present:", !!process.env.RESEND_API_KEY);

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "SahaVahan Email Verification",
        html: `
    <h2>Welcome to SahaVahan 🚗</h2>
    <p>Your Email Verification OTP:</p>
    <h1>${otp}</h1>
    <p>This OTP expires in 10 minutes.</p>
  `,
      });

      console.log("OTP Email Sent Successfully");
    } catch (sendErr) {
      console.error("[OTP-RESEND] Email send failed:", sendErr);
      return res.status(500).json({
        message: "Failed To Send OTP"
      });
    }

    res.json({
      message: "OTP Sent Successfully"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed To Send OTP"
    });
  }
});

// Login route
router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
  
      if (!user) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      if (!user.isEmailVerified) {
        return res.status(403).json({
          message: "Please verify your email first"
        });
      }
  
      const role = user.role || "user";
      res.status(200).json({
        success: true,
        role,
        redirect: role === "admin" ? "admin.html" : "index.html",
        username: user.username,
        email: user.email,
        uniqueCode: user.uniqueCode,
        phoneNumber: user.phoneNumber || "",
        isPhoneVerified: user.isPhoneVerified || false,
        trustScore: user.trustScore != null ? user.trustScore : 100,
        message: "Login successful"
      });

    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });


// Driver phone route
router.get("/phone/:username", async (req, res) => {

  try {

    const user =
      await User.findOne({
        username: req.params.username
      });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      phoneNumber: user.phoneNumber || ""
    });

  } catch (error) {

    res.status(500).json({
      message: "Failed"
    });

  }
});

// Change Password (Logged-In User - username based)
router.post("/change-password", async (req, res) => {

  try {

    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Missing required fields"
      });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password incorrect"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    res.json({
      message: "Password changed successfully"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to change password"
    });

  }
});

// Profile route
router.get("/profile/:uniqueCode", async (req, res) => {

  try {

    const user =
      await User.findOne({
        uniqueCode: req.params.uniqueCode
      });


    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber || "",
      isPhoneVerified: user.isPhoneVerified || false,
      uniqueCode: user.uniqueCode,
      trustScore: user.trustScore != null ? user.trustScore : 100,
      referralCode: user.referralCode || "",
      rewardPoints: user.rewardPoints || 0,
      totalReferrals: user.totalReferrals || 0,
      referredBy: user.referredBy || ""
    });

  } catch (err) {


    res.status(500).json({
      message: "Server Error"
    });

  }
});

const calculateTrustScore = require("../utils/calculateTrustScore");

// Phone verification (Firebase Phone Auth)
router.post("/verify-phone", async (req, res) => {
  try {
    const { username, phoneNumber, isVerified } = req.body;


    if (!username || !phoneNumber) {
      return res.status(400).json({ message: "Missing username or phoneNumber" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.phoneNumber = phoneNumber;
    if (isVerified) user.isPhoneVerified = true;

    // Recalculate trust score using canonical rules
    user.trustScore = calculateTrustScore(user);

    await user.save();

    return res.json({ message: "Phone Verified" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Phone verification failed" });
  }
});


// Save Firebase Cloud Messaging token (for web push)
// Body: { username, fcmToken }
router.post("/save-fcm-token", async (req, res) => {
  try {
    const { username, fcmToken } = req.body || {};

    if (!username || !fcmToken) {
      return res.status(400).json({ message: "username and fcmToken are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.fcmToken = String(fcmToken);
    await user.save();

    return res.json({ message: "FCM token saved" });
  } catch (error) {
    console.error("Save FCM token error:", error);
    return res.status(500).json({ message: "Failed" });
  }
});

module.exports = router;







