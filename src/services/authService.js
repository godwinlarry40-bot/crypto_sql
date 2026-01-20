const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User } = require('../models'); // Import from index to ensure associations
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

const authService = {
  // 1. 2FA Management
  generate2FASecret: (email) => {
    const secret = speakeasy.generateSecret({
      name: `Crypto Investment (${email})`
    });
    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url
    };
  },

  generateQRCode: async (otpauthUrl) => {
    try {
      return await qrcode.toDataURL(otpauthUrl);
    } catch (error) {
      logger.error(`QR Code Generation Error: ${error.message}`);
      throw error;
    }
  },

  verify2FAToken: (secret, token) => {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1 // Allowance for slight clock drift
    });
  },

  // 2. Email Verification & Password Resets
  sendVerificationEmail: async (userId) => {
    try {
      const user = await User.findByPk(userId);
      // Fixed field name to is_verified
      if (!user || user.is_verified) return false;

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
      await emailService.sendVerificationEmail(user.email, token);
      
      logger.info(`Verification email sent: ${user.email}`);
      return true;
    } catch (error) {
      logger.error(`Send Verification Email Error: ${error.message}`);
      throw error;
    }
  },

  verifyEmailToken: async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      
      if (!user) throw new Error('User not found');
      if (user.is_verified) throw new Error('Email already verified');

      user.is_verified = true;
      await user.save();

      await emailService.sendEmail(
        user.email,
        'Welcome to the Platform!',
        'Verification successful.',
        '<h1>Verified!</h1><p>You can now start investing.</p>'
      );

      return user;
    } catch (error) {
      logger.error(`Verify Email Token Error: ${error.message}`);
      throw error;
    }
  },

  // 3. API Key Management (Security Hardened)
  generateApiKey: async (userId) => {
    try {
      const user = await User.findByPk(userId);
      if (!user) throw new Error('User not found');

      const apiKey = `ck_${crypto.randomBytes(16).toString('hex')}`;
      const apiSecret = `cs_${crypto.randomBytes(32).toString('hex')}`;

      // We hash the secret for storage; we only show the plain secret once to the user
      const hashedSecret = await bcrypt.hash(apiSecret, 12);

      const metadata = user.metadata || {};
      user.metadata = {
        ...metadata,
        api_key: apiKey,
        api_secret_hash: hashedSecret,
        api_key_created: new Date()
      };
      
      await user.save();
      return { apiKey, apiSecret };
    } catch (error) {
      logger.error(`Generate API Key Error: ${error.message}`);
      throw error;
    }
  },

  // 4. Security: Login Attempt Tracking & Lockout
  logUserLogin: async (userId, ipAddress, userAgent) => {
    try {
      const user = await User.findByPk(userId);
      if (!user) return;

      const metadata = user.metadata || {};
      const history = metadata.login_history || [];

      history.unshift({ timestamp: new Date(), ip: ipAddress, ua: userAgent });
      
      user.last_login = new Date();
      user.metadata = {
        ...metadata,
        login_history: history.slice(0, 10), // Keep last 10
        failed_login_attempts: 0 // Reset attempts on successful login
      };

      await user.save();
    } catch (error) {
      logger.error(`Log Login Error: ${error.message}`);
    }
  },

  checkLoginAttempts: async (email) => {
    const user = await User.findOne({ where: { email } });
    if (!user || !user.metadata?.failed_login_attempts) return { locked: false };

    const maxAttempts = 5;
    const lockoutTime = 15 * 60 * 1000; // 15 mins
    const attempts = user.metadata.failed_login_attempts;
    const lastAttempt = new Date(user.metadata.last_failed_attempt).getTime();

    if (attempts >= maxAttempts && (Date.now() - lastAttempt) < lockoutTime) {
      const remaining = Math.ceil((lockoutTime - (Date.now() - lastAttempt)) / 60000);
      return { locked: true, remainingMinutes: remaining };
    }

    return { locked: false };
  }
};

module.exports = authService;