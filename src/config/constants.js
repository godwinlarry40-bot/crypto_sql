'use strict';
const Plan = require('../models/Plan');
const logger = require('../utils/logger');

const SETTINGS = {
  MIN_WITHDRAWAL: 10,           
  MIN_INVESTMENT_AMOUNT: 50,    
  WITHDRAWAL_FEE_PERCENT: 1.5,
  MAX_WITHDRAWAL_DAILY: 5000,
  SUPPORTED_NETWORKS: ['ERC20', 'TRC20', 'BEP20', 'BTC', 'SOLANA']
};

const DEFAULT_PLANS = [
  {
    id: 1, // Explicitly mapped for Plan ID 1
    name: 'Starter (1 Month)',
    duration_days: 30, 
    interest_rate: 5, 
    min_amount: 100,
    max_amount: 4999,
    payout_frequency: 'maturity', 
    is_active: true
  },
  {
    id: 2,
    name: 'Professional (6 Months)',
    duration_days: 180, 
    interest_rate: 10, 
    min_amount: 5000,
    max_amount: 19999,
    payout_frequency: 'maturity', 
    is_active: true
  },
  {
    id: 3,
    name: 'Enterprise (12 Months)',
    duration_days: 365, 
    interest_rate: 15, 
    min_amount: 20000,
    max_amount: 1000000,
    payout_frequency: 'maturity', 
    is_active: true
  }
];

const syncPlans = async () => {
    try {
        // START: Changed bulkCreate to upsert to ensure IDs 1, 2, 3 are strictly maintained
        for (const planData of DEFAULT_PLANS) {
            await Plan.upsert({
                ...planData,
                description: `${planData.interest_rate}% return over ${planData.duration_days} days`
            });
        }
        // END: Upsert logic
        return { success: true, message: 'Plans synced successfully' };
    } catch (error) {
        logger.error(`Constant Seed Error: ${error.message}`);
        throw error;
    }
};

module.exports = {
  SETTINGS,
  DEFAULT_PLANS,
  syncPlans,
  TRANSACTION_TYPES: Object.freeze({ DEPOSIT: 'deposit', WITHDRAWAL: 'withdrawal', INVESTMENT: 'investment' }),
  TRANSACTION_STATUS: Object.freeze({ PENDING: 'pending', COMPLETED: 'completed' }),
  INVESTMENT_STATUS: Object.freeze({ ACTIVE: 'active', COMPLETED: 'completed' })
};