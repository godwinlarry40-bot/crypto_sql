const Joi = require('joi');

const validators = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  wallet: Joi.object({
    currency: Joi.string().required()
  }),

  deposit: Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().required()
  }),

  withdrawal: Joi.object({
    amount: Joi.number().positive().required(),
    address: Joi.string().required(),
    currency: Joi.string().required()
  }),

  investment: Joi.object({
    planId: Joi.string().required(),
    amount: Joi.number().positive().required()
  })
};

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

module.exports = { validators, validate };