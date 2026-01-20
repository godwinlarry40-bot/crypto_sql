const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const auth = require('../middleware/auth');

// --- Global Protection ---
router.use(auth.protect);
router.use(auth.checkRole('admin', 'super_admin'));

// --- User Management ---
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);

// --- Transaction Management ---
router.get('/transactions', adminController.getAllTransactions);
router.put('/transactions/:id/status', adminController.updateTransactionStatus);

// --- Investment & Plan Management ---
router.get('/investments', adminController.getAllInvestments);
router.post('/plans', auth.checkRole('super_admin'), adminController.createPlan);
router.put('/plans/:id', auth.checkRole('super_admin'), adminController.updatePlan);
router.delete('/plans/:id', auth.checkRole('super_admin'), adminController.deletePlan);

// --- Platform Insights ---
router.get('/stats', adminController.getPlatformStats);
router.get('/dashboard', adminController.getDashboardOverview);

module.exports = router;
