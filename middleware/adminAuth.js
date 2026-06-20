const jwt = require("jsonwebtoken");
const User = require("../models/User");
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access Denied: Authorization token missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied: Not an administrator" });
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (err) {
    console.error("Admin Auth Middleware error:", err);
    return res.status(401).json({ message: "Access Denied: Invalid or expired token" });
  }
};

module.exports = adminAuthMiddleware;
