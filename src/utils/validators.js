const Joi = require('joi');
const constants = require('../config/constants') || {
  SETTINGS: { MIN_WITHDRAWAL: 10, MIN_INVESTMENT_AMOUNT: 50 }
};

const validators = {
  // ================================
  // 1. Joi Schemas (Centralized)
  // ================================
  schemas: {
    register: Joi.object({
      email: Joi.string().email().lowercase().trim().required().max(255),
      password: Joi.string()
        .min(8)
        .max(100)
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])'))
        .required(),
      firstName: Joi.string().trim().min(2).max(50).required(), // Updated to firstName
      lastName: Joi.string().trim().min(2).max(50).required(),  // Updated to lastName
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
      referral_code: Joi.string().alphanum().max(12).optional(),
      accept_terms: Joi.boolean().valid(true).required()
    }),

    login: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
      two_factor_code: Joi.string().length(6).pattern(/^\d+$/).optional()
    }),

    updateProfile: Joi.object({
      firstName: Joi.string().trim().min(2).max(50),
      lastName: Joi.string().trim().min(2).max(50),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional()
    }),

    changePassword: Joi.object({
      old_password: Joi.string().required(),
      new_password: Joi.string().min(8).required()
    }),

    deposit: Joi.object({
      currency: Joi.string().uppercase().required()
    }),

    withdrawal: Joi.object({
      currency: Joi.string().uppercase().required(),
      address: Joi.string().required(),
      amount: Joi.number().min(constants.SETTINGS.MIN_WITHDRAWAL).required()
    }),

    transfer: Joi.object({
      to_user_email: Joi.string().email().required(),
      currency: Joi.string().uppercase().required(),
      amount: Joi.number().positive().required()
    }),

    transactionStatus: Joi.object({
      status: Joi.string().valid('pending', 'completed', 'failed').required(),
      remarks: Joi.string().max(255).optional()
    })
  },

  // ================================
  // 2. Auth Route Validators
  // ================================
  register: (req, res, next) => {
    const { error } = validators.schemas.register.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        errors: error.details.map(err => ({
          field: err.context.key,
          message: err.message.replace(/"/g, '')
        }))
      });
    }
    next();
  },

  login: (req, res, next) => {
    const { error } = validators.schemas.login.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  updateProfile: (req, res, next) => {
    const { error } = validators.schemas.updateProfile.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        errors: error.details.map(err => ({
          field: err.context.key,
          message: err.message.replace(/"/g, '')
        }))
      });
    }
    next();
  },

  changePassword: (req, res, next) => {
    const { error } = validators.schemas.changePassword.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  // ================================
  // 3. Wallet Validators
  // ================================
  deposit: (req, res, next) => {
    const { error } = validators.schemas.deposit.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  withdrawal: (req, res, next) => {
    const { error } = validators.schemas.withdrawal.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  transfer: (req, res, next) => {
    const { error } = validators.schemas.transfer.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  // ================================
  // 4. Admin Validators
  // ================================
  validateUpdateUser: (req, res, next) => {
    const { error } = validators.schemas.updateProfile.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  validateTransactionStatus: (req, res, next) => {
    const { error } = validators.schemas.transactionStatus.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    next();
  },

  validatePlanCreation: (req, res, next) => {
    next(); 
  }
};

module.exports = validators;