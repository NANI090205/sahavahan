const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema(
{
    username: {
        type: String,
        required: true
    },

    uniqueCode: {
        type: String,
        required: true
    },

    phoneNumber: {
        type: String,
        default: ""
    },

    source: {
        type: String,
        required: true
    },

    sourceLat: {
        type: Number
    },

    sourceLng: {
        type: Number
    },

    destination: {
        type: String,
        required: true
    },

    date: {
        type: String,
        required: true
    },

    time: {
        type: String,
        required: true
    },

    seats: {
        type: Number,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    status: {
        type: String,
        enum: ["Scheduled", "In Progress", "Completed", "Cancelled"],
        default: "Scheduled"
    },

    driverLat: {
        type: Number,
        default: 0
    },

    driverLng: {
        type: Number,
        default: 0
    },

    rideCode: {
        type: String,
        required: true,
        unique: true
    },

    rideOTP: {
        type: String,
        default: ""
    },

    // Pickup/drop points (new schema)
    pickupPoints: {
        type: [
            {
                name: { type: String, default: "" },
                lat: { type: Number },
                lng: { type: Number }
            }
        ],
        default: []
    },

    dropPoints: {
        type: [
            {
                name: { type: String, default: "" },
                lat: { type: Number },
                lng: { type: Number }
            }
        ],
        default: []
    },

    // Legacy single pickup/drop coords (backward compatibility)
    // Prefer pickupPoints/dropPoints going forward.
    pickupLocation: {
        lat: {
            type: Number
        },
        lng: {
            type: Number
        }
    },

    dropLocation: {
        lat: {
            type: Number
        },
        lng: {
            type: Number
        }
    },


    // Trip metrics (new schema)
    distance: {
        type: Number,
        default: 0
    },

    eta: {
        type: String,
        default: ""
    },

    rideStartedAt: {
        type: Date
    },

    rideCompletedAt: {
        type: Date
    },

    // Recurring rides
    isRecurring: {
        type: Boolean,
        default: false
    },

    // Vehicle reference (required for publishing)
    vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle"
    },

    // Legacy field (kept for backward compatibility)
    recurringType: {
        type: String,
        default: "",
        enum: ["", "Daily", "Weekly", "Monthly"]
    },

    // New field for weekday-based recurring templates, e.g.
    // ["Monday","Tuesday","Wednesday","Thursday","Friday"]
    repeatDays: {
        type: [String],
        default: []
    },

    // Driver & Ride Preferences
    // Multi-stop path (full path including source and destination)
    // Example: [source, ...intermediateStops, destination]
    stops: {
        type: [
            {
                name: {
                    type: String,
                    default: ""
                },
                latitude: {
                    type: Number
                },
                longitude: {
                    type: Number
                }
            }
        ],
        default: []
    },

    preferences: {
        acAvailable: {
            type: Boolean,
            default: false
        },
        musicAllowed: {
            type: Boolean,
            default: false
        },
        smokingAllowed: {
            type: Boolean,
            default: false
        },
        petsAllowed: {
            type: Boolean,
            default: false
        },
        luggageAllowed: {
            type: Boolean,
            default: false
        },
        womenOnly: {
            type: Boolean,
            default: false
        }
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("Ride", rideSchema);


