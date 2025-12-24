const { sequelize } = require('../src/config/database');

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection successful!');
    
    // Test query
    const [results] = await sequelize.query('SELECT 1 + 1 AS result');
    console.log('✅ Test query successful:', results[0].result);
    
    // Get database version
    const [version] = await sequelize.query('SELECT VERSION() as version');
    console.log('✅ Database version:', version[0].version);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();