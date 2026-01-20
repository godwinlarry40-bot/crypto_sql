const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Area of change: Removed 'pool: true' to ensure every email gets a fresh, clean handshake
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465', 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    // Area of change: Increased timeouts for slower handshakes
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: {
      // Area of change: Ensures compatibility with Gmail's TLS requirements
      rejectUnauthorized: false,
      minVersion: "TLSv1.2"
    }
  });
};

/**
 * Base template wrapper
 */
const emailWrapper = (content) => `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">TradePro</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
      ${content}
    </div>
    <div style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        &copy; ${new Date().getFullYear()} TradePro Platform. All rights reserved.
      </p>
    </div>
  </div>
`;

const emailService = {
  // Area of change: These functions now call the centralized sendEmail logic
  sendVerificationEmail: async (email, token) => {
    const verificationLink = `${process.env.APP_URL}/verify-email?token=${token}`;
    const html = emailWrapper(`
      <h2 style="color: #2e7d32;">Verify Your Account</h2>
      <p>Click the button below to confirm your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #2e7d32; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;">Confirm Email</a>
      </div>
    `);
    return await emailService.sendEmail(email, 'Verify Your Email Address', html);
  },

  sendPasswordReset: async (email, resetToken) => {
    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    const html = emailWrapper(`
      <h2 style="color: #d32f2f;">Password Reset Request</h2>
      <p>Click the link below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #1976d2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
      </div>
    `);
    return await emailService.sendEmail(email, 'Security: Password Reset Request', html);
  },

  // Centralized Send Logic
  sendEmail: async (to, subject, html) => {
    // Area of change: Create a NEW transporter for every single email request
    const transporter = createTransporter();
    const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    try {
      const mailOptions = {
        from: `"TradePro Support" <${senderEmail}>`,
        to,
        subject,
        html
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      // Area of change: Detailed logging to see exactly why Gmail is cutting the connection
      logger.error(`SMTP Error for ${to}: ${error.message}`);
      return false;
    } finally {
      // Area of change: Explicitly close the connection after sending
      transporter.close();
    }
  }
};

module.exports = emailService;