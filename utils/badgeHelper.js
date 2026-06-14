function calculateBadges({
  totalRides = 0,
  passengerRating = 0,
  isVerified = false,
  isRegularCommuter = false
} = {}) {
  const badges = [];


  if (totalRides >= 1) {
    badges.push("🚗 First Ride");
  }

  if (totalRides >= 10) {
    badges.push("🏆 10 Rides");
  }

  if (totalRides >= 50) {
    badges.push("🥈 Silver Driver");
  }

  if (totalRides >= 100) {
    badges.push("🥇 Gold Driver");
  }

  if (totalRides >= 250) {
    badges.push("💎 Platinum Driver");
  }

  if (passengerRating >= 4.8) {
    badges.push("⭐ Top Rated Passenger");
  }

  if (isVerified) {
    badges.push("✔ Verified User");
  }

  // Driver verification badge (requested)
  if (isVerified) {
    badges.push("🛡 Verified Driver");
  }

  if (isRegularCommuter) {
    badges.push("📅 Regular Commuter");
  }

  return badges;
}

module.exports = calculateBadges;

