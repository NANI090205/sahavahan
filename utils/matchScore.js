function calculateMatchScore(
  userSource,
  userDestination,
  rideSource,
  rideDestination,
  userHistory = []
) {
  let score = 0;

  if (
    userSource &&
    rideSource &&
    userSource.toLowerCase() === rideSource.toLowerCase()
  ) {
    score += 50;
  }

  if (
    userDestination &&
    rideDestination &&
    userDestination.toLowerCase() === rideDestination.toLowerCase()
  ) {
    score += 50;
  }

  // If the user previously booked the same route, reward it.
  // Expected history entries like: { source, destination }
  userHistory.forEach((route) => {
    if (
      route &&
      route.source &&
      route.destination &&
      route.source.toLowerCase() === (rideSource || '').toLowerCase() &&
      route.destination.toLowerCase() === (rideDestination || '').toLowerCase()
    ) {
      score += 20;
    }
  });

  return Math.min(100, score);
}

module.exports = calculateMatchScore;

