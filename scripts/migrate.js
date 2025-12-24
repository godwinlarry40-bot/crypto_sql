const { sequelize } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Create tables
    await sequelize.sync({ alter: true });
    
    logger.info('✅ Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migrations
runMigrations();