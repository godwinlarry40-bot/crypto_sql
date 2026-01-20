const { sequelize, Wallet, Investment, Transaction, User } = require('../models');
const logger = require('../utils/logger');
// CHANGE: Ensure we are importing the instance directly. 
const coinGecko = require('../utils/CoinGeckoClient'); 
const { Op } = require('sequelize');

const portfolioService = {
  // 1. Calculate Real-Time Portfolio Value
  calculatePortfolioValue: async (userId) => {
    try {
      const [wallets, investments] = await Promise.all([
        Wallet.findAll({ where: { user_id: userId, is_active: true } }),
        Investment.findAll({ where: { user_id: userId, status: 'active' } })
      ]);

      // CHANGE: Ensure currencies is always an array to avoid .map errors
      const currencies = [...new Set([
        ...(wallets || []).map(w => w.currency?.toLowerCase()),
        ...(investments || []).map(i => i.currency?.toLowerCase())
      ])].filter(Boolean);

      if (!coinGecko || typeof coinGecko.getSimplePrice !== 'function') {
        throw new Error('CoinGecko client not initialized correctly');
      }

      // Fetch current market prices
      const marketPrices = await coinGecko.getSimplePrice(currencies) || {};

      let totalValueUSD = 0;
      let totalInvestedUSD = 0;
      let totalProjectedEarnedUSD = 0; 

      const assetBreakdown = wallets.map(w => {
        const symbol = w.currency?.toLowerCase();
        const coinId = (coinGecko.symbolToId && coinGecko.symbolToId[symbol]) || symbol;
        
        // CHANGE: Added deep safety checks for price and change data
        const priceData = marketPrices[coinId] || {};
        const price = parseFloat(priceData.usd || 0);
        const change24h = parseFloat(priceData.usd_24h_change || 0);

        const liquidVal = parseFloat(w.balance || 0) * price;
        const lockedVal = parseFloat(w.locked_balance || 0) * price;
        const totalVal = liquidVal + lockedVal;

        totalValueUSD += totalVal;

        return {
          currency: w.currency.toUpperCase(),
          total_quantity: parseFloat(w.balance || 0) + parseFloat(w.locked_balance || 0),
          value_usd: totalVal,
          price_usd: price,
          change_24h: change24h.toFixed(2)
        };
      });

      const investmentBreakdown = investments.map(inv => {
        const symbol = inv.currency?.toLowerCase();
        const coinId = (coinGecko.symbolToId && coinGecko.symbolToId[symbol]) || symbol;
        
        // CHANGE: Safety check for investment price mapping
        const price = parseFloat(marketPrices[coinId]?.usd || 0);
        
        const principalVal = parseFloat(inv.amount || 0) * price;
        const projectedProfitPercent = parseFloat(inv.interest_rate || 0);
        const earnedVal = principalVal * (projectedProfitPercent / 100);

        totalInvestedUSD += principalVal;
        totalProjectedEarnedUSD += earnedVal;

        return {
          id: inv.id,
          currency: inv.currency.toUpperCase(),
          principal_usd: principalVal,
          projected_earned_usd: earnedVal, 
          status: inv.status
        };
      });

      const weightedChange = portfolioService._calculateWeightedChange(assetBreakdown);

      return {
        timestamp: new Date(),
        summary: {
          total_portfolio_usd: totalValueUSD + totalProjectedEarnedUSD,
          liquid_balance_usd: totalValueUSD - totalInvestedUSD,
          invested_principal_usd: totalInvestedUSD,
          projected_profit_usd: totalProjectedEarnedUSD,
          weighted_24h_change: weightedChange
        },
        assets: assetBreakdown,
        investments: investmentBreakdown
      };
    } catch (error) {
      // CHANGE: Improved logging to see exactly which line failed in the 500 error
      logger.error(`Portfolio Calculation Error for User ${userId}: ${error.message}`);
      logger.error(error.stack);
      throw error; 
    }
  },

  // 2. Performance Tracking
  getPortfolioPerformance: async (userId, days = 7) => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const transactions = await Transaction.findAll({
        where: {
          user_id: userId,
          status: 'completed',
          createdAt: { [Op.gte]: startDate }
        }
      });

      const metrics = transactions.reduce((acc, tx) => {
        const amount = parseFloat(tx.amount || 0);
        if (tx.type === 'deposit') acc.deposits += amount;
        if (tx.type === 'withdrawal') acc.withdrawals += amount;
        if (tx.type === 'interest') acc.earnings += amount; 
        return acc;
      }, { deposits: 0, withdrawals: 0, earnings: 0 });

      return {
        timeframe_days: days,
        ...metrics,
        net_capital_flow: metrics.deposits - metrics.withdrawals,
        performance_ratio: metrics.deposits > 0 ? (metrics.earnings / metrics.deposits).toFixed(4) : 0
      };
    } catch (error) {
      logger.error(`Performance Metrics Error: ${error.message}`);
      throw error;
    }
  },

  // 3. Export Data
  exportPortfolioCSV: async (userId) => {
    const data = await portfolioService.calculatePortfolioValue(userId);
    let csv = 'Asset,Quantity,Price (USD),Total Value (USD),24h Change (%)\n';
    
    data.assets.forEach(a => {
      csv += `${a.currency},${a.total_quantity},${a.price_usd},${a.value_usd.toFixed(2)},${a.change_24h}%\n`;
    });

    return {
      filename: `portfolio_${userId}_${Date.now()}.csv`,
      content: csv
    };
  },

  // Private Helper
  _calculateWeightedChange: (assets) => {
    if (!assets || assets.length === 0) return "0.00";
    
    const totalVal = assets.reduce((sum, a) => sum + (a.value_usd || 0), 0);
    if (totalVal === 0) return "0.00";

    const weightedSum = assets.reduce((sum, a) => {
      const weight = (a.value_usd || 0) / totalVal;
      return sum + (parseFloat(a.change_24h || 0) * weight);
    }, 0);

    return weightedSum.toFixed(2);
  }
};

module.exports = portfolioService;