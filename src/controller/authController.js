const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { Op } = require('sequelize');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');
const { generateToken, generateRefreshToken } = require('../utils/helper');

async function getUserStatistics(userId) {
  const [deposits, withdrawals, invested, earned] = await Promise.all([
    Transaction.sum('amount', { where: { user_id: userId, type: 'deposit', status: 'completed' } }),
    Transaction.sum('amount', { where: { user_id: userId, type: 'withdrawal', status: 'completed' } }),
    Investment.sum('amount', { where: { user_id: userId } }),
    Investment.sum('total_earned', { where: { user_id: userId } })
  ]);
  return {
    total_deposits: Number(deposits || 0),
    total_withdrawals: Number(withdrawals || 0),
    total_invested: Number(invested || 0),
    total_earned: Number(earned || 0)
  };
}

const authController = {
  checkStatus: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: ['id', 'email', 'status', 'is_verified']
      });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      
      res.json({
        success: true,
        message: "Backend connection active",
        data: { status: user.status, isVerified: user.is_verified }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Status check failed' });
    }
  },

  register: async (req, res) => {
    let t;
    try {
      const { email, password, firstName, lastName, phone, referralCode } = req.body;
      t = await sequelize.transaction();
      const normalizedEmail = email.toLowerCase();

      const existingUser = await User.findOne({ where: { email: normalizedEmail } });
      if (existingUser) {
        if (t) await t.rollback();
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const user = await User.create({
        email: normalizedEmail,
        password: password,
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        referral_code: referralCode || Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'active',
        is_verified: false,
        verification_token: crypto.randomBytes(32).toString('hex')
      }, { transaction: t });

      const currencies = ['USDT', 'BTC', 'ETH', 'BNB'];
      for (const curr of currencies) {
        await Wallet.create({ 
          user_id: user.id, 
          currency: curr, 
          balance: 0,
          address: `0x${crypto.randomBytes(20).toString('hex')}` 
        }, { transaction: t });
      }

      await t.commit();

      // ==========================================
      // Area of change: Wrapped emailService in a local try-catch.
      // This prevents SMTP "Connection Closed" errors from failing the whole registration.
      // ==========================================
      try {
        await emailService.sendVerificationEmail(user.email, user.verification_token);
      } catch (mailErr) {
        logger.error(`Registration email failed for ${user.email}: ${mailErr.message}`);
        // We don't return error here because the user is already saved in the DB.
      }
      
      const token = generateToken(user);
      res.status(201).json({ 
        success: true, 
        message: "Registration successful", 
        data: { user: { id: user.id, email: user.email }, token } 
      });
    } catch (err) {
      console.log(err);
      if (t) await t.rollback();
      res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }
      if (user.two_factor_enabled) {
        return res.json({ success: true, two_factor_required: true, userId: user.id });
      }
      const token = generateToken(user);
      req.session.token = token
      req.session.userId = user.id
 
      res.json({ success: true, data: { user: { id: user.id, email: user.email }, token } });
    } catch (err) {
      console.log(err)
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  },

  getProfile: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password', 'verification_token', 'two_factor_secret'] }
      });
      const stats = await getUserStatistics(user.id);
      res.json({ success: true, data: { user, statistics: stats } });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Profile retrieval failed' });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { firstName, lastName, phone } = req.body;
      const user = await User.findByPk(req.user.id);
      await user.update({
        first_name: firstName || user.first_name,
        last_name: lastName || user.last_name,
        phone: phone || user.phone
      });
      res.json({ success: true, message: 'Profile updated' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Update failed' });
    }
  },

  changePassword: async (req, res) => {
    try {
      const { old_password:oldPassword, new_password:newPassword } = req.body;

      const user = await User.findByPk(req.user.id);
      if (!user || !(await user.comparePassword(oldPassword))) {
        return res.status(400).json({ success: false, message: 'Current password incorrect' });
      }
      user.password = newPassword;
      await user.save();
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Password change failed' });
    }
  },

  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      if (!user) return res.json({ success: true, message: 'Reset link sent.' });
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.reset_password_token = resetToken;
      user.reset_password_expires = Date.now() + 3600000; 
      await user.save();

      // ==========================================
      // Area of change: Wrapped emailService in a local try-catch.
      // ==========================================
      try {
        await emailService.sendPasswordReset(user.email, resetToken);
      } catch (mailErr) {
        logger.error(`Forgot password email failed: ${mailErr.message}`);
      }

      res.json({ success: true, message: 'Check your email.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;
      const user = await User.findOne({
        where: { reset_password_token: token, reset_password_expires: { [Op.gt]: Date.now() } }
      });
      if (!user) return res.status(400).json({ success: false, message: 'Expired token.' });
      user.password = password;
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await user.save();
      res.json({ success: true, message: 'Password updated.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
  },

  verifyEmail: async (req, res) => {
    try {
      const { token } = req.params;
      const user = await User.findOne({ where: { verification_token: token } });
      if (!user) return res.status(400).json({ success: false, message: 'Invalid token.' });
      user.is_verified = true;
      user.verification_token = null;
      await user.save();
      res.json({ success: true, message: 'Email verified successfully!' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Verification failed.' });
    }
  },

  enable2FA: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      const secret = speakeasy.generateSecret({ name: `TradePro (${user.email})` });
      user.two_factor_secret = secret.base32;
      await user.save();
      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
      res.json({ success: true, data: { qrCode: qrCodeUrl, secret: secret.base32 } });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to enable 2FA' });
    }
  },

  verify2FA: async (req, res) => {
    try {
      const { token, userId } = req.body;
      const id = userId || req.user.id;
      const user = await User.findByPk(id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: token
      });
      if (!verified) return res.status(400).json({ success: false, message: 'Invalid 2FA token' });
      user.two_factor_enabled = true;
      await user.save();
      const jwtToken = generateToken(user);
      res.json({ success: true, message: '2FA verified', token: jwtToken });
    } catch (err) {
      res.status(500).json({ success: false, message: '2FA verification failed' });
    }
  },

  disable2FA: async (req, res) => {
    try {
      const { token } = req.body;
      const user = await User.findByPk(req.user.id);
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: token
      });
      if (!verified) return res.status(400).json({ success: false, message: 'Invalid token' });
      user.two_factor_enabled = false;
      user.two_factor_secret = null;
      await user.save();
      res.json({ success: true, message: '2FA disabled' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to disable 2FA' });
    }
  }
};

module.exports = authController;