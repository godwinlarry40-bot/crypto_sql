require('dotenv').config();
const http = require('http');
const express = require('express'); 
// Area of change: Kept express-session for user state management
const session = require('express-session');
// Area of change: Removed 'cluster' and 'os' modules as they are no longer needed
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const app = require('./app'); 
const { sequelize } = require('./src/models');
const investmentService = require('./src/services/investmentService');
const { processMaturedInvestments } = require('./src/workers/investmentWorker'); 
const portfolioController = require('./src/controller/portfolioController');
const logger = require('./src/utils/logger');
// Area of change: Imported syncPlans from constants to allow auto-seeding
const { syncPlans } = require('./src/config/constants');

// Middleware for parsing form and JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Area of change: Session Configuration (MemoryStore works fine now without clusters)
app.use(session({
    secret: process.env.SESSION_SECRET || 'crypto_pro_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Secure Proxy route
app.get('/api/proxy/cmc', async (req, res) => {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        
        const response = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=10&convert=USD', {
            method: 'GET',
            headers: {
                'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        logger.error(`CMC Proxy Error: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

const PORT = process.env.PORT || 5000;

// Area of change: Simplified login route; req.session now persists in a single process
app.post('/api/auth/login', (req, res) => {
    const { email, username, password } = req.body;
    const identifier = email || username;
    
    if (identifier === "godwinlarry47@gmail.com" && password === "12345678") {
        const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1d' });
        
        // Save token to session
        req.session.token = token;

        return res.json({
            success: true,
            message: "Login successful",
            redirectUrl: "/dashboard"
        });
    } else {
        return res.status(401).json({ 
            success: false, 
            message: "Invalid email or password" 
        });
    }
});

app.get('/login', (req, res) => {
    res.redirect('/signin');
});

app.get('/signin', (req, res) => {
    res.render('sign-in', { title: 'Sign In - TradePro' });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) logger.error('Logout error:', err);
        res.clearCookie('connect.sid'); 
        res.redirect('/signin');
    });
});

// Area of change: Removed cluster-specific Master/Worker logic. Everything runs in one block.
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
      credentials: true
    }
});

// Area of change: Updated startServer to include the syncPlans logic
const startServer = async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ force: false });
        
        // Area of change: Call the sync logic from constants to fix the "Plan not found" error
        await syncPlans(); 
        
        logger.info('✅ Database connected and Plans synced from constants');

        // Start Cron Job
        if (process.env.NODE_ENV !== 'test') {
            cron.schedule('1 0 * * *', async () => {
                try {
                    await processMaturedInvestments(); 
                    await portfolioController.takeDailySnapshot();
                    logger.info('✅ Automated payout cycle completed.');
                } catch (err) {
                    logger.error('Payout Cron Failure', err);
                }
            });
        }

        server.listen(PORT, () => {
            logger.info(`🚀 Server listening on port ${PORT}`);
        });
    } catch (err) {
        logger.error('❌ Server Initialization Failed', err);
        process.exit(1);
    }
};

io.on('connection', (socket) => {
    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.join(`user_${decoded.id}`);
            socket.emit('authenticated', { status: 'success' });
        } catch (err) {
            socket.emit('auth_error', { message: 'Invalid Token' });
        }
    });
});

startServer();

const shutdown = async () => {
    logger.info('Server shutting down...');
    server.close(async () => {
        await sequelize.close();
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);