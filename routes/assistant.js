const express = require("express");
const router = express.Router();

const Ride = require("../models/Ride");
const BookedRide = require("../models/BookedRide");
const { askGemini } = require("../services/geminiService");

function normalizeRouteCity(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

function parseFromToTodayOrTomorrow(q) {
  // Examples:
  // - "available from Vijayawada to Hyderabad today"
  // - "find rides from Vijayawada to Hyderabad tomorrow"
  // - "price for route Vijayawada to Hyderabad"
  const fromTo = q.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(today|tomorrow))?$/i);
  if (!fromTo) {
    // Alternative phrasing: "between X and Y" optionally followed by today/tomorrow
    const between = q.match(/between\s+(.+?)\s+and\s+(.+?)(?:\s+(today|tomorrow))?$/i);
    if (!between) return null;
    return {
      source: between[1],
      destination: between[2],
      day: between[3] ? String(between[3]).toLowerCase() : null,
    };
  }


  let source = fromTo[1];
  let destination = fromTo[2];
  const day = fromTo[3] ? String(fromTo[3]).toLowerCase() : null;

  // Strip any trailing intent words that might leak in
  // like "today" or "available"
  source = String(source)
    .replace(/\b(today|tomorrow|available|rides|ride|price|cost|fare|how much|nearest pickup)\b.*$/i, "")
    .trim();
  destination = String(destination)
    .replace(/\b(today|tomorrow|available|rides|ride|price|cost|fare|how much|nearest pickup)\b.*$/i, "")
    .trim();


  if (!source || !destination) return null;

  return {
    source,
    destination,
    day,
  };
}

function getDayRange(day) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (!day || day === "today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { $gte: start.toISOString().split("T")[0], $lt: end.toISOString().split("T")[0] };
  }

  if (day === "tomorrow") {
    const tomorrowStart = new Date(start);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    return { $gte: tomorrowStart.toISOString().split("T")[0], $lt: tomorrowEnd.toISOString().split("T")[0] };
  }

  // Fallback: treat unknown as today
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { $gte: start.toISOString().split("T")[0], $lt: end.toISOString().split("T")[0] };
}

async function findTopRidesForRoute({ source, destination, day }) {
  // Status: Scheduled + In Progress
  const dateRange = getDayRange(day);

  // Fetch + lightweight ranking (fastest not available reliably; use price asc + date asc)
  // Smart search endpoint exists, but your endpoint may be down; DB query directly.
  const rides = await Ride.find({
    source,
    destination,
    status: { $in: ["Scheduled", "In Progress"] },
    date: { $gte: dateRange.$gte, $lt: dateRange.$lt },
  })
    .sort({ date: 1, time: 1, price: 1 })
    .limit(50);

  return rides.slice(0, 5);
}

async function getRecommendedPriceForRoute({ source, destination }) {
  // Mirror routes/rides.js GET /recommended-price/:source/:destination
  const rides = await Ride.find({ source, destination }).select("price");
  const baseFare = rides && rides.length ? rides.reduce((sum, r) => sum + (Number(r.price) || 0), 0) / rides.length : 300;

  const bookings = await BookedRide.countDocuments({ source, destination });
  const predictDemand = require("../utils/demandPrediction");
  const prediction = predictDemand(bookings);

  const recommendedPrice = Math.round(baseFare * prediction.recommendedPriceMultiplier);
  return recommendedPrice;
}

// Phase 1: basic rule-based assistant

// Quick health check for route wiring
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Assistant route working",
  });
});

