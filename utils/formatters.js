// New file for formatting functions
const formatAmount = (amount, usdRate) => {
  const formattedVerse = parseFloat(amount).toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
  const usdValue = amount * usdRate;
  return {
    verse: formattedVerse,
    usd: usdValue.toLocaleString("en-US", {
      maximumFractionDigits: 2
    })
  };
};

module.exports = { formatAmount }; 