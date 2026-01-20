const { sequelize } = require('../config/database');
const { Op, literal } = require('sequelize');
const Investment = require('../models/Investment');
const Plan = require('../models/Plan');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const constants = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Internal Helper: Calculate next payout date
 */
const getNextPayoutDate = (startDate, frequency, durationDays = 30) => {
  const date = new Date(startDate);
  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else if (frequency === 'maturity') {
    date.setDate(date.getDate() + Number(durationDays));
  } else {
    return null;
  }
  return date;
};

const investmentController = {
  // 1. Get all investment plans
  getPlans: async (req, res) => {
    try {
      const plans = await Plan.findAll({
        where: { is_active: true },
        order: [['min_amount', 'ASC']],
      });
      res.json({ success: true, data: plans });
    } catch (error) {
      logger.error(`Get plans error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Failed to fetch investment plans' });
    }
  },

  // 1b. Create Plan (Admin)
  createPlan: async (req, res) => {
    try {
      const { 
        name, 
        description, 
        min_amount, 
        max_amount, 
        interest_rate, 
        duration_days, 
        payout_frequency 
      } = req.body;
      
      const plan = await Plan.create({
        name,
        description,
        min_amount,
        max_amount,
        interest_rate,
        duration_days, 
        payout_frequency: payout_frequency || 'maturity', 
        is_active: true
      });

      res.status(201).json({ success: true, data: plan });
    } catch (error) {
      logger.error(`Create plan error: ${error.message}`);
      
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const messages = error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ success: false, message: `Validation Error: ${messages}` });
      }

      res.status(400).json({ success: false, message: error.message });
    }
  },

  // 2. Create new investment
  createInvestment: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      // START: Destructured inputs to handle various frontend naming conventions
      const { planId, plan_id, amount, currency, autoRenew, auto_renew } = req.body;
      const targetPlanId = planId || plan_id;
      const isAutoRenew = autoRenew || auto_renew || false;
      const investAmount = Number(amount);

      if (!targetPlanId) throw new Error('Plan ID is required');
      if (!req.user || !req.user.id) throw new Error('User authentication failed');

      // START: Lookup using the Integer ID as per current database structure
      const plan = await Plan.findByPk(targetPlanId, { transaction: t });
      if (!plan) throw new Error(`Plan not found. Please ensure Plan ID ${targetPlanId} exists in the database.`);
      if (!plan.is_active) throw new Error('This investment plan is currently inactive');

      if (investAmount < plan.min_amount || (plan.max_amount && investAmount > plan.max_amount)) {
        throw new Error(`Amount must be between ${plan.min_amount} and ${plan.max_amount}`);
      }

      const targetCurrency = (currency || 'USDT').toUpperCase();

      const wallet = await Wallet.findOne({
        where: { user_id: req.user.id, currency: targetCurrency },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!wallet || Number(wallet.balance) < investAmount) {
        throw new Error(`Insufficient ${targetCurrency} balance. Current balance: ${wallet ? wallet.balance : 0}`);
      }

      const startDate = new Date();
      const durationVal = Number(plan.duration_days || 30);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationVal);

      // Deduct from wallet
      await wallet.update({
        balance: literal(`balance - ${investAmount}`),
        locked_balance: literal(`locked_balance + ${investAmount}`)
      }, { transaction: t });

      const investment = await Investment.create({
        user_id: req.user.id,
        plan_id: targetPlanId,
        amount: investAmount,
        currency: targetCurrency,
        interest_rate: plan.interest_rate,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        auto_renew: isAutoRenew,
        duration_days: durationVal, // Field added to match Investment model
        next_payout_date: getNextPayoutDate(startDate, plan.payout_frequency, durationVal)
      }, { transaction: t });

      await Transaction.create({
        user_id: req.user.id,
        type: 'investment',
        amount: investAmount,
        currency: targetCurrency,
        status: 'completed',
        description: `TradePro: Invested in ${plan.name} plan`,
        reference_id: investment.id 
      }, { transaction: t });

      await t.commit();
      res.json({ success: true, data: investment });
      // END: Logic for creating investment
    } catch (error) {
      if (t) await t.rollback();
      logger.error(`Investment Error: ${error.message}`);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // 3. Get user's portfolio
  getUserInvestments: async (req, res) => {
    try {
      const { status } = req.query;
      const where = { user_id: req.user.id };
      if (status) where.status = status;

      const investments = await Investment.findAll({
        where,
        include: [{ model: Plan, as: 'plan', attributes: ['name', 'interest_rate'] }],
        order: [['createdAt', 'DESC']]
      });

      res.json({ success: true, data: investments });
    } catch (error) {
      logger.error(`Portfolio Fetch Error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Fetch error' });
    }
  },

  // 4. Get specific investment details
  getInvestmentDetails: async (req, res) => {
    try {
      const investment = await Investment.findOne({
        where: { id: req.params.id, user_id: req.user.id },
        include: [{ model: Plan, as: 'plan' }]
      });
      if (!investment) return res.status(404).json({ success: false, message: 'Investment not found' });
      res.json({ success: true, data: investment });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching details' });
    }
  },

  // 5. Early Withdrawal Logic
  requestEarlyWithdrawal: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const investment = await Investment.findOne({
        where: { id: req.params.id, user_id: req.user.id, status: 'active' },
        transaction: t
      });

      if (!investment) throw new Error('Active investment not found');

      const penalty = Number(investment.amount) * 0.20;
      const returnAmount = Number(investment.amount) - penalty;

      const wallet = await Wallet.findOne({
        where: { user_id: req.user.id, currency: investment.currency },
        transaction: t
      });

      await wallet.update({
        locked_balance: literal(`locked_balance - ${investment.amount}`),
        balance: literal(`balance + ${returnAmount}`)
      }, { transaction: t });

      investment.status = 'cancelled';
      await investment.save({ transaction: t });

      await Transaction.create({
        user_id: req.user.id,
        type: 'withdrawal',
        amount: returnAmount,
        fee: penalty,
        currency: investment.currency,
        status: 'completed',
        description: 'Early investment liquidation (Penalty applied)'
      }, { transaction: t });

      await t.commit();
      res.json({ success: true, returned: returnAmount, penalty });
    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // 6. Get Earnings History
  getEarningsHistory: async (req, res) => {
    try {
      const history = await Transaction.findAll({
        where: { 
          user_id: req.user.id, 
          type: 'interest',
          [Op.or]: [
            { description: { [Op.like]: `%${req.params.id}%` } }
          ]
        },
        order: [['createdAt', 'DESC']]
      });

      res.json({ success: true, data: history });
    } catch (error) {
      logger.error(`getEarningsHistory Error: ${error.message}`);
      res.status(500).json({ success: false, message: `Fetch error: ${error.message}` });
    }
  },

  // --- Admin Section ---
  getAllInvestments: async (req, res) => {
    try {
      const all = await Investment.findAll({
        include: [
          { model: User, as: 'user', attributes: ['email', 'first_name', 'last_name'] }, 
          { model: Plan, as: 'plan' }
        ]
      });
      res.json({ success: true, data: all });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Admin error' });
    }
  },

  getInvestmentStats: async (req, res) => {
    try {
      const stats = await Investment.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
        ],
        group: ['status']
      });
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Stats error' });
    }
  },

  updateInvestmentStatus: async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['active', 'completed', 'cancelled', 'pending'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status type' });
      }

      await Investment.update({ status }, { where: { id: req.params.id } });
      res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Update failed' });
    }
  }
};

module.exports = investmentController;