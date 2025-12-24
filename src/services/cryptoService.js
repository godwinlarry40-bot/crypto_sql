const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// Create cache with 30 second TTL
const cache = new NodeCache({ stdTTL: 30 });

const cryptoService = {
  // Get real-time prices
  getRealTimePrices: async (symbols = []) => {
    try {
      const cacheKey = `prices_${symbols.join('_')}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      let params = {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 100,
        page: 1
      };
      
      if (symbols.length > 0) {
        // Get coin IDs from symbols
        const coinIds = await getCoinIds(symbols);
        params.ids = coinIds.join(',');
      }
      
      const response = await axios.get(`${process.env.COINGECKO_API_URL}/coins/markets`, { params });
      
      const prices = response.data.reduce((acc, coin) => {
        acc[coin.symbol.toUpperCase()] = {
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          current_price: coin.current_price,
          market_cap: coin.market_cap,
          market_cap_rank: coin.market_cap_rank,
          total_volume: coin.total_volume,
          high_24h: coin.high_24h,
          low_24h: coin.low_24h,
          price_change_24h: coin.price_change_24h,
          price_change_percentage_24h: coin.price_change_percentage_24h,
          last_updated: coin.last_updated
        };
        return acc;
      }, {});
      
      cache.set(cacheKey, prices);
      
      return prices;
    } catch (error) {
      logger.error(`Get real-time prices error: ${error.message}`);
      throw error;
    }
  },

  // Get price by symbol
  getPriceBySymbol: async (symbol) => {
    try {
      symbol = symbol.toLowerCase();
      const cacheKey = `price_${symbol}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      const coinId = await getCoinId(symbol);
      if (!coinId) {
        throw new Error(`Symbol ${symbol} not found`);
      }
      
      const response = await axios.get(`${process.env.COINGECKO_API_URL}/simple/price`, {
        params: {
          ids: coinId,
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
          include_last_updated_at: true
        }
      });
      
      const data = response.data[coinId];
      const priceData = {
        symbol: symbol.toUpperCase(),
        price: data.usd,
        market_cap: data.usd_market_cap,
        volume_24h: data.usd_24h_vol,
        change_24h: data.usd_24h_change,
        last_updated: new Date(data.last_updated_at * 1000)
      };
      
      cache.set(cacheKey, priceData);
      
      return priceData;
    } catch (error) {
      logger.error(`Get price by symbol error: ${error.message}`);
      throw error;
    }
  },

  // Get historical OHLC data
  getOHLCData: async (symbol, days = 7) => {
    try {
      const coinId = await getCoinId(symbol);
      if (!coinId) {
        throw new Error(`Symbol ${symbol} not found`);
      }
      
      const response = await axios.get(
        `${process.env.COINGECKO_API_URL}/coins/${coinId}/ohlc`,
        {
          params: {
            vs_currency: 'usd',
            days: days
          }
        }
      );
      
      const ohlc = response.data.map(([timestamp, open, high, low, close]) => ({
        timestamp,
        date: new Date(timestamp).toISOString(),
        open,
        high,
        low,
        close,
        volume: 0 // CoinGecko OHLC doesn't include volume
      }));
      
      return ohlc;
    } catch (error) {
      logger.error(`Get OHLC data error: ${error.message}`);
      throw error;
    }
  },

  // Get market trends
  getMarketTrends: async () => {
    try {
      const cacheKey = 'market_trends';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      // Get top gainers and losers
      const response = await axios.get(`${process.env.COINGECKO_API_URL}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 50,
          page: 1,
          price_change_percentage: '24h'
        }
      });
      
      const coins = response.data;
      
      const trends = {
        top_gainers: coins
          .filter(coin => coin.price_change_percentage_24h > 0)
          .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
          .slice(0, 10)
          .map(coin => ({
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            price: coin.current_price,
            change_24h: coin.price_change_percentage_24h,
            market_cap: coin.market_cap
          })),
        
        top_losers: coins
          .filter(coin => coin.price_change_percentage_24h < 0)
          .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
          .slice(0, 10)
          .map(coin => ({
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            price: coin.current_price,
            change_24h: coin.price_change_percentage_24h,
            market_cap: coin.market_cap
          })),
        
        highest_volume: [...coins]
          .sort((a, b) => b.total_volume - a.total_volume)
          .slice(0, 10)
          .map(coin => ({
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            volume_24h: coin.total_volume,
            price: coin.current_price
          })),
        
        market_summary: {
          total_market_cap: coins.reduce((sum, coin) => sum + coin.market_cap, 0),
          total_volume_24h: coins.reduce((sum, coin) => sum + coin.total_volume, 0),
          bitcoin_dominance: (coins.find(c => c.symbol === 'btc')?.market_cap || 0) / 
                            coins.reduce((sum, coin) => sum + coin.market_cap, 0) * 100
        }
      };
      
      cache.set(cacheKey, trends, 60); // Cache for 1 minute
      
      return trends;
    } catch (error) {
      logger.error(`Get market trends error: ${error.message}`);
      throw error;
    }
  },

  // Convert between currencies
  convertCurrency: async (from, to, amount) => {
    try {
      const fromCoinId = await getCoinId(from);
      const toCoinId = await getCoinId(to);
      
      if (!fromCoinId || !toCoinId) {
        throw new Error('Invalid currency symbol');
      }
      
      const response = await axios.get(`${process.env.COINGECKO_API_URL}/simple/price`, {
        params: {
          ids: fromCoinId,
          vs_currencies: to
        }
      });
      
      const rate = response.data[fromCoinId][to];
      const convertedAmount = amount * rate;
      
      return {
        from,
        to,
        amount,
        rate,
        converted_amount: convertedAmount,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Convert currency error: ${error.message}`);
      throw error;
    }
  },

  // Get fear and greed index
  getFearAndGreedIndex: async () => {
    try {
      // Alternative Fear & Greed Index API
      const response = await axios.get('https://api.alternative.me/fng/', {
        params: {
          limit: 1,
          format: 'json',
          date_format: 'world'
        }
      });
      
      const data = response.data.data[0];
      
      return {
        value: parseInt(data.value),
        value_classification: data.value_classification,
        timestamp: new Date(parseInt(data.timestamp) * 1000),
        time_until_update: parseInt(data.time_until_update)
      };
    } catch (error) {
      logger.error(`Get fear and greed index error: ${error.message}`);
      // Return mock data if API fails
      return {
        value: 55,
        value_classification: 'Neutral',
        timestamp: new Date(),
        time_until_update: 3600
      };
    }
  },

  // Get supported networks for a currency
  getSupportedNetworks: async (symbol) => {
    try {
      const networks = {
        BTC: ['mainnet', 'testnet'],
        ETH: ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli'],
        USDT: ['ERC20', 'TRC20', 'BEP20', 'SOL'],
        BNB: ['BEP2', 'BEP20'],
        SOL: ['mainnet', 'devnet', 'testnet'],
        ADA: ['mainnet', 'testnet'],
        DOT: ['mainnet', 'testnet'],
        XRP: ['mainnet', 'testnet']
      };
      
      return networks[symbol.toUpperCase()] || ['mainnet'];
    } catch (error) {
      logger.error(`Get supported networks error: ${error.message}`);
      return ['mainnet'];
    }
  },

  // Validate network for currency
  validateNetwork: (symbol, network) => {
    const validNetworks = {
      BTC: ['mainnet', 'testnet'],
      ETH: ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli'],
      USDT: ['ERC20', 'TRC20', 'BEP20', 'SOL'],
      BNB: ['BEP2', 'BEP20'],
      SOL: ['mainnet', 'devnet', 'testnet']
    };
    
    const networks = validNetworks[symbol.toUpperCase()];
    return networks ? networks.includes(network) : false;
  }
};

// Helper functions
async function getCoinId(symbol) {
  // Map common symbols to CoinGecko IDs
  const symbolToId = {
    btc: 'bitcoin',
    eth: 'ethereum',
    usdt: 'tether',
    bnb: 'binancecoin',
    usdc: 'usd-coin',
    xrp: 'ripple',
    ada: 'cardano',
    sol: 'solana',
    doge: 'dogecoin',
    dot: 'polkadot',
    matic: 'matic-network',
    shib: 'shiba-inu',
    trx: 'tron',
    avax: 'avalanche-2',
    link: 'chainlink',
    atom: 'cosmos',
    uni: 'uniswap',
    etc: 'ethereum-classic',
    xlm: 'stellar',
    algo: 'algorand'
  };
  
  return symbolToId[symbol.toLowerCase()] || symbol.toLowerCase();
}

async function getCoinIds(symbols) {
  return symbols.map(symbol => getCoinId(symbol)).filter(id => id);
}

module.exports = cryptoService;