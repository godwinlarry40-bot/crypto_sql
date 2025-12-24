const axios = require('axios');
const { CACHE } = require('../utils/helper');
const logger = require('../utils/logger');

const marketController = {
  // Get all cryptocurrency prices
  getAllPrices: async (req, res) => {
    try {
      const cacheKey = 'crypto_prices_all';
      const cachedData = CACHE.get(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }

      const response = await axios.get(`${process.env.COINGECKO_API_URL}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          page: 1,
          sparkline: false,
          price_change_percentage: '1h,24h,7d'
        }
      });

      const prices = response.data.map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        current_price: coin.current_price,
        market_cap: coin.market_cap,
        market_cap_rank: coin.market_cap_rank,
        total_volume: coin.total_volume,
        high_24h: coin.high_24h,
        low_24h: coin.low_24h,
        price_change_24h: coin.price_change_24h,
        price_change_percentage_24h: coin.price_change_percentage_24h,
        price_change_percentage_1h_in_currency: coin.price_change_percentage_1h_in_currency,
        price_change_percentage_24h_in_currency: coin.price_change_percentage_24h_in_currency,
        price_change_percentage_7d_in_currency: coin.price_change_percentage_7d_in_currency,
        last_updated: coin.last_updated
      }));

      // Cache for 30 seconds
      CACHE.set(cacheKey, prices, 30);

      res.json({
        success: true,
        data: prices,
        cached: false
      });
    } catch (error) {
      logger.error(`Get all prices error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cryptocurrency prices'
      });
    }
  },

  // Get specific cryptocurrency price
  getCoinPrice: async (req, res) => {
    try {
      const { coinId } = req.params;
      const cacheKey = `coin_price_${coinId}`;
      const cachedData = CACHE.get(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }

      const response = await axios.get(`${process.env.COINGECKO_API_URL}/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false
        }
      });

      const coin = response.data;
      const priceData = {
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        current_price: coin.market_data.current_price,
        market_cap: coin.market_data.market_cap,
        total_volume: coin.market_data.total_volume,
        high_24h: coin.market_data.high_24h,
        low_24h: coin.market_data.low_24h,
        price_change_24h: coin.market_data.price_change_24h,
        price_change_percentage_24h: coin.market_data.price_change_percentage_24h,
        price_change_percentage_7d: coin.market_data.price_change_percentage_7d,
        price_change_percentage_30d: coin.market_data.price_change_percentage_30d,
        all_time_high: coin.market_data.ath,
        all_time_low: coin.market_data.atl,
        last_updated: coin.market_data.last_updated,
        image: coin.image,
        links: coin.links
      };

      // Cache for 30 seconds
      CACHE.set(cacheKey, priceData, 30);

      res.json({
        success: true,
        data: priceData,
        cached: false
      });
    } catch (error) {
      logger.error(`Get coin price error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch coin price'
      });
    }
  },

  // Get historical price data
  getHistoricalData: async (req, res) => {
    try {
      const { coinId, days = 7, interval = 'daily' } = req.query;
      
      const response = await axios.get(
        `${process.env.COINGECKO_API_URL}/coins/${coinId}/market_chart`,
        {
          params: {
            vs_currency: 'usd',
            days: days,
            interval: interval
          }
        }
      );

      const historicalData = {
        prices: response.data.prices.map(([timestamp, price]) => ({
          timestamp,
          price,
          date: new Date(timestamp).toISOString()
        })),
        market_caps: response.data.market_caps,
        total_volumes: response.data.total_volumes
      };

      res.json({
        success: true,
        data: historicalData
      });
    } catch (error) {
      logger.error(`Get historical data error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch historical data'
      });
    }
  },

  // Get market statistics
  getMarketStats: async (req, res) => {
    try {
      const cacheKey = 'market_stats';
      const cachedData = CACHE.get(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }

      const response = await axios.get(`${process.env.COINGECKO_API_URL}/global`);

      const stats = {
        active_cryptocurrencies: response.data.data.active_cryptocurrencies,
        upcoming_icos: response.data.data.upcoming_icos,
        ongoing_icos: response.data.data.ongoing_icos,
        ended_icos: response.data.data.ended_icos,
        markets: response.data.data.markets,
        total_market_cap: response.data.data.total_market_cap,
        total_volume: response.data.data.total_volume,
        market_cap_percentage: response.data.data.market_cap_percentage,
        market_cap_change_percentage_24h_usd: response.data.data.market_cap_change_percentage_24h_usd,
        updated_at: response.data.data.updated_at
      };

      // Cache for 60 seconds
      CACHE.set(cacheKey, stats, 60);

      res.json({
        success: true,
        data: stats,
        cached: false
      });
    } catch (error) {
      logger.error(`Get market stats error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch market statistics'
      });
    }
  },

  // Get trending cryptocurrencies
  getTrending: async (req, res) => {
    try {
      const response = await axios.get(`${process.env.COINGECKO_API_URL}/search/trending`);

      const trending = response.data.coins.map(coin => ({
        id: coin.item.id,
        name: coin.item.name,
        symbol: coin.item.symbol.toUpperCase(),
        market_cap_rank: coin.item.market_cap_rank,
        thumb: coin.item.thumb,
        small: coin.item.small,
        large: coin.item.large,
        score: coin.item.score
      }));

      res.json({
        success: true,
        data: trending
      });
    } catch (error) {
      logger.error(`Get trending error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch trending cryptocurrencies'
      });
    }
  },

  // Get exchange rates
  getExchangeRates: async (req, res) => {
    try {
      const cacheKey = 'exchange_rates';
      const cachedData = CACHE.get(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }

      const response = await axios.get(`${process.env.COINGECKO_API_URL}/exchange_rates`);

      const rates = Object.entries(response.data.rates).map(([currency, data]) => ({
        currency: currency.toUpperCase(),
        name: data.name,
        value: data.value,
        unit: data.unit
      }));

      // Cache for 5 minutes
      CACHE.set(cacheKey, rates, 300);

      res.json({
        success: false,
        data: rates,
        cached: false
      });
    } catch (error) {
      logger.error(`Get exchange rates error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch exchange rates'
      });
    }
  },

  // Get supported currencies
  getSupportedCurrencies: async (req, res) => {
    try {
      const currencies = [
        { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
        { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
        { symbol: 'USDT', name: 'Tether', type: 'stablecoin' },
        { symbol: 'BNB', name: 'Binance Coin', type: 'crypto' },
        { symbol: 'USDC', name: 'USD Coin', type: 'stablecoin' },
        { symbol: 'XRP', name: 'Ripple', type: 'crypto' },
        { symbol: 'ADA', name: 'Cardano', type: 'crypto' },
        { symbol: 'SOL', name: 'Solana', type: 'crypto' },
        { symbol: 'DOGE', name: 'Dogecoin', type: 'crypto' },
        { symbol: 'DOT', name: 'Polkadot', type: 'crypto' }
      ];

      res.json({
        success: true,
        data: currencies
      });
    } catch (error) {
      logger.error(`Get supported currencies error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch supported currencies'
      });
    }
  }
};

module.exports = marketController;