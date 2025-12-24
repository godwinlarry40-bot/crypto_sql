const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 minute default TTL

const helper = {
  // Generate JWT token
  generateToken: (user) => {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
  },

  // Generate refresh token
  generateRefreshToken: (userId) => {
    return jwt.sign(
      { id: userId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE }
    );
  },

  // Verify JWT token
  verifyToken: (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
  },

  // Generate random string
  generateRandomString: (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
  },

  // Format currency
  formatCurrency: (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(amount);
  },

  // Format date
  formatDate: (date, format = 'long') => {
    const d = new Date(date);
    
    if (format === 'short') {
      return d.toLocaleDateString('en-US');
    } else if (format === 'time') {
      return d.toLocaleTimeString('en-US');
    } else {
      return d.toLocaleString('en-US');
    }
  },

  // Calculate percentage
  calculatePercentage: (part, total) => {
    if (total === 0) return 0;
    return (part / total) * 100;
  },

  // Round number
  roundNumber: (num, decimals = 2) => {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  },

  // Validate email
  validateEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  // Generate referral code
  generateReferralCode: (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Calculate investment returns
  calculateInvestmentReturns: (principal, annualRate, days) => {
    const dailyRate = annualRate / 365 / 100;
    return principal * (1 + dailyRate * days);
  },

  // Get cache instance
  CACHE: cache,

  // Pagination helper
  paginate: (array, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    const paginatedItems = array.slice(offset, offset + limit);
    
    return {
      data: paginatedItems,
      pagination: {
        total: array.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(array.length / limit)
      }
    };
  },

  // Mask sensitive data
  maskData: (data, visibleChars = 4) => {
    if (!data || data.length <= visibleChars * 2) return data;
    
    const firstPart = data.substring(0, visibleChars);
    const lastPart = data.substring(data.length - visibleChars);
    const maskedPart = '*'.repeat(data.length - visibleChars * 2);
    
    return `${firstPart}${maskedPart}${lastPart}`;
  },

  // Delay function
  delay: (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Deep clone object
  deepClone: (obj) => {
    return JSON.parse(JSON.stringify(obj));
  },

  // Check if object is empty
  isEmpty: (obj) => {
    return Object.keys(obj).length === 0;
  },

  // Generate transaction ID
  generateTransactionId: () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `TX${timestamp}${random}`;
  },

  // Validate password strength
  validatePasswordStrength: (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    const strength = {
      length: password.length >= minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar
    };
    
    const isValid = Object.values(strength).every(Boolean);
    const score = Object.values(strength).filter(Boolean).length;
    
    return {
      isValid,
      score,
      strength,
      message: isValid ? 'Password is strong' : 'Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character'
    };
  }
};

module.exports = helper;