const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const auth = require('../middleware/auth');
const validation = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// --- Rate Limiter for Financial Actions ---
// Prevents spamming withdrawal or transfer requests
const transactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit 5 sensitive transactions per minute
  message: "Too many transaction requests. Please slow down."
});

// All routes require authentication
router.use(auth.verifyToken);

// --- 1. Query Transactions ---
router.get('/', transactionController.getAllTransactions);
router.get('/:id', transactionController.getTransactionById);

// --- 2. Financial Operations (Protected by Validation & Limiter) ---

// Deposit: Handled by generating an address usually, or logging an intent
router.post('/deposit', 
  validation.validateDeposit, 
  transactionController.getAllTransactions // Or your specific deposit logic
);

// Withdrawal: Uses our high-security "Locked Balance" logic
router.post('/withdraw', 
  transactionLimiter,
  validation.validateWithdrawal, 
  transactionController.requestWithdrawal
);

// Internal Transfer: Uses our "Atomic Update" logic
router.post('/transfer', 
  transactionLimiter,
  validation.validateTransfer, 
  transactionController.transfer
);

// --- 3. Utilities ---
router.post('/estimate-fee', transactionController.getTransactionFee);

// Cancel: Only allowed if status is still 'pending'
router.post('/:id/cancel', 
  validation.validateTransactionId, 
  transactionController.cancelTransaction
);

module.exports = router;