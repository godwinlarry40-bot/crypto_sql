module.exports = {
  CRYPTO_CURRENCIES: [
    { symbol: 'BTC', name: 'Bitcoin', decimal: 8 },
    { symbol: 'ETH', name: 'Ethereum', decimal: 18 },
    { symbol: 'USDT', name: 'Tether', decimal: 6 },
    { symbol: 'BNB', name: 'Binance Coin', decimal: 8 },
    { symbol: 'XRP', name: 'Ripple', decimal: 6 },
    { symbol: 'ADA', name: 'Cardano', decimal: 6 },
    { symbol: 'DOGE', name: 'Dogecoin', decimal: 8 },
    { symbol: 'SOL', name: 'Solana', decimal: 9 }
  ],
  
  INVESTMENT_PLANS: [
    {
      name: 'Basic',
      duration: 30,
      interest_rate: 5,
      min_amount: 100,
      max_amount: 5000
    },
    {
      name: 'Premium',
      duration: 60,
      interest_rate: 8,
      min_amount: 5000,
      max_amount: 50000
    },
    {
      name: 'VIP',
      duration: 90,
      interest_rate: 12,
      min_amount: 50000,
      max_amount: 100000
    }
  ],
  
  TRANSACTION_TYPES: {
    DEPOSIT: 'deposit',
    WITHDRAWAL: 'withdrawal',
    TRANSFER: 'transfer',
    INVESTMENT: 'investment',
    INTEREST: 'interest'
  },
  
  TRANSACTION_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },
  
  INVESTMENT_STATUS: {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  }
};