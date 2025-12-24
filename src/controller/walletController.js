const { sequelize } = require('../config/database');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const constants = require('../config/constants');
const logger = require('../utils/logger');
const { processCryptoTransfer } = require('../services/walletService');

const walletController = {
  // Get all wallets for user
  getUserWallets: async (req, res) => {
    try {
      const wallets = await Wallet.findAll({
        where: { user_id: req.user.id, is_active: true },
        attributes: ['id', 'currency', 'balance', 'locked_balance', 'total_deposited', 'total_withdrawn', 'wallet_address', 'wallet_type']
      });

      res.json({
        success: true,
        data: wallets
      });
    } catch (error) {
      logger.error(`Get wallets error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch wallets'
      });
    }
  },

  // Get single wallet by currency
  getWalletByCurrency: async (req, res) => {
    try {
      const { currency } = req.params;
      const wallet = await Wallet.findOne({
        where: { 
          user_id: req.user.id, 
          currency: currency.toUpperCase(),
          is_active: true 
        }
      });

      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }

      res.json({
        success: true,
        data: wallet
      });
    } catch (error) {
      logger.error(`Get wallet error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch wallet'
      });
    }
  },

  // Get wallet balance
  getBalance: async (req, res) => {
    try {
      const { currency } = req.query;
      
      let query = { user_id: req.user.id, is_active: true };
      if (currency) {
        query.currency = currency.toUpperCase();
      }

      const wallets = await Wallet.findAll({
        where: query,
        attributes: ['currency', 'balance', 'locked_balance', 'available_balance']
      });

      const totalBalance = wallets.reduce((sum, wallet) => sum + parseFloat(wallet.balance), 0);
      const totalLocked = wallets.reduce((sum, wallet) => sum + parseFloat(wallet.locked_balance), 0);
      const totalAvailable = wallets.reduce((sum, wallet) => sum + parseFloat(wallet.balance) - parseFloat(wallet.locked_balance), 0);

      res.json({
        success: true,
        data: {
          wallets,
          summary: {
            total_balance: totalBalance,
            total_locked: totalLocked,
            total_available: totalAvailable,
            wallet_count: wallets.length
          }
        }
      });
    } catch (error) {
      logger.error(`Get balance error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch balance'
      });
    }
  },

  // Generate deposit address
  generateDepositAddress: async (req, res) => {
    try {
      const { currency } = req.body;
      
      // Check if currency is supported
      const supportedCurrency = constants.CRYPTOCURRENCIES.find(c => c.symbol === currency.toUpperCase());
      if (!supportedCurrency) {
        return res.status(400).json({
          success: false,
          message: 'Currency not supported'
        });
      }

      let wallet = await Wallet.findOne({
        where: { 
          user_id: req.user.id, 
          currency: currency.toUpperCase(),
          wallet_type: 'spot'
        }
      });

      if (!wallet) {
        // Create new wallet if doesn't exist
        wallet = await Wallet.create({
          user_id: req.user.id,
          currency: currency.toUpperCase(),
          wallet_type: 'spot',
          wallet_address: `deposit_${req.user.id}_${currency}_${Date.now()}`,
          is_active: true
        });
      }

      // In production, generate actual blockchain address
      // const address = await generateBlockchainAddress(currency, req.user.id);
      
      res.json({
        success: true,
        data: {
          currency: wallet.currency,
          wallet_address: wallet.wallet_address,
          memo: `Deposit for user ${req.user.id}`,
          min_deposit: constants.SETTINGS.MIN_DEPOSIT,
          deposit_fee: constants.SETTINGS.DEPOSIT_FEE_PERCENTAGE
        }
      });
    } catch (error) {
      logger.error(`Generate deposit address error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to generate deposit address'
      });
    }
  },

  // Transfer between users
  transfer: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { amount, currency, recipient_email, description } = req.body;

      // Validate minimum amount
      if (amount < 0.1) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Minimum transfer amount is 0.1'
        });
      }

      // Check sender wallet
      const senderWallet = await Wallet.findOne({
        where: { 
          user_id: req.user.id, 
          currency: currency.toUpperCase(),
          wallet_type: 'spot'
        },
        transaction
      });

      if (!senderWallet) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Sender wallet not found'
        });
      }

      // Check sufficient balance (including fee)
      const fee = amount * 0.01; // 1% transfer fee
      const totalAmount = amount + fee;
      
      if (parseFloat(senderWallet.balance) < totalAmount) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      // Find recipient
      const recipient = await User.findOne({
        where: { email: recipient_email },
        transaction
      });

      if (!recipient) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Recipient not found'
        });
      }

      // Get or create recipient wallet
      let recipientWallet = await Wallet.findOne({
        where: { 
          user_id: recipient.id, 
          currency: currency.toUpperCase(),
          wallet_type: 'spot'
        },
        transaction
      });

      if (!recipientWallet) {
        recipientWallet = await Wallet.create({
          user_id: recipient.id,
          currency: currency.toUpperCase(),
          wallet_type: 'spot',
          balance: 0,
          wallet_address: `transfer_${recipient.id}_${currency}_${Date.now()}`,
          is_active: true
        }, { transaction });
      }

      // Update balances
      senderWallet.balance = parseFloat(senderWallet.balance) - totalAmount;
      await senderWallet.save({ transaction });

      recipientWallet.balance = parseFloat(recipientWallet.balance) + amount;
      await recipientWallet.save({ transaction });

      // Create transactions
      const senderTransaction = await Transaction.create({
        user_id: req.user.id,
        type: 'transfer_out',
        amount: amount,
        fee: fee,
        net_amount: -totalAmount,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: description || `Transfer to ${recipient_email}`,
        metadata: {
          recipient_email,
          recipient_id: recipient.id,
          transfer_type: 'internal'
        }
      }, { transaction });

      const recipientTransaction = await Transaction.create({
        user_id: recipient.id,
        type: 'transfer_in',
        amount: amount,
        fee: 0,
        net_amount: amount,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: description || `Transfer from ${req.user.email}`,
        metadata: {
          sender_email: req.user.email,
          sender_id: req.user.id,
          transfer_type: 'internal'
        }
      }, { transaction });

      await transaction.commit();

      // Send notification (implement notification service)

      res.json({
        success: true,
        message: 'Transfer completed successfully',
        data: {
          transaction_id: senderTransaction.id,
          amount,
          fee,
          total_deducted: totalAmount,
          recipient: recipient_email,
          timestamp: new Date()
        }
      });

      logger.info(`Transfer completed: ${req.user.email} -> ${recipient_email}, Amount: ${amount} ${currency}`);
    } catch (error) {
      await transaction.rollback();
      logger.error(`Transfer error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Transfer failed'
      });
    }
  },

  // Withdraw crypto
  withdraw: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { amount, currency, wallet_address, network } = req.body;

      // Validate minimum withdrawal
      if (amount < constants.SETTINGS.MIN_WITHDRAWAL) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Minimum withdrawal amount is ${constants.SETTINGS.MIN_WITHDRAWAL}`
        });
      }

      // Check daily withdrawal limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysWithdrawals = await Transaction.sum('amount', {
        where: {
          user_id: req.user.id,
          type: 'withdrawal',
          status: 'completed',
          currency: currency.toUpperCase(),
          created_at: { [sequelize.Op.gte]: today }
        },
        transaction
      });

      const totalToday = todaysWithdrawals || 0;
      if (totalToday + amount > constants.SETTINGS.DAILY_WITHDRAWAL_LIMIT) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Daily withdrawal limit exceeded. Maximum: ${constants.SETTINGS.DAILY_WITHDRAWAL_LIMIT}`
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

      const fee = amount * (constants.SETTINGS.WITHDRAWAL_FEE_PERCENTAGE / 100);
      const totalAmount = amount + fee;

      if (parseFloat(wallet.balance) < totalAmount) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      // Update wallet balance
      wallet.balance = parseFloat(wallet.balance) - totalAmount;
      wallet.total_withdrawn = parseFloat(wallet.total_withdrawn) + amount;
      await wallet.save({ transaction });

      // Create withdrawal transaction
      const withdrawalTransaction = await Transaction.create({
        user_id: req.user.id,
        type: 'withdrawal',
        amount: amount,
        fee: fee,
        net_amount: -totalAmount,
        currency: currency.toUpperCase(),
        status: 'pending',
        to_address: wallet_address,
        description: `Withdrawal to external wallet (${network})`,
        metadata: {
          network,
          wallet_address,
          withdrawal_type: 'external'
        }
      }, { transaction });

      // Process blockchain withdrawal (in background)
      processCryptoTransfer(withdrawalTransaction.id, wallet_address, amount, currency, network);

      await transaction.commit();

      res.json({
        success: true,
        message: 'Withdrawal request submitted',
        data: {
          transaction_id: withdrawalTransaction.id,
          amount,
          fee,
          total_deducted: totalAmount,
          wallet_address,
          network,
          status: 'pending',
          estimated_time: '10-30 minutes'
        }
      });

      logger.info(`Withdrawal requested: ${req.user.email}, Amount: ${amount} ${currency}`);
    } catch (error) {
      await transaction.rollback();
      logger.error(`Withdrawal error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Withdrawal failed'
      });
    }
  },

  // Get transaction history
  getTransactionHistory: async (req, res) => {
    try {
      const { type, currency, status, startDate, endDate, page = 1, limit = 20 } = req.query;
      
      const where = { user_id: req.user.id };
      const offset = (page - 1) * limit;

      if (type) where.type = type;
      if (currency) where.currency = currency.toUpperCase();
      if (status) where.status = status;
      
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
        attributes: ['id', 'type', 'amount', 'fee', 'net_amount', 'currency', 'status', 'description', 'created_at', 'confirmed_at', 'metadata']
      });

      res.json({
        success: true,
        data: {
          transactions: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error(`Get transaction history error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction history'
      });
    }
  },

  // Get transaction by ID
  getTransactionById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const transaction = await Transaction.findOne({
        where: { id, user_id: req.user.id },
        attributes: ['id', 'type', 'amount', 'fee', 'net_amount', 'currency', 'status', 'from_address', 'to_address', 'tx_hash', 'description', 'created_at', 'confirmed_at', 'metadata']
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      logger.error(`Get transaction by ID error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction'
      });
    }
  }
};

module.exports = walletController;