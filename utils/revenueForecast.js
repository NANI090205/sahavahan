function forecastRevenue(monthlyEarnings) {
  if (!Array.isArray(monthlyEarnings) || monthlyEarnings.length === 0) {
    return 0;
  }

  const total = monthlyEarnings.reduce((a, b) => a + (Number(b) || 0), 0);
  return Math.round(total / monthlyEarnings.length);
}

module.exports = forecastRevenue;

