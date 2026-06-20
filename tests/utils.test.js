const calculateTrustScore = require("../utils/calculateTrustScore");
const calculateBadges = require("../utils/badgeHelper");
const calculateDynamicPrice = require("../utils/dynamicPricing");
const predictDemand = require("../utils/demandPrediction");
const forecastRevenue = require("../utils/revenueForecast");

describe("SahaVahan Utilities Unit Tests", () => {
  describe("calculateTrustScore", () => {
    test("should start at base score of 50 and add verified components", () => {
      const user = {
        isEmailVerified: true,
        phoneNumber: "+919876543210",
        isVerifiedDriver: true,
        completedRides: 5,
        averageRating: 4.8,
        reportCount: 0
      };
      // Base (50) + Email (10) + Phone (10) + Driver (15) + Completed Rides (5) + Rating (10) - Report (0) = 100
      expect(calculateTrustScore(user)).toBe(100);
    });

    test("should handle missing optional fields and minimum clamp", () => {
      const user = null;
      expect(calculateTrustScore(user)).toBe(35); // 50 - 15 (due to low rating penalty)
    });

    test("should apply penalties for reports and low ratings", () => {
      const user = {
        isEmailVerified: false,
        phoneNumber: null,
        isVerifiedDriver: false,
        completedRides: 0,
        averageRating: 2.5, // -15
        reportCount: 4 // -20
      };
      // Base (50) - Rating (15) - Reports (20) = 15
      expect(calculateTrustScore(user)).toBe(15);
    });

    test("should clamp minimum to 0 and maximum to 100", () => {
      const userLow = { averageRating: 1, reportCount: 20 };
      expect(calculateTrustScore(userLow)).toBe(0);

      const userHigh = { isEmailVerified: true, phoneNumber: "123", isVerifiedDriver: true, completedRides: 50, averageRating: 5 };
      expect(calculateTrustScore(userHigh)).toBe(100);
    });
  });

  describe("badgeHelper", () => {
    test("should award First Ride and verified badges", () => {
      const badges = calculateBadges({ totalRides: 1, isVerified: true });
      expect(badges).toContain("🚗 First Ride");
      expect(badges).toContain("✔ Verified User");
      expect(badges).toContain("🛡 Verified Driver");
    });

    test("should award Silver Driver and Top Rated Passenger badges", () => {
      const badges = calculateBadges({ totalRides: 50, passengerRating: 4.9 });
      expect(badges).toContain("🏆 10 Rides");
      expect(badges).toContain("🥈 Silver Driver");
      expect(badges).toContain("⭐ Top Rated Passenger");
    });

    test("should award Gold and Platinum badges for higher ride counts", () => {
      const badgesG = calculateBadges({ totalRides: 120 });
      expect(badgesG).toContain("🥇 Gold Driver");

      const badgesP = calculateBadges({ totalRides: 300 });
      expect(badgesP).toContain("💎 Platinum Driver");
    });

    test("should award regular commuter badge", () => {
      const badges = calculateBadges({ isRegularCommuter: true });
      expect(badges).toContain("📅 Regular Commuter");
    });
  });

  describe("dynamicPricing", () => {
    test("should return base price when demand is Low and seats > 2", () => {
      expect(calculateDynamicPrice(100, "Low", 3)).toBe(100);
    });

    test("should apply demand multipliers", () => {
      expect(calculateDynamicPrice(100, "Medium", 4)).toBe(115); // +15%
      expect(calculateDynamicPrice(100, "High", 3)).toBe(130); // +30%
    });

    test("should apply low seat scarcity surcharge", () => {
      expect(calculateDynamicPrice(100, "Low", 2)).toBe(110); // +10%
      expect(calculateDynamicPrice(100, "High", 1)).toBe(140); // +30% + 10% = +40%
    });
  });

  describe("demandPrediction", () => {
    test("should predict Low demand for small booking counts", () => {
      const result = predictDemand(5);
      expect(result.level).toBe("Low");
      expect(result.recommendedPriceMultiplier).toBe(1);
    });

    test("should predict Medium demand for booking counts between 20 and 49", () => {
      const result = predictDemand(25);
      expect(result.level).toBe("Medium");
      expect(result.recommendedPriceMultiplier).toBe(1.1);
    });

    test("should predict High demand for booking counts >= 50", () => {
      const result = predictDemand(60);
      expect(result.level).toBe("High");
      expect(result.recommendedPriceMultiplier).toBe(1.3);
    });

    test("should handle invalid inputs", () => {
      expect(predictDemand(null).level).toBe("Low");
      expect(predictDemand("abc").level).toBe("Low");
    });
  });

  describe("revenueForecast", () => {
    test("should return average of monthly earnings list", () => {
      expect(forecastRevenue([100, 200, 300])).toBe(200);
    });

    test("should handle empty or invalid inputs", () => {
      expect(forecastRevenue([])).toBe(0);
      expect(forecastRevenue(null)).toBe(0);
    });

    test("should handle non-numeric items gracefully", () => {
      expect(forecastRevenue([100, "200", null, "abc"])).toBe(75); // (100 + 200 + 0 + 0) / 4 = 75
    });
  });
});