// Log incoming requests (debug for dashboard -> assistant payload)
router.post("/ask", async (req, res) => {
  console.log("BODY:", req.body);

  try {
    const { username, question, message } = req.body || {};

    const userQuestion = question || message;

    if (!username || !userQuestion) {
      return res.status(400).json({ response: "Missing username or message." });
    }

    const q = String(userQuestion).toLowerCase();
    let response = null;

    // Quick local intents to avoid Gemini usage
    if (q === "hi" || q === "hello" || q.includes(" hi ") || q.includes(" hello")) {
      return res.json({ response: "👋 Hello! How can I help with your rides today?" });
    }

    // Normalize for common phrasing variants
    const isBooked = q.includes("booked ride") || q.includes("booked rides");
    const isPublished =
      q.includes("published ride") || q.includes("published rides");
    const isCompleted =
      q.includes("completed ride") || q.includes("completed rides");

    if (isBooked || q.includes("show my booked rides")) {
      const rides = await BookedRide.find({ bookedBy: username });
      response = `You have booked ${rides.length} rides`;
    } else if (isPublished || q.includes("show my published rides")) {
      const rides = await Ride.find({ username });
      response = `You have published ${rides.length} rides`;
    } else if (isCompleted || q.includes("show completed rides")) {
      const rides = await Ride.find({ username, status: "Completed" });
      response = `Completed rides: ${rides.length}`;
    } else if (
      q.includes("earnings") ||
      q.includes("my earnings") ||
      q.includes("total earnings") ||
      q.includes("show my earnings") ||
      q.includes("how much did i earn") ||
      q.includes("how much did i earn?")
    ) {
      const rides = await Ride.find({ username, status: "Completed" });
      const total = rides.reduce(
        (sum, ride) => sum + Number(ride.price || 0),
        0
      );
      response = `Your total earnings are ₹${total}`;
    } else if (
      q.includes("spend") ||
      q.includes("spent") ||
      q.includes("expenses") ||
      q.includes("money spent") ||
      q.includes("total spent")
    ) {
      const bookings = await BookedRide.find({ bookedBy: username });

      const totalSpent = bookings.reduce(
        (sum, booking) => sum + Number(booking.totalPrice || 0),
        0
      );

      response = `You have spent ₹${totalSpent} on rides.`;
    }

    // Ride availability / pricing intents (DB fallback)
    const wantsAvailability =
      q.includes("available") ||
      q.includes("find rides") ||
      q.includes("find ride") ||
      q.includes("rides available") ||
      q.includes("nearest pickup") ||
      q.includes("show rides") ||
      q.includes("show available rides") ||
      q.includes("what rides") ||
      q.includes("available ride");

    const wantsPrice = q.includes("price") || q.includes("cost") || q.includes("fare") || q.includes("how much");


    const parsed = parseFromToTodayOrTomorrow(q);

    // Route DB search should be chosen whenever we have a from/to parse.
    // This makes Gemini a true fallback for general chat.
    if (parsed && parsed.source && parsed.destination && (wantsAvailability || wantsPrice || q.match(/\bfrom\b.*\bto\b/i) || q.match(/\bbetween\b.*\band\b/i))) {

      const source = parsed.source;
      const destination = parsed.destination;

      if (wantsPrice) {
        const recommendedPrice = await getRecommendedPriceForRoute({ source, destination });
        response = `Recommended price from ${source} to ${destination}: ₹${recommendedPrice}`;
        return res.json({ response });
      }

      const topRides = await findTopRidesForRoute({
        source,
        destination,
        day: parsed.day,
      });

      console.log("[Assistant] Ride DB search:", {
        source,
        destination,
        day: parsed.day || "today",
        count: topRides.length,
      });

      if (!topRides.length) {
        return res.json({
          response: `No rides found from ${source} to ${destination} ${parsed.day ? parsed.day : "today"}. Please try again in a moment.`,
        });
      }

      const lines = topRides.map((r, idx) => {
        return `${idx + 1}) ${r.time || ""} | ₹${r.price} | Seats: ${r.seats} | Driver: ${r.username} | Status: ${r.status} | Date: ${r.date}`;
      });

      response = `Available rides from ${source} to ${destination} (${parsed.day ? parsed.day : "today"}):\n${lines.join("\n")}`;
      return res.json({ response });
    }

    // If a rule matched, return immediately.
    if (response) {
      return res.json({ response });
    }


    // Gemini fallback (hybrid AI)
    console.log("[Assistant] Gemini fallback branch:");
    console.log("[Assistant] username:", username);

    const [bookedRides, publishedRides, completedRides] = await Promise.all([
      BookedRide.find({ bookedBy: username }),
      Ride.find({ username }),
      Ride.find({ username, status: "Completed" }),
    ]);

    console.log("[Assistant] DB results:");
    console.log("  bookedRides:", bookedRides.length);
    console.log("  publishedRides:", publishedRides.length);
    console.log("  completedRides:", completedRides.length);


    const earnings = completedRides.reduce(
      (sum, ride) => sum + Number(ride.price || 0),
      0
    );

    const spent = bookedRides.reduce(
      (sum, ride) => sum + Number(ride.totalPrice || 0),
      0
    );

    const prompt = `
You are SahaVahan AI Assistant.

Use the user’s data below when relevant.
Always respond naturally, concisely, and in a helpful tone.
Use rupee symbol ₹ for money.

User: ${username}

Context:
- Booked Rides: ${bookedRides.length}
- Published Rides: ${publishedRides.length}
- Completed Rides: ${completedRides.length}
- Total Earnings: ₹${earnings}
- Total Spent: ₹${spent}

Question:
${userQuestion}

Answer:`;

    let aiResponse;
    try {
      aiResponse = await askGemini(prompt);
    } catch (e) {
      // Avoid “no response from assistant” on Gemini failures/503s
      aiResponse = "🤖 AI assistant is busy right now. Please try again in a few seconds.";
    }

    const finalResponse = aiResponse || "🤖 AI assistant is busy right now. Please try again in a few seconds.";
    return res.json({ response: finalResponse });

  } catch (error) {
    console.error("Assistant error:");
    console.error(error);
    console.error(error && error.stack);

    console.error("Assistant error:");

    return res.json({
      response:
        "🤖 AI assistant is currently busy. Please try again in a few seconds.",
    });
  }
});

module.exports = router;

