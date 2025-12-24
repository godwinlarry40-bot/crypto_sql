const { sequelize } = require('../config/database');
const User = require('./User');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const Investment = require('./Investment');
const Plan = require('./Plan');

// Initialize models
const models = {
  User,
  Wallet,
  Transaction,
  Investment,
  Plan,
  sequelize
};

// Define associations
User.hasMany(Wallet, { foreignKey: 'user_id', as: 'wallets' });
Wallet.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Transaction, { foreignKey: 'user_id', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Investment, { foreignKey: 'user_id', as: 'investments' });
Investment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Plan.hasMany(Investment, { foreignKey: 'plan_id', as: 'investments' });
Investment.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

Investment.belongsTo(Transaction, { foreignKey: 'transaction_id', as: 'transaction' });
Transaction.hasOne(Investment, { foreignKey: 'transaction_id', as: 'investment' });

// Sync function
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('✅ Database synchronized successfully');
  } catch (error) {
    console.error('❌ Database synchronization failed:', error);
    process.exit(1);
  }
};

module.exports = {
  ...models,
  syncDatabase
};