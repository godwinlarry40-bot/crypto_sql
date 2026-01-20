const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plan = sequelize.define('Plan', {
  // START: Changed id from UUID to INTEGER to match constants.js
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // END: ID change
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  interest_rate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  duration_days: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  min_amount: {
    type: DataTypes.DECIMAL(36, 18),
    allowNull: false
  },
  max_amount: {
    type: DataTypes.DECIMAL(36, 18),
    allowNull: false
  },
  payout_frequency: {
    // START: Added 'maturity' to match your default plans
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'maturity'),
    defaultValue: 'maturity'
    // END: Added maturity
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'USDT'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'plans',
  underscored: true,
  timestamps: true
});

module.exports = Plan;