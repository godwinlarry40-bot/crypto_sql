const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// Cache: Prices (30s), Trends (5m), Fear/Greed (1h)
const cache = new NodeCache();

const cryptoService = {
  // 1. Get Real-Time Prices
  getRealTimePrices: async (symbols = []) => {
    try {
      const cacheKey = `prices_${symbols.sort().join('_') || 'top100'}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const params = {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 100,
        sparkline: false,
        price_change_percentage: '24h'
      };

      if (symbols.length > 0) {
        const ids = symbols.map(s => symbolToIdMap[s.toLowerCase()] || s.toLowerCase());
        params.ids = ids.join(',');
      }

      const response = await axios.get(`${process.env.COINGECKO_API_URL}/coins/markets`, { params });
      
      const prices = response.data.reduce((acc, coin) => {
        acc[coin.symbol.toUpperCase()] = {
          price: parseFloat(coin.current_price),
          change_24h: coin.price_change_percentage_24h,
          market_cap: coin.market_cap,
          image: coin.image,
          last_updated: coin.last_updated
        };
        return acc;
      }, {});

      cache.set(cacheKey, prices, 30); // 30 second cache
      return prices;
    } catch (error) {
      logger.error(`Crypto Price Fetch Error: ${error.message}`);
      // Fallback: If API fails, return cached data even if expired (stale-while-revalidate)
      return cache.get(`prices_top100`) || {};
    }
  },

  // 2. Market Trends (Top Gainers/Losers)
  getMarketTrends: async () => {
    try {
      const cacheKey = 'market_trends';
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await axios.get(`${process.env.COINGECKO_API_URL}/coins/markets`, {
        params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50 }
      });

      const coins = response.data;
      const trends = {
        top_gainers: [...coins].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 5),
        top_losers: [...coins].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 5),
        market_summary: {
          btc_dominance: (coins.find(c => c.symbol === 'btc')?.market_cap / coins.reduce((s, c) => s + c.market_cap, 0)) * 100
        }
      };

      cache.set(cacheKey, trends, 300); // 5 minute cache
      return trends;
    } catch (err) {
      logger.error('Market Trends Error', err);
      throw err;
    }
  },

  // 3. Fear and Greed Index
  getFearAndGreedIndex: async () => {
    try {
      const cached = cache.get('fng_index');
      if (cached) return cached;

      const { data } = await axios.get('https://api.alternative.me/fng/?limit=1');
      const result = {
        value: parseInt(data.data[0].value),
        sentiment: data.data[0].value_classification,
        timestamp: new Date(data.data[0].timestamp * 1000)
      };

      cache.set('fng_index', result, 3600); // 1 hour cache
      return result;
    } catch (err) {
      return { value: 50, sentiment: 'Neutral' }; // Safe fallback
    }
  }
};

// Internal Mapping to ensure ID consistency
const symbolToIdMap = {
  btc: 'bitcoin',
  eth: 'ethereum',
  usdt: 'tether',
  bnb: 'binancecoin',
  sol: 'solana',
  usdc: 'usd-coin',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
  trx: 'tron'
};

module.exports = cryptoService;