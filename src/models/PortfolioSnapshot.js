const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PortfolioSnapshot = sequelize.define('PortfolioSnapshot', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  total_balance_usd: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0.00,
    allowNull: false
  },
  total_invested_usd: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0.00,
    allowNull: false
  },
  total_profit_usd: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0.00,
    allowNull: false
  },
  snapshot_date: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  tableName: 'portfolio_snapshots',
  underscored: true,
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'snapshot_date']
    }
  ]
});

module.exports = PortfolioSnapshot;