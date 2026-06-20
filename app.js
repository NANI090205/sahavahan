require("dotenv").config();
console.log("GEMINI_API_KEY EXISTS:", !!process.env.GEMINI_API_KEY);
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");

const app = express();
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_APP_PASSWORD:", !!process.env.EMAIL_APP_PASSWORD);
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

// ---- Env validation (fail fast, list missing keys) ----
const requiredEnv = [
  "MONGO_URI",
];

const missingEnv = requiredEnv.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error("❌ Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

// MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Routes
const userRoutes = require("./routes/users");

// Recurring rides scheduler
require("./utils/rideScheduler");

// Auto-complete expired rides (runs hourly)
require("./utils/rideStatusUpdater");


const rideRoutes = require("./routes/rides");
const passengerBookingsRoutes = require("./routes/passengerBookings");


const dashboardRoutes = require("./routes/dashboard");
const reviewRoutes = require("./routes/reviews");
const chatRoutes = require("./routes/chat");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");
const favoriteRoutes = require("./routes/favorites");
const sosRoutes = require("./routes/sos");
const reportRoutes = require("./routes/reports");
const analyticsRoutes = require("./routes/analytics");
const weatherRoutes = require("./routes/weather");
const pickupPointsRoutes = require("./routes/pickupPoints");
const assistantRoutes = require("./routes/assistant");
const recommendationsRoutes = require("./routes/recommendations");
const predictionRoutes = require("./routes/prediction");
const pricingRoutes = require("./routes/pricing");
const forecastRoutes = require("./routes/forecast");
const environmentRoutes = require("./routes/environment");
const leaderboardRoutes = require("./routes/leaderboard");
const routePlannerRoutes = require("./routes/routePlanner");
const subscriptionRoutes = require("./routes/subscriptions");



// Revenue forecasting API
app.use("/api/forecast", forecastRoutes);


// Environmental Impact API
app.use("/api/environment", environmentRoutes);

// Leaderboards
app.use("/api/leaderboard", leaderboardRoutes);


// Middleware
const helmet = require("helmet");
const compression = require("compression");

app.use(helmet({
  contentSecurityPolicy: false // Disable Content Security Policy to support Leaflet maps and external CDN assets
}));
app.use(compression());
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Static files
app.use(express.static(path.join(__dirname, "public")));
// Serve uploaded files (disabled local storage, now on Cloudinary)


// Profile routes
const profileRoutes = require("./routes/profile");
app.use("/api/profile", profileRoutes);

// Driver KYC verification routes
const driverVerificationRoutes = require("./routes/driverVerification");
app.use("/api/driver-verification", driverVerificationRoutes);

// Waitlist routes
const waitlistRoutes = require("./routes/waitlist");
app.use("/api/waitlist", waitlistRoutes);



// API Routes
const vehicleRoutes = require("./routes/vehicles");
app.use("/api/vehicles", vehicleRoutes);


app.use("/api/users", userRoutes);
// NOTE: analytics routes (recommended/trending) are separated from rides routes
app.use("/api/analytics", analyticsRoutes);
app.use("/api/rides", rideRoutes);

// OTP Verification Routes
const otpRoutes = require("./routes/otp");
app.use("/api/otp", otpRoutes);

// Ensure dashboard endpoints (/api/rides/user/:uniqueCode and /api/rides/booked/:uniqueCode)
// are available via the same mounted router.

app.use("/api/passenger-bookings", passengerBookingsRoutes);



app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/pickup-points", pickupPointsRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/prediction", predictionRoutes);
app.use("/api/subscriptions", subscriptionRoutes);


// Route Planner (AI/Smart ranking)
app.use("/api/route-planner", routePlannerRoutes);

// Dynamic pricing API
app.use("/api/pricing", pricingRoutes);


// Pages






app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/ridepublish", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "ridepublish.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Start Server (HTTP + Socket.IO)
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Expose io to utils (notifications emit)
global.__io = io;

// Socket.IO events
// Rooms are keyed by rideId
io.on("connection", (socket) => {
  // Notifications: join a user room by username
  socket.on("userJoinNotifications", async ({ username } = {}) => {
    if (!username) return;
    socket.join(String(username));
  });

  socket.on("driverJoinRide", async ({ rideId } = {}) => {
    if (!rideId) return;
    socket.join(String(rideId));
  });

  socket.on("passengerJoinRide", async ({ rideId } = {}) => {
    if (!rideId) return;
    socket.join(String(rideId));
  });

  socket.on("driverLocation", async (data = {}) => {
    try {
      const { rideId, lat, lng } = data;
      if (!rideId) return;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      const Ride = require("./models/Ride");

      await Ride.findByIdAndUpdate(rideId, {
        driverLat: lat,
        driverLng: lng,
      });

      io.to(String(rideId)).emit("locationUpdated", {
        rideId,
        lat,
        lng,
      });
    } catch (e) {
      console.error("driverLocation error:", e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;


