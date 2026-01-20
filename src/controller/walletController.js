const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { Wallet, Transaction, User, Investment } = require('../models');
const logger = require('../utils/logger');

// Fallback settings
const SETTINGS = {
  MIN_WITHDRAWAL: 0.001,
  WITHDRAWAL_FEE_PERCENT: 1
};

const walletController = {

  // =========================
  // GET USER WALLETS
  // =========================
  getUserWallets: async (req, res) => {
    try {
      const wallets = await Wallet.findAll({
        where: { user_id: req.user.id, is_active: true }
      });
      res.json({ success: true, data: wallets });
    } catch (error) {
      logger.error(`Get wallets error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Failed to fetch wallets' });
    }
  },

  // =========================
  // GET WALLET BY CURRENCY
  // =========================
  getWalletByCurrency: async (req, res) => {
    try {
      const wallet = await Wallet.findOne({
        where: {
          user_id: req.user.id,
          currency: req.params.currency.toUpperCase(),
          is_active: true
        }
      });

      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }

      res.json({ success: true, data: wallet });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching wallet' });
    }
  },

  // =========================
  // GET BALANCE
  // =========================
  getBalance: async (req, res) => {
    try {
      const wallets = await Wallet.findAll({
        where: { user_id: req.user.id, is_active: true },
        attributes: ['currency', 'balance', 'locked_balance']
      });

      const summary = wallets.reduce(
        (acc, w) => {
          acc.total_balance += Number(w.balance || 0);
          acc.total_locked += Number(w.locked_balance || 0);
          return acc;
        },
        { total_balance: 0, total_locked: 0 }
      );

      res.json({ success: true, data: { wallets, summary } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Balance fetch failed' });
    }
  },

  // =========================
  // GENERATE DEPOSIT ADDRESS
  // =========================
  generateDepositAddress: async (req, res) => {
    try {
      const { currency } = req.body;

      const [wallet] = await Wallet.findOrCreate({
        where: { user_id: req.user.id, currency: currency.toUpperCase() },
        defaults: {
          balance: 0,
          locked_balance: 0,
          is_active: true,
          address: `DEP-${req.user.id}-${Date.now()}`
        }
      });

      res.json({ success: true, data: { address: wallet.address, currency: wallet.currency } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to generate address' });
    }
  },

  // =========================
  // DEPOSIT
  // =========================
  deposit: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { amount, currency, payment_method } = req.body;
      const amountNum = parseFloat(amount);

      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Invalid deposit amount provided');
      }

      const [wallet] = await Wallet.findOrCreate({
        where: { user_id: req.user.id, currency: currency.toUpperCase() },
        defaults: {
          balance: 0,
          locked_balance: 0,
          is_active: true,
          address: `DEP-${req.user.id}-${Date.now()}`
        },
        transaction: t
      });
      console.log("===============")
      console.log(wallet)
      // AREA OF CHANGE: Using manual balance addition and .save() to ensure SQL reflection
      const oldBalance = Number(wallet.balance);
      wallet.balance = oldBalance + amountNum;
      await wallet.save({ transaction: t });

      const tx = await Transaction.create({
        user_id: req.user.id,
        type: 'deposit',
        amount: amountNum,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: `Deposit via ${payment_method || 'direct'}`,
        metadata: typeof payment_method === 'object' ? JSON.stringify(payment_method) : payment_method
      }, { transaction: t });

      await t.commit();
      res.json({ success: true, message: 'Deposit successful', new_balance: wallet.balance, data: tx });

    } catch (error) {
      if (t) await t.rollback();
      logger.error(`Deposit error: ${error.message}`);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // =========================
  // INVEST FROM BALANCE
  // =========================
  investFromBalance: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { amount, plan_id, currency } = req.body;
      const amountNum = parseFloat(amount);

      const wallet = await Wallet.findOne({
        where: { user_id: req.user.id, currency: currency.toUpperCase() },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!wallet || Number(wallet.balance) < amountNum) {
        throw new Error('Insufficient balance to start investment');
      }

      await wallet.decrement('balance', { by: amountNum, transaction: t });

      const investment = await Investment.create({
        user_id: req.user.id,
        plan_id,
        amount: amountNum,
        currency: currency.toUpperCase(),
        status: 'active'
      }, { transaction: t });

      await Transaction.create({
        user_id: req.user.id,
        type: 'investment',
        amount: amountNum,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: `Investment in Plan #${plan_id}`
      }, { transaction: t });

      await t.commit();
      res.json({ success: true, message: 'Investment successful', data: investment });

    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // =========================
  // TRANSFER
  // =========================
  transfer: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { amount, currency, recipient_email, description } = req.body;
      const numericAmount = parseFloat(amount);

      if (isNaN(numericAmount) || numericAmount < 0.1) {
        throw new Error('Minimum transfer amount is 0.1');
      }

      const senderWallet = await Wallet.findOne({
        where: { user_id: req.user.id, currency: currency.toUpperCase() },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      const fee = numericAmount * 0.01;
      const totalDebit = numericAmount + fee;

      if (!senderWallet || Number(senderWallet.balance) < totalDebit) {
        throw new Error('Insufficient balance to cover amount and fee');
      }

      const recipient = await User.findOne({
        where: { email: recipient_email.toLowerCase() },
        transaction: t
      });

      if (!recipient || recipient.id === req.user.id) {
        throw new Error('Invalid recipient email');
      }

      const [recipientWallet] = await Wallet.findOrCreate({
        where: { user_id: recipient.id, currency: currency.toUpperCase() },
        defaults: { balance: 0, is_active: true, address: `INT-${recipient.id}-${Date.now()}` },
        transaction: t
      });

      await senderWallet.decrement('balance', { by: totalDebit, transaction: t });
      await recipientWallet.increment('balance', { by: numericAmount, transaction: t });

      const txs = await Transaction.bulkCreate([
        {
          user_id: req.user.id,
          type: 'transfer_out',
          amount: numericAmount,
          fee,
          currency: currency.toUpperCase(),
          status: 'completed',
          description: description || `Sent to ${recipient_email}`
        },
        {
          user_id: recipient.id,
          type: 'transfer_in',
          amount: numericAmount,
          fee: 0,
          currency: currency.toUpperCase(),
          status: 'completed',
          description: `Received from ${req.user.email}`
        }
      ], { transaction: t });

      await t.commit();
      res.json({ success: true, message: 'Transfer successful', tx_id: txs[0].id });

    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // =========================
  // WITHDRAW
  // =========================
  withdraw: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { amount, currency, wallet_address, network } = req.body;
      const numericAmount = parseFloat(amount);

      if (isNaN(numericAmount) || numericAmount < SETTINGS.MIN_WITHDRAWAL) {
        throw new Error(`Minimum withdrawal is ${SETTINGS.MIN_WITHDRAWAL}`);
      }

      const wallet = await Wallet.findOne({
        where: { user_id: req.user.id, currency: currency.toUpperCase() },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!wallet) throw new Error('Wallet not found');

      const fee = numericAmount * (SETTINGS.WITHDRAWAL_FEE_PERCENT / 100);
      const totalAmount = numericAmount + fee;

      if (Number(wallet.balance) < totalAmount) {
        throw new Error('Insufficient balance');
      }

      await wallet.decrement('balance', { by: totalAmount, transaction: t });
      await wallet.increment('locked_balance', { by: totalAmount, transaction: t });

      const withdrawalTx = await Transaction.create({
        user_id: req.user.id,
        type: 'withdrawal',
        amount: numericAmount,
        fee,
        currency: currency.toUpperCase(),
        status: 'pending',
        to_address: wallet_address,
        metadata: JSON.stringify({ network })
      }, { transaction: t });

      await t.commit();
      res.json({ success: true, message: 'Withdrawal is pending admin approval', data: { tx_id: withdrawalTx.id } });

    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // =========================
  // PROCESS WITHDRAWAL (ADMIN)
  // =========================
  processWithdrawal: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { transactionId, action } = req.body; 

      const tx = await Transaction.findByPk(transactionId, { transaction: t });
      if (!tx || tx.type !== 'withdrawal' || tx.status !== 'pending') {
        throw new Error('Invalid or already processed transaction');
      }

      const wallet = await Wallet.findOne({
        where: { user_id: tx.user_id, currency: tx.currency },
        transaction: t
      });

      const totalAmount = Number(tx.amount) + Number(tx.fee);

      if (action === 'approve') {
        await wallet.decrement('locked_balance', { by: totalAmount, transaction: t });
        tx.status = 'completed';
      } else {
        await wallet.decrement('locked_balance', { by: totalAmount, transaction: t });
        await wallet.increment('balance', { by: totalAmount, transaction: t });
        tx.status = 'failed';
      }

      await tx.save({ transaction: t });
      await t.commit();
      res.json({ success: true, message: `Withdrawal ${action}ed successfully` });

    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // =========================
  // TRANSACTION HISTORY
  // =========================
  getTransactionHistory: async (req, res) => {
    try {
      const history = await Transaction.findAll({
        where: { user_id: req.user.id },
        order: [['createdAt', 'DESC']],
        limit: 50
      });

      res.json({ success: true, data: history });

    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
  }
};

module.exports = walletController;