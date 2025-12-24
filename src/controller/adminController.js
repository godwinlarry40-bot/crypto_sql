const { sequelize } = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const Plan = require('../models/Plan');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

const adminController = {
  // Get all users
  getAllUsers: async (req, res) => {
    try {
      const { page = 1, limit = 20, search, role, status } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (search) {
        where[sequelize.Op.or] = [
          { email: { [sequelize.Op.like]: `%${search}%` } },
          { first_name: { [sequelize.Op.like]: `%${search}%` } },
          { last_name: { [sequelize.Op.like]: `%${search}%` } }
        ];
      }
      if (role) where.role = role;
      if (status) where.is_active = status === 'active';

      const { count, rows } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password', 'two_factor_secret'] },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          users: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error(`Get all users error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  },

  // Get user by ID
  getUserById: async (req, res) => {
    try {
      const { id } = req.params;

      const user = await User.findByPk(id, {
        attributes: { exclude: ['password', 'two_factor_secret'] },
        include: [
          {
            model: Wallet,
            as: 'wallets',
            attributes: ['currency', 'balance', 'locked_balance', 'total_deposited', 'total_withdrawn']
          },
          {
            model: Investment,
            as: 'investments',
            include: [{ model: Plan, as: 'plan' }],
            limit: 10,
            order: [['created_at', 'DESC']]
          }
        ]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user statistics
      const statistics = await getUserStatistics(id);

      res.json({
        success: true,
        data: {
          user,
          statistics
        }
      });
    } catch (error) {
      logger.error(`Get user by ID error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user'
      });
    }
  },

  // Update user
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { role, is_active, kyc_status } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update fields
      const updates = {};
      if (role) updates.role = role;
      if (is_active !== undefined) updates.is_active = is_active;
      if (kyc_status) updates.kyc_status = kyc_status;

      await user.update(updates);

      // Send notification email if status changed
      if (kyc_status && kyc_status !== user.kyc_status) {
        await emailService.sendEmail(
          user.email,
          `KYC Status Update: ${kyc_status}`,
          `Your KYC verification status has been updated to: ${kyc_status}`,
          `<p>Your KYC verification status has been updated to: <strong>${kyc_status}</strong></p>`
        );
      }

      res.json({
        success: true,
        message: 'User updated successfully',
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
          kyc_status: user.kyc_status
        }
      });
    } catch (error) {
      logger.error(`Update user error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to update user'
      });
    }
  },

  // Get all transactions (admin)
  getAllTransactions: async (req, res) => {
    try {
      const { 
        type, 
        status, 
        currency, 
        startDate, 
        endDate, 
        userId,
        page = 1, 
        limit = 50 
      } = req.query;

      const where = {};
      const offset = (page - 1) * limit;

      if (type) where.type = type;
      if (status) where.status = status;
      if (currency) where.currency = currency.toUpperCase();
      if (userId) where.user_id = userId;
      
      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.created_at[sequelize.Op.lte] = new Date(endDate);
      }

      const { count, rows } = await Transaction.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'email', 'first_name', 'last_name']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Calculate totals
      const totals = await Transaction.findAll({
        where,
        attributes: [
          'currency',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('fee')), 'total_fee'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['currency']
      });

      res.json({
        success: true,
        data: {
          transactions: rows,
          totals,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error(`Get all transactions error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions'
      });
    }
  },

  // Get all investments (admin)
  getAllInvestments: async (req, res) => {
    try {
      const { 
        status, 
        currency, 
        planId,
        startDate, 
        endDate, 
        userId,
        page = 1, 
        limit = 50 
      } = req.query;

      const where = {};
      const offset = (page - 1) * limit;

      if (status) where.status = status;
      if (currency) where.currency = currency.toUpperCase();
      if (planId) where.plan_id = planId;
      if (userId) where.user_id = userId;
      
      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.created_at[sequelize.Op.lte] = new Date(endDate);
      }

      const { count, rows } = await Investment.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'email', 'first_name', 'last_name']
          },
          {
            model: Plan,
            as: 'plan',
            attributes: ['name', 'interest_rate', 'duration']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Calculate investment statistics
      const stats = await Investment.findAll({
        where: { status: 'active' },
        attributes: [
          'currency',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('earned_amount')), 'total_earned'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['currency']
      });

      res.json({
        success: true,
        data: {
          investments: rows,
          statistics: stats,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error(`Get all investments error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch investments'
      });
    }
  },

  // Get platform statistics
  getPlatformStats: async (req, res) => {
    try {
      const [
        totalUsers,
        activeUsers,
        totalDeposits,
        totalWithdrawals,
        totalInvestments,
        activeInvestments,
        pendingTransactions
      ] = await Promise.all([
        User.count(),
        User.count({ where: { is_active: true } }),
        Transaction.sum('amount', { where: { type: 'deposit', status: 'completed' } }),
        Transaction.sum('amount', { where: { type: 'withdrawal', status: 'completed' } }),
        Investment.sum('amount'),
        Investment.sum('amount', { where: { status: 'active' } }),
        Transaction.count({ where: { status: 'pending' } })
      ]);

      // Get daily new users (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const dailyUsers = await User.findAll({
        where: {
          created_at: { [sequelize.Op.gte]: sevenDaysAgo }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
      });

      // Get total platform value
      const wallets = await Wallet.findAll({
        attributes: [
          'currency',
          [sequelize.fn('SUM', sequelize.col('balance')), 'total_balance'],
          [sequelize.fn('SUM', sequelize.col('locked_balance')), 'total_locked']
        ],
        group: ['currency']
      });

      const platformValue = wallets.reduce((total, wallet) => {
        return total + parseFloat(wallet.dataValues.total_balance) + parseFloat(wallet.dataValues.total_locked);
      }, 0);

      res.json({
        success: true,
        data: {
          overview: {
            total_users: totalUsers || 0,
            active_users: activeUsers || 0,
            total_deposits: totalDeposits || 0,
            total_withdrawals: totalWithdrawals || 0,
            total_investments: totalInvestments || 0,
            active_investments: activeInvestments || 0,
            pending_transactions: pendingTransactions || 0,
            platform_value: platformValue
          },
          daily_users: dailyUsers,
          wallet_summary: wallets
        }
      });
    } catch (error) {
      logger.error(`Get platform stats error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch platform statistics'
      });
    }
  },

  // Update transaction status
  updateTransactionStatus: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;

      const tx = await Transaction.findByPk(id, {
        include: [{ model: User, as: 'user' }],
        transaction
      });

      if (!tx) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const oldStatus = tx.status;
      tx.status = status;
      
      if (remarks) {
        tx.metadata = { ...tx.metadata, admin_remarks: remarks };
      }

      if (status === 'completed' && oldStatus !== 'completed') {
        tx.confirmed_at = new Date();
        
        // Update wallet if deposit
        if (tx.type === 'deposit') {
          const wallet = await Wallet.findOne({
            where: {
              user_id: tx.user_id,
              currency: tx.currency,
              wallet_type: 'spot'
            },
            transaction
          });

          if (wallet) {
            wallet.balance = parseFloat(wallet.balance) + parseFloat(tx.net_amount);
            wallet.total_deposited = parseFloat(wallet.total_deposited) + parseFloat(tx.amount);
            await wallet.save({ transaction });
          }
        }
      }

      await tx.save({ transaction });
      await transaction.commit();

      // Send notification to user
      if (tx.user && tx.user.email) {
        await emailService.sendEmail(
          tx.user.email,
          `Transaction ${status}`,
          `Your transaction (${tx.id}) status has been updated to: ${status}`,
          `<p>Transaction ID: <strong>${tx.id}</strong></p>
           <p>Amount: ${tx.amount} ${tx.currency}</p>
           <p>New Status: <strong>${status}</strong></p>
           ${remarks ? `<p>Remarks: ${remarks}</p>` : ''}`
        );
      }

      res.json({
        success: true,
        message: 'Transaction status updated successfully',
        data: tx
      });
    } catch (error) {
      await transaction.rollback();
      logger.error(`Update transaction status error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to update transaction status'
      });
    }
  },

  // Create investment plan
  createPlan: async (req, res) => {
    try {
      const { 
        name, 
        description, 
        min_amount, 
        max_amount, 
        duration, 
        interest_rate, 
        payout_frequency,
        is_active,
        features 
      } = req.body;

      const plan = await Plan.create({
        name,
        description,
        min_amount: parseFloat(min_amount),
        max_amount: max_amount ? parseFloat(max_amount) : null,
        duration: parseInt(duration),
        interest_rate: parseFloat(interest_rate),
        payout_frequency: payout_frequency || 'daily',
        is_active: is_active !== undefined ? is_active : true,
        features: features || []
      });

      res.status(201).json({
        success: true,
        message: 'Investment plan created successfully',
        data: plan
      });
    } catch (error) {
      logger.error(`Create plan error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to create investment plan'
      });
    }
  },

  // Update investment plan
  updatePlan: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const plan = await Plan.findByPk(id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Investment plan not found'
        });
      }

      // Parse numeric fields
      if (updates.min_amount) updates.min_amount = parseFloat(updates.min_amount);
      if (updates.max_amount) updates.max_amount = parseFloat(updates.max_amount);
      if (updates.interest_rate) updates.interest_rate = parseFloat(updates.interest_rate);
      if (updates.duration) updates.duration = parseInt(updates.duration);

      await plan.update(updates);

      res.json({
        success: true,
        message: 'Investment plan updated successfully',
        data: plan
      });
    } catch (error) {
      logger.error(`Update plan error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to update investment plan'
      });
    }
  },

  // Delete investment plan
  deletePlan: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const plan = await Plan.findByPk(id, { transaction });
      if (!plan) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Investment plan not found'
        });
      }

      // Check if plan has active investments
      const activeInvestments = await Investment.count({
        where: { plan_id: id, status: 'active' },
        transaction
      });

      if (activeInvestments > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cannot delete plan with active investments'
        });
      }

      await plan.destroy({ transaction });
      await transaction.commit();

      res.json({
        success: true,
        message: 'Investment plan deleted successfully'
      });
    } catch (error) {
      await transaction.rollback();
      logger.error(`Delete plan error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to delete investment plan'
      });
    }
  }
};

// Helper functions
async function getUserStatistics(userId) {
  const [
    totalDeposits,
    totalWithdrawals,
    totalInvested,
    totalEarned,
    walletCount,
    investmentCount
  ] = await Promise.all([
    Transaction.sum('amount', { where: { user_id: userId, type: 'deposit', status: 'completed' } }),
    Transaction.sum('amount', { where: { user_id: userId, type: 'withdrawal', status: 'completed' } }),
    Investment.sum('amount', { where: { user_id: userId } }),
    Investment.sum('earned_amount', { where: { user_id: userId } }),
    Wallet.count({ where: { user_id: userId } }),
    Investment.count({ where: { user_id: userId } })
  ]);

  return {
    total_deposits: totalDeposits || 0,
    total_withdrawals: totalWithdrawals || 0,
    total_invested: totalInvested || 0,
    total_earned: totalEarned || 0,
    wallet_count: walletCount || 0,
    investment_count: investmentCount || 0,
    net_deposit: (totalDeposits || 0) - (totalWithdrawals || 0)
  };
}

module.exports = adminController;