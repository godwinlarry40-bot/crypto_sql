const moment = require('moment');

const investmentUtils = {
  // 1. Core Earnings Logic
  // Formula: A = P(1 + rt) for simple interest
  calculateInvestmentReturns: (principal, annualRate, days) => {
    const p = parseFloat(principal);
    const r = parseFloat(annualRate) / 100 / 365;
    const returns = p * (1 + r * parseInt(days));
    return parseFloat(returns.toFixed(8));
  },

  calculateDailyEarnings: (principal, annualRate) => {
    const p = parseFloat(principal);
    const dailyRate = parseFloat(annualRate) / 100 / 365;
    return parseFloat((p * dailyRate).toFixed(8));
  },

  // 2. Time & Progress Management
  calculateRemainingDays: (endDate) => {
    const now = moment().startOf('day');
    const end = moment(endDate).startOf('day');
    const diff = end.diff(now, 'days');
    return Math.max(0, diff);
  },

  calculateProgressPercentage: (startDate, endDate) => {
    const start = moment(startDate);
    const end = moment(endDate);
    const now = moment();

    const total = end.diff(start, 'minutes');
    const elapsed = now.diff(start, 'minutes');

    if (total <= 0) return 100;
    const progress = (elapsed / total) * 100;
    return parseFloat(Math.min(100, Math.max(0, progress)).toFixed(2));
  },

  // 3. Payout Scheduling
  calculateNextPayoutDate: (lastPayoutDate, frequency) => {
    const date = moment(lastPayoutDate || new Date());
    
    switch (frequency?.toLowerCase()) {
      case 'daily':   return date.add(1, 'days').toDate();
      case 'weekly':  return date.add(7, 'days').toDate();
      case 'monthly': return date.add(1, 'months').toDate();
      case 'end':     return null; // Paid only at maturity
      default:        return date.add(1, 'days').toDate();
    }
  },

  isPayoutDue: (nextPayoutDate) => {
    if (!nextPayoutDate) return false;
    return moment().isSameOrAfter(moment(nextPayoutDate));
  },

  // 4. Financial Risk Metrics
  // Formula: A = P(1 + r/n)^(nt)
  calculateCompoundInterest: (principal, annualRate, years, frequency = 'daily') => {
    const frequencies = { daily: 365, monthly: 12, quarterly: 4, yearly: 1 };
    const n = frequencies[frequency] || 365;
    const p = parseFloat(principal);
    const r = parseFloat(annualRate) / 100;
    const t = parseFloat(years);

    const amount = p * Math.pow(1 + r / n, n * t);
    return parseFloat(amount.toFixed(8));
  },

  calculateROI: (initial, current) => {
    const i = parseFloat(initial);
    const c = parseFloat(current);
    if (i === 0) return 0;
    return parseFloat((((c - i) / i) * 100).toFixed(2));
  },

  // 5. Advanced Analytics (Max Drawdown)
  calculateMaxDrawdown: (priceHistory) => {
    if (!priceHistory || priceHistory.length === 0) return 0;
    
    let peak = priceHistory[0];
    let maxDD = 0;

    for (const val of priceHistory) {
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return parseFloat((maxDD * 100).toFixed(2));
  },

  // 6. Early Withdrawal Logic
  calculateEarlyWithdrawalPenalty: (principal, earnedSoFar, penaltyPercent = 10) => {
    // Standard logic: Penalty is a % of the principal or earned interest
    const p = parseFloat(principal);
    const penalty = p * (penaltyPercent / 100);
    const netRelease = (p + parseFloat(earnedSoFar)) - penalty;
    
    return {
      penalty_amount: parseFloat(penalty.toFixed(8)),
      net_amount: parseFloat(netRelease.toFixed(8))
    };
  }
};

module.exports = investmentUtils;