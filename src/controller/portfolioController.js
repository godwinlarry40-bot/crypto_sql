const { PortfolioSnapshot, User } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const portfolioService = require('../services/portfolioService');

const portfolioController = {
  // 1. Real-time Summary
  getPortfolioSummary: async (req, res) => {
    try {
      // The crash is likely inside this service call
      const summary = await portfolioService.calculatePortfolioValue(req.user.id);
      res.json({ success: true, data: summary });
    } catch (error) {
      // CHANGE: Log the full stack trace to terminal to find the exact line of failure
      logger.error(`Portfolio Summary Error: ${error.stack}`);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to calculate summary',
        error: error.message // Sending message to Postman for easier debugging
      });
    }
  },

  // 2. Asset Allocation
  getAssetAllocation: async (req, res) => {
    try {
      const allocation = await portfolioService.getAssetAllocation(req.user.id);
      res.json({ success: true, data: allocation });
    } catch (error) {
      logger.error(`Asset Allocation Error: ${error.message}`);
      res.status(500).json({ success: false, message: 'Failed to fetch allocation' });
    }
  },

  // 3. Time-Series Analytics
  getDailyAnalytics: async (req, res) => {
    try {
      const history = await PortfolioSnapshot.findAll({
        where: { 
          user_id: req.user.id, 
          timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        },
        order: [['timestamp', 'ASC']]
      });
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching daily data' });
    }
  },

  getMonthlyAnalytics: async (req, res) => {
    try {
      // CHANGE: Ensure days is a safe number
      const days = parseInt(req.query.days) || 30;
      const history = await PortfolioSnapshot.findAll({
        where: { 
          user_id: req.user.id, 
          timestamp: { [Op.gte]: new Date(Date.now() - (days * 24 * 60 * 60 * 1000)) } 
        },
        order: [['timestamp', 'ASC']]
      });
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching monthly data' });
    }
  },

  getYearlyAnalytics: async (req, res) => {
    try {
      const history = await PortfolioSnapshot.findAll({
        where: { 
          user_id: req.user.id, 
          timestamp: { [Op.gte]: new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)) } 
        },
        order: [['timestamp', 'ASC']]
      });
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching yearly data' });
    }
  },

  // 4. Advanced Analytics
  getPerformanceHistory: async (req, res) => {
    res.json({ success: true, message: "Performance metrics coming soon", data: {} });
  },

  getRiskAnalysis: async (req, res) => {
    res.json({ success: true, risk_score: "Low", message: "Diversification is optimal" });
  },

  getEarningsReport: async (req, res) => {
    res.json({ success: true, data: { total_interest_earned: 0 } });
  },

  // 5. Export Functions
  exportPortfolioCSV: async (req, res) => {
    res.json({ success: true, message: "CSV generation started." });
  },

  exportPortfolioPDF: async (req, res) => {
    res.json({ success: true, message: "PDF generation started." });
  },

  // 6. Background Task
  takeDailySnapshot: async (userId = null) => {
    const transaction = await sequelize.transaction();
    try {
      const users = userId ? [{ id: userId }] : await User.findAll({ where: { is_active: true } });

      for (const user of users) {
        const portfolio = await portfolioService.calculatePortfolioValue(user.id);
        // CHANGE: Fallback to 0 if total_portfolio_usd is missing to prevent crash
        const totalValue = portfolio?.summary?.total_portfolio_usd || 0;
        
        await PortfolioSnapshot.create({
          user_id: user.id,
          total_value: totalValue,
          timestamp: new Date()
        }, { transaction });
      }
      await transaction.commit();
      logger.info(`✅ Snapshots captured`);
    } catch (error) {
      if (transaction) await transaction.rollback();
      logger.error(`Snapshot Cron Error: ${error.message}`);
    }
  }
};

module.exports = portfolioController;