require('dotenv').config();
const http = require('http');
// AREA OF CHANGE: server.js should NOT redefine app middleware if app.js is required
const app = require('./app'); 
const { Server } = require('socket.io');
const cron = require('node-cron');

const { sequelize } = require('./src/models');
const { processMaturedInvestments } = require('./src/workers/investmentWorker'); 
const portfolioController = require('./src/controller/portfolioController');
const logger = require('./src/utils/logger');
const { syncPlans } = require('./src/config/constants');

const PORT = process.env.PORT || 5000;

// AREA OF CHANGE: Moved fetch logic inside the route to avoid initialization issues
app.get('/api/proxy/cmc', async (req, res) => {
    try {
        const { default: fetch } = await import('node-fetch');
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

// AREA OF CHANGE: Removed duplicate /api/auth/login. Ensure this logic is in src/routes/auth.routes.js

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
      credentials: true
    }
});

const startServer = async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ force: false });
        await syncPlans(); 
        logger.info('✅ Database connected and Plans synced');

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
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
            socket.join(`user_${decoded.id}`);
            socket.emit('authenticated', { status: 'success' });
        } catch (err) {
            socket.emit('auth_error', { message: 'Invalid Token' });
        }
    });
});

startServer();

const shutdown = async () => {
    server.close(async () => {
        await sequelize.close();
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);