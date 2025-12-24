const moment = require('moment');

const investmentUtils = {
  // Calculate investment returns
  calculateInvestmentReturns: (principal, annualRate, days) => {
    const dailyRate = annualRate / 365 / 100;
    const returns = principal * (1 + dailyRate * days);
    return parseFloat(returns.toFixed(8));
  },

  // Calculate daily earnings
  calculateDailyEarnings: (principal, annualRate) => {
    const dailyRate = annualRate / 365 / 100;
    return parseFloat((principal * dailyRate).toFixed(8));
  },

  // Calculate earnings for a specific period
  calculateEarningsForPeriod: (principal, annualRate, startDate, endDate) => {
    const days = moment(endDate).diff(moment(startDate), 'days');
    const dailyRate = annualRate / 365 / 100;
    return parseFloat((principal * dailyRate * days).toFixed(8));
  },

  // Calculate remaining days
  calculateRemainingDays: (endDate) => {
    const now = moment();
    const end = moment(endDate);
    return Math.max(0, end.diff(now, 'days'));
  },

  // Calculate progress percentage
  calculateProgressPercentage: (startDate, endDate) => {
    const now = moment();
    const start = moment(startDate);
    const end = moment(endDate);
    
    const totalDuration = end.diff(start, 'hours');
    const elapsedDuration = now.diff(start, 'hours');
    
    if (totalDuration <= 0) return 100;
    return Math.min(100, Math.max(0, (elapsedDuration / totalDuration) * 100));
  },

  // Calculate next payout date
  calculateNextPayoutDate: (lastPayoutDate, frequency) => {
    const date = moment(lastPayoutDate || new Date());
    
    switch (frequency) {
      case 'daily':
        return date.add(1, 'days').toDate();
      case 'weekly':
        return date.add(7, 'days').toDate();
      case 'monthly':
        return date.add(1, 'months').toDate();
      case 'end':
        return null;
      default:
        return date.add(1, 'days').toDate();
    }
  },

  // Check if payout is due
  isPayoutDue: (nextPayoutDate) => {
    if (!nextPayoutDate) return false;
    return moment().isSameOrAfter(moment(nextPayoutDate));
  },

  // Calculate penalty for early withdrawal
  calculateEarlyWithdrawalPenalty: (principal, expectedReturns, daysElapsed, totalDays) => {
    // Minimum penalty: 10% of expected interest
    // Penalty decreases linearly with time
    const expectedInterest = expectedReturns - principal;
    const minPenalty = expectedInterest * 0.1;
    const maxPenalty = expectedInterest * 0.5;
    
    const completionRatio = daysElapsed / totalDays;
    const penalty = maxPenalty - (maxPenalty - minPenalty) * completionRatio;
    
    return Math.max(minPenalty, Math.min(maxPenalty, penalty));
  },

  // Calculate compound interest
  calculateCompoundInterest: (principal, annualRate, periods, frequency = 'daily') => {
    let n;
    switch (frequency) {
      case 'daily':
        n = 365;
        break;
      case 'monthly':
        n = 12;
        break;
      case 'quarterly':
        n = 4;
        break;
      case 'yearly':
        n = 1;
        break;
      default:
        n = 365;
    }
    
    const rate = annualRate / 100;
    const amount = principal * Math.pow(1 + rate / n, n * periods);
    return parseFloat(amount.toFixed(8));
  },

  // Calculate ROI (Return on Investment)
  calculateROI: (initialInvestment, currentValue) => {
    if (initialInvestment === 0) return 0;
    return ((currentValue - initialInvestment) / initialInvestment) * 100;
  },

  // Calculate Sharpe ratio (simplified)
  calculateSharpeRatio: (returns, riskFreeRate = 0.02) => {
    if (returns.length === 0) return 0;
    
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    return (meanReturn - riskFreeRate) / stdDev;
  },

  // Calculate maximum drawdown
  calculateMaxDrawdown: (values) => {
    if (values.length === 0) return 0;
    
    let peak = values[0];
    let maxDrawdown = 0;
    
    for (const value of values) {
      if (value > peak) {
        peak = value;
      }
      
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown * 100; // Return as percentage
  },

  // Generate investment schedule
  generateInvestmentSchedule: (investment) => {
    const schedule = [];
    const startDate = moment(investment.start_date);
    const endDate = moment(investment.end_date);
    const totalDays = endDate.diff(startDate, 'days');
    const dailyEarnings = calculateDailyEarnings(investment.amount, investment.interest_rate);
    
    let currentDate = startDate.clone();
    let cumulativeEarnings = 0;
    
    while (currentDate.isSameOrBefore(endDate)) {
      cumulativeEarnings += dailyEarnings;
      
      schedule.push({
        date: currentDate.format('YYYY-MM-DD'),
        day: currentDate.diff(startDate, 'days') + 1,
        daily_earnings: dailyEarnings,
        cumulative_earnings: cumulativeEarnings,
        is_payout_day: isPayoutDay(currentDate, investment.payout_frequency)
      });
      
      currentDate.add(1, 'day');
    }
    
    return schedule;
  },

  // Validate investment parameters
  validateInvestmentParameters: (amount, plan) => {
    const errors = [];
    
    if (amount < plan.min_amount) {
      errors.push(`Minimum investment amount is ${plan.min_amount}`);
    }
    
    if (plan.max_amount && amount > plan.max_amount) {
      errors.push(`Maximum investment amount is ${plan.max_amount}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

// Helper function to check if it's a payout day
function isPayoutDay(date, frequency) {
  switch (frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return date.day() === 1; // Monday
    case 'monthly':
      return date.date() === 1; // 1st of month
    case 'end':
      return false;
    default:
      return false;
  }
}

module.exports = investmentUtils;