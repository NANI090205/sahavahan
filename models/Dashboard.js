const mongoose = require("mongoose");

const dashboardSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    unique: true 
  },

  // Refers to rides the user has published
  publishedRides: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Ride" 
  }],

  // Refers to rides the user has booked
  bookedRides: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "BookedRide" 
  }],
  
}, { timestamps: true });

module.exports = mongoose.model("Dashboard", dashboardSchema);
