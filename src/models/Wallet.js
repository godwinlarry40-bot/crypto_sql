const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Wallet = sequelize.define('Wallet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  address: {
    type: DataTypes.STRING,
    // CHANGE: Kept as false per your requirement, ensuring generation happens in controller
    allowNull: false, 
    unique: true,
    comment: 'The deposit address for this specific wallet/currency'
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    set(val) { this.setDataValue('currency', val.toUpperCase()); }
  },
  balance: {
    type: DataTypes.DECIMAL(36, 18),
    defaultValue: 0,
    // CHANGE: Added Getter to ensure mathematical operations treat this as a number
    get() {
      const value = this.getDataValue('balance');
      return value === null ? 0 : parseFloat(value);
    },
    validate: { min: 0 }
  },
  locked_balance: {
    type: DataTypes.DECIMAL(36, 18),
    defaultValue: 0,
    // CHANGE: Added Getter to prevent string-based math errors
    get() {
      const value = this.getDataValue('locked_balance');
      return value === null ? 0 : parseFloat(value);
    },
    validate: { min: 0 }
  },
  available_balance: {
    type: DataTypes.VIRTUAL,
    get() {
      // CHANGE: Now uses the fixed getters above for accurate subtraction
      return this.balance - this.locked_balance;
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'wallets',
  // CHANGE: Ensures user_id becomes user_id in SQL and createdAt becomes created_at
  underscored: true, 
  timestamps: true,
  indexes: [
    { unique: true, fields: ['user_id', 'currency'] }
  ]
});

module.exports = Wallet;