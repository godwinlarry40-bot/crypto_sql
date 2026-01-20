const axios = require('axios');
const logger = require('./logger');

class CoinGeckoClient {
  constructor() {
    this.baseUrl = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
    this.apiKey = process.env.COINGECKO_API_KEY;
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        ...(this.apiKey && { 'x-cg-demo-api-key': this.apiKey })
      }
    });
  }

  // Get current prices for a list of coin IDs (e.g., ['bitcoin', 'ethereum'])
  async getSimplePrices(ids) {
    try {
      const response = await this.axiosInstance.get('/simple/price', {
        params: {
          ids: ids.join(','),
          vs_currencies: 'usd',
          include_24hr_change: true
        }
      });
      return response.data;
    } catch (error) {
      logger.error(`CoinGecko SimplePrice Error: ${error.message}`);
      throw error;
    }
  }

  // Get full market data for portfolio list
  async getMarketData(ids) {
    try {
      const response = await this.axiosInstance.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: ids.join(','),
          order: 'market_cap_desc',
          sparkline: false
        }
      });
      return response.data;
    } catch (error) {
      logger.error(`CoinGecko MarketData Error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new CoinGeckoClient();