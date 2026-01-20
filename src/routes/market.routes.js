const express = require('express');
const router = express.Router();
const marketController = require('../controller/marketController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const marketDataLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 30, 
  message: { status: 'error', message: "Market data limit exceeded." }
});

// --- Public Market Routes ---

// CHANGE: Added /price (singular) so your Postman request works
router.get('/price', marketDataLimiter, marketController.getAllPrices);

// CHANGE: Standardized existing routes
router.get('/prices', marketDataLimiter, marketController.getAllPrices);
router.get('/prices/:coinId', marketDataLimiter, marketController.getCoinPrice);
router.get('/historical/:coinId', marketDataLimiter, marketController.getHistoricalData);
router.get('/exchange-rates', marketDataLimiter, marketController.getExchangeRates);

router.get('/stats', marketDataLimiter, marketController.getMarketStats);
router.get('/trending', marketDataLimiter, marketController.getTrending);
router.get('/currencies', marketDataLimiter, marketController.getSupportedCurrencies);

// --- Protected User Routes ---

// CHANGE: Simplified middleware call to use the primary protection method
router.use(auth.protect);

router.get('/portfolio/prices', marketController.getPortfolioPrices);
router.get('/watchlist', marketController.getWatchlist);
router.post('/watchlist/:coinId', marketController.addToWatchlist);
router.delete('/watchlist/:coinId', marketController.removeFromWatchlist);

module.exports = router;