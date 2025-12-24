const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

const authService = {
  // Generate 2FA secret
  generate2FASecret: (email) => {
    const secret = speakeasy.generateSecret({
      name: `Crypto Investment (${email})`
    });
    
    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url
    };
  },

  // Generate QR code for 2FA
  generateQRCode: async (otpauthUrl) => {
    try {
      const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);
      return qrCodeUrl;
    } catch (error) {
      logger.error(`Generate QR code error: ${error.message}`);
      throw error;
    }
  },

  // Verify 2FA token
  verify2FAToken: (secret, token) => {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1
    });
  },

  // Send verification email
  sendVerificationEmail: async (userId) => {
    try {
      const user = await User.findByPk(userId);
      if (!user || user.is_verified) {
        return false;
      }

      // Generate verification token
      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Send email
      await emailService.sendVerificationEmail(user.email, token);

      logger.info(`Verification email sent to: ${user.email}`);
      return true;
    } catch (error) {
      logger.error(`Send verification email error: ${error.message}`);
      throw error;
    }
  },

  // Send password reset email
  sendPasswordResetEmail: async (email) => {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) {
        // Don't reveal user existence
        return true;
      }

      // Generate reset token
      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Send email
      await emailService.sendPasswordResetEmail(user.email, token);

      logger.info(`Password reset email sent to: ${email}`);
      return true;
    } catch (error) {
      logger.error(`Send password reset email error: ${error.message}`);
      throw error;
    }
  },

  // Verify email token
  verifyEmailToken: async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (user.is_verified) {
        throw new Error('Email already verified');
      }

      user.is_verified = true;
      await user.save();

      // Send welcome email
      await emailService.sendEmail(
        user.email,
        'Welcome to Crypto Investment!',
        'Your email has been verified successfully. Welcome to our platform!',
        `<p>Your email has been verified successfully. Welcome to Crypto Investment!</p>
         <p>You can now start investing and trading cryptocurrencies.</p>`
      );

      return user;
    } catch (error) {
      logger.error(`Verify email token error: ${error.message}`);
      throw error;
    }
  },

  // Reset password with token
  resetPasswordWithToken: async (token, newPassword) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      
      if (!user) {
        throw new Error('User not found');
      }

      user.password = newPassword;
      await user.save();

      // Send confirmation email
      await emailService.sendEmail(
        user.email,
        'Password Reset Successful',
        'Your password has been reset successfully.',
        `<p>Your password has been reset successfully.</p>
         <p>If you did not request this change, please contact support immediately.</p>`
      );

      return user;
    } catch (error) {
      logger.error(`Reset password error: ${error.message}`);
      throw error;
    }
  },

  // Generate API key for user
  generateApiKey: async (userId) => {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate API key and secret
      const apiKey = `ck_${require('crypto').randomBytes(16).toString('hex')}`;
      const apiSecret = `cs_${require('crypto').randomBytes(32).toString('hex')}`;

      // Hash the secret before storing
      const hashedSecret = require('bcryptjs').hashSync(apiSecret, 10);

      // Store in user metadata
      user.metadata = {
        ...user.metadata,
        api_key: apiKey,
        api_secret_hash: hashedSecret,
        api_key_created: new Date()
      };
      await user.save();

      return { apiKey, apiSecret };
    } catch (error) {
      logger.error(`Generate API key error: ${error.message}`);
      throw error;
    }
  },

  // Verify API key
  verifyApiKey: async (apiKey, signature, data) => {
    try {
      const user = await User.findOne({
        where: {
          'metadata.api_key': apiKey
        }
      });

      if (!user || !user.metadata?.api_secret_hash) {
        return false;
      }

      // Verify signature
      const hmac = require('crypto').createHmac('sha256', user.metadata.api_secret_hash);
      const expectedSignature = hmac.update(JSON.stringify(data)).digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error(`Verify API key error: ${error.message}`);
      return false;
    }
  },

  // Log user login
  logUserLogin: async (userId, ipAddress, userAgent) => {
    try {
      const user = await User.findByPk(userId);
      if (!user) return;

      // Update last login
      user.last_login = new Date();
      user.login_ip = ipAddress;
      user.login_user_agent = userAgent;
      
      // Store login history
      const loginHistory = user.metadata?.login_history || [];
      loginHistory.unshift({
        timestamp: new Date(),
        ip: ipAddress,
        user_agent: userAgent
      });

      // Keep only last 10 logins
      if (loginHistory.length > 10) {
        loginHistory.length = 10;
      }

      user.metadata = {
        ...user.metadata,
        login_history: loginHistory
      };

      await user.save();
    } catch (error) {
      logger.error(`Log user login error: ${error.message}`);
    }
  },

  // Check if user is locked out
  checkLoginAttempts: async (email) => {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) return { locked: false };

      const failedAttempts = user.metadata?.failed_login_attempts || 0;
      const lastFailedAttempt = user.metadata?.last_failed_attempt;
      
      const lockoutDuration = 15 * 60 * 1000; // 15 minutes
      const maxAttempts = 5;

      if (failedAttempts >= maxAttempts && lastFailedAttempt) {
        const timeSinceLastAttempt = Date.now() - new Date(lastFailedAttempt).getTime();
        
        if (timeSinceLastAttempt < lockoutDuration) {
          const remainingTime = Math.ceil((lockoutDuration - timeSinceLastAttempt) / 1000 / 60);
          return {
            locked: true,
            remainingMinutes: remainingTime,
            message: `Account locked. Try again in ${remainingTime} minutes.`
          };
        }
      }

      return { locked: false };
    } catch (error) {
      logger.error(`Check login attempts error: ${error.message}`);
      return { locked: false };
    }
  },

  // Record failed login attempt
  recordFailedLogin: async (email, ipAddress) => {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) return;

      const failedAttempts = (user.metadata?.failed_login_attempts || 0) + 1;
      
      user.metadata = {
        ...user.metadata,
        failed_login_attempts: failedAttempts,
        last_failed_attempt: new Date()
      };

      await user.save();

      // If too many failed attempts, lock account and notify
      if (failedAttempts >= 5) {
        await emailService.sendEmail(
          user.email,
          'Account Locked - Multiple Failed Login Attempts',
          'Your account has been locked due to multiple failed login attempts.',
          `<p>Your account has been temporarily locked due to multiple failed login attempts.</p>
           <p>The lock will be automatically lifted in 15 minutes.</p>
           <p>If this wasn't you, please contact support immediately.</p>`
        );
      }
    } catch (error) {
      logger.error(`Record failed login error: ${error.message}`);
    }
  },

  // Reset failed login attempts
  resetFailedLoginAttempts: async (userId) => {
    try {
      const user = await User.findByPk(userId);
      if (!user) return;

      user.metadata = {
        ...user.metadata,
        failed_login_attempts: 0,
        last_failed_attempt: null
      };

      await user.save();
    } catch (error) {
      logger.error(`Reset failed login attempts error: ${error.message}`);
    }
  }
};

module.exports = authService;