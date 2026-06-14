function calculateDynamicPrice(
  basePrice,
  demandLevel,
  availableSeats
) {
  let multiplier = 1;

  if (demandLevel === "High") {
    multiplier += 0.30;
  }

  if (demandLevel === "Medium") {
    multiplier += 0.15;
  }

  if (Number(availableSeats) <= 2) {
    multiplier += 0.10;
  }

  return Math.round(Number(basePrice) * multiplier);
}

module.exports = calculateDynamicPrice;

