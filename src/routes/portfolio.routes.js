const express = require('express');
const router = express.Router();
const portfolioController = require('../controller/portfolioController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Limiter for heavy export tasks
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 5, 
  message: { success: false, message: "Export limit reached. Please wait one hour." }
});

// CHANGE: Standardized to use protect middleware for all portfolio routes
const protect = auth.protect || auth.verifyToken;
router.use(protect);

// --- 1. Real-time Overview ---
router.get('/summary', portfolioController.getPortfolioSummary);
router.get('/allocation', portfolioController.getAssetAllocation);

// --- 2. Advanced Analytics ---
router.get('/performance', portfolioController.getPerformanceHistory);
router.get('/risk-analysis', portfolioController.getRiskAnalysis);
router.get('/earnings/report', portfolioController.getEarningsReport);

// --- 3. Time-Series Data ---
router.get('/analytics/daily', portfolioController.getDailyAnalytics);
router.get('/analytics/monthly', portfolioController.getMonthlyAnalytics);
router.get('/analytics/yearly', portfolioController.getYearlyAnalytics);

// --- 4. Document Generation ---
router.get('/export/csv', exportLimiter, portfolioController.exportPortfolioCSV);
router.get('/export/pdf', exportLimiter, portfolioController.exportPortfolioPDF);

module.exports = router;