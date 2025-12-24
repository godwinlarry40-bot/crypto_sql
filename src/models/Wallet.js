const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Wallet = sequelize.define('Wallet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false
  },
  balance: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  availableBalance: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  lockedBalance: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = Wallet;