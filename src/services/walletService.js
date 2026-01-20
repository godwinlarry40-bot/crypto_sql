const axios = require('axios');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const { Transaction, Wallet } = require('../models');
const logger = require('../utils/logger');

const walletService = {
  // 1. Validate External Wallet Addresses (Regex based)
  validateWalletAddress: async (address, currency) => {
    const patterns = {
      BTC: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$/, // Assuming ERC-20
      BNB: /^(bnb1|[b])[a-zA-HJ-NP-Z0-9]{25,39}$/,
      TRX: /^T[A-Za-z1-9]{33}$/
    };

    const isValid = patterns[currency.toUpperCase()]?.test(address);
    return {
      valid: !!isValid,
      message: isValid ? 'Valid address' : `Invalid ${currency} address format`
    };
  },

  // 2. Generate Native Platform Wallet (HD Wallet Mock)
  generateNewWallet: async (currency) => {
    try {
      // In production: Use libraries like 'bitcoinjs-lib' or 'ethers'
      const address = currency.toUpperCase() === 'BTC' 
        ? `bc1${crypto.randomBytes(16).toString('hex')}` 
        : `0x${crypto.randomBytes(20).toString('hex')}`;
      
      const privateKey = crypto.randomBytes(32).toString('hex');
      
      // We NEVER store raw private keys. Encrypt before returning.
      const encryptedKey = CryptoJS.AES.encrypt(
        privateKey, 
        process.env.WALLET_ENCRYPTION_KEY || 'st-crypto-2025'
      ).toString();

      return {
        address,
        privateKey: encryptedKey,
        currency: currency.toUpperCase()
      };
    } catch (error) {
      logger.error(`Wallet Generation Error: ${error.message}`);
      throw error;
    }
  },

  // 3. Get Estimated Blockchain Network Fees
  getFeeEstimate: async (currency) => {
    // In production: Fetch from BlockCypher or EthGasStation APIs
    const mockFees = {
      BTC: { slow: 0.0001, medium: 0.00025, fast: 0.0005 },
      ETH: { slow: 0.001, medium: 0.002, fast: 0.004 },
      USDT: { fixed: 1.00 } // Typical TRC-20 or exchange fee
    };

    return mockFees[currency.toUpperCase()] || { medium: 0.001 };
  },

  // 4. Handle Incoming Blockchain Webhooks (e.g., from Tatum, BitGo, or Alchemy)
  processBlockchainWebhook: async (payload) => {
    try {
      const { txHash, address, amount, currency, confirmations } = payload;
      
      // Only process if enough confirmations are reached (usually 3-6)
      if (confirmations < 3) return { status: 'waiting_more_confirmations' };

      const wallet = await Wallet.findOne({ where: { wallet_address: address } });
      if (!wallet) return { status: 'ignored', message: 'Address not owned by platform' };

      // Check if already processed
      const existingTx = await Transaction.findOne({ where: { tx_hash: txHash } });
      if (existingTx && existingTx.status === 'completed') return { status: 'already_processed' };

      // Logic here would call paymentService.completeDepositTransaction
      return { status: 'success', userId: wallet.user_id };
    } catch (error) {
      logger.error(`Webhook Processing Error: ${error.message}`);
      throw error;
    }
  }
};

module.exports = walletService;