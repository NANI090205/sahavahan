process.env.PORT = "0";

// Mock node-cron and setInterval BEFORE requiring app.js to avoid running schedulers or open handles
jest.mock("node-cron", () => ({
  schedule: jest.fn()
}));
jest.spyOn(global, "setInterval").mockImplementation(() => {});

jest.mock("mongoose", () => {
  const originalMongoose = jest.requireActual("mongoose");
  return {
    ...originalMongoose,
    connect: jest.fn().mockResolvedValue(true),
  };
});

// Mock external integrations
jest.mock("bcryptjs", () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue("hashedpass123"),
}));

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn().mockReturnValue({ userId: "mockdrv123", username: "mockdriver", role: "admin" }),
  sign: jest.fn().mockReturnValue("mockjwttoken"),
}));

const request = require("supertest");
const app = require("../app");

// Mock Mongoose models
const User = require("../models/User");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Vehicle = require("../models/Vehicle");

jest.mock("../models/User");
jest.mock("../models/Ride");
jest.mock("../models/BookedRide");
jest.mock("../models/Vehicle");

describe("SahaVahan Route Endpoints Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/users/login", () => {
    test("should successfully login a verified user", async () => {
      const mockUser = {
        _id: "mockuser123",
        username: "testuser",
        email: "test@example.com",
        password: "hashedpassword",
        isSuspended: false,
        isEmailVerified: true,
        role: "user",
        uniqueCode: "12345",
        trustScore: 85,
        phoneNumber: "+919876543210",
        isPhoneVerified: true,
      };
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "testuser", password: "Password123" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.username).toBe("testuser");
    });

    test("should fail login if user not found", async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "unknown", password: "password" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid credentials");
    });
  });

  describe("GET /api/rides/all", () => {
    test("should return all scheduled and published rides", async () => {
      const mockRides = [
        {
          _id: "ride1",
          username: "driver1",
          source: "Vijayawada",
          destination: "Hyderabad",
          price: 350,
          seats: 3,
          status: "Scheduled",
        },
      ];
      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementation(function(cb) {
          return Promise.resolve(mockRides).then(cb);
        })
      };
      Ride.find.mockReturnValue(mockQueryChain);

      const res = await request(app).get("/api/rides/all");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].source).toBe("Vijayawada");
    });
  });

  describe("POST /api/otp/verify-boarding", () => {
    test("should reject BOLA auth bypass attempts", async () => {
      const mockRide = {
        _id: "ride123",
        username: "otherdriver",
        status: "Scheduled",
      };
      const mockBooking = {
        _id: "booking123",
        rideId: "ride123",
        otpVerified: false,
      };

      Ride.findById.mockResolvedValue(mockRide);
      BookedRide.findById.mockResolvedValue(mockBooking);

      const res = await request(app)
        .post("/api/otp/verify-boarding")
        .set("Authorization", "Bearer validtoken") // decoded as user: mockdriver
        .send({ rideId: "ride123", bookingId: "booking123", otp: "123456" });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Access denied: You are not the ride owner");
    });
  });

  describe("GET /api/admin/stats", () => {
    test("should return admin statistics if authorized", async () => {
      // Mock admin auth validation
      const mockAdminUser = { _id: "mockdrv123", role: "admin" };
      User.findById.mockResolvedValue(mockAdminUser);

      User.countDocuments.mockResolvedValue(100);
      Ride.countDocuments.mockResolvedValue(50);
      BookedRide.countDocuments.mockResolvedValue(40);
      BookedRide.find.mockResolvedValue([{ totalPrice: 15000 }]);

      const res = await request(app)
        .get("/api/admin/stats")
        .set("Authorization", "Bearer admin_token");

      expect(res.status).toBe(200);
      expect(res.body.users).toBe(100);
      expect(res.body.rides).toBe(50);
      expect(res.body.bookings).toBe(40);
      expect(res.body.revenue).toBe(15000);
    });
  });
});
