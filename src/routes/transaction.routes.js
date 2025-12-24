const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get transactions
router.get('/', transactionController.getTransactions);
router.get('/:id', transactionController.getTransactionById);

// Initiate transactions
router.post('/deposit', transactionController.initiateDeposit);
router.post('/withdraw', transactionController.initiateWithdrawal);
router.post('/transfer', transactionController.transfer);

// Transaction operations
router.post('/estimate-fee', transactionController.getTransactionFee);
router.post('/:id/cancel', transactionController.cancelTransaction);

module.exports = router;