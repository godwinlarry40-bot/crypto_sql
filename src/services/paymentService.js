const axios = require('axios');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

const paymentService = {
  // Process crypto payment
  processCryptoPayment: async (userId, amount, currency, paymentData) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { txHash, fromAddress, network } = paymentData;

      // Check if transaction already exists
      const existingTx = await Transaction.findOne({
        where: { tx_hash: txHash },
        transaction
      });

      if (existingTx) {
        await transaction.rollback();
        throw new Error('Transaction already processed');
      }

      // Get user wallet
      const wallet = await Wallet.findOne({
        where: {
          user_id: userId,
          currency: currency.toUpperCase(),
          wallet_type: 'spot'
        },
        transaction
      });

      if (!wallet) {
        await transaction.rollback();
        throw new Error('Wallet not found');
      }

      // Create pending transaction
      const paymentTx = await Transaction.create({
        user_id: userId,
        type: 'deposit',
        amount: amount,
        currency: currency.toUpperCase(),
        fee: 0,
        net_amount: amount,
        status: 'pending',
        from_address: fromAddress,
        to_address: wallet.wallet_address,
        tx_hash: txHash,
        description: `Crypto deposit (${network})`,
        metadata: {
          network,
          confirmation_blocks: 3,
          current_confirmations: 0
        }
      }, { transaction });

      await transaction.commit();

      // Start monitoring transaction
      monitorTransactionConfirmation(paymentTx.id, txHash, currency, network);

      return {
        success: true,
        transactionId: paymentTx.id,
        status: 'pending',
        message: 'Payment received, waiting for confirmations'
      };
    } catch (error) {
      await transaction.rollback();
      logger.error(`Process crypto payment error: ${error.message}`);
      throw error;
    }
  },

  // Process bank transfer
  processBankTransfer: async (userId, amount, currency, bankDetails) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { bankName, accountNumber, reference } = bankDetails;

      // Create pending transaction
      const paymentTx = await Transaction.create({
        user_id: userId,
        type: 'deposit',
        amount: amount,
        currency: currency.toUpperCase(),
        fee: amount * 0.02, // 2% bank fee
        net_amount: amount * 0.98,
        status: 'pending',
        description: `Bank transfer - ${bankName}`,
        metadata: {
          bank_name: bankName,
          account_number: accountNumber,
          reference: reference,
          payment_method: 'bank_transfer'
        }
      }, { transaction });

      await transaction.commit();

      // Notify admin about pending bank transfer
      await notifyAdminBankTransfer(paymentTx.id, userId, amount, currency, bankDetails);

      return {
        success: true,
        transactionId: paymentTx.id,
        status: 'pending',
        message: 'Bank transfer initiated, awaiting confirmation'
      };
    } catch (error) {
      await transaction.rollback();
      logger.error(`Process bank transfer error: ${error.message}`);
      throw error;
    }
  },

  // Process card payment
  processCardPayment: async (userId, amount, currency, cardDetails) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { token, cardType } = cardDetails;

      // In production, integrate with payment gateway (Stripe, PayPal, etc.)
      // This is a mock implementation
      
      // Simulate payment gateway response
      const paymentResult = await simulatePaymentGateway(token, amount, currency);
      
      if (!paymentResult.success) {
        await transaction.rollback();
        throw new Error(`Payment failed: ${paymentResult.message}`);
      }

      // Get user wallet
      const wallet = await Wallet.findOne({
        where: {
          user_id: userId,
          currency: currency.toUpperCase(),
          wallet_type: 'spot'
        },
        transaction
      });

      if (!wallet) {
        await transaction.rollback();
        throw new Error('Wallet not found');
      }

      // Calculate fees
      const fee = amount * 0.035; // 3.5% card fee
      const netAmount = amount - fee;

      // Update wallet
      wallet.balance = parseFloat(wallet.balance) + netAmount;
      wallet.total_deposited = parseFloat(wallet.total_deposited) + amount;
      await wallet.save({ transaction });

      // Create transaction
      const paymentTx = await Transaction.create({
        user_id: userId,
        type: 'deposit',
        amount: amount,
        fee: fee,
        net_amount: netAmount,
        currency: currency.toUpperCase(),
        status: 'completed',
        description: `Card payment (${cardType})`,
        metadata: {
          payment_gateway: 'stripe',
          card_type: cardType,
          last4: token.slice(-4),
          gateway_reference: paymentResult.reference
        },
        confirmed_at: new Date()
      }, { transaction });

      await transaction.commit();

      // Send confirmation email
      const user = await User.findByPk(userId);
      if (user && user.email) {
        await emailService.sendEmail(
          user.email,
          'Payment Successful',
          `Your card payment of ${amount} ${currency} was successful.`,
          `<p>Payment of <strong>${amount} ${currency}</strong> was successful.</p>
           <p>Transaction ID: ${paymentTx.id}</p>
           <p>Fee: ${fee} ${currency}</p>
           <p>Net amount added to your wallet: ${netAmount} ${currency}</p>`
        );
      }

      return {
        success: true,
        transactionId: paymentTx.id,
        status: 'completed',
        amount: netAmount,
        fee: fee
      };
    } catch (error) {
      await transaction.rollback();
      logger.error(`Process card payment error: ${error.message}`);
      throw error;
    }
  },

  // Process withdrawal
  processWithdrawal: async (transactionId, adminApproval = false) => {
    const transaction = await sequelize.transaction();
    
    try {
      const withdrawalTx = await Transaction.findByPk(transactionId, {
        include: [{ model: User, as: 'user' }],
        transaction
      });

      if (!withdrawalTx || withdrawalTx.type !== 'withdrawal') {
        await transaction.rollback();
        throw new Error('Withdrawal transaction not found');
      }

      if (withdrawalTx.status !== 'pending') {
        await transaction.rollback();
        throw new Error('Transaction already processed');
      }

      // If admin approval required and not approved yet
      if (adminApproval && !withdrawalTx.metadata?.admin_approved) {
        withdrawalTx.status = 'processing';
        withdrawalTx.metadata = {
          ...withdrawalTx.metadata,
          admin_approved: true,
          approved_at: new Date(),
          approved_by: 'admin' // In production, use actual admin ID
        };
        
        await withdrawalTx.save({ transaction });
        await transaction.commit();

        // Start blockchain withdrawal process
        initiateBlockchainWithdrawal(withdrawalTx);

        return {
          success: true,
          status: 'processing',
          message: 'Withdrawal approved, processing on blockchain'
        };
      }

      // Auto-approve if no admin approval needed
      withdrawalTx.status = 'processing';
      await withdrawalTx.save({ transaction });
      await transaction.commit();

      // Start blockchain withdrawal process
      initiateBlockchainWithdrawal(withdrawalTx);

      return {
        success: true,
        status: 'processing',
        message: 'Withdrawal processing started'
      };
    } catch (error) {
      await transaction.rollback();
      logger.error(`Process withdrawal error: ${error.message}`);
      throw error;
    }
  },

  // Get payment methods
  getPaymentMethods: async (currency) => {
    try {
      const methods = {
        crypto: {
          name: 'Cryptocurrency',
          currencies: ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'],
          fees: 'Network fee only',
          processing_time: '10-30 minutes',
          min_amount: 10,
          max_amount: 100000
        },
        bank_transfer: {
          name: 'Bank Transfer',
          currencies: ['USD', 'EUR', 'GBP'],
          fees: '2%',
          processing_time: '1-3 business days',
          min_amount: 50,
          max_amount: 50000
        },
        card: {
          name: 'Credit/Debit Card',
          currencies: ['USD', 'EUR', 'GBP'],
          fees: '3.5%',
          processing_time: 'Instant',
          min_amount: 10,
          max_amount: 10000
        }
      };

      // Filter methods by currency if specified
      if (currency) {
        const filteredMethods = {};
        Object.entries(methods).forEach(([key, method]) => {
          if (method.currencies.includes(currency.toUpperCase())) {
            filteredMethods[key] = method;
          }
        });
        return filteredMethods;
      }

      return methods;
    } catch (error) {
      logger.error(`Get payment methods error: ${error.message}`);
      throw error;
    }
  },

  // Get transaction status
  getTransactionStatus: async (transactionId) => {
    try {
      const transaction = await Transaction.findByPk(transactionId, {
        include: [{ model: User, as: 'user', attributes: ['email', 'first_name'] }]
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // If it's a blockchain transaction, check confirmations
      if (transaction.tx_hash) {
        const confirmations = await checkBlockchainConfirmations(
          transaction.tx_hash,
          transaction.currency
        );

        transaction.metadata = {
          ...transaction.metadata,
          current_confirmations: confirmations.current,
          required_confirmations: confirmations.required,
          block_height: confirmations.blockHeight
        };

        // Update status if enough confirmations
        if (confirmations.current >= confirmations.required && transaction.status === 'pending') {
          await completeDepositTransaction(transaction);
        }

        await transaction.save();
      }

      return {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        created_at: transaction.created_at,
        confirmed_at: transaction.confirmed_at,
        metadata: transaction.metadata,
        user: transaction.user
      };
    } catch (error) {
      logger.error(`Get transaction status error: ${error.message}`);
      throw error;
    }
  },

  // Calculate fees for payment method
  calculateFees: async (amount, currency, paymentMethod) => {
    try {
      const feeRates = {
        crypto: 0.001, // 0.1%
        bank_transfer: 0.02, // 2%
        card: 0.035, // 3.5%
        instant: 0.05 // 5%
      };

      const feeRate = feeRates[paymentMethod] || 0.02;
      const fee = amount * feeRate;
      const netAmount = amount - fee;

      return {
        amount,
        currency,
        payment_method: paymentMethod,
        fee_rate: feeRate * 100,
        fee,
        net_amount: netAmount,
        total: amount
      };
    } catch (error) {
      logger.error(`Calculate fees error: ${error.message}`);
      throw error;
    }
  }
};

// Helper functions
async function monitorTransactionConfirmation(transactionId, txHash, currency, network) {
  try {
    // In production, this would use blockchain webhooks or polling
    // This is a mock implementation
    
    setTimeout(async () => {
      try {
        const transaction = await Transaction.findByPk(transactionId);
        if (!transaction || transaction.status !== 'pending') return;

        // Simulate blockchain confirmation
        const confirmations = {
          current: 3,
          required: 3,
          blockHeight: Math.floor(Math.random() * 1000000)
        };

        transaction.metadata = {
          ...transaction.metadata,
          current_confirmations: confirmations.current,
          required_confirmations: confirmations.required,
          block_height: confirmations.blockHeight,
          confirmed_at: new Date()
        };

        if (confirmations.current >= confirmations.required) {
          await completeDepositTransaction(transaction);
        }

        await transaction.save();
      } catch (error) {
        logger.error(`Monitor transaction error: ${error.message}`);
      }
    }, 60000); // 1 minute for simulation
  } catch (error) {
    logger.error(`Monitor transaction confirmation error: ${error.message}`);
  }
}

async function completeDepositTransaction(transaction) {
  const dbTransaction = await sequelize.transaction();
  
  try {
    transaction.status = 'completed';
    transaction.confirmed_at = new Date();
    await transaction.save({ transaction: dbTransaction });

    // Update wallet balance
    const wallet = await Wallet.findOne({
      where: {
        user_id: transaction.user_id,
        currency: transaction.currency,
        wallet_type: 'spot'
      },
      transaction: dbTransaction
    });

    if (wallet) {
      wallet.balance = parseFloat(wallet.balance) + parseFloat(transaction.net_amount);
      wallet.total_deposited = parseFloat(wallet.total_deposited) + parseFloat(transaction.amount);
      await wallet.save({ transaction: dbTransaction });
    }

    await dbTransaction.commit();

    // Send confirmation email
    const user = await User.findByPk(transaction.user_id);
    if (user && user.email) {
      await emailService.sendEmail(
        user.email,
        'Deposit Confirmed',
        `Your deposit of ${transaction.amount} ${transaction.currency} has been confirmed.`,
        `<p>Deposit confirmed!</p>
         <p>Amount: <strong>${transaction.amount} ${transaction.currency}</strong></p>
         <p>Transaction ID: ${transaction.id}</p>
         <p>Added to your wallet: ${transaction.net_amount} ${transaction.currency}</p>`
      );
    }

    logger.info(`Deposit completed: ${transaction.id}, User: ${transaction.user_id}`);
  } catch (error) {
    await dbTransaction.rollback();
    logger.error(`Complete deposit transaction error: ${error.message}`);
    throw error;
  }
}

async function notifyAdminBankTransfer(transactionId, userId, amount, currency, bankDetails) {
  try {
    const user = await User.findByPk(userId);
    if (!user) return;

    await emailService.sendEmail(
      process.env.ADMIN_EMAIL || 'admin@cryptoinvest.com',
      `Bank Transfer Pending - ${transactionId}`,
      `A new bank transfer requires approval.\n\nUser: ${user.email}\nAmount: ${amount} ${currency}\nBank: ${bankDetails.bankName}\nReference: ${bankDetails.reference}`,
      `<h3>Bank Transfer Pending Approval</h3>
       <p><strong>Transaction ID:</strong> ${transactionId}</p>
       <p><strong>User:</strong> ${user.email} (${user.first_name} ${user.last_name})</p>
       <p><strong>Amount:</strong> ${amount} ${currency}</p>
       <p><strong>Bank:</strong> ${bankDetails.bankName}</p>
       <p><strong>Account:</strong> ${bankDetails.accountNumber}</p>
       <p><strong>Reference:</strong> ${bankDetails.reference}</p>
       <p>Please review and approve this transaction in the admin panel.</p>`
    );
  } catch (error) {
    logger.error(`Notify admin bank transfer error: ${error.message}`);
  }
}

async function simulatePaymentGateway(token, amount, currency) {
  // Mock payment gateway response
  // In production, integrate with actual payment gateway
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate random failures (5% failure rate)
      if (Math.random() < 0.05) {
        resolve({
          success: false,
          message: 'Payment declined by bank',
          code: 'DECLINED'
        });
      } else {
        resolve({
          success: true,
          message: 'Payment successful',
          reference: `pay_${crypto.randomBytes(8).toString('hex')}`,
          amount: amount,
          currency: currency
        });
      }
    }, 2000); // 2 second delay
  });
}

