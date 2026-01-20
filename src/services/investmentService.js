const { sequelize, Investment, Wallet, Transaction, User, Plan } = require('../models');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/emailService');
const { Op } = require('sequelize');

const investmentService = {
  // 1. Process daily investment payouts
  processDailyPayouts: async () => {
    const transaction = await sequelize.transaction();
    
    try {
      logger.info('🚀 Starting daily investment payout cycle...');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const investments = await Investment.findAll({
        where: {
          status: 'active',
          next_payout_date: { [Op.lt]: tomorrow }
        },
        include: [{ model: Plan, as: 'plan' }],
        transaction
      });
      
      logger.info(`Found ${investments.length} investments due for payout.`);
      
      let totalPaid = 0;
      
      for (const inv of investments) {
        // Calculate: (Amount * (APR/100)) / 365 
        const annualRate = parseFloat(inv.interest_rate) / 100;
        const dailyEarnings = (parseFloat(inv.amount) * annualRate) / 365;
        
        // Update Investment record
        inv.earned_amount = parseFloat(inv.earned_amount) + dailyEarnings;
        inv.last_payout_date = new Date();
        inv.next_payout_date = calculateNextPayout(new Date(), inv.plan.payout_frequency);
        
        await inv.save({ transaction });

        // Update Wallet (Using the unified Wallet model from previous steps)
        const wallet = await Wallet.findOne({
          where: { user_id: inv.user_id, currency: inv.currency },
          transaction
        });

        if (wallet) {
          wallet.balance = parseFloat(wallet.balance) + dailyEarnings;
          await wallet.save({ transaction });
        }

        // Create Ledger Entry
        await Transaction.create({
          user_id: inv.user_id,
          wallet_id: wallet?.id,
          type: 'investment_earning',
          amount: dailyEarnings,
          currency: inv.currency,
          status: 'completed',
          description: `Daily ROI: ${inv.plan.name}`,
          metadata: { investment_id: inv.id }
        }, { transaction });

        // Maturity Check
        if (new Date() >= new Date(inv.end_date)) {
          await investmentService.processInvestmentMaturity(inv, transaction);
        }

        totalPaid += dailyEarnings;
      }
      
      await transaction.commit();
      return { success: true, processed: investments.length, totalPaid };
      
    } catch (error) {
      await transaction.rollback();
      logger.error(`Payout Error: ${error.message}`);
      throw error;
    }
  },

  // 2. Handle Investment Maturity
  processInvestmentMaturity: async (inv, transaction) => {
    logger.info(`🎓 Investment Matured: ${inv.id}`);
    
    inv.status = 'matured';
    await inv.save({ transaction });

    const wallet = await Wallet.findOne({
      where: { user_id: inv.user_id, currency: inv.currency },
      transaction
    });

    if (wallet) {
      // Release the principal from locked back to total balance
      wallet.locked_balance = parseFloat(wallet.locked_balance) - parseFloat(inv.amount);
      await wallet.save({ transaction });
    }

    if (inv.auto_renew) {
      await investmentService.autoRenew(inv, transaction);
    }
  },

  // 3. Auto-Renew Logic
  autoRenew: async (oldInv, transaction) => {
    const plan = await Plan.findByPk(oldInv.plan_id, { transaction });
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.duration_days);

    return await Investment.create({
      user_id: oldInv.user_id,
      plan_id: oldInv.plan_id,
      amount: oldInv.amount,
      currency: oldInv.currency,
      interest_rate: plan.interest_rate,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      next_payout_date: calculateNextPayout(startDate, plan.payout_frequency),
      auto_renew: true
    }, { transaction });
  }
};

// --- Helpers ---

function calculateNextPayout(currentDate, frequency) {
  const date = new Date(currentDate);
  if (frequency === 'daily') date.setDate(date.getDate() + 1);
  else if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  else if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
  return date;
}

module.exports = investmentService;