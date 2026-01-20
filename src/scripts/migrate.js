const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

// Import all models here to ensure they are registered with Sequelize
require('../models'); 

async function runMigrations() {
  try {
    logger.info(`Starting migrations in [${process.env.NODE_ENV || 'development'}] mode...`);

    // Only use 'alter' in development. 
    // In production, we want to be much more careful.
    const isDev = process.env.NODE_ENV !== 'production';
    
    await sequelize.sync({ 
      alter: isDev,
      logging: (msg) => logger.debug(msg) // Send SQL logs to your logger
    });

    // Verify which tables were synced
    const tables = await sequelize.getQueryInterface().showAllTables();
    logger.info(`✅ Database synced. Tables present: ${tables.join(', ')}`);
    
    logger.info('✅ Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

runMigrations();