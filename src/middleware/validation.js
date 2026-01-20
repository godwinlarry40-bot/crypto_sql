const Joi = require('joi');
const logger = require('../utils/logger');

const schemas = {
  register: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().min(8).max(30).required(),
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().min(2).max(50).required(),
    // referralCode: Joi.string().alphanum().max(12).optional(),
    phoneNumber: Joi.string().min(5).max(30).required()
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).optional()
  }),
  updateProfile: Joi.object({
    first_name: Joi.string().trim().min(2).max(50).optional(),
    last_name: Joi.string().trim().min(2).max(50).optional(),
    phone: Joi.string().trim().min(10).max(15).optional()
  }),
  changePassword: Joi.object({
    old_password: Joi.string().required(),
    new_password: Joi.string().min(8).required()
  }),
  // CHANGE: Added missing wallet schemas to stop the route crash
  deposit: Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().uppercase().required(),
    payment_method: Joi.string().required()
  }),
  invest: Joi.object({
    amount: Joi.number().positive().required(),
    plan_id: Joi.number().integer().required(),
    currency: Joi.string().uppercase().required()
  }),
  withdraw: Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().uppercase().required(),
    wallet_address: Joi.string().required(),
    network: Joi.string().optional()
  }),
  transfer: Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().uppercase().required(),
    recipient_email: Joi.string().email().required(),
    description: Joi.string().max(100).optional()
  })
};

const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      logger.error(`Validation schema missing for: ${schemaName}`);
      return res.status(500).json({ success: false, message: 'Internal Validation Error' });
    }

    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const errors = error.details.map(d => ({ field: d.path[0], message: d.message }));
      logger.warn(`Validation failed for ${schemaName}`, { ip: req.ip, errors });
      return res.status(422).json({ success: false, errors });
    }
    req.body = value;
    next();
  };
};

module.exports = {
  register: validate('register'),
  login: validate('login'),
  updateProfile: validate('updateProfile'),
  changePassword: validate('changePassword'),
  // CHANGE: Exporting the wallet validation functions
  deposit: validate('deposit'),
  invest: validate('invest'),
  withdraw: validate('withdraw'),
  transfer: validate('transfer')
};