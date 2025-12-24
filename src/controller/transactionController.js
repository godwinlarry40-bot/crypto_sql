const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { sequelize } = require('../config/database');
const constants = require('../config/constants');
const logger = require('../utils/logger');

const transactionController = {
  // Get all transactions with filters
  getAllTransactions: async (req, res) => {
    try {
      const { 
        type, 
        status, 
        currency, 
        startDate, 
        endDate, 
        page = 1, 
        limit = 50,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = req.query;

      const where = {};
      const offset = (page - 1) * limit;

      // Add filters
      if (type) where.type = type;
      if (status) where.status = status;
      if (currency) where.currency = currency.toUpperCase();
      
      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.created_at[sequelize.Op.lte] = new Date(endDate);
      }

      // For non-admin users, only show their transactions
      if (req.user.role === 'user') {
        where.user_id = req.user.id;
      }

      const { count, rows } = await Transaction.findAndCountAll({
        where,
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          {
            model: require('../models/User'),
            as: 'user',
            attributes: ['id', 'email', 'first_name', 'last_name']
          }
        ]
      });

      // Calculate summary
      const summary = await Transaction.findAll({
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
          summary,
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

  // Get transaction statistics
  getTransactionStats: async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Daily statistics
      const dailyStats = await Transaction.findAll({
        where: {
          user_id: req.user.id,
          created_at: { [sequelize.Op.gte]: today }
        },
        attributes: [
          'type',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['type']
      });

      // Monthly statistics
      const monthlyStats = await Transaction.findAll({
        where: {
          user_id: req.user.id,
          created_at: { [sequelize.Op.gte]: thirtyDaysAgo }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
        ],
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'DESC']],
        limit: 30
      });

      // Type distribution
      const typeDistribution = await Transaction.findAll({
        where: { user_id: req.user.id },
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['type']
      });

      // Currency distribution
      const currencyDistribution = await Transaction.findAll({
        where: { user_id: req.user.id },
        attributes: [
          'currency',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['currency']
      });

      res.json({
        success: true,
        data: {
          daily_stats: dailyStats,
          monthly_stats: monthlyStats,
          type_distribution: typeDistribution,
          currency_distribution: currencyDistribution
        }
      });
    } catch (error) {
      logger.error(`Get transaction stats error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction statistics'
      });
    }
  },

  // Update transaction status (Admin only)
  updateTransactionStatus: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;

      const validStatuses = Object.values(constants.TRANSACTION_STATUS);
      if (!validStatuses.includes(status)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const tx = await Transaction.findByPk(id, { transaction });
      if (!tx) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // If transaction is being marked as completed, update wallet
      if (status === 'completed' && tx.status !== 'completed') {
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
        
        tx.confirmed_at = new Date();
      }

      tx.status = status;
      if (remarks) {
        tx.metadata = { ...tx.metadata, admin_remarks: remarks };
      }
      await tx.save({ transaction });

      await transaction.commit();

      // Send notification to user about status change

      res.json({
        success: true,
        message: 'Transaction status updated successfully',
        data: tx
      });

      logger.info(`Transaction status updated: ${id} -> ${status}`);
    } catch (error) {
      await transaction.rollback();
      logger.error(`Update transaction status error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to update transaction status'
      });
    }
  }
};

module.exports = transactionController;