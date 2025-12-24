const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  interestRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  durationDays: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  minAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  maxAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: true
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'USDT'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = Plan;