const { Investment, User, Wallet, Transaction, Plan } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

const processDailyPayouts = async () => {
  const transaction = await sequelize.transaction();
  const summary = { processed: 0, skipped: 0, totalPaid: 0 };

  try {
    // 1. Fetch only ACTIVE investments with their Plan details
    const activeInvestments = await Investment.findAll({
      where: { status: 'active' },
      include: [{ model: Plan, as: 'plan' }],
      transaction
    });

    const now = new Date();

    for (const investment of activeInvestments) {
      const plan = investment.plan;
      const lastPayout = investment.last_payout_date || investment.start_date;
      
      // Calculate days since last payout
      const diffTime = Math.abs(now - new Date(lastPayout));
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // 2. Frequency Logic Filter
      let shouldPay = false;
      if (plan.payout_frequency === 'daily' && diffDays >= 1) shouldPay = true;
      if (plan.payout_frequency === 'weekly' && diffDays >= 7) shouldPay = true;
      if (plan.payout_frequency === 'monthly' && diffDays >= 30) shouldPay = true;

      if (shouldPay) {
        // Calculate earnings: (Amount * Interest Rate %)
        const earnings = parseFloat(investment.amount) * (parseFloat(plan.interest_rate) / 100);

        // 3. Update User Wallet (Atomic increment)
        await Wallet.increment('balance', {
          by: earnings,
          where: { user_id: investment.user_id, currency: investment.currency },
          transaction
        });

        // 4. Record Transaction History
        await Transaction.create({
          user_id: investment.user_id,
          amount: earnings,
          type: 'investment_earning',
          status: 'completed',
          description: `Payout for ${plan.name}`,
          metadata: { investment_id: investment.id }
        }, { transaction });

        // 5. Update Investment Record
        investment.total_earned = parseFloat(investment.total_earned) + earnings;
        investment.last_payout_date = now;
        await investment.save({ transaction });

        summary.processed++;
        summary.totalPaid += earnings;
      } else {
        summary.skipped++;
      }
    }

    await transaction.commit();
    logger.info(`Payout Task: Paid ${summary.processed}, Skipped ${summary.skipped}, Total: ${summary.totalPaid}`);
    return summary;
  } catch (error) {
    await transaction.rollback();
    logger.error('CRITICAL: Payout processing failed', error);
    throw error;
  }
};

module.exports = { processDailyPayouts };