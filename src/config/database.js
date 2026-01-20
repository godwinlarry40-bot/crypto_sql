const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,      // crypto_api
  process.env.DB_USER,      // root
  process.env.DB_PASSWORD,  // Changed from DB_PASS to match your .env
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[Sequelize]: ${msg}`) : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    timezone: '+00:00'
  }
);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database Connection Error:', error.message);
    if (process.env.NODE_ENV === 'production') process.exit(1);
    return false;
  }
};

module.exports = { sequelize, testConnection };