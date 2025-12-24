require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const app = require('./app');
const { sequelize } = require('./config/database');
const investmentService = require('./services/investmentService');
const logger = require('./utils/logger');
const constants = require('./config/constants');

const PORT = process.env.PORT || 5000;

// Cluster mode for production
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  console.log(`🚀 Master ${process.pid} is running`);
  console.log(`📊 CPU Cores: ${numCPUs}`);
  
  // Fork workers (use 4 cores max or available cores)
  const workers = Math.min(numCPUs, 4);
  console.log(`👥 Creating ${workers} worker processes`);
  
  for (let i = 0; i < workers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died with code ${code}`);
    console.log(`🔄 Restarting worker...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.process.pid} is online`);
  });

  // Don't run server code in master
  return;
}

// Worker process code
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('New client connected', { 
    socketId: socket.id,
    ip: socket.handshake.address 
  });
  
  // Authenticate user
  socket.on('authenticate', (token) => {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Store user info on socket
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      
      // Join user-specific room
      socket.join(`user_${decoded.id}`);
      
      // Join general room for announcements
      socket.join('announcements');
      
      logger.info(`User ${decoded.email} (${decoded.id}) joined socket`, { 
        socketId: socket.id 
      });
      
      socket.emit('authenticated', {
        userId: decoded.id,
        message: 'Authentication successful'
      });
      
    } catch (error) {
      logger.error('Socket authentication failed:', { 
        error: error.message,
        socketId: socket.id 
      });
      socket.emit('auth_error', { 
        message: 'Authentication failed',
        error: error.message 
      });
    }
  });
  
  // Subscribe to market data
  socket.on('subscribe_market', (symbols) => {
    if (!Array.isArray(symbols) || symbols.length > 50) {
      socket.emit('error', { 
        message: 'Invalid subscription. Maximum 50 symbols allowed.' 
      });
      return;
    }
    
    symbols.forEach(symbol => {
      const cleanSymbol = symbol.toUpperCase().trim();
      socket.join(`market_${cleanSymbol}`);
    });
    
    logger.info(`Socket ${socket.id} subscribed to markets`, { 
      symbols,
      userId: socket.userId 
    });
    
    socket.emit('subscription_confirmed', { 
      symbols,
      message: 'Market subscription successful' 
    });
  });
  
  // Unsubscribe from market
  socket.on('unsubscribe_market', (symbols) => {
    symbols.forEach(symbol => {
      const cleanSymbol = symbol.toUpperCase().trim();
      socket.leave(`market_${cleanSymbol}`);
    });
  });
  
  // Handle errors
  socket.on('error', (error) => {
    logger.error('Socket error:', { 
      error,
      socketId: socket.id,
      userId: socket.userId 
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', { 
      socketId: socket.id, 
      userId: socket.userId,
      reason,
      rooms: Object.keys(socket.rooms)
    });
  });
  
  // Keep-alive ping
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
});

// Broadcast helper function
const broadcastToRoom = (room, event, data) => {
  io.to(room).emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Schedule cron jobs (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  
  // Daily investment payouts at midnight UTC
  const dailyPayoutJob = cron.schedule('0 0 * * *', async () => {
    const jobId = `payout_${Date.now()}`;
    logger.info(`Starting daily investment payout job: ${jobId}`);
    
    try {
      const result = await investmentService.processDailyPayouts();
      logger.info(`Daily payout job completed: ${jobId}`, result);
      
      // Broadcast completion
      broadcastToRoom('announcements', 'payouts_completed', {
        jobId,
        processed: result.processed,
        totalPayout: result.totalPayout
      });
      
    } catch (error) {
      logger.error(`Daily payout job failed: ${jobId}`, { 
        error: error.message,
        stack: error.stack 
      });
      
      // Send alert in production
      if (process.env.NODE_ENV === 'production') {
        // Implement alert system (email, Slack, etc.)
        logger.error('ALERT: Daily payout job failed', { jobId, error: error.message });
      }
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  // Hourly market data updates
  const marketUpdateJob = cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly market data update');
    
    try {
      // Update market data
      const cryptoService = require('./services/cryptoService');
      const prices = await cryptoService.getRealTimePrices();
      
      // Broadcast to market rooms
      Object.keys(prices).forEach(symbol => {
        broadcastToRoom(`market_${symbol}`, 'price_update', {
          symbol,
          price: prices[symbol].current_price,
          change: prices[symbol].price_change_percentage_24h
        });
      });
      
      logger.info('Market data update completed', { 
        symbols: Object.keys(prices).length 
      });
      
    } catch (error) {
      logger.error('Market data update failed:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  // Every 10 minutes: Check for pending deposits/withdrawals
  const transactionCheckJob = cron.schedule('*/10 * * * *', async () => {
    logger.info('Checking pending transactions');
    
    try {
      const paymentService = require('./services/paymentService');
      const pendingCount = await paymentService.checkPendingTransactions();
      
      if (pendingCount > 0) {
        logger.info(`Found ${pendingCount} pending transactions`);
      }
      
    } catch (error) {
      logger.error('Transaction check failed:', error.message);
    }
  });

  // Weekly statistics on Monday at 2 AM
  const weeklyStatsJob = cron.schedule('0 2 * * 1', async () => {
    logger.info('Running weekly statistics job');
    // Generate weekly reports, send emails, etc.
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  // Log cron job status
  logger.info('Cron jobs scheduled:', {
    dailyPayout: dailyPayoutJob.getStatus(),
    marketUpdate: marketUpdateJob.getStatus(),
    transactionCheck: transactionCheckJob.getStatus(),
    weeklyStats: weeklyStatsJob.getStatus()
  });
}

// Health check endpoint
app.get('/server-status', (req, res) => {
  const status = {
    status: 'running',
    pid: process.pid,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    memory: {
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
    },
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    worker: cluster.worker ? `Worker ${cluster.worker.id}` : 'Master'
  };
  
  res.json(status);
});

// Start server
server.listen(PORT, async () => {
  try {
    // Sync database models
    const syncOptions = process.env.NODE_ENV === 'development' 
      ? { alter: true } 
      : { alter: false }; // Never use alter in production
    
    await sequelize.sync(syncOptions);
    logger.info('✅ Database models synchronized');
    
    // Seed initial data if needed
    await seedInitialData();
    
    logger.info(`✅ Server running on port ${PORT}`);
    logger.info(`✅ Environment: ${process.env.NODE_ENV}`);
    logger.info(`✅ Worker PID: ${process.pid}`);
    logger.info(`✅ API URL: http://localhost:${PORT}`);
    logger.info(`✅ Health Check: http://localhost:${PORT}/health`);
    logger.info(`✅ Server Status: http://localhost:${PORT}/server-status`);
    logger.info(`✅ API Docs: http://localhost:${PORT}/api-docs`);
    
  } catch (error) {
    logger.error('❌ Server startup failed:', error);
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  const shutdownId = `shutdown_${Date.now()}`;
  logger.info(`🚦 Starting graceful shutdown: ${shutdownId}`);
  
  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info(`✅ HTTP server closed: ${shutdownId}`);
    });
    
    // Close Socket.IO
    io.close(() => {
      logger.info(`✅ Socket.IO closed: ${shutdownId}`);
    });
    
    // Close database connections
    await sequelize.close();
    logger.info(`✅ Database connections closed: ${shutdownId}`);
    
    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error(`⏰ Force shutdown after timeout: ${shutdownId}`);
      process.exit(1);
    }, 10000);
    
    // Exit process
    setTimeout(() => {
      logger.info(`👋 Shutdown complete: ${shutdownId}`);
      process.exit(0);
    }, 1000);
    
  } catch (error) {
    logger.error(`❌ Error during shutdown ${shutdownId}:`, error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Seed initial data
async function seedInitialData() {
  try {
    const Plan = require('./models/Plan');
    
    // Check if plans already exist
    const planCount = await Plan.count();
    
    if (planCount === 0) {
      logger.info('🌱 Seeding initial investment plans...');
      
      for (const planData of constants.DEFAULT_PLANS) {
        await Plan.create(planData);
      }
      
      logger.info(`✅ Seeded ${constants.DEFAULT_PLANS.length} investment plans`);
    } else {
      logger.info(`📊 Found ${planCount} existing investment plans`);
    }
    
    // Create admin user if not exists (optional)
    if (process.env.CREATE_ADMIN === 'true') {
      const User = require('./models/User');
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@cryptoinvest.com';
      
      const adminExists = await User.findOne({ where: { email: adminEmail } });
      if (!adminExists) {
        const bcrypt = require('bcryptjs');
        const adminUser = await User.create({
          email: adminEmail,
          password: process.env.ADMIN_PASSWORD || 'Admin@12345',
          first_name: 'Admin',
          last_name: 'User',
          role: 'admin',
          is_verified: true,
          is_active: true
        });
        logger.info(`👑 Created admin user: ${adminEmail}`);
      }
    }
    
  } catch (error) {
    logger.error('❌ Error seeding initial data:', error.message);
  }
}