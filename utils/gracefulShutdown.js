/**
 * Graceful shutdown handler for Render deployment
 * Ensures connections are properly closed when the service is shut down
 */

const logger = require('./logger');
const mongoose = require('mongoose');

class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownTimeout = 10000; // 10 seconds max to clean up
    
    // Register process signal handlers
    process.on('SIGTERM', this.handleSignal.bind(this, 'SIGTERM'));
    process.on('SIGINT', this.handleSignal.bind(this, 'SIGINT'));
    
    logger.info('Graceful shutdown handler initialized');
  }
  
  registerServer(server, io, redisClient = null) {
    this.server = server;
    this.io = io;
    this.redisClient = redisClient;
    logger.info('Server registered with graceful shutdown handler');
  }
  
  handleSignal(signal) {
    if (this.isShuttingDown) {
      logger.warn(`Received ${signal} during shutdown, ignoring`);
      return;
    }
    
    logger.info(`Received ${signal}, starting graceful shutdown`);
    this.isShuttingDown = true;
    
    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s, forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);
    
    // Start the shutdown process
    this.shutdown()
      .then(() => {
        clearTimeout(forceExitTimeout);
        logger.info('Graceful shutdown completed');
        process.exit(0);
      })
      .catch(err => {
        clearTimeout(forceExitTimeout);
        logger.error('Error during graceful shutdown:', err);
        process.exit(1);
      });
  }
  
  async shutdown() {
    try {
      // Close Socket.IO connections
      if (this.io) {
        logger.info('Closing Socket.IO connections...');
        await new Promise(resolve => {
          this.io.close(resolve);
        });
      }
      
      // Close Redis connections
      if (this.redisClient && this.redisClient.isOpen) {
        logger.info('Closing Redis connections...');
        await this.redisClient.quit();
      }
      
      // Close MongoDB connection
      if (mongoose.connection.readyState === 1) {
        logger.info('Closing MongoDB connection...');
        await mongoose.connection.close();
      }
      
      // Close HTTP server
      if (this.server) {
        logger.info('Closing HTTP server...');
        await new Promise((resolve, reject) => {
          this.server.close(err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
      
      logger.info('All connections closed successfully');
    } catch (err) {
      logger.error('Error during connection cleanup:', err);
      throw err;
    }
  }
}

module.exports = new GracefulShutdown();
