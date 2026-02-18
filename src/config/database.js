const { Sequelize } = require('sequelize');
require('dotenv').config();

// Area of change: Added logic to switch between DATABASE_URL and individual credentials
const isProduction = process.env.NODE_ENV === 'production';

let sequelize;

if (process.env.DATABASE_URL) {
  // If Render provides a single connection string, use it
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Required for many cloud MySQL providers
      }
    }
  });
} else {
  // Local development fallback
  sequelize = new Sequelize(
    process.env.DB_NAME || 'crypto_api', 
    process.env.DB_USER || 'root', 
    process.env.DB_PASSWORD, 
    {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: isProduction ? false : (msg) => console.log(`[Sequelize]: ${msg}`),
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true
      }
    }
  );
}

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL Database connected successfully');
    return true;
  } catch (error) {
    // Area of change: Better logging to see exactly why it failed on Render
    console.error('❌ Database Connection Error:', error.message);
    if (isProduction) process.exit(1);
    return false;
  }
};

module.exports = { sequelize, testConnection };