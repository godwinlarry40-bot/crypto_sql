const { sequelize } = require('../config/database');
const Investment = require('../models/Investment');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/emailService');

const investmentService = {
  // Process daily investment payouts
  processDailyPayouts: async () => {
    const transaction = await sequelize.transaction();
    
    try {
      logger.info('Starting daily investment payout processing...');
      
      // Get investments due for payout today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const investments = await Investment.findAll({
        where: {
          status: 'active',
          next_payout_date: {
            [sequelize.Op.gte]: today,
            [sequelize.Op.lt]: tomorrow
          }
        },
        include: [
          {
            model: require('../models/Plan'),
            as: 'plan',
            attributes: ['payout_frequency']
          }
        ],
        transaction
      });
      
      logger.info(`Found ${investments.length} investments for payout`);
      
      let processedCount = 0;
      let totalPayout = 0;
      
      for (const investment of investments) {
        try {
          // Calculate daily earnings
          const dailyRate = parseFloat(investment.interest_rate) / 365 / 100;
          const dailyEarnings = parseFloat(investment.amount) * dailyRate;
          
          // Update investment
          investment.earned_amount = parseFloat(investment.earned_amount) + dailyEarnings;
          investment.last_payout_date = new Date();
          
          // Set next payout date based on frequency
          const nextDate = new Date();
          switch (investment.plan.payout_frequency) {
            case 'daily':
              nextDate.setDate(nextDate.getDate() + 1);
              break;
            case 'weekly':
              nextDate.setDate(nextDate.getDate() + 7);
              break;
            case 'monthly':
              nextDate.setMonth(nextDate.getMonth() + 1);
              break;
            default:
              nextDate.setDate(nextDate.getDate() + 1);
          }
          investment.next_payout_date = nextDate;
          
          await investment.save({ transaction });
          
          // Get or create earnings wallet
          let earningsWallet = await Wallet.findOne({
            where: {
              user_id: investment.user_id,
              currency: investment.currency,
              wallet_type: 'earnings'
            },
            transaction
          });
          
          if (!earningsWallet) {
            earningsWallet = await Wallet.create({
              user_id: investment.user_id,
              currency: investment.currency,
              wallet_type: 'earnings',
              balance: 0,
              is_active: true
            }, { transaction });
          }
          
          // Update earnings wallet
          earningsWallet.balance = parseFloat(earningsWallet.balance) + dailyEarnings;
          await earningsWallet.save({ transaction });
          
          // Create earnings transaction
          await Transaction.create({
            user_id: investment.user_id,
            type: 'earnings',
            amount: dailyEarnings,
            currency: investment.currency,
            status: 'completed',
            description: `Daily earnings from investment ${investment.id}`,
            metadata: {
              investment_id: investment.id,
              plan_id: investment.plan_id,
              payout_frequency: investment.plan.payout_frequency,
              daily_rate: dailyRate
            }
          }, { transaction });
          
          // Check if investment has matured
          if (new Date() >= new Date(investment.end_date)) {
            await processInvestmentMaturity(investment, transaction);
          }
          
          processedCount++;
          totalPayout += dailyEarnings;
          
        } catch (error) {
          logger.error(`Error processing investment ${investment.id}: ${error.message}`);
          // Continue with other investments
        }
      }
      
      await transaction.commit();
      
      logger.info(`Daily payouts processed: ${processedCount} investments, Total: ${totalPayout}`);
      
      return {
        success: true,
        processed: processedCount,
        totalPayout,
        timestamp: new Date()
      };
      
    } catch (error) {
      await transaction.rollback();
      logger.error(`Process daily payouts error: ${error.message}`);
      throw error;
    }
  },

  // Process investment maturity
  processInvestmentMaturity: async (investment, transaction) => {
    try {
      logger.info(`Processing maturity for investment ${investment.id}`);
      
      // Update investment status
      investment.status = 'matured';
      await investment.save({ transaction });
      
      // Get spot wallet
      const spotWallet = await Wallet.findOne({
        where: {
          user_id: investment.user_id,
          currency: investment.currency,
          wallet_type: 'spot'
        },
        transaction
      });
      
      if (spotWallet) {
        // Release locked balance
        spotWallet.locked_balance = parseFloat(spotWallet.locked_balance) - parseFloat(investment.amount);
        
        // Add earned amount to spot wallet if not auto-renew
        if (!investment.auto_renew) {
          spotWallet.balance = parseFloat(spotWallet.balance) + parseFloat(investment.earned_amount);
        }
        
        await spotWallet.save({ transaction });
      }
      
      // Create maturity transaction
      await Transaction.create({
        user_id: investment.user_id,
        type: investment.auto_renew ? 'investment_renew' : 'investment_matured',
        amount: investment.earned_amount,
        currency: investment.currency,
        status: 'completed',
        description: `Investment ${investment.id} has matured`,
        metadata: {
          investment_id: investment.id,
          principal: investment.amount,
          total_earned: investment.earned_amount,
          auto_renew: investment.auto_renew
        }
      }, { transaction });
      
      // Get user for notification
      const user = await User.findByPk(investment.user_id, { transaction });
      
      // Send notification
      if (user && user.email) {
        await sendEmail(
          user.email,
          'Investment Matured',
          `Your investment of ${investment.amount} ${investment.currency} has matured. Total earnings: ${investment.earned_amount} ${investment.currency}`,
          'investment-matured',
          {
            investment_amount: investment.amount,
            investment_currency: investment.currency,
            total_earnings: investment.earned_amount,
            start_date: investment.start_date,
            end_date: investment.end_date
          }
        );
      }
      
      // Auto-renew if enabled
      if (investment.auto_renew) {
        await autoRenewInvestment(investment, transaction);
      }
      
      return { success: true };
      
    } catch (error) {
      logger.error(`Process investment maturity error: ${error.message}`);
      throw error;
    }
  },

  // Calculate projected earnings
  calculateProjectedEarnings: async (userId, planId, amount) => {
    try {
      const plan = await require('../models/Plan').findByPk(planId);
      
      if (!plan) {
        throw new Error('Plan not found');
      }
      
      const dailyRate = parseFloat(plan.interest_rate) / 365 / 100;
      const dailyEarnings = parseFloat(amount) * dailyRate;
      
      const projections = {
        daily: dailyEarnings,
        weekly: dailyEarnings * 7,
        monthly: dailyEarnings * 30,
        quarterly: dailyEarnings * 90,
        yearly: parseFloat(amount) * (parseFloat(plan.interest_rate) / 100),
        total: dailyEarnings * parseInt(plan.duration)
      };
      
      return {
        success: true,
        plan: plan.name,
        amount,
        interest_rate: plan.interest_rate,
        duration: plan.duration,
        projections
      };
    } catch (error) {
      logger.error(`Calculate projected earnings error: ${error.message}`);
      throw error;
    }
  },

  // Get investment analytics
  getInvestmentAnalytics: async (userId) => {
    try {
      const investments = await Investment.findAll({
        where: { user_id: userId },
        include: [
          {
            model: require('../models/Plan'),
            as: 'plan',
            attributes: ['name', 'interest_rate']
          }
        ]
      });
      
      const analytics = {
        total_invested: investments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0),
        total_earned: investments.reduce((sum, inv) => sum + parseFloat(inv.earned_amount), 0),
        active_investments: investments.filter(inv => inv.status === 'active').length,
        completed_investments: investments.filter(inv => ['completed', 'matured'].includes(inv.status)).length,
        average_interest_rate: investments.length > 0 ? 
          investments.reduce((sum, inv) => sum + parseFloat(inv.interest_rate), 0) / investments.length : 0,
        
        // Performance by plan
        by_plan: {},
        
        // Monthly performance
        monthly_performance: await getMonthlyPerformance(userId)
      };
      
      // Group by plan
      investments.forEach(inv => {
        const planName = inv.plan.name;
        if (!analytics.by_plan[planName]) {
          analytics.by_plan[planName] = {
            count: 0,
            total_invested: 0,
            total_earned: 0
          };
        }
        
        analytics.by_plan[planName].count++;
        analytics.by_plan[planName].total_invested += parseFloat(inv.amount);
        analytics.by_plan[planName].total_earned += parseFloat(inv.earned_amount);
      });
      
      return {
        success: true,
        analytics
      };
    } catch (error) {
      logger.error(`Get investment analytics error: ${error.message}`);
      throw error;
    }
  }
};

