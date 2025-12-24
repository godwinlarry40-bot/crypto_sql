const nodemailer = require('nodemailer');
const logger = require('./logger');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify transporter
transporter.verify((error) => {
  if (error) {
    logger.error('Email transporter verification failed:', error);
  } else {
    logger.info('Email transporter is ready');
  }
});

const emailService = {
  // Send verification email
  sendVerificationEmail: async (email, userId, token) => {
    try {
      const verificationLink = `${process.env.APP_URL}/verify-email?token=${token}`;
      
      const mailOptions = {
        from: `"Crypto Investment" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Verify Your Email Address',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Crypto Investment Platform!</h2>
            <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Verify Email Address
              </a>
            </p>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all;">${verificationLink}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      logger.info(`Verification email sent to: ${email}`);
      
      return true;
    } catch (error) {
      logger.error(`Send verification email error: ${error.message}`);
      throw error;
    }
  },

  // Send password reset email
  sendPasswordResetEmail: async (email, resetToken) => {
    try {
      const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"Crypto Investment" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>We received a request to reset your password. Click the link below to set a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Reset Password
              </a>
            </p>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all;">${resetLink}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      logger.info(`Password reset email sent to: ${email}`);
      
      return true;
    } catch (error) {
      logger.error(`Send password reset email error: ${error.message}`);
      throw error;
    }
  },

  // Send investment notification
  sendInvestmentNotification: async (email, investmentDetails) => {
    try {
      const mailOptions = {
        from: `"Crypto Investment" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Investment Confirmation',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Investment Confirmed!</h2>
            <p>Your investment has been successfully created. Here are the details:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Plan:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.planName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Amount:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.amount} ${investmentDetails.currency}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Interest Rate:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.interestRate}%</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Duration:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.duration} days</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Start Date:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.startDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">End Date:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.endDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Expected Return:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${investmentDetails.expectedReturn} ${investmentDetails.currency}</td>
              </tr>
            </table>
            <p>You can track your investment in your dashboard.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      logger.info(`Investment notification sent to: ${email}`);
      
      return true;
    } catch (error) {
      logger.error(`Send investment notification error: ${error.message}`);
      throw error;
    }
  },

  // Send withdrawal notification
  sendWithdrawalNotification: async (email, withdrawalDetails) => {
    try {
      const mailOptions = {
        from: `"Crypto Investment" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Withdrawal Request Received',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Withdrawal Request Received</h2>
            <p>Your withdrawal request has been received and is being processed. Here are the details:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Amount:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${withdrawalDetails.amount} ${withdrawalDetails.currency}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Fee:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${withdrawalDetails.fee} ${withdrawalDetails.currency}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Net Amount:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${withdrawalDetails.netAmount} ${withdrawalDetails.currency}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Wallet Address:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace;">${withdrawalDetails.walletAddress}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Network:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${withdrawalDetails.network}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Status:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${withdrawalDetails.status}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Transaction ID:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${withdrawalDetails.transactionId}</td>
              </tr>
            </table>
            <p>Estimated processing time: 10-30 minutes</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      logger.info(`Withdrawal notification sent to: ${email}`);
      
      return true;
    } catch (error) {
      logger.error(`Send withdrawal notification error: ${error.message}`);
      throw error;
    }
  },

  // Send generic email
  sendEmail: async (to, subject, text, html) => {
    try {
      const mailOptions = {
        from: `"Crypto Investment" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        text,
        html
      };
      
      await transporter.sendMail(mailOptions);
      logger.info(`Email sent to: ${to}, Subject: ${subject}`);
      
      return true;
    } catch (error) {
      logger.error(`Send email error: ${error.message}`);
      throw error;
    }
  }
};

module.exports = emailService;