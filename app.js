const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require("path");
const session = require('express-session');
const axios = require('axios'); // AREA OF CHANGE: Added axios for the CMC proxy route
const app = express();

const logger = require('./src/utils/logger');
const { errorHandler } = require('./src/middleware/errorHandler');

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(session({
    name: 'connect.sid', 
    secret: process.env.SESSION_SECRET || 'crypto_pro_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true, 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// AREA OF CHANGE: Updated connect-src to allow CoinGecko fallback and fixed proxy headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://code.jquery.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            "font-src": ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            "connect-src": [
                "'self'", 
                "http://localhost:5000", 
                "http://127.0.0.1:5000", 
                "https://cdn.jsdelivr.net",
                "https://code.jquery.com",
                "https://api.coingecko.com" // AREA OF CHANGE: Allowed CoinGecko for market.js fallback
            ],
            "img-src": [
                "'self'", 
                "data:", 
                "https:", 
                "https://ui-avatars.com"
            ]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: ['http://localhost:5000', 'http://127.0.0.1:5000'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(morgan('combined', { stream: logger.stream }));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'src/public')));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, 
    message: { success: false, message: 'Too many attempts, try again later.' }
});

// ROUTE IMPORTS
const authRoutes = require('./src/routes/auth.routes');
const walletRoutes = require('./src/routes/wallet.routes');
const investmentRoutes = require('./src/routes/investment.routes');
const marketRoutes = require('./src/routes/market.routes');
const portfolioRoutes = require('./src/routes/portfolio.routes');
const adminRoutes = require('./src/routes/admin.routes');
const webRoutes = require('./src/routes/web.fe');
const authFeRoutes = require('./src/routes/auth.fe');

// API ROUTES
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/wallets', walletRoutes); 
app.use('/api/investments', investmentRoutes); 
app.use('/api/market', marketRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/admin', adminRoutes);

// AREA OF CHANGE: Added Proxy route for CoinMarketCap to fix 404 in market.js
app.get('/api/proxy/cmc', async (req, res) => {
    try {
        const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
            headers: {
                'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY || '64190c76-f38b-4a57-893f-c689f2a48705', // Use your key or this test one
            },
            params: { start: '1', limit: '100', convert: 'USD' }
        });
        res.json(response.data);
    } catch (error) {
        logger.error("CMC Proxy Error: " + error.message);
        res.status(500).json({ success: false, message: "Proxy failed" });
    }
});

// FRONTEND ROUTES
app.use('/', webRoutes);
app.use('/', authFeRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: "API route not found" });
});

app.use(errorHandler);

module.exports = app;