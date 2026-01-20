const express = require('express');
const router = express.Router();
const investmentController = require('../controller/investmentController');
const validation = require('../middleware/validation');
const auth = require('../middleware/auth');
// CHANGE: Imported the maturity worker to allow manual triggering of payouts for testing
const { processMaturedInvestments } = require('../workers/investmentWorker');
const logger = require('../utils/logger');

// --- 1. PUBLIC ROUTES (No Token Needed) ---
router.get('/plans', investmentController.getPlans);

// --- 2. PROTECTED ROUTES (Token Required) ---
router.use(auth.protect);

// Area of change: Added root POST route to match frontend call to /api/investments
// This ensures that POST /api/investments works without needing /invest at the end
router.post('/', 
  validation.createInvestment || ((req,res,next)=>next()), 
  investmentController.createInvestment
);

// Area of change: Keep /invest as an alias just in case
router.post('/invest', 
  validation.createInvestment || ((req,res,next)=>next()), 
  investmentController.createInvestment
);

// User Portfolio Management
router.get('/my-investments', investmentController.getUserInvestments);

// Standard nested routes
router.get('/my-investments/:id', investmentController.getInvestmentDetails);
router.get('/my-investments/:id/earnings', investmentController.getEarningsHistory);

router.post('/my-investments/:id/withdraw-early', 
  validation.validateEarlyWithdrawal || ((req,res,next)=>next()), 
  investmentController.requestEarlyWithdrawal
);

// --- 3. ADMIN ROUTES ---
const isAdmin = auth.checkRole ? auth.checkRole('admin', 'super_admin') : ((req,res,next)=>next());

// Admin can create plans
router.post('/plans', isAdmin, investmentController.createPlan);

router.get('/admin/all', isAdmin, investmentController.getAllInvestments);
router.get('/admin/stats', isAdmin, investmentController.getInvestmentStats);
router.put('/admin/status/:id', isAdmin, investmentController.updateInvestmentStatus);

// CHANGE: Added TEST ROUTE to manually trigger maturity payouts
router.post('/admin/test-payout', isAdmin, async (req, res) => {
  try {
    logger.info('Manual maturity payout triggered by Admin');
    await processMaturedInvestments();
    res.json({ 
      success: true, 
      message: 'Maturity processing completed. Check server logs for transaction details.' 
    });
  } catch (error) {
    logger.error(`Manual payout error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;