const express = require('express');
const router = express.Router();
// AREA OF CHANGE: Using Sequelize models for data consistency and cleaner queries
const { User, Wallet, Investment, sequelize } = require('../models'); 
const { QueryTypes } = require('sequelize');

// AREA OF CHANGE: Importing authController to reuse your existing logic
const authController = require('../controller/authController');

// ==========================================
// 1. PAGE RENDERING ROUTES (EJS)
// ==========================================

// AREA OF CHANGE: Silence Chrome DevTools internal 404/CSP errors
router.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.status(204).end());

// Alias for login
router.get('/login', (req, res) => res.redirect('/signin'));

// Render Home Page
router.get('/index', (req, res) => {
    res.render('index', { title: 'Home - TradePro' });
});

// AREA OF CHANGE: Added /profile route to fix the 404 error
router.get('/profile', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        if (!user) return res.redirect('/signin');

        res.render('profile', { 
            title: 'My Profile | TradePro',
            user: { 
                firstName: user.first_name,
                lastName: user.last_name,
                name: `${user.first_name} ${user.last_name}`,
                email: user.email,
                phone: user.phone || 'Not set',
                joined: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'
            } 
        });
    } catch (error) {
        console.error("Profile Page Load Error:", error);
        res.status(500).send("Error loading profile page");
    }
});

// Crypto Withdrawal Page
router.get('/withdraw/crypto', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        res.render('crypto-withdraw', { 
            title: 'Crypto Withdrawal | TradePro',
            user: { name: `${user.first_name} ${user.last_name}`, email: user.email } 
        });
    } catch (error) {
        res.status(500).send("Error loading withdrawal page");
    }
});

// Credit Page
router.get('/credit', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        res.render('credit', { 
            title: 'Credit Score | TradePro',
            user: { name: `${user.first_name} ${user.last_name}`, email: user.email } 
        });
    } catch (error) {
        res.status(500).send("Error loading credit page");
    }
});

// Orders Page
router.get('/orders', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        res.render('orders', { 
            title: 'My Orders | TradePro',
            user: { name: `${user.first_name} ${user.last_name}`, email: user.email } 
        });
    } catch (error) {
        res.status(500).send("Error loading orders page");
    }
});

// Investment Page
router.get('/investment', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        res.render('investment', { 
            title: 'Investments | TradePro',
            user: { name: `${user.first_name} ${user.last_name}`, email: user.email } 
        });
    } catch (error) {
        res.status(500).send("Error loading investment page");
    }
});

// Market Page
router.get('/market', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        res.render('market', { 
            title: 'Market | TradePro',
            user: { name: `${user.first_name} ${user.last_name}` } 
        });
    } catch (error) {
        res.status(500).send("Error loading market page");
    }
});
//  history
router.get('/history', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        
        // AREA OF CHANGE: Fetching user transactions for the history page
        const transactions = await Transaction.findAll({
            where: { user_id: req.session.userId },
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        res.render('history', { 
            title: 'Transaction History | TradePro',
            user: { 
                name: `${user.first_name} ${user.last_name}`,
                email: user.email
            },
            transactions: transactions // Passing data to EJS
        });
    } catch (error) {
        console.error("History Page Load Error:", error);
        res.status(500).send("Error loading history page");
    }
});

// Dashboard
router.get('/dashboard', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        const wallet = await Wallet.findOne({ where: { user_id: user.id, currency: "USDT" } });
        const investment = await Investment.findOne({ where: { user_id: user.id, currency: "USDT" } });
        res.render('dashboard', { 
            title: 'User Dashboard | TradePro',
            user: { 
                name: `${user.first_name} ${user.last_name}`,
                balance: wallet ? wallet.balance : 0,
                investments: investment ? investment.amount : 0,
                profit: investment ? investment.total_earned : 0
            } 
        });
    } catch (error) {
        res.status(500).send("Error loading dashboard");
    }
});

// Settings Page
router.get('/settings', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/signin');
    try {
        const user = await User.findByPk(req.session.userId);
        res.render('settings', { 
            title: 'Settings | TradePro',
            user: { 
                firstName: user.first_name,
                lastName: user.last_name,
                name: `${user.first_name} ${user.last_name}`, 
                email: user.email,
                phone: user.phone
            } 
        });
    } catch (error) {
        res.status(500).send("Error loading settings");
    }
});

// Auth & Financial Pages
router.get('/signin', (req, res) => res.render('sign-in', { title: 'Sign In - TradePro' }));
router.get('/signup', (req, res) => res.render('sign-up', { title: 'Sign Up - TradePro' }));
router.get('/bank', (req, res) => req.session.userId ? res.render('bank', { title: 'Bank Transfer' }) : res.redirect('/signin'));
router.get('/cryptodep', (req, res) => req.session.userId ? res.render('cryptodep', { title: 'Crypto Deposit' }) : res.redirect('/signin'));

// ==========================================
// 2. ACTION & API ROUTES
// ==========================================

router.get('/api/user/stats', async (req, res) => {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    try {
        const wallet = await Wallet.findOne({ where: { user_id: req.session.userId, currency: "USDT" } });
        const inv = await Investment.findOne({ where: { user_id: req.session.userId, currency: "USDT" } });
        res.json({ success: true, balance: wallet ? wallet.balance : 0, investments: inv ? inv.amount : 0, profit: inv ? inv.total_earned : 0 });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

router.post('/settings/update/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    req.user = { id: req.session.userId };
    return authController.updateProfile(req, res);
});

router.post('/settings/update/security/security', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    req.user = { id: req.session.userId };
    req.body.old_password = req.body.currentPassword;
    req.body.new_password = req.body.newPassword;
    return authController.changePassword(req, res);
});

// ==========================================
// 3. LOGOUT & EXPORTS
// ==========================================

router.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            return res.redirect('/signin');
        });
    } else {
        res.redirect('/signin');
    }
});

module.exports = router;