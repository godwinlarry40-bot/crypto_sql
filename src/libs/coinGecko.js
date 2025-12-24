const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// Cache for API responses
const cache = new NodeCache({ stdTTL: 30 }); // 30 seconds TTL

class CoinGeckoClient {
  constructor() {
    this.client = axios.create({
      baseURL: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  // Get coin list
  async getCoinList() {
    try {
      const cacheKey = 'coin_list';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get('/coins/list');
      cache.set(cacheKey, response.data, 3600); // Cache for 1 hour
      
      return response.data;
    } catch (error) {
      logger.error(`Get coin list error: ${error.message}`);
      throw error;
    }
  }

  // Get market data
  async getMarkets(vsCurrency = 'usd', limit = 100) {
    try {
      const cacheKey = `markets_${vsCurrency}_${limit}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get('/coins/markets', {
        params: {
          vs_currency: vsCurrency,
          order: 'market_cap_desc',
          per_page: limit,
          page: 1,
          sparkline: false,
          price_change_percentage: '1h,24h,7d'
        }
      });
      
      cache.set(cacheKey, response.data, 30); // Cache for 30 seconds
      
      return response.data;
    } catch (error) {
      logger.error(`Get markets error: ${error.message}`);
      throw error;
    }
  }

  // Get coin data by ID
  async getCoinData(coinId, includeTickers = false) {
    try {
      const cacheKey = `coin_${coinId}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get(`/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: includeTickers,
          market_data: true,
          community_data: true,
          developer_data: true,
          sparkline: false
        }
      });
      
      cache.set(cacheKey, response.data, 60); // Cache for 1 minute
      
      return response.data;
    } catch (error) {
      logger.error(`Get coin data error: ${error.message}`);
      throw error;
    }
  }

  // Get historical data
  async getHistoricalData(coinId, days = 7, vsCurrency = 'usd') {
    try {
      const cacheKey = `historical_${coinId}_${days}_${vsCurrency}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get(`/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: vsCurrency,
          days: days
        }
      });
      
      cache.set(cacheKey, response.data, 300); // Cache for 5 minutes
      
      return response.data;
    } catch (error) {
      logger.error(`Get historical data error: ${error.message}`);
      throw error;
    }
  }

  // Get OHLC data
  async getOHLC(coinId, days = 7, vsCurrency = 'usd') {
    try {
      const response = await this.client.get(`/coins/${coinId}/ohlc`, {
        params: {
          vs_currency: vsCurrency,
          days: days
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Get OHLC error: ${error.message}`);
      throw error;
    }
  }

  // Get global data
  async getGlobalData() {
    try {
      const cacheKey = 'global_data';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get('/global');
      cache.set(cacheKey, response.data, 60); // Cache for 1 minute
      
      return response.data;
    } catch (error) {
      logger.error(`Get global data error: ${error.message}`);
      throw error;
    }
  }

  // Get trending coins
  async getTrending() {
    try {
      const response = await this.client.get('/search/trending');
      return response.data;
    } catch (error) {
      logger.error(`Get trending error: ${error.message}`);
      throw error;
    }
  }

  // Get exchange rates
  async getExchangeRates() {
    try {
      const cacheKey = 'exchange_rates';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get('/exchange_rates');
      cache.set(cacheKey, response.data, 300); // Cache for 5 minutes
      
      return response.data;
    } catch (error) {
      logger.error(`Get exchange rates error: ${error.message}`);
      throw error;
    }
  }

  // Search coins
  async searchCoins(query) {
    try {
      const response = await this.client.get('/search', {
        params: { query }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Search coins error: ${error.message}`);
      throw error;
    }
  }

  // Get supported vs_currencies
  async getSupportedVsCurrencies() {
    try {
      const cacheKey = 'vs_currencies';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const response = await this.client.get('/simple/supported_vs_currencies');
      cache.set(cacheKey, response.data, 3600); // Cache for 1 hour
      
      return response.data;
    } catch (error) {
      logger.error(`Get vs currencies error: ${error.message}`);
      throw error;
    }
  }

  // Ping API
  async ping() {
    try {
      const response = await this.client.get('/ping');
      return response.data;
    } catch (error) {
      logger.error(`Ping error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CoinGeckoClient();