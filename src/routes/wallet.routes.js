const express = require('express');
const router = express.Router();

// Controller
const walletController = require('../controller/walletController');

// Middleware
const validation = require('../middleware/validation');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// --- Specific Rate Limiter for Transfers/Withdrawals ---
const walletActionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 3,
  message: {
    success: false,
    message: 'Security alert: Too many wallet actions. Please wait.'
  }
});

// --- Apply authentication middleware to all wallet routes ---
router.use(auth.protect);

// =========================
// 1. Wallet Information (Static Routes)
// =========================
router.get('/', walletController.getUserWallets);
router.get('/balance', walletController.getBalance);
router.get('/history/ledger', walletController.getTransactionHistory);

// =========================
// 2. Deposit & Investment
// =========================
router.post(
  '/deposit',
  validation.deposit, // input validation
  walletController.deposit
);

router.post(
  '/invest',
  validation.invest, // input validation
  walletController.investFromBalance
);

// =========================
// 3. Admin-only withdrawal processing
// =========================
router.post(
  '/admin/process-withdrawal',
  auth.admin, // admin guard
  walletController.processWithdrawal
);

// =========================
// 4. Deposit address generation
// =========================
router.post(
  '/deposit-address',
  walletController.deposit
);
// =========================
// 5. Withdrawal & Transfer with rate limiting
// =========================
router.post(
  '/withdraw',
  walletActionLimiter,
  validation.withdraw,
  walletController.withdraw
);

router.post(
  '/transfer',
  walletActionLimiter,
  validation.transfer,
  walletController.transfer
);

// =========================
// 6. Dynamic Routes (keep last to avoid conflicts)
// =========================
router.get('/:currency', walletController.getWalletByCurrency);

module.exports = router;