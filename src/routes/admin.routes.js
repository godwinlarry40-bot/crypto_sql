const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const validation = require('../middleware/validation');

// All admin routes require authentication and admin role
router.use(auth.verifyToken);
router.use(auth.checkRole('admin', 'super_admin'));

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);

// Transaction management
router.get('/transactions', adminController.getAllTransactions);
router.put('/transactions/:id/status', adminController.updateTransactionStatus);

// Investment management
router.get('/investments', adminController.getAllInvestments);

// Plan management
router.post('/plans', adminController.createPlan);
router.put('/plans/:id', adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

// Platform statistics
router.get('/stats', adminController.getPlatformStats);

// Dashboard overview
router.get('/dashboard', adminController.getDashboardOverview);

module.exports = router;