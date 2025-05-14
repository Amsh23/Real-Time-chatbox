/**
 * Application logging module optimized for Render deployment
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels with custom socket and database levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  socket: 3,
  db: 4,
  debug: 5
};

// Define colors for each level for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  socket: 'blue',
  db: 'cyan',
  debug: 'gray'
};

// Add colors to winston
winston.addColors(colors);

// Create format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    info => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

// Create format for file output optimized for log analysis
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define transports based on environment
const transports = [];

// Console transport for all environments
transports.push(
  new winston.transports.Console({
    level: config.isProduction ? 'info' : 'debug',
    format: consoleFormat
  })
);

// File transport for production and development
if (!config.isProduction) {
  // Development uses separate log files for error and combined logs
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
} else {
  // Production only logs to stdout/stderr for Render's log aggregation
  // Render captures stdout/stderr automatically
}

// Create the logger with the transports
const logger = winston.createLogger({
  levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'chatbox' },
  transports,
  exitOnError: false
});

// Add stream for Morgan integration (HTTP logging)
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

module.exports = logger;
