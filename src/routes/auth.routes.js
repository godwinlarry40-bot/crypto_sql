const express = require('express');
const router = express.Router();
const authController = require('../controller/authController'); 
const validation = require('../middleware/validation'); 
const auth = require('../middleware/auth'); 
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'error', message: "Too many attempts, please try again later." }
});

// --- PUBLIC AUTH ROUTES ---
router.post('/register', authLimiter, validation.register, authController.register);
router.post('/login', authLimiter, validation.login, authController.login);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// --- PROTECTED ROUTES ---
router.use(auth.protect);

// Endpoint to confirm connection and account status
router.get('/check-status', authController.checkStatus);

router.get('/profile', authController.getProfile);
router.put('/profile', validation.updateProfile, authController.updateProfile);
router.post('/change-password', validation.changePassword, authController.changePassword);

// 2FA Routes
router.post('/enable-2fa', authController.enable2FA);
router.post('/verify-2fa', authController.verify2FA);
router.post('/disable-2fa', authController.disable2FA);

module.exports = router;