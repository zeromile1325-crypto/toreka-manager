/**
 * Exchange rate fetcher with 1-hour cache
 * Uses free API: https://api.exchangerate-api.com/v4/latest/JPY
 */

let cachedRates = null;
let cacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

const TARGET_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'HKD', 'CNY', 'KRW', 'TWD', 'THB'];

export async function getExchangeRates() {
  const now = Date.now();
  if (cachedRates && (now - cacheTime) < CACHE_TTL) {
    return cachedRates;
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/JPY');
    const data = await res.json();

    const rates = {};
    for (const cur of TARGET_CURRENCIES) {
      if (data.rates[cur]) {
        rates[cur] = data.rates[cur];
      }
    }
    rates._updatedAt = new Date().toISOString();

    cachedRates = rates;
    cacheTime = now;
    return rates;
  } catch (err) {
    console.error('Exchange rate fetch failed:', err.message);
    return cachedRates || { USD: 0.0067, EUR: 0.0062, _updatedAt: 'fallback' };
  }
}

export function convertPrice(jpyPrice, rates) {
  const result = { JPY: jpyPrice };
  for (const [cur, rate] of Object.entries(rates)) {
    if (cur.startsWith('_')) continue;
    result[cur] = Math.round(jpyPrice * rate * 100) / 100;
  }
  return result;
}
