const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const auth = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/prices', marketController.getAllPrices);
router.get('/prices/:coinId', marketController.getCoinPrice);
router.get('/historical/:coinId', marketController.getHistoricalData);
router.get('/stats', marketController.getMarketStats);
router.get('/trending', marketController.getTrending);
router.get('/exchange-rates', marketController.getExchangeRates);
router.get('/currencies', marketController.getSupportedCurrencies);

// Protected routes (for personalized market data)
router.get('/portfolio/prices', auth.verifyToken, marketController.getPortfolioPrices);
router.get('/watchlist', auth.verifyToken, marketController.getWatchlist);
router.post('/watchlist/:coinId', auth.verifyToken, marketController.addToWatchlist);
router.delete('/watchlist/:coinId', auth.verifyToken, marketController.removeFromWatchlist);

module.exports = router;