// Helper functions
async function autoRenewInvestment(investment, transaction) {
  try {
    logger.info(`Auto-renewing investment ${investment.id}`);
    
    const plan = await require('../models/Plan').findByPk(investment.plan_id, { transaction });
    
    // Calculate new end date
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + parseInt(plan.duration));
    
    // Create new investment
    const newInvestment = await Investment.create({
      user_id: investment.user_id,
      plan_id: investment.plan_id,
      amount: investment.amount,
      currency: investment.currency,
      interest_rate: plan.interest_rate,
      expected_return: parseFloat(investment.amount) * (1 + parseFloat(plan.interest_rate) / 100),
      start_date: new Date(),
      end_date: newEndDate,
      status: 'active',
      auto_renew: true,
      payout_frequency: plan.payout_frequency,
      next_payout_date: getNextPayoutDate(new Date(), plan.payout_frequency)
    }, { transaction });
    
    // Create renewal transaction
    await Transaction.create({
      user_id: investment.user_id,
      type: 'investment',
      amount: investment.amount,
      currency: investment.currency,
      status: 'completed',
      description: `Auto-renewal of investment ${investment.id}`,
      metadata: {
        previous_investment_id: investment.id,
        new_investment_id: newInvestment.id,
        auto_renew: true
      }
    }, { transaction });
    
    // Send notification
    const user = await User.findByPk(investment.user_id, { transaction });
    if (user && user.email) {
      await sendEmail(
        user.email,
        'Investment Auto-Renewed',
        `Your investment of ${investment.amount} ${investment.currency} has been auto-renewed for another ${plan.duration} days. New investment ID: ${newInvestment.id}`,
        'investment-renewed',
        {
          previous_investment_id: investment.id,
          new_investment_id: newInvestment.id,
          amount: investment.amount,
          currency: investment.currency,
          duration: plan.duration
        }
      );
    }
    
    return newInvestment;
    
  } catch (error) {
    logger.error(`Auto-renew investment error: ${error.message}`);
    throw error;
  }
}

function getNextPayoutDate(startDate, frequency) {
  const date = new Date(startDate);
  
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      return null;
  }
  
  return date;
}

async function getMonthlyPerformance(userId) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const earnings = await Transaction.findAll({
    where: {
      user_id: userId,
      type: 'earnings',
      created_at: { [sequelize.Op.gte]: sixMonthsAgo }
    },
    attributes: [
      [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_earnings'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count']
    ],
    group: [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m')],
    order: [['month', 'DESC']]
  });
  
  return earnings;
}

module.exports = investmentService;