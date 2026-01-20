const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require("path");
const session = require('express-session');
const app = express();

// Utilities
const logger = require('./src/utils/logger');
const { errorHandler } = require('./src/middleware/errorHandler');

// ========================
// 1. CORE CONFIGURATION (MUST BE FIRST)
// ========================
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// ========================
// 2. SESSION & SECURITY
// ========================
app.use(session({
    secret: process.env.SESSION_SECRET || 'crypto_pro_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": [
                "'self'", 
                "'unsafe-inline'", 
                "'unsafe-eval'", 
                "https://cdn.jsdelivr.net", 
                "https://code.jquery.com" 
            ],
            "style-src": [
                "'self'", 
                "'unsafe-inline'", 
                "https://cdnjs.cloudflare.com", 
                "https://fonts.googleapis.com",
                "https://cdn.jsdelivr.net"
            ],
            "font-src": [
                "'self'", 
                "data:",
                "https://cdnjs.cloudflare.com", 
                "https://fonts.gstatic.com"
            ],
            "connect-src": [
                "'self'", 
                "http://localhost:5000", 
                "http://127.0.0.1:5000", 
                "https://cdn.jsdelivr.net",
                "https://code.jquery.com"
            ],
            "img-src": ["'self'", "data:", "https:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: ['http://localhost:5000', 'http://127.0.0.1:5000'],
    credentials: true
}));

// ========================
// 3. BODY PARSERS (AREA OF CHANGE: MOVED ABOVE ROUTES)
// ========================
// These must come BEFORE any routes that use req.body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(morgan('combined', { stream: logger.stream }));

// ========================
// 4. STATIC FILES
// ========================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'src/public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ========================
// 5. LIMITERS
// ======================== 
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, 
    message: { success: false, message: 'Too many attempts, try again later.' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, 
    message: { success: false, message: 'Too many requests, try again later.' }
});

// ========================
// 6. ROUTES
// ========================
const authRoutes = require('./src/routes/auth.routes');
const walletRoutes = require('./src/routes/wallet.routes');
const investmentRoutes = require('./src/routes/investment.routes');
const marketRoutes = require('./src/routes/market.routes');
const portfolioRoutes = require('./src/routes/portfolio.routes');
const adminRoutes = require('./src/routes/admin.routes');
const webRoutes = require('./src/routes/web.fe');
const authFeRoutes = require('./src/routes/auth.fe');

// Proxy Route
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
        console.error('CMC Proxy Error:', error);
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

// API Endpoints
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/wallets', apiLimiter, walletRoutes); 
app.use('/api/investments', apiLimiter, investmentRoutes); 
app.use('/api/market', apiLimiter, marketRoutes);
app.use('/api/portfolio', apiLimiter, portfolioRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);

// Frontend Routes (Area of change: Placed after API so API routes take precedence)
app.use('/', webRoutes);
app.use('/', authFeRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ========================
// 7. ERROR HANDLING
// ========================

// Fallback for missing API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: "API route not found" });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;