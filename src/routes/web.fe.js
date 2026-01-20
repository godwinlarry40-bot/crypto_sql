const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// --- PAGE RENDERING ROUTES ---

// Render Home Page
router.get('/index', (req, res) => {
    res.render('index', { title: 'Home - TradePro' });
});

// Area of change: Ensures dashboard.ejs renders with user data
router.get('/dashboard', (req, res) => {
    res.render('dashboard', { 
        title: 'User Dashboard | TradePro',
        user: { name: 'Godwin Larry' } 
    });
});

// Render Login Page
router.get('/signin', (req, res) => {
    res.render('sign-in', { title: 'Sign In - TradePro' });
});

// Render Registration Page
router.get('/signup', (req, res) => {
    res.render('sign-up', { 
        title: 'Sign Up - TradePro', 
        user: { firstName: 'Larry' } 
    });
});

// Forgot Password Page
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { 
        title: 'Recover Account | TradePro',
        error: null, 
        success: null 
    });
});

// Reset Password Page
router.get('/reset-password/:token', (req, res) => {
    const { token } = req.params;
    res.render('reset-password', { 
        title: 'New Password | TradePro',
        token: token,
        error: null,
        success: null
    });
});

// Financial Pages
router.get('/bank', (req, res) => {
    res.render('bank', { title: 'Bank Transfer - TradePro' });
});

router.get('/credit', (req, res) => {
    res.render('credit', { title: 'Credit Deposit - TradePro' });
});

router.get('/cryptodep', (req, res) => {
    res.render('cryptodep', { title: 'Crypto Deposit - TradePro' });
});

router.get('/withdraw/crypto', (req, res) => {
    res.render('crypto-withdraw', { title: 'Crypto Withdrawal | TradePro' });
});

// Market & Investment
router.get('/investment', (req, res) => {
    res.render('investment', { title: 'Investment Plans | TradePro' });
});

router.get('/market', (req, res) => {
    res.render('market', { title: 'Crypto Market Data | TradePro' });
});

// Area of change: Settings Page with dynamic user object
router.get('/settings', (req, res) => {
    res.render('settings', { 
        title: 'Settings | TradePro',
        user: { name: 'Felix Lucky' } 
    });
});
router.get('/orders', (req, res) => {
    res.render('orders', { title: 'My Investment Orders' });
});

// Serves the HTML page
router.get('/history', (req, res) => {
    res.render('history');
});
// --- API & POST ENDPOINTS ---

// Auth POST Handlers
router.post('/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    res.render('forgot-password', {
        title: 'Recover Account | TradePro',
        error: null,
        success: 'Recovery instructions have been sent to your email.'
    });
});

router.post('/auth/reset-password', async (req, res) => {
    const { token, password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
        return res.render('reset-password', {
            title: 'New Password | TradePro',
            token,
            error: 'Passwords do not match.',
            success: null
        });
    }
    res.render('sign-in', { 
        title: 'Sign In - TradePro',
        success: 'Password updated successfully. You can now login.' 
    });
});

// Area of change: Login API remains separate to avoid conflict with settings
router.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === "godwinlarry47@gmail.com" && password === "12345678") {
        return res.json({
            success: true,
            message: "Login successful",
            redirectUrl: "/dashboard",
            user: { fullName: "Godwin Larry", email: email }
        });
    } else {
        return res.status(401).json({ 
            success: false, 
            message: "Invalid email or password" 
        });
    }
});

// Area of change: Integrated Settings Update Route to handle security and profile separately
router.post('/settings/update/security/:type', (req, res) => {
    const { type } = req.params;
    
    if (type === 'security') {
        const { currentPassword, newPassword } = req.body;
        // Hardcoded check for your testing
        const ACTUAL_PASSWORD = "12345678"; 
        
        if (currentPassword !== ACTUAL_PASSWORD) {
            return res.status(401).json({ 
                success: false, 
                message: "Current password incorrect" 
            });
        }
        
        console.log(`[Security] Password updated for user. New password is: ${newPassword}`);
        return res.json({ success: true, message: "Security settings updated successfully!" });
    }

    if (type === 'profile') {
        console.log(`[Profile] Update received:`, req.body);
        return res.json({ success: true, message: "Profile details updated successfully!" });
    }
    
    res.json({ success: true, message: `${type} update processed` });
});

// Data API Routes
router.get('/api/user/dashboard-data', (req, res) => {
    res.json({
        fullName: "Godwin Larry",
        balance: 12500.75,
        investments: 5000.00,
        profit: 1200.50,
        transactions: [
            { date: "2026-01-10", type: "Crypto Deposit (BTC)", amount: "+0.005 BTC", status: "Completed" },
            { date: "2026-01-08", type: "Bank Withdrawal", amount: "-$500.00", status: "Pending" }
        ]
    });
});

router.get('/api/market-data', async (req, res) => {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

module.exports = router;