async function initiateBlockchainWithdrawal(withdrawalTx) {
  try {
    // In production, this would initiate actual blockchain transaction
    // This is a mock implementation
    
    setTimeout(async () => {
      try {
        const transaction = await Transaction.findByPk(withdrawalTx.id);
        if (!transaction || transaction.status !== 'processing') return;

        // Simulate blockchain transaction
        const txHash = `0x${crypto.randomBytes(32).toString('hex')}`;
        
        transaction.status = 'completed';
        transaction.tx_hash = txHash;
        transaction.confirmed_at = new Date();
        
        await transaction.save();

        // Send confirmation email
        const user = await User.findByPk(transaction.user_id);
        if (user && user.email) {
          await emailService.sendEmail(
            user.email,
            'Withdrawal Completed',
            `Your withdrawal of ${transaction.amount} ${transaction.currency} has been processed.`,
            `<p>Withdrawal completed!</p>
             <p>Amount: <strong>${transaction.amount} ${transaction.currency}</strong></p>
             <p>Transaction ID: ${transaction.id}</p>
             <p>Transaction Hash: ${txHash}</p>
             <p>Sent to: ${transaction.to_address}</p>`
          );
        }

        logger.info(`Withdrawal completed: ${transaction.id}, User: ${transaction.user_id}`);
      } catch (error) {
        logger.error(`Complete withdrawal error: ${error.message}`);
      }
    }, 30000); // 30 second delay for simulation
  } catch (error) {
    logger.error(`Initiate blockchain withdrawal error: ${error.message}`);
  }
}

async function checkBlockchainConfirmations(txHash, currency) {
  // Mock blockchain confirmation check
  // In production, query blockchain explorer API
  
  return {
    current: Math.floor(Math.random() * 10) + 1,
    required: 3,
    blockHeight: Math.floor(Math.random() * 1000000)
  };
}

module.exports = paymentService;