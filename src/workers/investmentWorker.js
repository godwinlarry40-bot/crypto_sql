// src/workers/investmentWorker.js
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Investment = require('../models/Investment');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

const processMaturedInvestments = async () => {
  const t = await sequelize.transaction();
  try {
    // 1. Find all active investments where end_date has passed
    // CHANGE: Added specific check for 'active' status and matured dates
    const maturedInvestments = await Investment.findAll({
      where: {
        status: 'active',
        end_date: { [Op.lte]: new Date() } // end_date is less than or equal to NOW
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (maturedInvestments.length === 0) {
      await t.rollback();
      return;
    }

    for (const inv of maturedInvestments) {
      // 2. Calculate Profit (Principal * Interest Rate / 100)
      const principal = Number(inv.amount);
      const interest = (principal * Number(inv.interest_rate)) / 100;
      const totalPayout = principal + interest;

      // 3. Update User Wallet
      const wallet = await Wallet.findOne({
        where: { user_id: inv.user_id, currency: inv.currency },
        transaction: t
      });

      // CHANGE: Move funds from locked_balance back to main balance + interest
      await wallet.update({
        locked_balance: literal(`locked_balance - ${principal}`),
        balance: literal(`balance + ${totalPayout}`)
      }, { transaction: t });

      // 4. Record the Interest Transaction
      await Transaction.create({
        user_id: inv.user_id,
        type: 'interest',
        amount: interest,
        currency: inv.currency,
        status: 'completed',
        description: `Profit payout for investment #${inv.id} (${inv.interest_rate}%)`
      }, { transaction: t });

      // 5. Close the investment
      inv.status = 'completed';
      await inv.save({ transaction: t });

      logger.info(`Processed maturity for Investment ID: ${inv.id}. User ${inv.user_id} received ${totalPayout}`);
    }

    await t.commit();
  } catch (error) {
    if (t) await t.rollback();
    logger.error(`Maturity Worker Error: ${error.message}`);
  }
};

module.exports = { processMaturedInvestments };