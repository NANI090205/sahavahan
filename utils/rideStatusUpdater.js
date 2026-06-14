const Ride = require("../models/Ride");

function combineRideDateTime({ date, time }) {
  if (!date || !time) return null;
  const rideDateTime = new Date(`${date} ${time}`);
  if (Number.isNaN(rideDateTime.getTime())) return null;
  return rideDateTime;
}

async function updateExpiredRides() {
  const now = new Date();

  // Only consider Scheduled rides (auto-expire). In Progress/Completed handled elsewhere.
  const rides = await Ride.find({ status: "Scheduled" }).lean();

  const expiredIds = [];

  for (const ride of rides) {
    const rideDateTime = combineRideDateTime({
      date: ride.date,
      time: ride.time,
    });

    if (!rideDateTime) continue;

    if (rideDateTime < now) {
      expiredIds.push(ride._id);
    }
  }

  if (!expiredIds.length) return;

  await Ride.updateMany(
    { _id: { $in: expiredIds }, status: "Scheduled" },
    { $set: { status: "Completed", rideCompletedAt: new Date() } }
  );
}

// Run every hour
setInterval(() => {
  updateExpiredRides().catch((err) => console.error("rideStatusUpdater error:", err));
}, 60 * 60 * 1000);

module.exports = updateExpiredRides;


