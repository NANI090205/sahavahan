const mongoose = require("mongoose");

const bookedRideSchema = new mongoose.Schema(
{
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        required: true
    },

    bookedBy: {
        type: String,
        required: true
    },

    bookedByCode: {
        type: String,
        required: true
    },

    publishedBy: {
        type: String,
        required: true
    },

    source: {
        type: String,
        required: true
    },

    destination: {
        type: String,
        required: true
    },

    boardingPoint: {
        type: String,
        default: ""
    },

    boardingLat: {
        type: Number,
        default: undefined
    },

    boardingLng: {
        type: Number,
        default: undefined
    },

    dropPoint: {
        type: String,
        default: ""
    },

    dropLat: {
        type: Number,
        default: undefined
    },

    dropLng: {
        type: Number,
        default: undefined
    },


    date: {
        type: String,
        required: true
    },

    time: {
        type: String,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    seatsBooked: {
        type: Number,
        required: true,
        min: 1
    },

    totalPrice: {
        type: Number,
        required: true
    },

    // Legacy/current OTP fields
    // rideOTP is used by existing flows (ticket + /api/rides/verify-otp)
    rideOTP: {
        type: String,
        default: ""
    },

    // New boarding OTP (preferred by the boarding system)
    boardingOTP: {
        type: String,
        default: ""
    },

    otpVerified: {
        type: Boolean,
        default: false
    },

    // Boarding confirmation timestamp
    boardedAt: {
        type: Date
    },

    // New Drop OTP Verification
    dropOTP: {
        type: String,
        default: ""
    },

    dropOTPVerified: {
        type: Boolean,
        default: false
    },

    droppedAt: {
        type: Date
    }
}, 
{
    timestamps: true
});

module.exports = mongoose.model(
    "BookedRide",
    bookedRideSchema
);

