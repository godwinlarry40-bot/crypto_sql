const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth.verifyToken);

// Portfolio overview
router.get('/summary', portfolioController.getPortfolioSummary);
router.get('/performance', portfolioController.getPerformanceHistory);
router.get('/allocation', portfolioController.getAssetAllocation);
router.get('/earnings/report', portfolioController.getEarningsReport);
router.get('/risk-analysis', portfolioController.getRiskAnalysis);

// Portfolio analytics
router.get('/analytics/daily', portfolioController.getDailyAnalytics);
router.get('/analytics/monthly', portfolioController.getMonthlyAnalytics);
router.get('/analytics/yearly', portfolioController.getYearlyAnalytics);

// Export data
router.get('/export/csv', portfolioController.exportPortfolioCSV);
router.get('/export/pdf', portfolioController.exportPortfolioPDF);

module.exports = router;