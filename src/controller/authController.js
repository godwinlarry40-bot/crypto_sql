const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { sequelize } = require('../config/database');
const constants = require('../config/constants');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');
const authService = require('../services/authService');
const { generateToken, generateRefreshToken } = require('../utils/helper');
const validators = require('../utils/validators');

const authController = {
  // ============================================
  // REGISTER NEW USER
  // ============================================
  register: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { email, password, first_name, last_name, phone, country, referral_code, accept_terms } = req.body;

      // Validate input
      const validation = validators.validate(validators.user.register, req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email'
        });
      }

      // Check referral code if provided
      let referredBy = null;
      if (referral_code) {
        const referrer = await User.findOne({ 
          where: { referral_code: referral_code.toUpperCase() } 
        });
        
        if (!referrer) {
          return res.status(400).json({
            success: false,
            message: 'Invalid referral code'
          });
        }
        
        if (!referrer.is_active) {
          return res.status(400).json({
            success: false,
            message: 'Referrer account is inactive'
          });
        }
        
        referredBy = referrer.id;
      }

      // Create user
      const user = await User.create({
        email: email.toLowerCase(),
        password,
        first_name,
        last_name,
        phone,
        country,
        referred_by: referredBy,
        is_verified: false,
        is_active: true,
        role: 'user',
        kyc_status: 'pending'
      }, { transaction });

      // Create default wallets for user
      const currencies = ['USDT', 'BTC', 'ETH', 'BNB'];
      
      for (const currency of currencies) {
        await Wallet.create({
          user_id: user.id,
          currency: currency.toUpperCase(),
          balance: 0,
          locked_balance: 0,
          total_deposited: 0,
          total_withdrawn: 0,
          wallet_type: 'spot',
          is_active: true,
          wallet_address: `${user.id}_${currency}_${Date.now()}`
        }, { transaction });
      }

      // Generate tokens
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user.id);

      // Generate email verification token
      const verificationToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Send verification email
      try {
        await emailService.sendVerificationEmail(user.email, verificationToken);
        logger.info(`Verification email sent to: ${user.email}`);
      } catch (emailError) {
        logger.error(`Failed to send verification email: ${emailError.message}`);
        // Continue even if email fails
      }

      // If referred, create referral bonus transaction
      if (referredBy) {
        try {
          // Find referrer's USDT wallet
          const referrerWallet = await Wallet.findOne({
            where: { 
              user_id: referredBy, 
              currency: 'USDT',
              wallet_type: 'referral' 
            },
            transaction
          });

          let referralWallet;
          if (!referrerWallet) {
            // Create referral wallet for referrer
            referralWallet = await Wallet.create({
              user_id: referredBy,
              currency: 'USDT',
              balance: constants.SETTINGS.REFERRAL_BONUS_PERCENTAGE,
              wallet_type: 'referral',
              is_active: true,
              wallet_address: `referral_${referredBy}_${Date.now()}`
            }, { transaction });

            // Create referral bonus transaction
            await Transaction.create({
              user_id: referredBy,
              type: 'referral_bonus',
              amount: constants.SETTINGS.REFERRAL_BONUS_PERCENTAGE,
              currency: 'USDT',
              fee: 0,
              net_amount: constants.SETTINGS.REFERRAL_BONUS_PERCENTAGE,
              status: 'completed',
              description: `Referral bonus for ${user.email}`,
              metadata: {
                referred_user_id: user.id,
                referred_user_email: user.email,
                bonus_type: 'signup'
              }
            }, { transaction });
          } else {
            // Update existing referral wallet
            referrerWallet.balance += constants.SETTINGS.REFERRAL_BONUS_PERCENTAGE;
            await referrerWallet.save({ transaction });

            await Transaction.create({
              user_id: referredBy,
              type: 'referral_bonus',
              amount: constants.SETTINGS.REFERRAL_BONUS_PERCENTAGE,
              currency: 'USDT',
              fee: 0,
              net_amount: constants.SETTINGS.REFERRAL_BONUS_PERCENTAGE,
              status: 'completed',
              description: `Referral bonus for ${user.email}`,
              metadata: {
                referred_user_id: user.id,
                referred_user_email: user.email,
                bonus_type: 'signup'
              }
            }, { transaction });
          }
        } catch (referralError) {
          logger.error(`Referral bonus processing failed: ${referralError.message}`);
          // Don't fail registration if referral bonus fails
        }
      }

      await transaction.commit();

      // Log user registration
      await authService.logUserLogin(user.id, req.ip, req.get('User-Agent'));

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            is_verified: user.is_verified,
            referral_code: user.referral_code,
            role: user.role
          },
          token,
          refreshToken
        }
      });

      logger.info(`New user registered: ${user.email}`, { 
        userId: user.id,
        referralCode: referral_code 
      });

    } catch (error) {
      await transaction.rollback();
      
      logger.error(`Registration error: ${error.message}`, { 
        email: req.body.email,
        error: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ============================================
  // LOGIN USER
  // ============================================
  login: async (req, res) => {
    try {
      const { email, password, two_factor_code } = req.body;

      // Validate input
      const validation = validators.validate(validators.user.login, req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      // Check if user is locked out
      const lockCheck = await authService.checkLoginAttempts(email);
      if (lockCheck.locked) {
        return res.status(429).json({
          success: false,
          message: lockCheck.message,
          retryAfter: lockCheck.remainingMinutes * 60
        });
      }

      // Find user
      const user = await User.findOne({ 
        where: { email: email.toLowerCase() } 
      });

      if (!user) {
        await authService.recordFailedLogin(email, req.ip);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if account is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.'
        });
      }

      // Check if email is verified
      if (!user.is_verified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email address before logging in.',
          requiresVerification: true
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        await authService.recordFailedLogin(email, req.ip);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if 2FA is enabled
      if (user.two_factor_enabled) {
        if (!two_factor_code) {
          return res.status(400).json({
            success: false,
            message: 'Two-factor authentication code is required',
            requires2FA: true
          });
        }

        // Verify 2FA code
        const isValid2FA = authService.verify2FAToken(user.two_factor_secret, two_factor_code);
        if (!isValid2FA) {
          await authService.recordFailedLogin(email, req.ip);
          return res.status(401).json({
            success: false,
            message: 'Invalid two-factor authentication code'
          });
        }
      }

      // Reset failed login attempts
      await authService.resetFailedLoginAttempts(user.id);

      // Update last login
      user.last_login = new Date();
      await user.save();

      // Generate tokens
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user.id);

      // Log login
      await authService.logUserLogin(user.id, req.ip, req.get('User-Agent'));

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            is_verified: user.is_verified,
            two_factor_enabled: user.two_factor_enabled,
            kyc_status: user.kyc_status,
            referral_code: user.referral_code
          },
          token,
          refreshToken
        }
      });

      logger.info(`User logged in: ${user.email}`, { 
        userId: user.id,
        ip: req.ip 
      });

    } catch (error) {
      logger.error(`Login error: ${error.message}`, { 
        email: req.body.email,
        error: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Login failed. Please try again.'
      });
    }
  },

  // ============================================
  // REFRESH TOKEN
  // ============================================
  refreshToken: async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      // Find user
      const user = await User.findByPk(decoded.id);
      if (!user || !user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const newToken = generateToken(user);
      const newRefreshToken = generateRefreshToken(user.id);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      logger.error(`Refresh token error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh token'
      });
    }
  },

  // ============================================
  // VERIFY EMAIL
  // ============================================
  verifyEmail: async (req, res) => {
    try {
      const { token } = req.params;

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.is_verified) {
        return res.status(400).json({
          success: false,
          message: 'Email already verified'
        });
      }

      user.is_verified = true;
      await user.save();

      // Send welcome email
      try {
        await emailService.sendEmail(
          user.email,
          'Welcome to Crypto Investment Platform!',
          'Your email has been successfully verified. Welcome to our platform!',
          `<h2>Welcome to Crypto Investment Platform!</h2>
           <p>Your email has been successfully verified.</p>
           <p>You can now:</p>
           <ul>
             <li>Deposit funds to your wallet</li>
             <li>Start investing in our plans</li>
             <li>Track your portfolio performance</li>
             <li>Withdraw your earnings</li>
           </ul>
           <p>Start your investment journey today!</p>`
        );
      } catch (emailError) {
        logger.error(`Welcome email failed: ${emailError.message}`);
      }

      res.json({
        success: true,
        message: 'Email verified successfully'
      });

      logger.info(`Email verified: ${user.email}`, { userId: user.id });

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(400).json({
          success: false,
          message: 'Verification token has expired'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification token'
        });
      }

      logger.error(`Email verification error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Email verification failed'
      });
    }
  },

  // ============================================
  // RESEND VERIFICATION EMAIL
  // ============================================
  resendVerificationEmail: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      
      // Don't reveal if user exists for security
      if (!user) {
        return res.json({
          success: true,
          message: 'If an account exists with this email, a verification link will be sent'
        });
      }

      if (user.is_verified) {
        return res.status(400).json({
          success: false,
          message: 'Email already verified'
        });
      }

      // Generate new verification token
      const verificationToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Send verification email
      await emailService.sendVerificationEmail(user.email, verificationToken);

      res.json({
        success: true,
        message: 'Verification email sent successfully'
      });

      logger.info(`Verification email resent to: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Resend verification error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to resend verification email'
      });
    }
  },

  // ============================================
  // FORGOT PASSWORD
  // ============================================
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      
      // Don't reveal if user exists for security
      if (!user) {
        return res.json({
          success: true,
          message: 'If an account exists with this email, you will receive a password reset link'
        });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Send reset email
      await authService.sendPasswordResetEmail(user.email, resetToken);

      res.json({
        success: true,
        message: 'Password reset link sent to your email'
      });

      logger.info(`Password reset requested for: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Forgot password error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to process password reset request'
      });
    }
  },

  // ============================================
  // RESET PASSWORD
  // ============================================
  resetPassword: async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      // Validate password
      const passwordValidation = validators.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: passwordValidation.message
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update password
      user.password = password;
      await user.save();

      // Send confirmation email
      try {
        await emailService.sendEmail(
          user.email,
          'Password Reset Successful',
          'Your password has been reset successfully.',
          `<p>Your password has been reset successfully.</p>
           <p>If you did not request this change, please contact support immediately.</p>`
        );
      } catch (emailError) {
        logger.error(`Password reset confirmation email failed: ${emailError.message}`);
      }

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

      logger.info(`Password reset for: ${user.email}`, { userId: user.id });

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(400).json({
          success: false,
          message: 'Password reset token has expired'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid reset token'
        });
      }

      logger.error(`Reset password error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to reset password'
      });
    }
  },

  // ============================================
  // GET USER PROFILE
  // ============================================
  getProfile: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: { 
          exclude: [
            'password', 
            'two_factor_secret',
            'reset_token',
            'reset_token_expires'
          ] 
        },
        include: [
          {
            model: Wallet,
            as: 'wallets',
            attributes: ['currency', 'balance', 'locked_balance', 'wallet_type'],
            where: { is_active: true },
            required: false
          }
        ]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user statistics
      const statistics = await getUserStatistics(user.id);

      res.json({
        success: true,
        data: {
          user,
          statistics
        }
      });

    } catch (error) {
      logger.error(`Get profile error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile'
      });
    }
  },

  // ============================================
  // UPDATE PROFILE
  // ============================================
  updateProfile: async (req, res) => {
    try {
      const { first_name, last_name, phone, country, city, address, date_of_birth } = req.body;

      // Validate input
      const validation = validators.validate(validators.user.updateProfile, req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update user
      await user.update({
        first_name: first_name || user.first_name,
        last_name: last_name || user.last_name,
        phone: phone || user.phone,
        country: country || user.country,
        city: city || user.city,
        address: address || user.address,
        date_of_birth: date_of_birth || user.date_of_birth
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone,
            country: user.country,
            city: user.city,
            address: user.address,
            date_of_birth: user.date_of_birth
          }
        }
      });

      logger.info(`Profile updated: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Update profile error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  },

  // ============================================
  // CHANGE PASSWORD
  // ============================================
  changePassword: async (req, res) => {
    try {
      const { current_password, new_password, confirm_password } = req.body;

      // Validate input
      const validation = validators.validate(validators.user.changePassword, req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(current_password);
      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Check if new password is same as old
      const isSamePassword = await user.comparePassword(new_password);
      if (isSamePassword) {
        return res.status(400).json({
          success: false,
          message: 'New password cannot be the same as current password'
        });
      }

      // Update password
      user.password = new_password;
      await user.save();

      // Send notification email
      try {
        await emailService.sendEmail(
          user.email,
          'Password Changed Successfully',
          'Your password has been changed successfully.',
          `<p>Your password has been changed successfully.</p>
           <p>If you did not make this change, please contact support immediately.</p>`
        );
      } catch (emailError) {
        logger.error(`Password change notification email failed: ${emailError.message}`);
      }

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

      logger.info(`Password changed for: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Change password error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to change password'
      });
    }
  },

  // ============================================
  // ENABLE 2FA
  // ============================================
  enable2FA: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.two_factor_enabled) {
        return res.status(400).json({
          success: false,
          message: '2FA is already enabled'
        });
      }

      // Generate 2FA secret
      const secret = authService.generate2FASecret(user.email);
      
      // Generate QR code
      const qrCodeUrl = await authService.generateQRCode(secret.otpauth_url);

      // Store secret temporarily (user needs to verify first)
      user.two_factor_secret = secret.secret;
      await user.save();

      res.json({
        success: true,
        message: 'Scan QR code with authenticator app',
        data: {
          secret: secret.secret,
          qrCodeUrl,
          otpauthUrl: secret.otpauth_url
        }
      });

      logger.info(`2FA setup initiated for: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Enable 2FA error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to enable 2FA'
      });
    }
  },

  // ============================================
  // VERIFY AND ACTIVATE 2FA
  // ============================================
  verify2FA: async (req, res) => {
    try {
      const { token } = req.body;

      if (!token || token.length !== 6) {
        return res.status(400).json({
          success: false,
          message: 'Valid 6-digit token is required'
        });
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.two_factor_secret) {
        return res.status(400).json({
          success: false,
          message: '2FA not set up. Please enable 2FA first.'
        });
      }

      // Verify token
      const isValid = authService.verify2FAToken(user.two_factor_secret, token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid 2FA token'
        });
      }

      // Enable 2FA
      user.two_factor_enabled = true;
      await user.save();

      // Send notification email
      try {
        await emailService.sendEmail(
          user.email,
          'Two-Factor Authentication Enabled',
          'Two-factor authentication has been enabled on your account.',
          `<p>Two-factor authentication has been enabled on your account.</p>
           <p>You will now need to enter a verification code from your authenticator app when logging in.</p>
           <p>If you did not enable this, please contact support immediately.</p>`
        );
      } catch (emailError) {
        logger.error(`2FA enabled notification email failed: ${emailError.message}`);
      }

      res.json({
        success: true,
        message: '2FA enabled successfully'
      });

      logger.info(`2FA enabled for: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Verify 2FA error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to verify 2FA'
      });
    }
  },

  // ============================================
  // DISABLE 2FA
  // ============================================
  disable2FA: async (req, res) => {
    try {
      const { password, token } = req.body;

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.two_factor_enabled) {
        return res.status(400).json({
          success: false,
          message: '2FA is not enabled'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Password is incorrect'
        });
      }

      // Verify 2FA token if provided
      if (token) {
        const isValidToken = authService.verify2FAToken(user.two_factor_secret, token);
        if (!isValidToken) {
          return res.status(401).json({
            success: false,
            message: 'Invalid 2FA token'
          });
        }
      }

      // Disable 2FA
      user.two_factor_enabled = false;
      user.two_factor_secret = null;
      await user.save();

      // Send notification email
      try {
        await emailService.sendEmail(
          user.email,
          'Two-Factor Authentication Disabled',
          'Two-factor authentication has been disabled on your account.',
          `<p>Two-factor authentication has been disabled on your account.</p>
           <p>If you did not disable this, please contact support immediately.</p>`
        );
      } catch (emailError) {
        logger.error(`2FA disabled notification email failed: ${emailError.message}`);
      }

      res.json({
        success: true,
        message: '2FA disabled successfully'
      });

      logger.info(`2FA disabled for: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Disable 2FA error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to disable 2FA'
      });
    }
  },

  // ============================================
  // LOGOUT (Blacklist token)
  // ============================================
  logout: async (req, res) => {
    try {
      // In a real implementation, you would blacklist the token
      // This requires Redis or a database to store blacklisted tokens
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        // Add token to blacklist (implement this based on your storage)
        // await tokenBlacklist.add(token);
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

      logger.info(`User logged out`, { userId: req.user.id });

    } catch (error) {
      logger.error(`Logout error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to logout'
      });
    }
  },

  // ============================================
  // UPLOAD KYC DOCUMENTS
  // ============================================
  uploadKYC: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!req.files || !req.files.document) {
        return res.status(400).json({
          success: false,
          message: 'Please upload a document'
        });
      }

      const document = req.files.document;
      
      // Validate document
      const validation = validators.validateKYCDocument(document);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Save document path (implement file upload logic)
      const documentPath = `/uploads/kyc/${user.id}_${Date.now()}_${document.name}`;
      
      // Update user KYC status
      user.kyc_status = 'pending';
      user.kyc_document = documentPath;
      await user.save();

      // Notify admin about new KYC submission
      try {
        await emailService.sendEmail(
          process.env.ADMIN_EMAIL,
          'New KYC Submission',
          `New KYC document submitted by ${user.email}`,
          `<p>User ${user.email} (${user.first_name} ${user.last_name}) has submitted KYC documents.</p>
           <p>Please review in the admin panel.</p>`
        );
      } catch (emailError) {
        logger.error(`KYC notification email failed: ${emailError.message}`);
      }

      res.json({
        success: true,
        message: 'KYC documents submitted successfully. Please wait for verification.',
        data: {
          kyc_status: user.kyc_status,
          document: documentPath
        }
      });

      logger.info(`KYC documents submitted by: ${user.email}`, { userId: user.id });

    } catch (error) {
      logger.error(`Upload KYC error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to upload KYC documents'
      });
    }
  },

  // ============================================
  // CHECK KYC STATUS
  // ============================================
  checkKYCStatus: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: ['id', 'email', 'kyc_status', 'kyc_document']
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          kyc_status: user.kyc_status,
          kyc_document: user.kyc_document,
          requires_kyc: user.kyc_status !== 'verified'
        }
      });

    } catch (error) {
      logger.error(`Check KYC status error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to check KYC status'
      });
    }
  },

  // ============================================
  // GET REFERRAL STATISTICS
  // ============================================
  getReferralStats: async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get referred users
      const referredUsers = await User.findAll({
        where: { referred_by: user.id },
        attributes: ['id', 'email', 'first_name', 'last_name', 'created_at', 'is_verified'],
        order: [['created_at', 'DESC']]
      });

      // Get referral earnings
      const referralEarnings = await Transaction.sum('amount', {
        where: {
          user_id: user.id,
          type: 'referral_bonus',
          status: 'completed'
        }
      });

      // Get referral wallet balance
      const referralWallet = await Wallet.findOne({
        where: {
          user_id: user.id,
          wallet_type: 'referral'
        }
      });

      res.json({
        success: true,
        data: {
          referral_code: user.referral_code,
          referral_link: `${process.env.APP_URL}/register?ref=${user.referral_code}`,
          total_referred: referredUsers.length,
          total_earnings: referralEarnings || 0,
          referral_balance: referralWallet ? referralWallet.balance : 0,
          referred_users: referredUsers
        }
      });

    } catch (error) {
      logger.error(`Get referral stats error: ${error.message}`, { userId: req.user.id });
      res.status(500).json({
        success: false,
        message: 'Failed to get referral statistics'
      });
    }
  }
};

