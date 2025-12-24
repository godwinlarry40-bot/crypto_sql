const { sequelize } = require('../config/database');
const Wallet = require('../models/Wallet');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../utils/logger');
const cryptoService = require('./cryptoService');

const portfolioService = {
  // Calculate portfolio value
  calculatePortfolioValue: async (userId) => {
    try {
      // Get all user wallets
      const wallets = await Wallet.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['currency', 'balance', 'locked_balance']
      });

      // Get active investments
      const investments = await Investment.findAll({
        where: { user_id: userId, status: 'active' },
        attributes: ['currency', 'amount', 'earned_amount', 'expected_return']
      });

      // Get current prices
      const symbols = [
        ...new Set([
          ...wallets.map(w => w.currency.toLowerCase()),
          ...investments.map(i => i.currency.toLowerCase())
        ])
      ];

      const prices = await cryptoService.getRealTimePrices(symbols);

      // Calculate wallet values
      let totalWalletValue = 0;
      let totalLockedValue = 0;
      let totalAvailableValue = 0;

      const walletValues = wallets.map(wallet => {
        const price = prices[wallet.currency.toLowerCase()]?.current_price || 1;
        const balanceValue = parseFloat(wallet.balance) * price;
        const lockedValue = parseFloat(wallet.locked_balance) * price;
        const totalValue = balanceValue + lockedValue;

        totalWalletValue += totalValue;
        totalLockedValue += lockedValue;
        totalAvailableValue += balanceValue;

        return {
          currency: wallet.currency,
          balance: parseFloat(wallet.balance),
          locked_balance: parseFloat(wallet.locked_balance),
          price: price,
          balance_value: balanceValue,
          locked_value: lockedValue,
          total_value: totalValue
        };
      });

      // Calculate investment values
      let totalInvestedValue = 0;
      let totalEarnedValue = 0;
      let totalExpectedValue = 0;

      const investmentValues = investments.map(investment => {
        const price = prices[investment.currency.toLowerCase()]?.current_price || 1;
        const investedValue = parseFloat(investment.amount) * price;
        const earnedValue = parseFloat(investment.earned_amount) * price;
        const expectedValue = parseFloat(investment.expected_return) * price;

        totalInvestedValue += investedValue;
        totalEarnedValue += earnedValue;
        totalExpectedValue += expectedValue;

        return {
          currency: investment.currency,
          amount: parseFloat(investment.amount),
          earned_amount: parseFloat(investment.earned_amount),
          expected_return: parseFloat(investment.expected_return),
          price: price,
          invested_value: investedValue,
          earned_value: earnedValue,
          expected_value: expectedValue
        };
      });

      const totalPortfolioValue = totalWalletValue + totalInvestedValue;
      const totalEarnings = totalEarnedValue + (totalExpectedValue - totalInvestedValue);

      return {
        summary: {
          total_portfolio_value: totalPortfolioValue,
          total_wallet_value: totalWalletValue,
          total_invested_value: totalInvestedValue,
          total_earned_value: totalEarnedValue,
          total_expected_earnings: totalExpectedValue - totalInvestedValue,
          total_earnings: totalEarnings,
          total_locked_value: totalLockedValue,
          total_available_value: totalAvailableValue
        },
        wallets: walletValues,
        investments: investmentValues
      };
    } catch (error) {
      logger.error(`Calculate portfolio value error: ${error.message}`);
      throw error;
    }
  },

  // Get portfolio performance
  getPortfolioPerformance: async (userId, period = '7d') => {
    try {
      // Calculate period dates
      const endDate = new Date();
      let startDate = new Date();

      switch (period) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
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
          startDate = new Date(0); // Beginning of time
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get transactions in period
      const transactions = await Transaction.findAll({
        where: {
          user_id: userId,
          created_at: {
            [sequelize.Op.between]: [startDate, endDate]
          },
          status: 'completed'
        },
        attributes: ['type', 'amount', 'currency', 'created_at']
      });

      // Calculate performance metrics
      const deposits = transactions.filter(t => t.type === 'deposit');
      const withdrawals = transactions.filter(t => t.type === 'withdrawal');
      const earnings = transactions.filter(t => t.type === 'earnings');
      const investments = transactions.filter(t => t.type === 'investment');

      const totalDeposits = deposits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const totalWithdrawals = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const totalEarnings = earnings.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const totalInvested = investments.reduce((sum, t) => sum + parseFloat(t.amount), 0);

      // Calculate daily performance (simplified)
      const dailyPerformance = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const dayTransactions = transactions.filter(t => 
          t.created_at >= dayStart && t.created_at <= dayEnd
        );

        const dayDeposits = dayTransactions.filter(t => t.type === 'deposit');
        const dayWithdrawals = dayTransactions.filter(t => t.type === 'withdrawal');
        const dayEarnings = dayTransactions.filter(t => t.type === 'earnings');

        const dayNetFlow = 
          dayDeposits.reduce((sum, t) => sum + parseFloat(t.amount), 0) -
          dayWithdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0) +
          dayEarnings.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        dailyPerformance.push({
          date: currentDate.toISOString().split('T')[0],
          net_flow: dayNetFlow,
          deposits: dayDeposits.length,
          withdrawals: dayWithdrawals.length,
          earnings: dayEarnings.reduce((sum, t) => sum + parseFloat(t.amount), 0)
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Calculate ROI
      const currentPortfolio = await portfolioService.calculatePortfolioValue(userId);
      const currentValue = currentPortfolio.summary.total_portfolio_value;
      const netDeposits = totalDeposits - totalWithdrawals;
      const roi = netDeposits > 0 ? ((currentValue - netDeposits) / netDeposits) * 100 : 0;

      return {
        period: {
          start: startDate,
          end: endDate,
          days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
        },
        metrics: {
          total_deposits: totalDeposits,
          total_withdrawals: totalWithdrawals,
          total_earnings: totalEarnings,
          total_invested: totalInvested,
          net_cash_flow: totalDeposits - totalWithdrawals,
          current_portfolio_value: currentValue,
          net_investment: netDeposits,
          roi_percentage: roi,
          annualized_roi: roi * (365 / Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)))
        },
        daily_performance: dailyPerformance,
        transaction_summary: {
          deposits: deposits.length,
          withdrawals: withdrawals.length,
          earnings: earnings.length,
          investments: investments.length
        }
      };
    } catch (error) {
      logger.error(`Get portfolio performance error: ${error.message}`);
      throw error;
    }
  },

  // Get asset allocation
  getAssetAllocation: async (userId) => {
    try {
      const portfolio = await portfolioService.calculatePortfolioValue(userId);

      // Group by asset type
      const allocation = {};

      // Wallet allocation
      portfolio.wallets.forEach(wallet => {
        if (!allocation[wallet.currency]) {
          allocation[wallet.currency] = {
            currency: wallet.currency,
            type: getAssetType(wallet.currency),
            wallet_balance: wallet.balance,
            wallet_locked: wallet.locked_balance,
            wallet_value: wallet.total_value,
            investment_amount: 0,
            investment_value: 0,
            total_amount: wallet.balance + wallet.locked_balance,
            total_value: wallet.total_value,
            percentage: 0
          };
        } else {
          allocation[wallet.currency].wallet_balance += wallet.balance;
          allocation[wallet.currency].wallet_locked += wallet.locked_balance;
          allocation[wallet.currency].wallet_value += wallet.total_value;
          allocation[wallet.currency].total_amount += wallet.balance + wallet.locked_balance;
          allocation[wallet.currency].total_value += wallet.total_value;
        }
      });

      // Investment allocation
      portfolio.investments.forEach(investment => {
        if (!allocation[investment.currency]) {
          allocation[investment.currency] = {
            currency: investment.currency,
            type: getAssetType(investment.currency),
            wallet_balance: 0,
            wallet_locked: 0,
            wallet_value: 0,
            investment_amount: investment.amount,
            investment_value: investment.invested_value,
            total_amount: investment.amount,
            total_value: investment.invested_value,
            percentage: 0
          };
        } else {
          allocation[investment.currency].investment_amount += investment.amount;
          allocation[investment.currency].investment_value += investment.invested_value;
          allocation[investment.currency].total_amount += investment.amount;
          allocation[investment.currency].total_value += investment.invested_value;
        }
      });

      // Calculate total value for percentages
      const totalValue = Object.values(allocation).reduce((sum, asset) => sum + asset.total_value, 0);

      // Calculate percentages
      Object.values(allocation).forEach(asset => {
        asset.percentage = totalValue > 0 ? (asset.total_value / totalValue) * 100 : 0;
      });

      // Convert to array and sort by value
      const allocationArray = Object.values(allocation)
        .sort((a, b) => b.total_value - a.total_value);

      // Group by asset type
      const byType = {
        cryptocurrency: allocationArray.filter(a => a.type === 'cryptocurrency'),
        stablecoin: allocationArray.filter(a => a.type === 'stablecoin'),
        fiat: allocationArray.filter(a => a.type === 'fiat')
      };

      // Calculate type percentages
      const typePercentages = {};
      Object.entries(byType).forEach(([type, assets]) => {
        const typeValue = assets.reduce((sum, asset) => sum + asset.total_value, 0);
        typePercentages[type] = totalValue > 0 ? (typeValue / totalValue) * 100 : 0;
      });

      return {
        allocation: allocationArray,
        by_type: byType,
        type_percentages: typePercentages,
        summary: {
          total_value: totalValue,
          asset_count: allocationArray.length,
          cryptocurrency_percentage: typePercentages.cryptocurrency || 0,
          stablecoin_percentage: typePercentages.stablecoin || 0,
          fiat_percentage: typePercentages.fiat || 0
        }
      };
    } catch (error) {
      logger.error(`Get asset allocation error: ${error.message}`);
      throw error;
    }
  },

  // Get risk analysis
  getRiskAnalysis: async (userId) => {
    try {
      const allocation = await portfolioService.getAssetAllocation(userId);
      const prices = await cryptoService.getRealTimePrices();

      // Calculate risk metrics
      let totalValue = 0;
      let weightedVolatility = 0;
      let concentrationRisk = 0;
      
      const riskMetrics = allocation.allocation.map(asset => {
        const assetVolatility = getAssetVolatility(asset.currency, prices);
        const assetValue = asset.total_value;
        const assetWeight = asset.percentage / 100;

        totalValue += assetValue;
        weightedVolatility += assetWeight * assetVolatility;

        // Calculate concentration risk (Herfindahl-Hirschman Index)
        concentrationRisk += Math.pow(assetWeight, 2);

        return {
          currency: asset.currency,
          type: asset.type,
          value: assetValue,
          weight: assetWeight,
          volatility: assetVolatility,
          risk_score: assetVolatility * 100,
          concentration: assetWeight
        };
      });

      // Calculate diversification score (inverse of HHI)
      const diversificationScore = Math.max(0, Math.min(100, (1 - concentrationRisk) * 100));

      // Calculate overall risk score (1-10)
      const riskScore = Math.min(10, Math.max(1, weightedVolatility * 100 * (1 - diversificationScore / 100)));

      // Generate recommendations
      const recommendations = generateRiskRecommendations(riskMetrics, riskScore, diversificationScore);

      return {
        risk_metrics: {
          total_value: totalValue,
          weighted_volatility: weightedVolatility,
          concentration_index: concentrationRisk,
          diversification_score: diversificationScore,
          risk_score: riskScore,
          risk_level: getRiskLevel(riskScore)
        },
        asset_risk: riskMetrics,
        recommendations: recommendations
      };
    } catch (error) {
      logger.error(`Get risk analysis error: ${error.message}`);
      throw error;
    }
  },

  // Export portfolio data
  exportPortfolioData: async (userId, format = 'csv') => {
    try {
      const portfolio = await portfolioService.calculatePortfolioValue(userId);
      const user = await User.findByPk(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const timestamp = new Date().toISOString();
      const filename = `portfolio_${user.email}_${timestamp}`;

      if (format === 'csv') {
        return exportToCSV(portfolio, user, filename);
      } else if (format === 'json') {
        return exportToJSON(portfolio, user, filename);
      } else if (format === 'pdf') {
        return exportToPDF(portfolio, user, filename);
      } else {
        throw new Error('Unsupported export format');
      }
    } catch (error) {
      logger.error(`Export portfolio data error: ${error.message}`);
      throw error;
    }
  }
};

