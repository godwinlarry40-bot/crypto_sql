const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Investment = sequelize.define('Investment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: { type: DataTypes.UUID, allowNull: false },
  // START: Changed plan_id to INTEGER to match Plan.js
  plan_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  // END: plan_id change
  amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
  currency: { type: DataTypes.STRING(10), allowNull: false },
  interest_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  duration_days: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('active', 'completed', 'cancelled', 'pending'), defaultValue: 'active' },
  start_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  end_date: { type: DataTypes.DATE, allowNull: false }
}, {
  tableName: 'investments',
  underscored: true
});

module.exports = Investment;