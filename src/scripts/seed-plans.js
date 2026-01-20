const { sequelize } = require('../config/database');
const Plan = require('../models/Plan');
const User = require('../models/User'); // Added User model
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const defaultPlans = [
  // ... your plans array stays here ...
  {
    name: 'Basic Plan',
    description: 'Perfect for beginners.',
    min_amount: 10,
    max_amount: 1000,
    duration: 30,
    interest_rate: 5.0,
    payout_frequency: 'daily',
    is_active: true,
    features: ['Daily payouts', 'Capital secured'],
    priority: 1
  },
  // ... other plans ...
];

async function seedDatabase() {
  try {
    await sequelize.sync();
    logger.info('Connected to database for seeding...');

    // 1. Seed Super Admin (Essential for testing protected routes)
    const adminEmail = 'admin@fintech.com';
    const adminExists = await User.findOne({ where: { email: adminEmail } });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('Admin@2025!', 12);
      await User.create({
        firstName: 'System',
        lastName: 'Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'super_admin',
        is_active: true
      });
      logger.info('✅ Super Admin created: ' + adminEmail);
    }

    // 2. Seed Investment Plans
    const existingCount = await Plan.count();
    if (existingCount > 0) {
      logger.info(`Found ${existingCount} existing plans. Skipping plan seed.`);
    } else {
      for (const planData of defaultPlans) {
        await Plan.create(planData);
        logger.info(`Created plan: ${planData.name}`);
      }
      logger.info('✅ Investment plans seeded successfully');
    }

    logger.info('🚀 Seeding process completed.');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedDatabase();