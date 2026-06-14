function predictDemand(bookingCount) {
  if (!Number.isFinite(bookingCount)) bookingCount = 0;

  if (bookingCount >= 50) {
    return {
      level: "High",
      recommendedPriceMultiplier: 1.3,
    };
  }

  if (bookingCount >= 20) {
    return {
      level: "Medium",
      recommendedPriceMultiplier: 1.1,
    };
  }

  return {
    level: "Low",
    recommendedPriceMultiplier: 1,
  };
}

module.exports = predictDemand;

