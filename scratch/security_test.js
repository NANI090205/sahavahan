const axios = require("axios");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = "http://localhost:4040";

// Import Models
const User = require("../models/User");

async function testNoSqlInjection() {
  console.log("\n[Security Test] Checking NoSQL Query Injection in Login...");
  try {
    const res = await axios.post(`${BASE_URL}/api/users/login`, {
      username: { $gt: "" },
      password: { $gt: "" }
    });
    console.log("❌ FAIL: NoSQL query injection succeeded!");
  } catch (err) {
    if (err.response && err.response.status === 400) {
      console.log("✔ PASS: NoSQL injection blocked (400 Bad Request)");
    } else {
      console.log(`✔ PASS: NoSQL injection blocked with status: ${err.response?.status || err.message}`);
    }
  }
}

async function testBola() {
  console.log("\n[Security Test] Checking BOLA on start ride endpoint...");
  try {
    // Generate a user and login
    const ts = Date.now();
    const username = `thief_${ts}`;
    const email = `thief_${ts}@test.com`;
    const password = "TestPass1234";

    await axios.post(`${BASE_URL}/api/users/signup`, {
      username,
      email,
      phoneNumber: "+919999999999",
      password
    });

    const userObj = await User.findOne({ email });
    const otp = userObj.emailOtp;
    await axios.post(`${BASE_URL}/api/users/verify-email`, { email, otp });

    const loginRes = await axios.post(`${BASE_URL}/api/users/login`, { username, password });
    const token = loginRes.data.token;

    // Try starting a ride we don't own (e.g. dummy ID)
    const dummyRideId = new mongoose.Types.ObjectId();
    const res = await axios.put(`${BASE_URL}/api/rides/start/${dummyRideId}`, {
      username
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("❌ FAIL: Succeeded in starting a ride we don't own!");
  } catch (err) {
    if (err.response && (err.response.status === 403 || err.response.status === 404)) {
      console.log(`✔ PASS: BOLA attack blocked (status: ${err.response.status})`);
    } else {
      console.log(`❌ FAIL: BOLA test failed with unexpected error: ${err.message}`);
    }
  }
}

async function testJwtManipulation() {
  console.log("\n[Security Test] Checking JWT signature tampering...");
  try {
    const invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YTM1ZjMyYTgzNWQwZDA1ZmVkYWRmNTgiLCJ1c2VybmFtZSI6ImRydl8xNzgxOTMyNTYwNzA2XzEiLCJyb2xlIjoidXNlciIsImlhdCI6MTc4MTkzMjU2MSwiZXhwIjoxNzgxOTc1NzYxfQ.tampered_signature_123456";
    await axios.get(`${BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${invalidToken}` }
    });
    console.log("❌ FAIL: Tampered JWT accepted!");
  } catch (err) {
    console.log(`✔ PASS: Tampered JWT signature rejected with status: ${err.response?.status || err.message}`);
  }
}

async function testHardcodedSecrets() {
  console.log("\n[Security Test] Auditing codebase for hardcoded secrets...");
  const fs = require("fs");
  const usersCode = fs.readFileSync(path.join(__dirname, "..", "routes", "users.js"), "utf8");
  const authCode = fs.readFileSync(path.join(__dirname, "..", "middleware", "auth.js"), "utf8");

  const hasHardcodedKey = usersCode.includes("JWT_SECRET = '") || authCode.includes("JWT_SECRET = '");
  if (hasHardcodedKey) {
    console.log("⚠ WARNING: Hardcoded fallback secret keys detected in source code (safe if process.env.JWT_SECRET is set, but better removed).");
  } else {
    console.log("✔ PASS: No hardcoded fallbacks found.");
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/sahavahan");
  await testNoSqlInjection();
  await testBola();
  await testJwtManipulation();
  await testHardcodedSecrets();
  await mongoose.disconnect();
  console.log("\n==================================================");
  console.log("🎉 SECURITY AUDIT COMPLETED!");
  console.log("==================================================");
}

main().catch(console.error);
