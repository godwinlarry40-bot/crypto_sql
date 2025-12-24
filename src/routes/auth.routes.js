const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validation = require('../middleware/validation');
const auth = require('../middleware/auth');

// Public routes
router.post('/register', validation.register, authController.register);
router.post('/login', validation.login, authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.get('/profile', auth.verifyToken, authController.getProfile);
router.put('/profile', auth.verifyToken, authController.updateProfile);
router.post('/change-password', auth.verifyToken, authController.changePassword);
router.post('/enable-2fa', auth.verifyToken, authController.enable2FA);
router.post('/verify-2fa', auth.verifyToken, authController.verify2FA);
router.post('/disable-2fa', auth.verifyToken, authController.disable2FA);

// Admin routes
router.get('/users', auth.verifyToken, auth.checkRole('admin', 'super_admin'), authController.getAllUsers);
router.get('/users/:id', auth.verifyToken, auth.checkRole('admin', 'super_admin'), authController.getUserById);
router.put('/users/:id', auth.verifyToken, auth.checkRole('admin', 'super_admin'), authController.updateUser);
router.put('/users/:id/status', auth.verifyToken, auth.checkRole('admin', 'super_admin'), authController.updateUserStatus);

module.exports = router;