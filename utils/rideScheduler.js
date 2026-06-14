const cron = require("node-cron");
const Ride = require("../models/Ride");
const FavoriteRoute = require("../models/FavoriteRoute");
const Notification = require("../models/Notification");


// Creates next occurrence for recurring rides.
// Runs every day at 00:00 server time.
cron.schedule("0 0 * * *", async () => {
  try {
    const recurringRides = await Ride.find({ isRecurring: true }).lean();
    const createdKeys = new Set();

    const dayNameToIndex = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
    };

    const normalizeDay = (d) => String(d || "").trim();

    const buildDupeKey = ({ ride, dateStr }) => {
      // Include time/price to reduce accidental duplicate collisions
      return `${ride.username}|${ride.source}|${ride.destination}|${ride.time}|${ride.price}|${dateStr}`;
    };

    const computeNextDate = ({ baseDateStr, repeatDays, rideTime, price }) => {
      // Strategy:
      // - if repeatDays is provided/non-empty => find the next date after baseDateStr (inclusive+1) that matches weekday.
      // - else => keep legacy behavior using recurringType.

      const baseDate = new Date(baseDateStr);
      if (Number.isNaN(baseDate.getTime())) return null;

      if (repeatDays && Array.isArray(repeatDays) && repeatDays.length) {
        const allowed = repeatDays
          .map(normalizeDay)
          .map((d) => dayNameToIndex[d])
          .filter((idx) => typeof idx === "number");

        if (!allowed.length) return null;

        // Move to next day to avoid re-creating the base date occurrence.
        const cursor = new Date(baseDate);
        cursor.setDate(cursor.getDate() + 1);

        // Search forward up to 14 days (enough for Mon-Fri weekly recurrence)
        for (let i = 0; i < 14; i++) {
          const dow = cursor.getDay();
          if (allowed.includes(dow)) return cursor;
          cursor.setDate(cursor.getDate() + 1);
        }

        return null;
      }

      // Legacy fallback: daily/weekly/monthly based on recurringType
      const legacyNext = new Date(baseDate);
      return legacyNext;
    };

    for (const ride of recurringRides) {
      const baseDateStr = ride.date;
      if (!baseDateStr) continue;

      const nextRideDate = (() => {
        if (ride.repeatDays && Array.isArray(ride.repeatDays) && ride.repeatDays.length) {
          // weekday-based
          const d = computeNextDate({ baseDateStr: ride.date, repeatDays: ride.repeatDays, rideTime: ride.time, price: ride.price });
          return d;
        }

        const nextDate = new Date(baseDateStr);
        if (Number.isNaN(nextDate.getTime())) return null;

        if (ride.recurringType === "Daily") nextDate.setDate(nextDate.getDate() + 1);
        if (ride.recurringType === "Weekly") nextDate.setDate(nextDate.getDate() + 7);
        if (ride.recurringType === "Monthly") nextDate.setMonth(nextDate.getMonth() + 1);
        return nextDate;
      })();

      if (!nextRideDate || Number.isNaN(nextRideDate.getTime())) continue;

      const nextDateStr = nextRideDate.toISOString().split("T")[0];
      const dupeKey = buildDupeKey({ ride, dateStr: nextDateStr });
      if (createdKeys.has(dupeKey)) continue;

      const existing = await Ride.findOne({
        username: ride.username,
        source: ride.source,
        destination: ride.destination,
        date: nextDateStr,
        time: ride.time,
        price: ride.price,
        isRecurring: true
      }).lean();

      if (existing) {
        createdKeys.add(dupeKey);
        continue;
      }

      createdKeys.add(dupeKey);

      const rideCode = "RIDE-" + Math.random().toString(36).substring(2, 8).toUpperCase();

      const created = await Ride.create({
        username: ride.username,
        uniqueCode: ride.uniqueCode,
        phoneNumber: ride.phoneNumber || "",
        source: ride.source,
        sourceLat: ride.sourceLat,
        sourceLng: ride.sourceLng,
        destination: ride.destination,
        date: nextDateStr,
        time: ride.time,
        seats: ride.seats,
        price: ride.price,
        status: "Scheduled",
        rideCode,
        rideOTP: "",
        isRecurring: true,
        recurringType: ride.recurringType,
        repeatDays: ride.repeatDays || []
      });

      // Phase 2: notify passengers subscribed to this route
      try {
        const subscribers = await FavoriteRoute.find({
          source: created.source,
          destination: created.destination
        }).lean();

        const uniquePassengerUsernames = Array.from(
          new Set(subscribers.map(s => s.username))
        );

        const notifications = uniquePassengerUsernames
          .filter(u => u && u !== created.username)
          .map(u => ({
            username: u,
            title: "🔔 New Ride Available",
            message: `New ride: ${created.source} → ${created.destination} on ${created.date} at ${created.time}`,
            type: "ride_published"
          }));

        if (notifications.length) {
          // insertMany to reduce DB roundtrips
          await Notification.insertMany(notifications);
        }
      } catch (notifyErr) {
        console.error("Recurring ride notify error:", notifyErr);
      }

    }
  } catch (e) {
    console.error("rideScheduler error:", e);
  }
});


