const express = require('express');
const router = express.Router();
const investmentController = require('../controllers/investmentController');
const validation = require('../middleware/validation');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth.verifyToken);

// Investment plans
router.get('/plans', investmentController.getPlans);

// User investments
router.post('/', validation.createInvestment, investmentController.createInvestment);
router.get('/', investmentController.getUserInvestments);
router.get('/:id', investmentController.getInvestmentDetails);
router.post('/:id/withdraw-early', investmentController.requestEarlyWithdrawal);
router.get('/:id/earnings', investmentController.getEarningsHistory);

// Earnings
router.get('/earnings/history', investmentController.getEarningsHistory);

// Admin routes
router.get('/admin/all', auth.checkRole('admin', 'super_admin'), investmentController.getAllInvestments);
router.get('/admin/stats', auth.checkRole('admin', 'super_admin'), investmentController.getInvestmentStats);
router.put('/admin/:id/status', auth.checkRole('admin', 'super_admin'), investmentController.updateInvestmentStatus);

module.exports = router;