const express = require('express');
const router = express.Router();

// Render Home Page
router.get('/', (req, res) => {
    res.render('index', { title: 'TradePro - Professional Trading' });
});

// Render Dashboard
router.get('/dashboard', (req, res) => {
    // You would usually check for authentication here
    res.render('dashboard.ejs', { user: { firstName: 'User' } });
});

module.exports = router;