// Helper functions
function getAssetType(currency) {
  const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD'];
  const fiat = ['USD', 'EUR', 'GBP', 'JPY'];
  
  if (stablecoins.includes(currency.toUpperCase())) {
    return 'stablecoin';
  } else if (fiat.includes(currency.toUpperCase())) {
    return 'fiat';
  } else {
    return 'cryptocurrency';
  }
}

function getAssetVolatility(currency, prices) {
  // Mock volatility data
  // In production, use historical data to calculate actual volatility
  
  const volatilityMap = {
    BTC: 0.035,
    ETH: 0.04,
    USDT: 0.001,
    USDC: 0.001,
    BNB: 0.045,
    SOL: 0.055,
    XRP: 0.05,
    ADA: 0.048,
    DOGE: 0.06
  };

  return volatilityMap[currency.toUpperCase()] || 0.03; // Default 3%
}

function generateRiskRecommendations(riskMetrics, riskScore, diversificationScore) {
  const recommendations = [];

  if (riskScore > 7) {
    recommendations.push({
      type: 'high_risk',
      message: 'Your portfolio has high volatility. Consider increasing stablecoin allocation.',
      priority: 'high'
    });
  }

  if (diversificationScore < 70) {
    recommendations.push({
      type: 'diversification',
      message: 'Low diversification detected. Spread investments across more assets.',
      priority: 'medium'
    });
  }

  // Check for concentration risk
  const sortedAssets = [...riskMetrics].sort((a, b) => b.weight - a.weight);
  if (sortedAssets.length > 0 && sortedAssets[0].weight > 0.5) {
    recommendations.push({
      type: 'concentration',
      message: `High concentration in ${sortedAssets[0].currency}. Consider rebalancing.`,
      priority: 'high'
    });
  }

  // Check for all high-volatility assets
  const highVolatilityAssets = riskMetrics.filter(a => a.volatility > 0.04);
  if (highVolatilityAssets.length === riskMetrics.length && riskMetrics.length > 1) {
    recommendations.push({
      type: 'volatility',
      message: 'All assets have high volatility. Add some stable assets.',
      priority: 'medium'
    });
  }

  return recommendations;
}

