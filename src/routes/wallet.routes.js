const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const validation = require('../middleware/validation');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth.verifyToken);

// Wallet management
router.get('/', walletController.getUserWallets);
router.get('/balance', walletController.getBalance);
router.get('/:currency', walletController.getWalletByCurrency);
router.post('/deposit-address', validation.deposit, walletController.generateDepositAddress);
router.post('/withdraw', validation.withdrawal, walletController.withdraw);
router.post('/transfer', validation.transfer, walletController.transfer);

// Transaction history
router.get('/transactions/history', walletController.getTransactionHistory);
router.get('/transactions/:id', walletController.getTransactionById);

// Admin routes
router.get('/admin/transactions', auth.checkRole('admin', 'super_admin'), walletController.getAllTransactions);
router.put('/admin/transactions/:id/status', auth.checkRole('admin', 'super_admin'), walletController.updateTransactionStatus);

module.exports = router;