const { sequelize } = require('../config/database');
const Wallet = require('../models/Wallet');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const axios = require('axios');
const logger = require('../utils/logger');

const portfolioController = {
  // Get portfolio summary
  getPortfolioSummary: async (req, res) => {
    try {
      // Get all wallets
      const wallets = await Wallet.findAll({
        where: { user_id: req.user.id, is_active: true },
        attributes: ['currency', 'balance', 'locked_balance', 'total_deposited', 'total_withdrawn']
      });

      // Get active investments
      const investments = await Investment.findAll({
        where: { user_id: req.user.id, status: 'active' },
        attributes: ['currency', 'amount', 'earned_amount', 'expected_return']
      });

      // Get current prices for cryptocurrencies
      const cryptoPrices = await getCurrentPrices();

      // Calculate portfolio value
      let totalValue = 0;
      let totalInvested = 0;
      let totalEarnings = 0;
      let totalLocked = 0;

      const walletSummary = wallets.map(wallet => {
        const price = cryptoPrices[wallet.currency.toLowerCase()] || 1;
        const value = (parseFloat(wallet.balance) + parseFloat(wallet.locked_balance)) * price;
        const invested = parseFloat(wallet.total_deposited) * price;
        
        totalValue += value;
        totalInvested += invested;
        totalLocked += parseFloat(wallet.locked_balance) * price;

        return {
          currency: wallet.currency,
          balance: parseFloat(wallet.balance),
          locked_balance: parseFloat(wallet.locked_balance),
          total_deposited: parseFloat(wallet.total_deposited),
          total_withdrawn: parseFloat(wallet.total_withdrawn),
          current_price: price,
          value: value,
          invested: invested,
          pnl: value - invested
        };
      });

      // Calculate investment summary
      const investmentSummary = investments.map(inv => {
        const price = cryptoPrices[inv.currency.toLowerCase()] || 1;
        const currentValue = parseFloat(inv.amount) * price;
        const expectedValue = parseFloat(inv.expected_return) * price;
        
        totalEarnings += parseFloat(inv.earned_amount) * price;

        return {
          currency: inv.currency,
          amount: parseFloat(inv.amount),
          earned_amount: parseFloat(inv.earned_amount),
          expected_return: parseFloat(inv.expected_return),
          current_value: currentValue,
          expected_value: expectedValue,
          potential_earnings: expectedValue - currentValue
        };
      });

      // Get recent transactions
      const recentTransactions = await Transaction.findAll({
        where: { user_id: req.user.id },
        order: [['created_at', 'DESC']],
        limit: 10,
        attributes: ['type', 'amount', 'currency', 'status', 'created_at', 'description']
      });

      // Calculate performance metrics
      const performance = await calculatePerformanceMetrics(req.user.id);

      res.json({
        success: true,
        data: {
          summary: {
            total_value: totalValue,
            total_invested: totalInvested,
            total_earnings: totalEarnings,
            total_locked: totalLocked,
            total_available: totalValue - totalLocked,
            overall_pnl: totalValue - totalInvested,
            pnl_percentage: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0
          },
          wallets: walletSummary,
          investments: investmentSummary,
          recent_transactions: recentTransactions,
          performance: performance
        }
      });
    } catch (error) {
      logger.error(`Get portfolio summary error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch portfolio summary'
      });
    }
  },

  // Get portfolio performance over time
  getPerformanceHistory: async (req, res) => {
    try {
      const { period = '7d' } = req.query; // 7d, 30d, 90d, 1y, all
      
      // Calculate start date based on period
      let startDate = new Date();
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case 'all':
          startDate = null;
          break;
      }

      // Get daily portfolio values
      const dailyValues = await getDailyPortfolioValues(req.user.id, startDate);

      // Calculate performance metrics
      const metrics = {
        start_value: dailyValues[0]?.value || 0,
        end_value: dailyValues[dailyValues.length - 1]?.value || 0,
        highest_value: Math.max(...dailyValues.map(d => d.value)),
        lowest_value: Math.min(...dailyValues.map(d => d.value)),
        total_change: dailyValues[dailyValues.length - 1]?.value - dailyValues[0]?.value || 0,
        percentage_change: dailyValues[0]?.value > 0 ? 
          ((dailyValues[dailyValues.length - 1]?.value - dailyValues[0]?.value) / dailyValues[0]?.value) * 100 : 0
      };

      res.json({
        success: true,
        data: {
          period,
          daily_values: dailyValues,
          metrics: metrics
        }
      });
    } catch (error) {
      logger.error(`Get performance history error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance history'
      });
    }
  },

  // Get asset allocation
  getAssetAllocation: async (req, res) => {
    try {
      const wallets = await Wallet.findAll({
        where: { user_id: req.user.id, is_active: true },
        attributes: ['currency', 'balance', 'locked_balance']
      });

      const cryptoPrices = await getCurrentPrices();

      const allocation = wallets.map(wallet => {
        const price = cryptoPrices[wallet.currency.toLowerCase()] || 1;
        const totalBalance = parseFloat(wallet.balance) + parseFloat(wallet.locked_balance);
        const value = totalBalance * price;

        return {
          currency: wallet.currency,
          balance: totalBalance,
          value: value,
          price: price,
          percentage: 0 // Will calculate after
        };
      });

      // Calculate total value for percentages
      const totalValue = allocation.reduce((sum, asset) => sum + asset.value, 0);
      
      // Calculate percentages
      allocation.forEach(asset => {
        asset.percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
      });

      // Sort by value descending
      allocation.sort((a, b) => b.value - a.value);

      // Group by asset type
      const byType = {
        crypto: allocation.filter(a => !['USDT', 'USDC'].includes(a.currency)),
        stablecoin: allocation.filter(a => ['USDT', 'USDC'].includes(a.currency)),
        locked: allocation.reduce((sum, asset) => sum + (parseFloat(asset.balance) * asset.price), 0)
      };

      res.json({
        success: true,
        data: {
          allocation,
          by_type: byType,
          total_value: totalValue
        }
      });
    } catch (error) {
      logger.error(`Get asset allocation error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch asset allocation'
      });
    }
  },

  // Get earnings report
  getEarningsReport: async (req, res) => {
    try {
      const { startDate, endDate, groupBy = 'month' } = req.query;
      
      const where = {
        user_id: req.user.id,
        type: 'earnings'
      };

      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.created_at[sequelize.Op.lte] = new Date(endDate);
      }

      let groupFormat;
      switch (groupBy) {
        case 'day':
          groupFormat = '%Y-%m-%d';
          break;
        case 'week':
          groupFormat = '%Y-%u';
          break;
        case 'month':
          groupFormat = '%Y-%m';
          break;
        case 'year':
          groupFormat = '%Y';
          break;
        default:
          groupFormat = '%Y-%m';
      }

      const earnings = await Transaction.findAll({
        where,
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), groupFormat), 'period'],
          'currency',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['period', 'currency'],
        order: [['period', 'DESC']]
      });

      // Get total earnings by source
      const earningsBySource = await Transaction.findAll({
        where: {
          user_id: req.user.id,
          type: ['earnings', 'referral']
        },
        attributes: [
          'type',
          'currency',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
        ],
        group: ['type', 'currency']
      });

      // Calculate projected earnings from active investments
      const activeInvestments = await Investment.findAll({
        where: { user_id: req.user.id, status: 'active' },
        attributes: ['currency', 'amount', 'interest_rate', 'start_date', 'end_date']
      });

      const projectedEarnings = activeInvestments.map(inv => {
        const daysLeft = Math.ceil((new Date(inv.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const dailyRate = parseFloat(inv.interest_rate) / 365 / 100;
        const projected = parseFloat(inv.amount) * dailyRate * daysLeft;

        return {
          currency: inv.currency,
          amount: parseFloat(inv.amount),
          interest_rate: parseFloat(inv.interest_rate),
          days_remaining: daysLeft,
          projected_earnings: projected
        };
      });

      res.json({
        success: true,
        data: {
          earnings_by_period: earnings,
          earnings_by_source: earningsBySource,
          projected_earnings: projectedEarnings,
          total_earnings: earningsBySource.reduce((sum, item) => sum + parseFloat(item.total_amount), 0)
        }
      });
    } catch (error) {
      logger.error(`Get earnings report error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch earnings report'
      });
    }
  },

  // Get risk analysis
  getRiskAnalysis: async (req, res) => {
    try {
      // Get portfolio data
      const wallets = await Wallet.findAll({
        where: { user_id: req.user.id, is_active: true },
        attributes: ['currency', 'balance', 'locked_balance']
      });

      const investments = await Investment.findAll({
        where: { user_id: req.user.id, status: 'active' },
        attributes: ['currency', 'amount', 'plan_id']
      });

      // Get current prices and volatility data
      const marketData = await getMarketVolatility();

      // Calculate risk metrics
      let totalValue = 0;
      let weightedVolatility = 0;
      let maxDrawdownPotential = 0;
      
      const riskAnalysis = wallets.map(wallet => {
        const currencyData = marketData[wallet.currency.toLowerCase()] || {
          volatility: 0.02, // Default 2% daily volatility
          correlation: {},
          max_drawdown: 0.1 // Default 10% max drawdown
        };

        const price = currencyData.price || 1;
        const value = (parseFloat(wallet.balance) + parseFloat(wallet.locked_balance)) * price;
        totalValue += value;
        
        weightedVolatility += (value / totalValue) * currencyData.volatility;
        maxDrawdownPotential += value * currencyData.max_drawdown;

        return {
          currency: wallet.currency,
          allocation: (value / totalValue) * 100,
          volatility: currencyData.volatility,
          max_drawdown: currencyData.max_drawdown,
          risk_score: currencyData.volatility * 100,
          value: value
        };
      });

      // Calculate portfolio risk score (1-10, 10 being highest risk)
      const riskScore = Math.min(10, Math.max(1, weightedVolatility * 100));

      // Get diversification score
      const diversificationScore = calculateDiversificationScore(riskAnalysis);

      res.json({
        success: true,
        data: {
          risk_analysis: riskAnalysis,
          portfolio_metrics: {
            total_value: totalValue,
            weighted_volatility: weightedVolatility,
            max_drawdown_potential: maxDrawdownPotential,
            risk_score: riskScore,
            diversification_score: diversificationScore,
            risk_level: getRiskLevel(riskScore)
          },
          recommendations: generateRiskRecommendations(riskAnalysis, riskScore, diversificationScore)
        }
      });
    } catch (error) {
      logger.error(`Get risk analysis error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch risk analysis'
      });
    }
  }
};

// Helper functions
async function getCurrentPrices() {
  try {
    const response = await axios.get(`${process.env.COINGECKO_API_URL}/simple/price`, {
      params: {
        ids: 'bitcoin,ethereum,tether,binancecoin,usd-coin,ripple,cardano,solana,dogecoin,polkadot',
        vs_currencies: 'usd'
      }
    });

    const prices = {};
    Object.entries(response.data).forEach(([coin, data]) => {
      prices[coin] = data.usd;
    });

    return prices;
  } catch (error) {
    logger.error(`Get current prices error: ${error.message}`);
    return {};
  }
}

async function getDailyPortfolioValues(userId, startDate) {
  // This is a simplified version
  // In production, you would store daily portfolio snapshots
  
  const dailyValues = [];
  const days = startDate ? Math.ceil((new Date() - startDate) / (1000 * 60 * 60 * 24)) : 30;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Calculate approximate daily value
    // This should be replaced with actual historical data
    dailyValues.push({
      date: date.toISOString().split('T')[0],
      value: 1000 + (Math.random() * 100 - 50) // Placeholder
    });
  }
  
  return dailyValues;
}

async function calculatePerformanceMetrics(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get transactions for the period
  const transactions = await Transaction.findAll({
    where: {
      user_id: userId,
      created_at: { [sequelize.Op.gte]: thirtyDaysAgo }
    }
  });

  // Calculate metrics
  const deposits = transactions.filter(t => t.type === 'deposit');
  const withdrawals = transactions.filter(t => t.type === 'withdrawal');
  const earnings = transactions.filter(t => t.type === 'earnings');

  const totalDeposited = deposits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalWithdrawn = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalEarned = earnings.reduce((sum, t) => sum + parseFloat(t.amount), 0);

  return {
    total_deposited: totalDeposited,
    total_withdrawn: totalWithdrawn,
    total_earned: totalEarned,
    net_cash_flow: totalDeposited - totalWithdrawn,
    roi: totalDeposited > 0 ? (totalEarned / totalDeposited) * 100 : 0
  };
}

async function getMarketVolatility() {
  // Simplified market data
  // In production, fetch from market data API
  return {
    bitcoin: {
      volatility: 0.035,
      correlation: { ethereum: 0.8, solana: 0.7 },
      max_drawdown: 0.15,
      price: 45000
    },
    ethereum: {
      volatility: 0.04,
      correlation: { bitcoin: 0.8, solana: 0.6 },
      max_drawdown: 0.18,
      price: 3000
    },
    // Add more currencies...
  };
}

function calculateDiversificationScore(assets) {
  if (assets.length === 0) return 0;
  
  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);
  const herfindahlIndex = assets.reduce((sum, a) => {
    const share = a.value / totalValue;
    return sum + (share * share);
  }, 0);
  
  // Convert to diversification score (0-100)
  return Math.max(0, Math.min(100, (1 - herfindahlIndex) * 100));
}

function getRiskLevel(riskScore) {
  if (riskScore <= 3) return 'Low';
  if (riskScore <= 6) return 'Medium';
  return 'High';
}

function generateRiskRecommendations(assets, riskScore, diversificationScore) {
  const recommendations = [];
  
  if (diversificationScore < 70) {
    recommendations.push('Consider diversifying your portfolio across more asset types');
  }
  
  if (riskScore > 7) {
    recommendations.push('High volatility detected. Consider reducing exposure to high-risk assets');
  }
  
  // Check for concentration risk
  const sortedAssets = [...assets].sort((a, b) => b.value - a.value);
  if (sortedAssets.length > 0 && sortedAssets[0].allocation > 50) {
    recommendations.push(`High concentration in ${sortedAssets[0].currency}. Consider rebalancing`);
  }
  
  return recommendations;
}

module.exports = portfolioController;