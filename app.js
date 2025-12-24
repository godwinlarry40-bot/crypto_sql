const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { testConnection } = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const validators = require('./utils/validators');

// Import routes
const authRoutes = require('./routes/auth.routes');
const walletRoutes = require('./routes/wallet.routes');
const investmentRoutes = require('./routes/investment.routes');
const marketRoutes = require('./routes/market.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Test database connection on startup
testConnection().catch(error => {
  logger.error('Failed to connect to database:', error);
  process.exit(1);
});

// ========================
// SECURITY MIDDLEWARE
// ========================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-api-key'],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return req.ip;
  }
});

// Apply rate limiting to all routes
app.use('/api/', limiter);

// ========================
// REQUEST PARSING MIDDLEWARE
// ========================

// Body parsers
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// Compression
app.use(compression());

// ========================
// LOGGING MIDDLEWARE
// ========================

// Morgan for HTTP request logging
app.use(morgan('combined', { 
  stream: logger.stream,
  skip: (req, res) => {
    // Skip logging for health checks
    return req.path === '/health' && res.statusCode < 400;
  }
}));

// Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.http(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referrer: req.get('Referrer'),
    contentType: req.get('Content-Type')
  });
  
  // Log response time
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`Response ${res.statusCode} in ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });
  });
  
  next();
});

// ========================
// STATIC FILES
// ========================

// Serve uploaded files
if (process.env.UPLOAD_PATH) {
  app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_PATH)));
}

// Serve public files
app.use('/public', express.static(path.join(__dirname, 'public')));

// ========================
// HEALTH CHECK & STATUS
// ========================

app.get('/health', (req, res) => {
  const healthcheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'crypto-investment-backend',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'connected',
    environment: process.env.NODE_ENV,
    node_version: process.version
  };
  
  res.status(200).json(healthcheck);
});

app.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Crypto Investment Platform API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// ========================
// API DOCUMENTATION
// ========================

app.get('/api-docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile',
        logout: 'POST /api/auth/logout'
      },
      wallet: {
        getWallets: 'GET /api/wallet',
        getBalance: 'GET /api/wallet/balance',
        depositAddress: 'POST /api/wallet/deposit-address',
        withdraw: 'POST /api/wallet/withdraw',
        transfer: 'POST /api/wallet/transfer'
      },
      investment: {
        getPlans: 'GET /api/investment/plans',
        createInvestment: 'POST /api/investment',
        getInvestments: 'GET /api/investment',
        getInvestmentDetails: 'GET /api/investment/:id'
      },
      market: {
        getPrices: 'GET /api/market/prices',
        getCoinPrice: 'GET /api/market/prices/:coinId',
        getTrending: 'GET /api/market/trending',
        getStats: 'GET /api/market/stats'
      },
      portfolio: {
        getSummary: 'GET /api/portfolio/summary',
        getPerformance: 'GET /api/portfolio/performance',
        getAllocation: 'GET /api/portfolio/allocation'
      }
    }
  });
});

// ========================
// API ROUTES
// ========================

// Authentication routes
app.use('/api/auth', authRoutes);

// Wallet routes
app.use('/api/wallet', walletRoutes);

// Investment routes
app.use('/api/investment', investmentRoutes);

// Market data routes
app.use('/api/market', marketRoutes);

// Portfolio routes
app.use('/api/portfolio', portfolioRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// ========================
// ERROR HANDLING MIDDLEWARE
// ========================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.originalUrl}`,
    error: 'Not Found',
    statusCode: 404
  });
});

// 404 handler for all other routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: 'Not Found',
    statusCode: 404,
    requestedUrl: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to exit the process
  // process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // In production, you might want to exit the process
  // process.exit(1);
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  // Close server
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connections
      require('./config/database').sequelize.close()
        .then(() => {
          logger.info('Database connections closed');
          process.exit(0);
        })
        .catch((error) => {
          logger.error('Error closing database connections:', error);
          process.exit(1);
        });
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  }
};

// Listen for shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;