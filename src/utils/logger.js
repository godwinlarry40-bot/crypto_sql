const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file'); // Ensures logs are archived daily

const logDir = 'logs';

// Custom levels for financial tracking
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    transaction: 3, // For deposits/withdrawals
    security: 4,    // For login/password changes
    debug: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    transaction: 'magenta',
    security: 'cyan',
    debug: 'gray'
  }
};

const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'TradePro' },
  transports: [
    // 1. Error Logs (Strictly errors)
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d' // Keep logs for 30 days
    }),
    // 2. Combined Logs (All general activity)
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m' // Rotate if file exceeds 20MB
    }),
    // 3. Dedicated Transaction Audit Trail
    new winston.transports.File({
      filename: path.join(logDir, 'transactions.log'),
      level: 'transaction'
    })
  ]
});

// Add colors to winston
winston.addColors(customLevels.colors);

// Console logging for Development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        return `${timestamp} [${level}]: ${stack || message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
    )
  }));
}

// Stream for Morgan (HTTP request logging)
logger.stream = {
  write: (message) => logger.info(message.trim())
};

module.exports = logger;