// Helper function to get user statistics
async function getUserStatistics(userId) {
  try {
    const [
      totalDeposits,
      totalWithdrawals,
      totalInvested,
      totalEarned,
      walletCount,
      investmentCount,
      activeInvestments
    ] = await Promise.all([
      Transaction.sum('amount', { 
        where: { 
          user_id: userId, 
          type: 'deposit', 
          status: 'completed' 
        } 
      }),
      Transaction.sum('amount', { 
        where: { 
          user_id: userId, 
          type: 'withdrawal', 
          status: 'completed' 
        } 
      }),
      Transaction.sum('amount', { 
        where: { 
          user_id: userId, 
          type: 'investment' 
        } 
      }),
      Transaction.sum('amount', { 
        where: { 
          user_id: userId, 
          type: 'earnings' 
        } 
      }),
      Wallet.count({ where: { user_id: userId, is_active: true } }),
      require('../models/Investment').count({ where: { user_id: userId } }),
      require('../models/Investment').count({ 
        where: { 
          user_id: userId, 
          status: 'active' 
        } 
      })
    ]);

    return {
      total_deposits: totalDeposits || 0,
      total_withdrawals: totalWithdrawals || 0,
      total_invested: totalInvested || 0,
      total_earned: totalEarned || 0,
      net_deposit: (totalDeposits || 0) - (totalWithdrawals || 0),
      wallet_count: walletCount || 0,
      investment_count: investmentCount || 0,
      active_investments: activeInvestments || 0
    };
  } catch (error) {
    logger.error(`Get user statistics error: ${error.message}`, { userId });
    return {};
  }
}

module.exports = authController;