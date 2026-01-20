const { sequelize } = require('../config/database');
const { Op, fn, col, literal } = require('sequelize'); // --- ADDED: literal ---
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const Plan = require('../models/Plan');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

const adminController = {
  getAllUsers: async (req, res) => {
    try {
      const users = await User.findAll({ attributes: { exclude: ['password'] } });
      res.json({ success: true, data: users });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getUserById: async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, { include: [{ model: Wallet, as: 'wallets' }] });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  updateUser: async (req, res) => {
    try {
      await User.update(req.body, { where: { id: req.params.id } });
      res.json({ success: true, message: 'User updated' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getAllTransactions: async (req, res) => {
    try {
      const txs = await Transaction.findAll({ order: [['createdAt', 'DESC']] });
      res.json({ success: true, data: txs });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // --- UPDATED: Full Logic to update Database tables ---
  updateTransactionStatus: async (req, res) => {
    const t = await sequelize.transaction(); // Start transaction to ensure data integrity
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;

      // 1. Fetch transaction and lock row for update
      const tx = await Transaction.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!tx) throw new Error('Transaction not found');
      if (tx.status !== 'pending') throw new Error('Transaction is no longer pending');

      const walletWhere = { user_id: tx.user_id, currency: tx.currency };

      // 2. Logic for COMPLETING a transaction
      if (status === 'completed') {
        if (tx.type === 'deposit') {
          // --- CHANGE: Atomically increment balance in database ---
          await Wallet.increment('balance', { 
            by: tx.amount, 
            where: walletWhere, 
            transaction: t 
          });
          await Wallet.increment('total_deposited', { 
            by: tx.amount, 
            where: walletWhere, 
            transaction: t 
          });
        } else if (tx.type === 'withdrawal') {
          // Finalize withdrawal by clearing locked funds
          await Wallet.decrement('locked_balance', { 
            by: (Number(tx.amount) + Number(tx.fee || 0)), 
            where: walletWhere, 
            transaction: t 
          });
          await Wallet.increment('total_withdrawn', { 
            by: tx.amount, 
            where: walletWhere, 
            transaction: t 
          });
        }
      } 
      // 3. Logic for FAILING/CANCELLING a transaction (Refunds)
      else if ((status === 'failed' || status === 'cancelled') && tx.type === 'withdrawal') {
        const refundAmount = Number(tx.amount) + Number(tx.fee || 0);
        await Wallet.increment('balance', { by: refundAmount, where: walletWhere, transaction: t });
        await Wallet.decrement('locked_balance', { by: refundAmount, where: walletWhere, transaction: t });
      }

      // 4. Save the transaction status change
      tx.status = status;
      if (remarks) tx.metadata = { ...tx.metadata, admin_remarks: remarks };
      await tx.save({ transaction: t });

      await t.commit();
      res.json({ success: true, message: `Transaction ${status}. Wallet updated.` });
    } catch (error) {
      if (t) await t.rollback();
      logger.error(`Status Update Error: ${error.message}`);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getAllInvestments: async (req, res) => {
    try {
      const investments = await Investment.findAll({
        order: [['createdAt', 'DESC']],
        include: [{ model: User, attributes: ['email', 'first_name', 'last_name'] }]
      });
      res.json({ success: true, data: investments });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPlatformStats: async (req, res) => {
    try {
      const totalInvestments = Number(await Investment.sum('amount')) || 0;

      const stats = {
        total_users: await User.count(),
        total_investments: totalInvestments,
        pending_withdrawals: await Transaction.count({
          where: { type: 'withdrawal', status: 'pending' }
        })
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  createPlan: async (req, res) => {
    try {
      const plan = await Plan.create(req.body);
      res.status(201).json({ success: true, data: plan });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  updatePlan: async (req, res) => {
    try {
      await Plan.update(req.body, { where: { id: req.params.id } });
      res.json({ success: true, message: 'Plan updated' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  deletePlan: async (req, res) => {
    try {
      await Plan.destroy({ where: { id: req.params.id } });
      res.json({ success: true, message: 'Plan deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getDashboardOverview: async (req, res) => {
    try {
      const recentUsers = await User.findAll({
        limit: 5,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['password'] }
      });

      res.json({ success: true, data: { recentUsers } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = adminController;