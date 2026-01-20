const axios = require('axios');
const crypto = require('crypto');
const { Transaction, Wallet, User, sequelize } = require('../models');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

const paymentService = {
  // 1. Process Crypto Payment (Webhook or Manual Hash Submission)
  processCryptoPayment: async (userId, amount, currency, paymentData) => {
    const transaction = await sequelize.transaction();
    try {
      const { txHash, fromAddress, network } = paymentData;

      // Idempotency check: Don't process the same hash twice
      const existingTx = await Transaction.findOne({ where: { tx_hash: txHash }, transaction });
      if (existingTx) {
        await transaction.rollback();
        throw new Error('Transaction hash already exists');
      }

      const wallet = await Wallet.findOne({
        where: { user_id: userId, currency: currency.toUpperCase(), wallet_type: 'spot' },
        transaction
      });

      if (!wallet) throw new Error('Spot wallet not found for this currency');

      const paymentTx = await Transaction.create({
        user_id: userId,
        wallet_id: wallet.id,
        type: 'deposit',
        amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        tx_hash: txHash,
        from_address: fromAddress,
        to_address: wallet.wallet_address,
        description: `Crypto Deposit (${network})`,
        metadata: { network, confirmations: 0, required: 3 }
      }, { transaction });

      await transaction.commit();

      // Trigger background monitoring
      monitorBlockchain(paymentTx.id, txHash, currency);

      return { success: true, txId: paymentTx.id, status: 'pending' };
    } catch (error) {
      if (transaction) await transaction.rollback();
      logger.error(`Crypto Payment Error: ${error.message}`);
      throw error;
    }
  },

  // 2. Process Card Payment (Stripe/PayPal Integration Point)
  processCardPayment: async (userId, amount, currency, paymentMethodId) => {
    const transaction = await sequelize.transaction();
    try {
      // In production: const charge = await stripe.charges.create({...})
      const mockSuccess = true; 

      if (!mockSuccess) throw new Error('Payment gateway declined the card');

      const wallet = await Wallet.findOne({
        where: { user_id: userId, currency: currency.toUpperCase(), wallet_type: 'spot' },
        transaction
      });

      const fee = amount * 0.035; // 3.5% Gateway Fee
      const netAmount = amount - fee;

      // Immediate Credit for Card Payments
      wallet.balance = parseFloat(wallet.balance) + netAmount;
      wallet.total_deposited = parseFloat(wallet.total_deposited) + amount;
      await wallet.save({ transaction });

      const paymentTx = await Transaction.create({
        user_id: userId,
        wallet_id: wallet.id,
        type: 'deposit',
        amount: amount,
        fee: fee,
        net_amount: netAmount,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: 'Visa/Mastercard Deposit',
        confirmed_at: new Date()
      }, { transaction });

      await transaction.commit();
      return { success: true, txId: paymentTx.id, amount: netAmount };
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  },

  // 3. Process Withdrawal (With Balance Check)
  processWithdrawal: async (userId, amount, currency, address) => {
    const transaction = await sequelize.transaction();
    try {
      const wallet = await Wallet.findOne({
        where: { user_id: userId, currency: currency.toUpperCase() },
        transaction
      });

      if (!wallet || parseFloat(wallet.balance) < amount) {
        throw new Error('Insufficient funds for withdrawal');
      }

      // Deduct immediately and move to 'pending'
      wallet.balance = parseFloat(wallet.balance) - amount;
      await wallet.save({ transaction });

      const withdrawalTx = await Transaction.create({
        user_id: userId,
        wallet_id: wallet.id,
        type: 'withdrawal',
        amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        to_address: address,
        description: 'External Wallet Withdrawal'
      }, { transaction });

      await transaction.commit();
      return { success: true, txId: withdrawalTx.id };
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  }
};

// Internal Monitoring Helper
async function monitorBlockchain(txId, hash, currency) {
  // Mocking the wait for 3 confirmations
  setTimeout(async () => {
    const transaction = await Transaction.findByPk(txId);
    if (transaction && transaction.status === 'pending') {
      await completeDeposit(transaction);
    }
  }, 30000); // 30s simulation
}

async function completeDeposit(tx) {
  const dbTx = await sequelize.transaction();
  try {
    const wallet = await Wallet.findByPk(tx.wallet_id, { transaction: dbTx });
    wallet.balance = parseFloat(wallet.balance) + parseFloat(tx.amount);
    await wallet.save({ transaction: dbTx });

    tx.status = 'completed';
    tx.confirmed_at = new Date();
    await tx.save({ transaction: dbTx });

    await dbTx.commit();
    logger.info(`✅ Deposit Confirmed: ${tx.id}`);
  } catch (err) {
    await dbTx.rollback();
    logger.error(`Confirmation Failed: ${err.message}`);
  }
}

module.exports = paymentService;