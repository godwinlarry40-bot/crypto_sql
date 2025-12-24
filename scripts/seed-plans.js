const { sequelize } = require('../src/config/database');
const Plan = require('../src/models/Plan');
const logger = require('../src/utils/logger');

const defaultPlans = [
  {
    name: 'Basic Plan',
    description: 'Perfect for beginners. Start your investment journey with minimal risk.',
    min_amount: 10,
    max_amount: 1000,
    duration: 30,
    interest_rate: 5.0,
    payout_frequency: 'daily',
    is_active: true,
    features: [
      'Daily payouts',
      'Low minimum investment',
      'Perfect for beginners',
      'Capital secured'
    ],
    priority: 1
  },
  {
    name: 'Silver Plan',
    description: 'For investors looking for higher returns with moderate risk.',
    min_amount: 1001,
    max_amount: 5000,
    duration: 60,
    interest_rate: 7.5,
    payout_frequency: 'daily',
    is_active: true,
    features: [
      'Daily payouts',
      'Higher returns',
      'Auto-compound option',
      'Priority support'
    ],
    priority: 2
  },
  {
    name: 'Gold Plan',
    description: 'Premium investment plan for experienced investors seeking maximum returns.',
    min_amount: 5001,
    max_amount: 20000,
    duration: 90,
    interest_rate: 10.0,
    payout_frequency: 'daily',
    is_active: true,
    features: [
      'Daily payouts',
      'Maximum returns',
      'Auto-compound enabled',
      'VIP support',
      'Early withdrawal option'
    ],
    priority: 3
  },
  {
    name: 'Platinum Plan',
    description: 'Exclusive plan for high-net-worth investors with custom terms.',
    min_amount: 20001,
    max_amount: 100000,
    duration: 180,
    interest_rate: 15.0,
    payout_frequency: 'daily',
    is_active: true,
    features: [
      'Daily payouts',
      'Highest returns',
      'Custom investment terms',
      'Dedicated account manager',
      'Flexible withdrawal',
      'Priority processing'
    ],
    priority: 4
  },
  {
    name: 'Weekly High Yield',
    description: 'Short-term high-yield investment with weekly payouts.',
    min_amount: 100,
    max_amount: 5000,
    duration: 7,
    interest_rate: 2.0,
    payout_frequency: 'weekly',
    is_active: true,
    features: [
      'Weekly payouts',
      'Short-term commitment',
      'Quick returns',
      'Perfect for testing'
    ],
    priority: 5
  },
  {
    name: 'Monthly Income',
    description: 'Steady monthly income with compound interest benefits.',
    min_amount: 500,
    max_amount: 10000,
    duration: 30,
    interest_rate: 6.0,
    payout_frequency: 'monthly',
    is_active: true,
    features: [
      'Monthly payouts',
      'Compound interest',
      'Stable returns',
      'Auto-renewal option'
    ],
    priority: 6
  }
];

async function seedPlans() {
  try {
    // Sync database
    await sequelize.sync();
    
    // Check if plans already exist
    const existingCount = await Plan.count();
    
    if (existingCount > 0) {
      logger.info(`Found ${existingCount} existing plans. Skipping seed.`);
      return;
    }
    
    // Create plans
    for (const planData of defaultPlans) {
      await Plan.create(planData);
      logger.info(`Created plan: ${planData.name}`);
    }
    
    logger.info('✅ Investment plans seeded successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error seeding plans:', error.message);
    process.exit(1);
  }
}

// Run seed
seedPlans();