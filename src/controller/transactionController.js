const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { sequelize } = require('../config/database');
const { Op, literal } = require('sequelize');
const logger = require('../utils/logger');

const transactionController = {
  // --- 1. ADDED: GET ALL TRANSACTIONS (Required by router.get('/')) ---
  getAllTransactions: async (req, res) => {
    try {
      const { type, status } = req.query;
      const where = { user_id: req.user.id };
      if (type) where.type = type;
      if (status) where.status = status;

      const txs = await Transaction.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });
      res.json({ success: true, data: txs });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Fetch error' });
    }
  },

  // --- 2. ADDED: GET TRANSACTION BY ID (Required by router.get('/:id')) ---
  getTransactionById: async (req, res) => {
    try {
      const tx = await Transaction.findOne({
        where: { id: req.params.id, user_id: req.user.id }
      });
      if (!tx) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true, data: tx });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching transaction' });
    }
  },

  // --- 3. ADDED: DEPOSIT LOGIC (Corrected router.post('/deposit')) ---
  requestDeposit: async (req, res) => {
    try {
      const { amount, currency, payment_method } = req.body;
      const tx = await Transaction.create({
        user_id: req.user.id,
        type: 'deposit',
        amount: amount,
        net_amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        metadata: { payment_method }
      });
      res.json({ success: true, message: 'Deposit intent logged', data: tx });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Deposit failed' });
    }
  },

  // 4. USER: Request a withdrawal (Existing)
  requestWithdrawal: async (req, res) => {
    const dbTransaction = await sequelize.transaction();
    try {
      const { amount, currency, address } = req.body;
      const userId = req.user.id;

      const wallet = await Wallet.findOne({
        where: { user_id: userId, currency: currency.toUpperCase() },
        transaction: dbTransaction,
        lock: dbTransaction.LOCK.UPDATE
      });

      if (!wallet || Number(wallet.balance) < Number(amount)) {
        await dbTransaction.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient balance' });
      }

      await wallet.update({
        balance: literal(`balance - ${amount}`),
        locked_balance: literal(`locked_balance + ${amount}`)
      }, { transaction: dbTransaction });

      const tx = await Transaction.create({
        user_id: userId,
        type: 'withdrawal',
        amount: amount,
        net_amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        metadata: { destination_address: address }
      }, { transaction: dbTransaction });

      await dbTransaction.commit();
      res.json({ success: true, message: 'Withdrawal request submitted', data: tx });

    } catch (error) {
      if (dbTransaction) await dbTransaction.rollback();
      logger.error(`Withdrawal Error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Withdrawal failed' });
    }
  },

  // --- 5. ADDED: ATOMIC TRANSFER LOGIC (Required by router.post('/transfer')) ---
  transfer: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { recipientEmail, amount, currency } = req.body;
      const amountNum = parseFloat(amount);

      const senderWallet = await Wallet.findOne({
        where: { user_id: req.user.id, currency: currency.toUpperCase() },
        transaction: t, lock: t.LOCK.UPDATE
      });

      const recipient = await User.findOne({ where: { email: recipientEmail } });
      if (!recipient) throw new Error('Recipient not found');

      const receiverWallet = await Wallet.findOne({
        where: { user_id: recipient.id, currency: currency.toUpperCase() },
        transaction: t, lock: t.LOCK.UPDATE
      });

      if (!senderWallet || senderWallet.balance < amountNum) throw new Error('Insufficient funds');

      await senderWallet.update({ balance: literal(`balance - ${amountNum}`) }, { transaction: t });
      await receiverWallet.update({ balance: literal(`balance + ${amountNum}`) }, { transaction: t });

      await Transaction.create({
        user_id: req.user.id,
        type: 'transfer',
        amount: amountNum,
        currency: currency.toUpperCase(),
        status: 'completed',
        metadata: { recipient: recipientEmail }
      }, { transaction: t });

      await t.commit();
      res.json({ success: true, message: 'Transfer successful' });
    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // --- 6. ADDED: CANCEL TRANSACTION (Required by router.post('/:id/cancel')) ---
  cancelTransaction: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const tx = await Transaction.findOne({
        where: { id: req.params.id, user_id: req.user.id, status: 'pending' },
        transaction: t
      });

      if (!tx) throw new Error('Transaction not found or not cancellable');

      if (tx.type === 'withdrawal') {
        await Wallet.update({
          balance: literal(`balance + ${tx.amount}`),
          locked_balance: literal(`locked_balance - ${tx.amount}`)
        }, { where: { user_id: req.user.id, currency: tx.currency }, transaction: t });
      }

      tx.status = 'cancelled';
      await tx.save({ transaction: t });

      await t.commit();
      res.json({ success: true, message: 'Transaction cancelled' });
    } catch (error) {
      if (t) await t.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // --- 7. ADDED: ESTIMATE FEE (Required by router.post('/estimate-fee')) ---
  getTransactionFee: async (req, res) => {
    const { amount } = req.body;
    const fee = parseFloat(amount) * 0.01; // Example 1% fee
    res.json({ success: true, fee });
  },

  // 8. ADMIN: Update Status (Existing)
  updateTransactionStatus: async (req, res) => {
    const dbTransaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;

      const tx = await Transaction.findByPk(id, { transaction: dbTransaction, lock: dbTransaction.LOCK.UPDATE });
      if (!tx || tx.status !== 'pending') throw new Error('Invalid transaction');

      const walletWhere = { user_id: tx.user_id, currency: tx.currency };

      if (status === 'completed') {
        if (tx.type === 'withdrawal') {
          await Wallet.update({
            locked_balance: literal(`locked_balance - ${tx.amount}`),
            total_withdrawn: literal(`total_withdrawn + ${tx.amount}`)
          }, { where: walletWhere, transaction: dbTransaction });
        } else if (tx.type === 'deposit') {
          await Wallet.update({
            balance: literal(`balance + ${tx.net_amount}`),
            total_deposited: literal(`total_deposited + ${tx.amount}`)
          }, { where: walletWhere, transaction: dbTransaction });
        }
      } else if (status === 'failed' && tx.type === 'withdrawal') {
        await Wallet.update({
          balance: literal(`balance + ${tx.amount}`),
          locked_balance: literal(`locked_balance - ${tx.amount}`)
        }, { where: walletWhere, transaction: dbTransaction });
      }

      tx.status = status;
      if (remarks) tx.metadata = { ...tx.metadata, admin_remarks: remarks };
      await tx.save({ transaction: dbTransaction });

      await dbTransaction.commit();
      res.json({ success: true, message: `Transaction marked as ${status}` });
    } catch (error) {
      if (dbTransaction) await dbTransaction.rollback();
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = transactionController;