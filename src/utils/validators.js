const Joi = require('joi');
const constants = require('../config/constants');

const validators = {
  // User validation schemas
  user: {
    register: Joi.object({
      email: Joi.string().email().required().max(255),
      password: Joi.string()
        .min(8)
        .max(100)
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])'))
        .required()
        .messages({
          'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
        }),
      first_name: Joi.string().min(2).max(100).required(),
      last_name: Joi.string().min(2).max(100).required(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
      country: Joi.string().max(100).optional(),
      referral_code: Joi.string().max(20).optional(),
      accept_terms: Joi.boolean().valid(true).required()
    }),

    login: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
      two_factor_code: Joi.string().length(6).optional()
    }),

    updateProfile: Joi.object({
      first_name: Joi.string().min(2).max(100).optional(),
      last_name: Joi.string().min(2).max(100).optional(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
      country: Joi.string().max(100).optional(),
      city: Joi.string().max(100).optional(),
      address: Joi.string().max(500).optional(),
      date_of_birth: Joi.date().max('now').optional()
    }),

    changePassword: Joi.object({
      current_password: Joi.string().required(),
      new_password: Joi.string()
        .min(8)
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])'))
        .required()
        .messages({
          'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
        }),
      confirm_password: Joi.string().valid(Joi.ref('new_password')).required()
    })
  },

  // Wallet validation schemas
  wallet: {
    deposit: Joi.object({
      amount: Joi.number().positive().min(0.00000001).required(),
      currency: Joi.string().valid(...constants.CRYPTOCURRENCIES.map(c => c.symbol)).required(),
      payment_method: Joi.string().valid('crypto', 'bank_transfer', 'card').required(),
      network: Joi.string().when('payment_method', {
        is: 'crypto',
        then: Joi.string().required(),
        otherwise: Joi.string().optional()
      })
    }),

    withdraw: Joi.object({
      amount: Joi.number().positive().min(0.00000001).required(),
      currency: Joi.string().valid(...constants.CRYPTOCURRENCIES.map(c => c.symbol)).required(),
      wallet_address: Joi.string().required(),
      network: Joi.string().required(),
      two_factor_code: Joi.string().length(6).optional()
    }).custom((value, helpers) => {
      // Validate minimum withdrawal amount
      if (value.amount < constants.SETTINGS.MIN_WITHDRAWAL) {
        return helpers.error('any.custom', {
          message: `Minimum withdrawal amount is ${constants.SETTINGS.MIN_WITHDRAWAL}`
        });
      }
      return value;
    }),

    transfer: Joi.object({
      amount: Joi.number().positive().min(0.00000001).required(),
      currency: Joi.string().valid(...constants.CRYPTOCURRENCIES.map(c => c.symbol)).required(),
      recipient_email: Joi.string().email().required(),
      description: Joi.string().max(255).optional(),
      two_factor_code: Joi.string().length(6).optional()
    })
  },

  // Investment validation schemas
  investment: {
    create: Joi.object({
      plan_id: Joi.string().uuid().required(),
      amount: Joi.number().positive().min(0.00000001).required(),
      currency: Joi.string().valid(...constants.CRYPTOCURRENCIES.map(c => c.symbol)).required(),
      auto_renew: Joi.boolean().default(false),
      two_factor_code: Joi.string().length(6).optional()
    }),

    earlyWithdrawal: Joi.object({
      two_factor_code: Joi.string().length(6).optional()
    })
  },

  // Admin validation schemas
  admin: {
    createPlan: Joi.object({
      name: Joi.string().min(3).max(100).required(),
      description: Joi.string().max(1000).optional(),
      min_amount: Joi.number().positive().required(),
      max_amount: Joi.number().positive().greater(Joi.ref('min_amount')).optional(),
      duration: Joi.number().integer().positive().min(1).required(),
      interest_rate: Joi.number().positive().max(100).required(),
      payout_frequency: Joi.string().valid('daily', 'weekly', 'monthly', 'end').default('daily'),
      is_active: Joi.boolean().default(true),
      features: Joi.array().items(Joi.string()).default([])
    }),

    updatePlan: Joi.object({
      name: Joi.string().min(3).max(100).optional(),
      description: Joi.string().max(1000).optional(),
      min_amount: Joi.number().positive().optional(),
      max_amount: Joi.number().positive().optional(),
      duration: Joi.number().integer().positive().min(1).optional(),
      interest_rate: Joi.number().positive().max(100).optional(),
      payout_frequency: Joi.string().valid('daily', 'weekly', 'monthly', 'end').optional(),
      is_active: Joi.boolean().optional(),
      features: Joi.array().items(Joi.string()).optional()
    }),

    updateUser: Joi.object({
      role: Joi.string().valid('user', 'admin', 'super_admin').optional(),
      is_active: Joi.boolean().optional(),
      kyc_status: Joi.string().valid('pending', 'verified', 'rejected').optional()
    }),

    updateTransaction: Joi.object({
      status: Joi.string().valid(...Object.values(constants.TRANSACTION_STATUS)).required(),
      remarks: Joi.string().max(500).optional()
    })
  },

  // Market validation schemas
  market: {
    historicalData: Joi.object({
      days: Joi.number().integer().min(1).max(365).default(7),
      interval: Joi.string().valid('daily', 'hourly', 'minute').default('daily'),
      vs_currency: Joi.string().default('usd')
    }),

    convert: Joi.object({
      from: Joi.string().required(),
      to: Joi.string().required(),
      amount: Joi.number().positive().required()
    })
  },

  // Portfolio validation schemas
  portfolio: {
    export: Joi.object({
      format: Joi.string().valid('csv', 'json', 'pdf').default('csv'),
      start_date: Joi.date().optional(),
      end_date: Joi.date().optional()
    })
  },

  // General validation functions
  validate: (schema, data) => {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return { valid: false, errors };
    }

    return { valid: true, value };
  },

  // Sanitize input
  sanitize: (input) => {
    if (typeof input === 'string') {
      // Remove script tags and trim whitespace
      return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .trim();
    }
    return input;
  },

  // Validate wallet address
  validateWalletAddress: (address, currency) => {
    const validators = {
      BTC: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$/,
      BNB: /^(bnb1|[b])[a-zA-HJ-NP-Z0-9]{25,39}$/,
      TRX: /^T[A-Za-z1-9]{33}$/,
      SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
      XRP: /^r[0-9a-zA-Z]{24,34}$/,
      ADA: /^addr1[0-9a-z]{58}$/,
      DOT: /^1[0-9a-z]{47}$/,
      DOGE: /^D{1}[5-9A-HJ-NP-U]{1}[1-9A-HJ-NP-Za-km-z]{32}$/
    };

    const validator = validators[currency.toUpperCase()];
    if (!validator) {
      return {
        valid: false,
        message: `Unsupported currency for address validation: ${currency}`
      };
    }

    const isValid = validator.test(address);
    return {
      valid: isValid,
      message: isValid ? 'Valid address' : 'Invalid address format'
    };
  },

  // Validate amount
  validateAmount: (amount, currency, type = 'deposit') => {
    const minAmounts = {
      deposit: constants.SETTINGS.MIN_DEPOSIT,
      withdrawal: constants.SETTINGS.MIN_WITHDRAWAL,
      transfer: 0.00000001,
      investment: constants.SETTINGS.MIN_INVESTMENT_AMOUNT
    };

    const minAmount = minAmounts[type] || 0.00000001;

    if (amount < minAmount) {
      return {
        valid: false,
        message: `Minimum amount for ${type} is ${minAmount} ${currency}`
      };
    }

    if (type === 'withdrawal' && amount > constants.SETTINGS.DAILY_WITHDRAWAL_LIMIT) {
      return {
        valid: false,
        message: `Amount exceeds daily withdrawal limit of ${constants.SETTINGS.DAILY_WITHDRAWAL_LIMIT} ${currency}`
      };
    }

    return { valid: true, message: 'Valid amount' };
  },

  // Validate KYC document
  validateKYCDocument: (file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        message: 'Invalid file type. Allowed types: JPG, PNG, PDF'
      };
    }

    if (file.size > maxSize) {
      return {
        valid: false,
        message: 'File size exceeds 5MB limit'
      };
    }

    return { valid: true, message: 'Valid document' };
  },

  // Validate date range
  validateDateRange: (startDate, endDate, maxDays = 365) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();

    if (start > end) {
      return {
        valid: false,
        message: 'Start date must be before end date'
      };
    }

    if (end > today) {
      return {
        valid: false,
        message: 'End date cannot be in the future'
      };
    }

    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (daysDiff > maxDays) {
      return {
        valid: false,
        message: `Date range cannot exceed ${maxDays} days`
      };
    }

    return { valid: true, message: 'Valid date range' };
  },

  // Validate currency pair
  validateCurrencyPair: (from, to) => {
    const supportedCurrencies = constants.CRYPTOCURRENCIES.map(c => c.symbol);
    
    if (!supportedCurrencies.includes(from.toUpperCase())) {
      return {
        valid: false,
        message: `Unsupported source currency: ${from}`
      };
    }

    if (!supportedCurrencies.includes(to.toUpperCase())) {
      return {
        valid: false,
        message: `Unsupported target currency: ${to}`
      };
    }

    return { valid: true, message: 'Valid currency pair' };
  }
};

module.exports = validators;