function getRiskLevel(riskScore) {
  if (riskScore <= 3) return 'Low';
  if (riskScore <= 6) return 'Medium';
  if (riskScore <= 8) return 'High';
  return 'Very High';
}

function exportToCSV(portfolio, user, filename) {
  let csv = 'Portfolio Summary\n';
  csv += `User: ${user.email}\n`;
  csv += `Date: ${new Date().toISOString()}\n\n`;
  
  csv += 'Summary\n';
  csv += 'Metric,Value\n';
  Object.entries(portfolio.summary).forEach(([key, value]) => {
    csv += `${key},${value}\n`;
  });
  
  csv += '\nWallets\n';
  csv += 'Currency,Balance,Locked Balance,Price,Balance Value,Locked Value,Total Value\n';
  portfolio.wallets.forEach(wallet => {
    csv += `${wallet.currency},${wallet.balance},${wallet.locked_balance},${wallet.price},${wallet.balance_value},${wallet.locked_value},${wallet.total_value}\n`;
  });
  
  csv += '\nInvestments\n';
  csv += 'Currency,Amount,Earned Amount,Expected Return,Price,Invested Value,Earned Value,Expected Value\n';
  portfolio.investments.forEach(investment => {
    csv += `${investment.currency},${investment.amount},${investment.earned_amount},${investment.expected_return},${investment.price},${investment.invested_value},${investment.earned_value},${investment.expected_value}\n`;
  });
  
  return {
    filename: `${filename}.csv`,
    content: csv,
    contentType: 'text/csv'
  };
}

function exportToJSON(portfolio, user, filename) {
  const data = {
    user: {
      email: user.email,
      name: `${user.first_name} ${user.last_name}`
    },
    export_date: new Date().toISOString(),
    portfolio
  };
  
  return {
    filename: `${filename}.json`,
    content: JSON.stringify(data, null, 2),
    contentType: 'application/json'
  };
}

function exportToPDF(portfolio, user, filename) {
  // In production, use a PDF generation library like pdfkit
  // This is a simplified mock
  
  const pdfData = {
    filename: `${filename}.pdf`,
    content: `PDF Export for ${user.email}`,
    contentType: 'application/pdf'
  };
  
  return pdfData;
}

module.exports = portfolioService;