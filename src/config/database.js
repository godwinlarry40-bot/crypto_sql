const { Sequelize } = require('sequelize');
require('dotenv').config();

// Change: Added a check for DATABASE_URL (common on Render/Production)
// If DATABASE_URL exists, it uses that. Otherwise, it falls back to your local individual variables.
const sequelize = process.env.DATABASE_URL 
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[Sequelize]: ${msg}`) : false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false // Change: Added for secure connections often required by cloud databases
        }
      },
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
      define: { timestamps: true, underscored: true, freezeTableName: true },
      timezone: '+00:00'
    })
  : new Sequelize(
      process.env.DB_NAME, 
      process.env.DB_USER, 
      process.env.DB_PASSWORD, 
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[Sequelize]: ${msg}`) : false,
        pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
        define: { timestamps: true, underscored: true, freezeTableName: true },
        timezone: '+00:00'
      }
    );

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL Database connected successfully');
    return true;
  } catch (error) {
    // Change: Added more detail to the error log to help you debug on Render logs
    console.error('❌ Database Connection Error:', error.name, error.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('Check your Environment Variables on Render!');
      process.exit(1);
    }
    return false;
  }
};

module.exports = { sequelize, testConnection };