const mongoose = require("mongoose");
const User = require("../models/User");
const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const Vehicle = require("../models/Vehicle");
const Review = require("../models/Review");
const Notification = require("../models/Notification");
const RouteSubscription = require("../models/RouteSubscription");
const Waitlist = require("../models/Waitlist");

describe("SahaVahan Models Validation Tests", () => {
  describe("User Model", () => {
    test("should fail validation if required fields are missing", () => {
      const user = new User({});
      const err = user.validateSync();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.email).toBeDefined();
      expect(err.errors.password).toBeDefined();
    });

    test("should validate with default values when required fields are present", () => {
      const user = new User({
        username: "johndoe",
        email: "john@example.com",
        password: "securepassword",
        uniqueCode: 12345
      });
      const err = user.validateSync();
      expect(err).toBeUndefined();
      expect(user.role).toBe("user");
      expect(user.trustScore).toBe(50);
      expect(user.emergencyContacts).toEqual([]);
    });

    test("should validate nested emergency contacts structure", () => {
      const user = new User({
        username: "johndoe2",
        email: "john2@example.com",
        password: "securepassword",
        uniqueCode: 12346,
        emergencyContacts: [
          { name: "Jane Doe", phone: "+919876543210", relation: "Sister" }
        ]
      });
      const err = user.validateSync();
      expect(err).toBeUndefined();
      expect(user.emergencyContacts[0].name).toBe("Jane Doe");
      expect(user.emergencyContacts[0].relation).toBe("Sister");
    });
  });

  describe("Ride Model", () => {
    test("should fail validation if required fields are missing", () => {
      const ride = new Ride({});
      const err = ride.validateSync();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.source).toBeDefined();
      expect(err.errors.destination).toBeDefined();
      expect(err.errors.price).toBeDefined();
      expect(err.errors.seats).toBeDefined();
    });

    test("should succeed validation with standard properties", () => {
      const ride = new Ride({
        username: "driver1",
        source: "Hyderabad",
        destination: "Vijayawada",
        price: 400,
        seats: 4,
        date: "2026-06-21",
        time: "10:00",
        rideCode: "RIDE-12345",
        uniqueCode: "12345"
      });
      const err = ride.validateSync();
      expect(err).toBeUndefined();
      expect(ride.status).toBe("Scheduled");
    });
  });

  describe("BookedRide Model", () => {
    test("should fail validation if required fields are missing", () => {
      const booking = new BookedRide({});
      const err = booking.validateSync();
      expect(err.errors.rideId).toBeDefined();
      expect(err.errors.bookedBy).toBeDefined();
      expect(err.errors.source).toBeDefined();
      expect(err.errors.destination).toBeDefined();
      expect(err.errors.price).toBeDefined();
      expect(err.errors.seatsBooked).toBeDefined();
    });

    test("should validate correct booking status options", () => {
      const booking = new BookedRide({
        rideId: new mongoose.Types.ObjectId(),
        bookedBy: "passenger1",
        bookedByCode: "12345",
        publishedBy: "driver1",
        source: "Hyderabad",
        destination: "Vijayawada",
        date: "2026-06-21",
        time: "10:00",
        price: 400,
        seatsBooked: 2,
        totalPrice: 800,
        status: "InvalidStatus"
      });
      const err = booking.validateSync();
      expect(err.errors.status).toBeDefined();
      expect(err.errors.status.kind).toBe("enum");
    });
  });

  describe("Vehicle Model", () => {
    test("should fail validation if required fields are missing", () => {
      const vehicle = new Vehicle({});
      const err = vehicle.validateSync();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.vehicleNumber).toBeDefined();
    });

    test("should validate standard vehicle properties", () => {
      const vehicle = new Vehicle({
        username: "driver1",
        vehicleType: "Car",
        vehicleModel: "Swift Dzire",
        vehicleNumber: "AP16AB1234",
        vehicleColor: "Red",
        acAvailable: true
      });
      const err = vehicle.validateSync();
      expect(err).toBeUndefined();
      expect(vehicle.acAvailable).toBe(true);
    });
  });

  describe("Review Model", () => {
    test("should fail validation if required fields are missing", () => {
      const review = new Review({});
      const err = review.validateSync();
      expect(err.errors.rideId).toBeDefined();
      expect(err.errors.reviewer).toBeDefined();
      expect(err.errors.reviewedUser).toBeDefined();
      expect(err.errors.rating).toBeDefined();
    });

    test("should validate rating limits", () => {
      const reviewHigh = new Review({
        rideId: new mongoose.Types.ObjectId(),
        reviewer: "pax1",
        reviewedUser: "drv1",
        rating: 6 // Limit 5
      });
      const errHigh = reviewHigh.validateSync();
      expect(errHigh.errors.rating).toBeDefined();

      const reviewLow = new Review({
        rideId: new mongoose.Types.ObjectId(),
        reviewer: "pax1",
        reviewedUser: "drv1",
        rating: 0 // Limit min 1
      });
      const errLow = reviewLow.validateSync();
      expect(errLow.errors.rating).toBeDefined();
    });
  });

  describe("Notification Model", () => {
    test("should set default unread status", () => {
      const notif = new Notification({
        username: "user1",
        title: "Test Alert",
        message: "Hello world"
      });
      const err = notif.validateSync();
      expect(err).toBeUndefined();
      expect(notif.isRead).toBe(false);
      expect(notif.type).toBe("general");
    });
  });

  describe("RouteSubscription Model", () => {
    test("should require source and destination", () => {
      const sub = new RouteSubscription({ username: "user1" });
      const err = sub.validateSync();
      expect(err.errors.source).toBeDefined();
      expect(err.errors.destination).toBeDefined();
    });
  });

  describe("Waitlist Model", () => {
    test("should require username and position", () => {
      const w = new Waitlist({});
      const err = w.validateSync();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.position).toBeDefined();
    });
  });
});
