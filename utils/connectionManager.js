const { performance } = require('perf_hooks');
const messageMetrics = require('./messageMetrics');
const logger = require('./logger');

class ConnectionManager {
    constructor() {
        this.reconnectAttempts = new Map();
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
    }

    handleDisconnect(socket, reason) {
        const attempts = this.reconnectAttempts.get(socket.id) || 0;
        
        if (attempts >= this.maxReconnectAttempts) {
            console.warn(`Client ${socket.id} exceeded max reconnection attempts`);
            return false;
        }

        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, attempts),
            this.maxReconnectDelay
        );

        this.reconnectAttempts.set(socket.id, attempts + 1);

        setTimeout(() => {
            if (socket.connected) return;
            socket.connect();
        }, delay);

        return true;
    }

    handleConnection(socket) {
        // Reset reconnect attempts
        this.reconnectAttempts.delete(socket.id);
        
        // Log connection
        const timestamp = new Date().toISOString();
        console.log(`Client connected: ${socket.id} at ${timestamp}`);
    }
}

// Create singleton instance
const connectionManager = new ConnectionManager();

// Setup Redis for Socket.IO
async function setupRedis(io) {
    // Check if we should skip Redis setup
    if (process.env.SKIP_REDIS === 'true') {
        logger.info('SKIP_REDIS flag is set, using in-memory adapter');
        return null;
    }

    try {
        // Attempt to connect to Redis
        const { createClient } = require('redis');
        const { createAdapter } = require('@socket.io/redis-adapter');
        
        const pubClient = createClient({
            url: process.env.REDIS_URL,
            password: process.env.REDIS_PASSWORD || undefined
        });
        
        const subClient = pubClient.duplicate();
        
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        
        logger.info('Redis connected successfully for Socket.IO adapter');
        return pubClient;
    } catch (err) {
        logger.error(`❌ Redis connection error: ${err.message}`, err);
        return null;
    }
}

module.exports = connectionManager;
module.exports.setupRedis = setupRedis;