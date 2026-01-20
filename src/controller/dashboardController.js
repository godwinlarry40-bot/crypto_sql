const Wallet = require('../models/Wallet');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');

const dashboardController = {
    getStats: async (req, res) => {
        try {
            const userId = req.user.id;

            // 1. Total Balance: Sum of all wallet balances for the user
            const totalBalance = await Wallet.sum('balance', { 
                where: { user_id: userId } 
            }) || 0;

            // 2. Active Investments: Sum of principal in 'active' status
            const activeInvestments = await Investment.sum('amount', {
                where: { user_id: userId, status: 'active' }
            }) || 0;

            // 3. Total Profit: Sum of all investment earnings
            const totalProfit = await Transaction.sum('amount', {
                where: { 
                    user_id: userId, 
                    type: 'investment_earning', 
                    status: 'completed' 
                }
            }) || 0;

            res.json({
                success: true,
                data: {
                    total_balance: parseFloat(totalBalance).toFixed(2),
                    active_investments: parseFloat(activeInvestments).toFixed(2),
                    total_profit: parseFloat(totalProfit).toFixed(2)
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

module.exports = dashboardController;