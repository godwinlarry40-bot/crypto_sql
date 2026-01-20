const { sequelize } = require('../config/database');
const User = require('./User');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const Investment = require('./Investment');
const Plan = require('./Plan');
const PortfolioSnapshot = require('./PortfolioSnapshot'); // Added

// --- Define Associations ---

// 1. User <-> Wallet (One-to-Many)
User.hasMany(Wallet, { foreignKey: 'user_id', as: 'wallets', onDelete: 'RESTRICT' });
Wallet.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 2. User <-> Transaction (One-to-Many)
User.hasMany(Transaction, { foreignKey: 'user_id', as: 'transactions', onDelete: 'RESTRICT' });
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 3. User <-> Investment (One-to-Many)
User.hasMany(Investment, { foreignKey: 'user_id', as: 'investments', onDelete: 'RESTRICT' });
Investment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 4. Plan <-> Investment (One-to-Many)
// We use RESTRICT so you can't delete a plan that people are currently invested in.
Plan.hasMany(Investment, { foreignKey: 'plan_id', as: 'investments', onDelete: 'RESTRICT' });
Investment.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// 5. Transaction <-> Investment (One-to-One)
// Links an investment to the specific transaction that funded it.
Transaction.hasOne(Investment, { foreignKey: 'transaction_id', as: 'investment_details' });
Investment.belongsTo(Transaction, { foreignKey: 'transaction_id', as: 'funding_transaction' });

// 6. User <-> PortfolioSnapshot (One-to-Many)
User.hasMany(PortfolioSnapshot, { foreignKey: 'user_id', as: 'snapshots', onDelete: 'CASCADE' });
PortfolioSnapshot.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// --- Export Configuration ---

const models = {
  User,
  Wallet,
  Transaction,
  Investment,
  Plan,
  PortfolioSnapshot,
  sequelize
};

module.exports = models;