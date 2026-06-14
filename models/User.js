const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
{
    username: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    resetOtp: {
        type: String,
        default: ""
    },

    otpExpiry: {
        type: Date,
        default: null
    },

    phoneNumber: {
        type: String,
        default: ""
    },

    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },

    trustScore: {
        type: Number,
        default: 50
    },

    profilePhoto: {
        type: String,
        default: ""
    },

    uniqueCode: {
        type: Number,
        unique: true,
        required: true
    },

    referralCode: {
        type: String,
        default: ""
    },

    referredBy: {
        type: String,
        default: ""
    },

    rewardPoints: {
        type: Number,
        default: 0
    },

    totalReferrals: {
        type: Number,
        default: 0
    },

    // Driver verification (migrated KYC)
    // Keeping legacy fields (licenseImage/isVerified) for backward compatibility,
    // but new admin flow will rely on isVerifiedDriver + verificationStatus.
    licenseImage: {
        type: String,
        default: ""
    },

    isVerified: {
        type: Boolean,
        default: false
    },

    isVerifiedDriver: {
        type: Boolean,
        default: false
    },

    verificationStatus: {
        type: String,
        default: "Pending",
        enum: ["Pending", "Approved", "Rejected"]
    },


    reportCount: {
        type: Number,
        default: 0
    },

    isSuspended: {
        type: Boolean,
        default: false
    },
    challengeProgress: {
type:Object,
default:{}
},

    // Achievement badges
    badges: {
        type: [String],
        default: []
    },

    // Driver lifetime earnings
    totalEarnings: {
        type: Number,
        default: 0
    },

    // Total completed rides (driver leaderboard)
    completedRides: {
        type: Number,
        default: 0
    },

    // Average driver rating (driver leaderboard)
    averageRating: {
        type: Number,
        default: 0
    },

    // Carbon footprint savings (CO₂ equivalent) in KG
    co2Saved: {
        type: Number,
        default: 0
    },

    // Email verification (Signup)
    isEmailVerified: {
        type: Boolean,
        default: false
    },

    // Profile completion gate
    profileCompleted: {
        type: Boolean,
        default: false
    },

    emailOtp: {
        type: String,
        default: ""
    },

    emailOtpExpiry: {
        type: Date,
        default: null
    },

    emergencyContacts: {
        type: [
            {
                name: { type: String, default: "" },
                phone: { type: String, default: "" },
                relation: { type: String, default: "" }
            }
        ],
        default: []
    },

    // Firebase Cloud Messaging token for real push notifications
    // (single device token MVP; can extend to array later)
    fcmToken: {
        type: String,
        default: ""
    }

}, 
{
    timestamps: true
});

// referralCode is optional. Allow multiple documents without a referralCode,
// but enforce uniqueness when referralCode is actually set (non-empty string).
UserSchema.index(
    { referralCode: 1 },
    {
        unique: true,
        partialFilterExpression: { referralCode: { $type: "string", $ne: "" } }
    }
);






module.exports = mongoose.model(
    "User",
    UserSchema
);


