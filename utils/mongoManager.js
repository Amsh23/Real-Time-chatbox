/**
 * MongoDB connection manager with reconnection logic
 * Optimized for Render.com free tier
 */

const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('../config');

class MongoDBManager {
  constructor() {
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.initialBackoff = 1000;
    this.maxBackoff = 30000;
    
    // Mongoose event listeners
    mongoose.connection.on('connected', () => this.handleConnected());
    mongoose.connection.on('error', (err) => this.handleError(err));
    mongoose.connection.on('disconnected', () => this.handleDisconnected());
    
    // Handle specific MongoDB server events
    mongoose.connection.on('reconnectFailed', () => {
      logger.error('MongoDB reconnection failed after maximum attempts');
    });
  }
  
  async connect() {
    // Check for test or development mode without MongoDB requirement
    if (process.env.SKIP_MONGODB === 'true') {
      logger.info('SKIP_MONGODB=true: Running in memory-only mode without MongoDB connection');
      this.isConnected = true;
      return true; // Return success
    }
    
    if (!config.mongodb || !config.mongodb.uri) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn('MongoDB URI is not defined in development mode. Running with limited functionality.');
        this.isConnected = true;
        return true; // Return success
      }
      throw new Error('MongoDB URI is not defined in configuration');
    }
    
    // Enhanced options for Render free tier
    const enhancedOptions = {
      ...(config.mongodb.options || {}),
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 30000, // Reduce heartbeat frequency (default: 10000)
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: config.isProduction ? 5 : 10, // Reduced for free tier
      minPoolSize: config.isProduction ? 1 : 2
    };
    
    try {
      logger.info('Connecting to MongoDB...');
      await mongoose.connect(config.mongodb.uri, enhancedOptions);
      return true;
    } catch (err) {
      logger.error('MongoDB initial connection error:', err);
      return false;
    }
  }
  
  handleConnected() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    logger.info('✅ Connected to MongoDB successfully');
    
    // Log connection pool information
    if (mongoose.connection.client && mongoose.connection.client.topology) {
      const poolStats = mongoose.connection.client.topology.s.pool;
      if (poolStats) {
        logger.info(`MongoDB connection pool - Size: ${poolStats.size}, Available: ${poolStats.available}`);
      }
    }
  }
  
  handleError(err) {
    logger.error('MongoDB connection error:', err);
    
    // Don't attempt to reconnect if initial connection failed
    if (this.isConnected) {
      this.scheduleReconnect();
    }
  }
  
  handleDisconnected() {
    this.isConnected = false;
    logger.warn('MongoDB disconnected');
    
    // Schedule reconnect
    this.scheduleReconnect();
  }
  
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Failed to reconnect to MongoDB after ${this.maxReconnectAttempts} attempts`);
      return;
    }
    
    // Calculate exponential backoff
    const backoff = Math.min(
      this.initialBackoff * Math.pow(1.5, this.reconnectAttempts),
      this.maxBackoff
    );
    
    this.reconnectAttempts++;
    
    logger.info(`Attempting to reconnect to MongoDB in ${backoff}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        if (!mongoose.connection || mongoose.connection.readyState === 0) {
          await this.connect();
        }
      } catch (err) {
        logger.error('Failed to reconnect to MongoDB:', err);
      }
    }, backoff);
  }
  
  async disconnect() {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
      } catch (err) {
        logger.error('Error disconnecting from MongoDB:', err);
      }
    }
  }
  
  getDatabaseStatus() {
    const status = {
      connected: this.isConnected,
      readyState: mongoose.connection ? mongoose.connection.readyState : 0,
      reconnectAttempts: this.reconnectAttempts,
      hasQueuedOperations: mongoose.connection && mongoose.connection.hasQueuedOperations ? true : false
    };
    
    // Add connection pool stats if available
    if (mongoose.connection && mongoose.connection.client && mongoose.connection.client.topology) {
      const poolStats = mongoose.connection.client.topology.s.pool;
      if (poolStats) {
        status.pool = {
          size: poolStats.size,
          available: poolStats.available
        };
      }
    }
    
    return status;
  }
}

module.exports = new MongoDBManager();
