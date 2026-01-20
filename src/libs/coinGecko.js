const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// CHANGE: Increased TTL for prices to 2 minutes to stay within free tier limits
const cache = new NodeCache({ stdTTL: 120 });

class CoinGeckoClient {
  constructor() {
    this.client = axios.create({
      baseURL: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        // Note: Demo API keys use 'x-cg-demo-api-key', Pro keys use 'x-cg-pro-api-key'
        'x-cg-demo-api-key': process.env.COINGECKO_API_KEY 
      }
    });

    this.symbolToId = {
      'btc': 'bitcoin',
      'eth': 'ethereum',
      'usdt': 'tether',
      'bnb': 'binancecoin',
      'sol': 'solana',
      'trx': 'tron',
      'usdc': 'usd-coin',
      'doge': 'dogecoin'
    };
  }

  // 1. Get Simple Price
  async getSimplePrice(symbols, vsCurrency = 'usd') {
    try {
      if (!symbols || symbols.length === 0) return {};

      // CHANGE: Filter out any null/undefined and map to IDs
      const ids = symbols
        .filter(s => !!s)
        .map(s => this.symbolToId[s.toLowerCase()] || s.toLowerCase())
        .join(',');

      const cacheKey = `price_${ids}_${vsCurrency}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await this.client.get('/simple/price', {
        params: {
          ids: ids,
          vs_currencies: vsCurrency,
          include_24hr_change: true
        }
      });

      // CHANGE: Added more aggressive caching to prevent 429 Rate Limit errors
      cache.set(cacheKey, response.data); 
      return response.data;
    } catch (error) {
      this._handleError(error, 'Simple Price');
      // CHANGE: Return an empty object so the portfolio service doesn't crash on .map()
      return {};
    }
  }

  // 2. Get Historical Data
  async getHistoricalData(coinId, days = 7) {
    try {
      const id = this.symbolToId[coinId.toLowerCase()] || coinId.toLowerCase();
      const cacheKey = `hist_${id}_${days}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await this.client.get(`/coins/${id}/market_chart`, {
        params: { vs_currency: 'usd', days: days }
      });

      if (!response.data || !response.data.prices) return [];

      const formatted = response.data.prices.map(p => ({
        x: p[0], 
        y: parseFloat(p[1].toFixed(2)) 
      }));

      cache.set(cacheKey, formatted, 600); // Cache historical data for 10 mins
      return formatted;
    } catch (error) {
      this._handleError(error, 'Historical Data');
      return [];
    }
  }

  // 3. Get Market Summary
  async getMarketSummary(limit = 20) {
    try {
      const cacheKey = `market_summary_${limit}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await this.client.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: limit,
          sparkline: true,
          price_change_percentage: '24h'
        }
      });

      cache.set(cacheKey, response.data, 300); // 5 minute cache
      return response.data;
    } catch (error) {
      this._handleError(error, 'Market Summary');
      return [];
    }
  }

  _handleError(error, context) {
    const status = error.response?.status;
    if (status === 429) {
      logger.error(`🚨 CoinGecko Rate Limit Hit (${context}). Using cached data if available.`);
    } else if (status === 401 || status === 403) {
      logger.error(`🔑 CoinGecko API Key Invalid or Expired`);
    } else {
      logger.error(`❌ CoinGecko Error (${context}): ${error.message}`);
    }
  }
}

module.exports = new CoinGeckoClient();