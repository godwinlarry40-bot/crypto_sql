const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const NodeCache = require('node-cache');

// Primary cache for short-lived UI data
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const helper = {
  // 1. Authentication Helpers
  generateToken: (user) => {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );
  },

  generateRefreshToken: (userId) => {
    return jwt.sign(
      { id: userId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
    );
  },

  verifyToken: (token, isRefresh = false) => {
    const secret = isRefresh ? process.env.JWT_REFRESH_SECRET : process.env.JWT_SECRET;
    return jwt.verify(token, secret);
  },

  // 2. Financial & Crypto Math
  // Using BigInt/Strings to avoid floating point issues (0.1 + 0.2)
  formatCurrency: (amount, currency = 'USD') => {
    const isCrypto = ['BTC', 'ETH', 'SOL', 'BNB'].includes(currency.toUpperCase());
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: isCrypto ? 8 : 2
    }).format(amount);
  },

  // Calculate daily interest: Principal * (Rate/100) / 365
  calculateDailyROI: (principal, annualRatePercent) => {
    const p = parseFloat(principal);
    const r = parseFloat(annualRatePercent) / 100 / 365;
    return (p * r).toFixed(8); // Return as string to preserve precision
  },

  // 3. Security & Validation
  validatePasswordStrength: (password) => {
    const criteria = {
      length: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*]/.test(password)
    };
    
    const score = Object.values(criteria).filter(Boolean).length;
    return {
      isValid: score >= 5,
      score,
      message: score >= 5 ? 'Strong' : 'Weak: Needs caps, numbers, and special chars'
    };
  },

  generateReferralCode: (length = 8) => {
    // Avoid confusing characters like 0, O, I, 1
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  },

  generateTransactionId: (prefix = 'TX') => {
    const datePart = Date.now().toString(36).toUpperCase();
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
  },

  // 4. Data Transformation
  paginate: (queryResult, page = 1, limit = 20) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      offset,
      limit: parseInt(limit)
    };
  },

  // Masking for Privacy
  maskAddress: (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  },

  // 5. System Utilities
  CACHE: cache,
  
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Clean object of null/undefined values (useful before DB updates)
  cleanObject: (obj) => {
    return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null));
  }
};

module.exports = helper;