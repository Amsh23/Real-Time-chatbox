const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    socket: 3,
    db: 4,
    debug: 5
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    socket: 'blue',
    db: 'magenta',
    debug: 'cyan'
};

// Add colors to winston
winston.addColors(colors);

// Create format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        info => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// Create format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
    levels,
    format: fileFormat,
    transports: [
        // Write all logs with level 'error' and below to 'error.log'
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error'
        }),
        // Write all logs with level 'socket' and below to 'socket.log'
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/socket.log'),
            level: 'socket'
        }),
        // Write all logs with level 'db' and below to 'db.log'
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/db.log'),
            level: 'db'
        }),
        // Write all logs with level 'debug' and below to 'combined.log'
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log')
        })
    ]
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
    }));
}

// Create log rotation
const { createRotatingFileStream } = require('rotating-file-stream');
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create rotating streams for each log file
const rotatingStreams = {};
['error', 'socket', 'db', 'combined'].forEach(type => {
    rotatingStreams[type] = createRotatingFileStream(`${type}.log`, {
        interval: '1d', // Rotate daily
        path: logsDir,
        size: '10M', // Rotate when size exceeds 10MB
        compress: 'gzip' // Compress rotated files
    });
});

// Add methods for different log types
const loggers = {
    // System errors and critical issues
    error: (message, error) => {
        const errorDetails = error ? `${error.message}\n${error.stack}` : '';
        logger.error(`${message}${errorDetails ? '\n' + errorDetails : ''}`);
    },

    // Warning messages
    warn: (message) => {
        logger.warn(message);
    },

    // General information
    info: (message) => {
        logger.info(message);
    },

    // Socket.IO events and issues
    socket: {
        connect: (socketId) => {
            logger.log('socket', `New connection: ${socketId}`);
        },
        disconnect: (socketId, reason) => {
            logger.log('socket', `Disconnection: ${socketId}, Reason: ${reason}`);
        },
        error: (socketId, error) => {
            logger.log('socket', `Error in socket ${socketId}: ${error.message}`);
        },
        event: (socketId, event, data) => {
            logger.log('socket', `Socket ${socketId} emitted ${event}: ${JSON.stringify(data)}`);
        }
    },

    // Database operations and issues
    db: {
        query: (operation, collection, query) => {
            logger.log('db', `${operation} on ${collection}: ${JSON.stringify(query)}`);
        },
        error: (operation, error) => {
            logger.log('db', `Database error during ${operation}: ${error.message}`);
        },
        connection: (status) => {
            logger.log('db', `Database connection status: ${status}`);
        }
    },

    // Debug information for development
    debug: (message) => {
        logger.debug(message);
    }
};

// Create a stream for Morgan HTTP request logging
const httpLogStream = createRotatingFileStream('access.log', {
    interval: '1d',
    path: logsDir,
    size: '10M',
    compress: 'gzip'
});

module.exports = {
    loggers,
    httpLogStream
};