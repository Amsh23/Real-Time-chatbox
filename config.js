/**
 * Central configuration file for the application
 * Optimized for Render.com free tier
 */

require('dotenv').config();

const config = {
  // Core configuration
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  
  // MongoDB configuration
  mongodb: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10,  // Reduced for free tier
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 10000
    }
  },
  
  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || null,
    enabled: !!process.env.REDIS_URL
  },
  
  // Security settings
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret-key',
    adminApiKey: process.env.ADMIN_API_KEY,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  
  // Cache settings - optimized for memory constraints
  cache: {
    messageCacheSize: parseInt(process.env.MESSAGE_CACHE_SIZE, 10) || 50,
    messageCacheTTL: 30 * 60 * 1000, // 30 minutes
    staticMaxAge: 24 * 60 * 60 * 1000, // 1 day
  },
  
  // File upload settings
  uploads: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 15 * 1024 * 1024,
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'jpeg,jpg,png,gif,mp4,webm,pdf,docx,xlsx').split(','),
  },
  
  // App specific settings
  app: {
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH, 10) || 2000,
    typingTimeout: parseInt(process.env.TYPING_TIMEOUT, 10) || 3000,
  },

  // Memory optimization for free tier
  memory: {
    // GC optimization
    gcInterval: 10 * 60 * 1000, // 10 minutes
    
    // LRU cache settings
    lruMax: 500,
    
    // Cleanup intervals
    cleanupOldMessages: 3 * 24 * 60 * 60 * 1000, // 3 days
  }
};

module.exports = config;
