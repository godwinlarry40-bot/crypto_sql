const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  wallet_id: {
    type: DataTypes.UUID,
    allowNull: true // Can be null for system-wide adjustments
  },
  type: {
    type: DataTypes.ENUM(
      'deposit', 
      'withdrawal', 
      'transfer_in', 
      'transfer_out', 
      'investment_purchase', 
      'investment_earning', 
      'referral_bonus',
      'fee'
    ),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(36, 18),
    allowNull: false,
    validate: { min: 0 }
  },
  fee: {
    type: DataTypes.DECIMAL(36, 18),
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    set(val) { this.setDataValue('currency', val.toUpperCase()); }
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled', 'processing'),
    defaultValue: 'pending'
  },
  tx_hash: { // Crypto transaction hash
    type: DataTypes.STRING,
    allowNull: true,
    unique: true // Prevent duplicate deposit processing
  },
  from_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  to_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON, // For storing investment_id, notes, or extra API data
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'transactions',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['tx_hash'] }
  ]
});

module.exports = Transaction;