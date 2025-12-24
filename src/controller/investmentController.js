const { sequelize } = require('../config/database');
const Investment = require('../models/Investment');
const Plan = require('../models/Plan');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const constants = require('../config/constants');
const logger = require('../utils/logger');
const { calculateInvestmentReturns } = require('../utils/investmentUtils');

const investmentController = {
  // Get all investment plans
  getPlans: async (req, res) => {
    try {
      const plans = await Plan.findAll({
        where: { is_active: true },
        order: [['priority', 'ASC'], ['min_amount', 'ASC']],
        attributes: ['id', 'name', 'description', 'min_amount', 'max_amount', 'duration', 'interest_rate', 'payout_frequency', 'features']
      });

      res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      logger.error(`Get plans error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch investment plans'
      });
    }
  },

  // Create new investment
  createInvestment: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { planId, amount, currency, autoRenew } = req.body;

      // Get plan details
      const plan = await Plan.findByPk(planId, { transaction });
      if (!plan || !plan.is_active) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Investment plan not found or inactive'
        });
      }

      // Validate amount against plan limits
      if (amount < plan.min_amount) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Minimum investment amount is ${plan.min_amount}`
        });
      }

      if (plan.max_amount && amount > plan.max_amount) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Maximum investment amount is ${plan.max_amount}`
        });
      }

      // Check wallet balance
      const wallet = await Wallet.findOne({
        where: { 
          user_id: req.user.id, 
          currency: currency.toUpperCase(),
          wallet_type: 'spot'
        },
        transaction
      });

      if (!wallet) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }

      if (parseFloat(wallet.balance) < amount) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      // Calculate expected returns
      const expectedReturn = calculateInvestmentReturns(amount, plan.interest_rate, plan.duration);
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);

      // Update wallet balance
      wallet.balance = parseFloat(wallet.balance) - amount;
      wallet.locked_balance = parseFloat(wallet.locked_balance) + amount;
      await wallet.save({ transaction });

      // Create investment record
      const investment = await Investment.create({
        user_id: req.user.id,
        plan_id: planId,
        amount: amount,
        currency: currency.toUpperCase(),
        interest_rate: plan.interest_rate,
        expected_return: expectedReturn,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        auto_renew: autoRenew || false,
        payout_frequency: plan.payout_frequency,
        next_payout_date: getNextPayoutDate(startDate, plan.payout_frequency)
      }, { transaction });

      // Create transaction record
      const investmentTransaction = await Transaction.create({
        user_id: req.user.id,
        type: 'investment',
        amount: amount,
        fee: 0,
        net_amount: -amount,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: `Investment in ${plan.name} plan`,
        metadata: {
          plan_id: planId,
          plan_name: plan.name,
          investment_id: investment.id,
          duration: plan.duration,
          interest_rate: plan.interest_rate
        }
      }, { transaction });

      // Update investment with transaction ID
      investment.transaction_id = investmentTransaction.id;
      await investment.save({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Investment created successfully',
        data: {
          investment: {
            id: investment.id,
            plan_name: plan.name,
            amount,
            currency: currency.toUpperCase(),
            interest_rate: plan.interest_rate,
            expected_return: expectedReturn,
            start_date: startDate,
            end_date: endDate,
            status: 'active',
            next_payout_date: investment.next_payout_date
          }
        }
      });

      logger.info(`Investment created: User ${req.user.id}, Plan: ${plan.name}, Amount: ${amount} ${currency}`);
    } catch (error) {
      await transaction.rollback();
      logger.error(`Create investment error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to create investment'
      });
    }
  },

  // Get user's investments
  getUserInvestments: async (req, res) => {
    try {
      const { status } = req.query;
      
      const where = { user_id: req.user.id };
      if (status) where.status = status;

      const investments = await Investment.findAll({
        where,
        include: [
          {
            model: Plan,
            as: 'plan',
            attributes: ['name', 'description', 'interest_rate', 'duration']
          }
        ],
        order: [['created_at', 'DESC']],
        attributes: ['id', 'amount', 'currency', 'interest_rate', 'expected_return', 'earned_amount', 'start_date', 'end_date', 'status', 'next_payout_date', 'auto_renew']
      });

      // Calculate statistics
      const totalInvested = investments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
      const totalEarned = investments.reduce((sum, inv) => sum + parseFloat(inv.earned_amount), 0);
      const activeInvestments = investments.filter(inv => inv.status === 'active').length;

      res.json({
        success: true,
        data: {
          investments,
          statistics: {
            total_invested: totalInvested,
            total_earned: totalEarned,
            active_investments: activeInvestments,
            total_investments: investments.length
          }
        }
      });
    } catch (error) {
      logger.error(`Get user investments error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch investments'
      });
    }
  },

  // Get investment details
  getInvestmentDetails: async (req, res) => {
    try {
      const { id } = req.params;

      const investment = await Investment.findOne({
        where: { id, user_id: req.user.id },
        include: [
          {
            model: Plan,
            as: 'plan',
            attributes: ['name', 'description', 'interest_rate', 'duration', 'features']
          },
          {
            model: Transaction,
            as: 'transaction',
            attributes: ['id', 'created_at']
          }
        ]
      });

      if (!investment) {
        return res.status(404).json({
          success: false,
          message: 'Investment not found'
        });
      }

      // Calculate days remaining
      const now = new Date();
      const endDate = new Date(investment.end_date);
      const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));

      // Calculate estimated daily/weekly/monthly earnings
      const earningsBreakdown = calculateEarningsBreakdown(
        investment.amount,
        investment.interest_rate,
        investment.payout_frequency,
        investment.start_date,
        investment.end_date
      );

      res.json({
        success: true,
        data: {
          investment,
          details: {
            days_remaining: daysRemaining,
            days_elapsed: Math.ceil((now - new Date(investment.start_date)) / (1000 * 60 * 60 * 24)),
            progress_percentage: calculateProgressPercentage(investment.start_date, investment.end_date),
            earnings_breakdown: earningsBreakdown
          }
        }
      });
    } catch (error) {
      logger.error(`Get investment details error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch investment details'
      });
    }
  },

  // Request early withdrawal (with penalty)
  requestEarlyWithdrawal: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const investment = await Investment.findOne({
        where: { id, user_id: req.user.id, status: 'active' },
        transaction
      });

      if (!investment) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Active investment not found'
        });
      }

      // Check if early withdrawal is allowed (after minimum period)
      const daysElapsed = Math.ceil((new Date() - new Date(investment.start_date)) / (1000 * 60 * 60 * 24));
      if (daysElapsed < 7) { // Minimum 7 days
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Early withdrawal allowed only after 7 days'
        });
      }

      // Calculate penalty (20% of expected interest)
      const expectedInterest = investment.expected_return - investment.amount;
      const penalty = expectedInterest * 0.2;
      const returnAmount = investment.amount - penalty;

      // Update investment status
      investment.status = 'cancelled';
      investment.earned_amount = 0;
      await investment.save({ transaction });

      // Update wallet
      const wallet = await Wallet.findOne({
        where: {
          user_id: req.user.id,
          currency: investment.currency,
          wallet_type: 'spot'
        },
        transaction
      });

      if (wallet) {
        wallet.locked_balance = parseFloat(wallet.locked_balance) - investment.amount;
        wallet.balance = parseFloat(wallet.balance) + returnAmount;
        await wallet.save({ transaction });
      }

      // Create transaction
      await Transaction.create({
        user_id: req.user.id,
        type: 'withdrawal',
        amount: returnAmount,
        fee: penalty,
        net_amount: returnAmount,
        currency: investment.currency,
        status: 'completed',
        description: 'Early withdrawal from investment (penalty applied)',
        metadata: {
          investment_id: investment.id,
          penalty_applied: penalty,
          original_amount: investment.amount,
          days_elapsed: daysElapsed
        }
      }, { transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Early withdrawal processed successfully',
        data: {
          original_amount: investment.amount,
          penalty: penalty,
          returned_amount: returnAmount,
          days_elapsed: daysElapsed
        }
      });

      logger.info(`Early withdrawal: Investment ${id}, User ${req.user.id}, Returned: ${returnAmount}`);
    } catch (error) {
      await transaction.rollback();
      logger.error(`Early withdrawal error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to process early withdrawal'
      });
    }
  },

  // Get investment earnings history
  getEarningsHistory: async (req, res) => {
    try {
      const { investmentId, startDate, endDate, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const where = {
        user_id: req.user.id,
        type: 'earnings'
      };

      if (investmentId) {
        where.metadata = { investment_id: investmentId };
      }

      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.created_at[sequelize.Op.lte] = new Date(endDate);
      }

      const { count, rows } = await Transaction.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: ['id', 'amount', 'currency', 'created_at', 'metadata']
      });

      // Calculate total earnings
      const totalEarnings = await Transaction.sum('amount', {
        where: {
          user_id: req.user.id,
          type: 'earnings'
        }
      });

      res.json({
        success: true,
        data: {
          earnings: rows,
          total_earnings: totalEarnings || 0,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error(`Get earnings history error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch earnings history'
      });
    }
  }
};

// Helper functions
function getNextPayoutDate(startDate, frequency) {
  const date = new Date(startDate);
  
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      return null; // For 'end' frequency
  }
  
  return date;
}

function calculateProgressPercentage(startDate, endDate) {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const totalDuration = end - start;
  const elapsed = now - start;
  
  return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
}

function calculateEarningsBreakdown(amount, interestRate, frequency, startDate, endDate) {
  const annualInterest = amount * (interestRate / 100);
  
  switch (frequency) {
    case 'daily':
      return {
        daily: annualInterest / 365,
        weekly: annualInterest / 52,
        monthly: annualInterest / 12,
        total: annualInterest * (getDaysBetween(startDate, endDate) / 365)
      };
    case 'weekly':
      return {
        weekly: annualInterest / 52,
        monthly: annualInterest / 12,
        total: annualInterest * (getDaysBetween(startDate, endDate) / 365)
      };
    case 'monthly':
      return {
        monthly: annualInterest / 12,
        total: annualInterest * (getDaysBetween(startDate, endDate) / 365)
      };
    default:
      return {
        total: annualInterest * (getDaysBetween(startDate, endDate) / 365)
      };
  }
}

function getDaysBetween(startDate, endDate) {
  return Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
}

module.exports = investmentController;