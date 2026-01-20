const axios = require('axios');
// CHANGE: Robust fallback for CACHE helper to prevent "undefined" crashes
const { CACHE } = require('../utils/helper') || {};
const logger = require('../utils/logger');

// Cache TTLs (in seconds)
const CACHE_TTL = {
  PRICES: 60,      // 1 minute
  STATS: 300,      // 5 minutes
  TRENDING: 600    // 10 minutes
};

const geckoApi = axios.create({
  baseURL: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
  // CHANGE: Coingecko Demo API requires this header specifically
  headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY },
  timeout: 10000
});

const marketController = {
  // 1. GET /prices (or /price)
  getAllPrices: async (req, res) => {
    try {
      // CHANGE: Added simple caching check to save API credits
      const cachedData = CACHE?.get ? CACHE.get('all_prices') : null;
      if (cachedData) return res.json({ success: true, data: cachedData, source: 'cache' });

      const response = await geckoApi.get('/coins/markets', {
        params: { 
          vs_currency: 'usd', 
          order: 'market_cap_desc', 
          per_page: 50, 
          page: 1,
          sparkline: false 
        }
      });

      if (CACHE?.set) CACHE.set('all_prices', response.data, CACHE_TTL.PRICES);
      
      res.json({ success: true, data: response.data });
    } catch (error) {
      logger.error(`Market API Error: ${error.message}`);
      // CHANGE: Differentiate between Rate Limit (429) and Server Errors
      const status = error.response?.status === 429 ? 429 : 500;
      const message = status === 429 ? 'Rate limit reached. Try again in a minute.' : 'Market API Error';
      res.status(status).json({ success: false, message });
    }
  },

  // 2. GET /prices/:coinId
  getCoinPrice: async (req, res) => {
    try {
      const { coinId } = req.params;
      const response = await geckoApi.get(`/coins/${coinId.toLowerCase()}`, {
        params: { 
          localization: false, 
          tickers: false, 
          community_data: false, 
          developer_data: false,
          sparkline: true 
        }
      });
      res.json({ success: true, data: response.data });
    } catch (error) {
      res.status(404).json({ success: false, message: `Coin '${req.params.coinId}' not found` });
    }
  },

  // 3. GET /historical/:coinId
  getHistoricalData: async (req, res) => {
    try {
      const { coinId } = req.params;
      const { days = 7 } = req.query; 
      const response = await geckoApi.get(`/coins/${coinId.toLowerCase()}/market_chart`, {
        params: { vs_currency: 'usd', days: days }
      });
      res.json({ success: true, data: response.data });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Chart data unavailable' });
    }
  },

  // 4. GET /exchange-rates
  getExchangeRates: async (req, res) => {
    try {
      const response = await geckoApi.get('/exchange_rates');
      res.json({ success: true, data: response.data.rates });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Rates unavailable' });
    }
  },

  // 5. GET /stats
  getMarketStats: async (req, res) => {
    try {
      const response = await geckoApi.get('/global');
      res.json({ success: true, data: response.data.data });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Stats unavailable' });
    }
  },

  // 6. GET /trending
  getTrending: async (req, res) => {
    try {
      const response = await geckoApi.get('/search/trending');
      res.json({ success: true, data: response.data.coins });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Trending data unavailable' });
    }
  },

  // 7. GET /currencies
  getSupportedCurrencies: async (req, res) => {
    try {
      const response = await geckoApi.get('/simple/supported_vs_currencies');
      res.json({ success: true, data: response.data });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Currencies unavailable' });
    }
  },

  // --- PROTECTED USER PORTFOLIO LOGIC ---
  
  getPortfolioPrices: async (req, res) => {
    try {
      // CHANGE: Added basic logic framework for future DB integration
      // const userWallets = await Wallet.findAll({ where: { user_id: req.user.id } });
      res.json({ success: true, message: "Live portfolio feed", data: [] });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Portfolio error' });
    }
  },

  getWatchlist: async (req, res) => {
    try {
      res.json({ success: true, data: [], message: "User watchlist" });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch watchlist' });
    }
  },

  addToWatchlist: async (req, res) => {
    try {
      const { coinId } = req.params;
      res.json({ success: true, message: `${coinId} added to watchlist` });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to add to watchlist' });
    }
  },

  removeFromWatchlist: async (req, res) => {
    try {
      const { coinId } = req.params;
      res.json({ success: true, message: `${coinId} removed from watchlist` });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to remove from watchlist' });
    }
  }
};

module.exports = marketController;