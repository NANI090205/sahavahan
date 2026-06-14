const express = require('express');
const router = express.Router();

const Ride = require('../models/Ride');
const BookedRide = require('../models/BookedRide');
const calculateMatchScore = require('../utils/matchScore');

function parseTimeToMinutes(timeStr) {
  // Accept formats like "7:15 AM", "09:40", "7.30 PM", etc.
  if (!timeStr) return null;
  const s = String(timeStr).trim();

  // Normalize separators
  const cleaned = s.replace(/\./g, ':');

  // 12-hour with AM/PM
  const m12 = cleaned.match(/^([0-1]?\d|2[0-3])\s*:\s*([0-5]\d)\s*([AaPp][Mm])$/);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2]);
    const ampm = m12[3].toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return h * 60 + min;
  }

  // 24-hour HH:MM
  const m24 = cleaned.match(/^([0-1]?\d|2[0-3])\s*:\s*([0-5]\d)$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    return h * 60 + min;
  }

  return null;
}

function computeReason({ best }) {
  const reasons = [];
  if (best?.isFastest) reasons.push('Fastest');
  if (best?.isCheapest) reasons.push('Cheapest');
  if (best?.isHighestRating) reasons.push('Highest driver rating');
  if (best?.isBestMatch) reasons.push('Best match score');
  return reasons.length ? reasons.join(' + ') : 'Best available option';
}

// Phase 1: rule-based planner
// POST /api/route-planner/plan
// Body: { destination, arrivalTime, username?, source?, budget? }
router.post('/plan', async (req, res) => {
  try {
    const {
      destination,
      arrivalTime,
      username,
      source,
      budget,
    } = req.body || {};

    if (!destination || !arrivalTime) {
      return res.status(400).json({ message: 'destination and arrivalTime are required' });
    }

    const dest = String(destination).trim();
    const timeLimitMinutes = parseTimeToMinutes(arrivalTime);
    if (timeLimitMinutes == null) {
      return res.status(400).json({ message: 'Invalid arrivalTime format. Use e.g. "10:00 AM".' });
    }

    const timeFieldAssumption = 'ride.time';

    let rides = await Ride.find({ destination: dest, status: 'Scheduled' }).lean();

    // Optional budget filter
    if (budget != null && budget !== '') {
      const b = Number(budget);
      if (!Number.isNaN(b)) {
        rides = rides.filter(r => Number(r.price || 0) <= b);
      }
    }

    // Filter by time constraint using ride.time as the only available time field.
    rides = rides
      .map(r => {
        const mins = parseTimeToMinutes(r.time);
        return { ...r, _rideTimeMinutes: mins };
      })
      .filter(r => r._rideTimeMinutes != null && r._rideTimeMinutes <= timeLimitMinutes);

    // If no rides match hard filters, fall back to destination+scheduled (still filtered by time if possible)
    if (!rides.length) {
      rides = await Ride.find({ destination: dest, status: 'Scheduled' }).lean();
    }

    // User history boosts
    let history = [];
    if (username && source) {
      const historyDocs = await BookedRide.find({ bookedBy: username }).select('source destination');
      history = (historyDocs || []).map(b => ({ source: b.source, destination: b.destination }));
    }

    // Rank/score
    const ranked = rides
      .map(r => {
        const matchScore = calculateMatchScore(
          source || '',
          dest,
          r.source,
          r.destination,
          history
        );

        const rideTimeMinutes = r._rideTimeMinutes != null ? r._rideTimeMinutes : parseTimeToMinutes(r.time);
        const departureTimeMinutes = rideTimeMinutes ?? 999999;

        // Driver rating: repo uses reviews. We don't have it here per-ride,
        // so we approximate with review-derived rating if present in Ride (not in schema).
        // We'll default to 0 rating for now.
        const driverRating = 0;

        // Planner ranking: cheapest -> earlier -> higher rating -> match
        // We keep matchScore as final tie-breaker.
        const matchTie = Number(matchScore || 0);
        const price = Number(r.price || 0);

        return {
          ...r,
          matchScore,
          driverRating,
          _departureTimeMinutes: departureTimeMinutes,
          _price: price,
          _matchTie: matchTie,
        };
      })
      .sort((a, b) => {
        // (1) Cheapest
        if (a._price !== b._price) return a._price - b._price;
        // (2) Earlier time
        if (a._departureTimeMinutes !== b._departureTimeMinutes) return a._departureTimeMinutes - b._departureTimeMinutes;
        // (3) Higher rating
        if (a.driverRating !== b.driverRating) return b.driverRating - a.driverRating;
        // (4) Better match score
        return b.matchScore - a.matchScore;
      });

    const topN = ranked.slice(0, 10);
    if (!topN.length) return res.json({ message: 'No rides found', rides: [] });

    // Determine best flags for reason
    const best = topN[0];
    const cheapest = topN.reduce((acc, r) => (r._price < acc._price ? r : acc), topN[0]);
    const fastest = topN.reduce((acc, r) => (r._departureTimeMinutes < acc._departureTimeMinutes ? r : acc), topN[0]);
    const bestMatch = topN.reduce((acc, r) => (r.matchScore > acc.matchScore ? r : acc), topN[0]);

    const withReason = {
      ...best,
      reason: computeReason({
        best: {
          isCheapest: best._id ? String(best._id) === String(cheapest._id) : best._price === cheapest._price,
          isFastest: best._id ? String(best._id) === String(fastest._id) : best._departureTimeMinutes === fastest._departureTimeMinutes,
          isHighestRating: best.driverRating === (topN[0].driverRating),
          isBestMatch: best._id ? String(best._id) === String(bestMatch._id) : best.matchScore === bestMatch.matchScore,
        }
      }),
      timeFieldAssumption,
    };

    const response = {
      best: {
        driver: withReason.username,
        departureTime: withReason.time,
        arrivalTime: arrivalTime,
        price: withReason.price,
        matchScore: withReason.matchScore,
        reason: withReason.reason,
        rideId: withReason._id,
        source: withReason.source,
        destination: withReason.destination,
        date: withReason.date,
      },
      rides: topN.map(r => ({
        rideId: r._id,
        driver: r.username,
        departureTime: r.time,
        price: r.price,
        matchScore: r.matchScore,
        source: r.source,
        destination: r.destination,
        date: r.date,
      }))
    };

    return res.json(response);
  } catch (error) {
    console.error('routePlanner plan error:', error);
    return res.status(500).json({ message: 'Failed to plan route' });
  }
});

module.exports = router;

