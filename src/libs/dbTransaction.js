const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

const dbTransaction = {
  // Execute with transaction
  executeWithTransaction: async (callback, options = {}) => {
    const transaction = await sequelize.transaction();
    
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      logger.error(`Transaction failed: ${error.message}`);
      throw error;
    }
  },

  // Retry transaction on deadlock
  executeWithRetry: async (callback, maxRetries = 3, delay = 100) => {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await dbTransaction.executeWithTransaction(callback);
      } catch (error) {
        lastError = error;
        
        // Check if it's a deadlock error
        if (error.name === 'SequelizeDatabaseError' && error.message.includes('deadlock')) {
          if (i < maxRetries - 1) {
            logger.warn(`Deadlock detected, retrying... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            continue;
          }
        }
        
        throw error;
      }
    }
    
    throw lastError;
  },

  // Batch insert with transaction
  batchInsert: async (model, data, transaction) => {
    try {
      return await model.bulkCreate(data, { transaction });
    } catch (error) {
      logger.error(`Batch insert error: ${error.message}`);
      throw error;
    }
  },

  // Batch update with transaction
  batchUpdate: async (model, data, whereField, transaction) => {
    try {
      const updates = [];
      
      for (const item of data) {
        const update = await model.update(item, {
          where: { [whereField]: item[whereField] },
          transaction
        });
        updates.push(update);
      }
      
      return updates;
    } catch (error) {
      logger.error(`Batch update error: ${error.message}`);
      throw error;
    }
  },

  // Execute multiple operations in sequence
  executeSequence: async (operations, transaction) => {
    const results = [];
    
    for (const operation of operations) {
      try {
        const result = await operation(transaction);
        results.push(result);
      } catch (error) {
        logger.error(`Sequence operation failed: ${error.message}`);
        throw error;
      }
    }
    
    return results;
  }
};

module.exports = dbTransaction;