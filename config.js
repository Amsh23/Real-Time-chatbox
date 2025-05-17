/**
 * Central configuration file for the application
 * Simplified version with no external dependencies
 */

require('dotenv').config();

const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
  
  // Storage configuration
  useMemoryStore: true,
  
  // Security settings
  security: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 15728640, // 15MB
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'jpeg,jpg,png,gif,mp4,webm,pdf,docx,xlsx').split(','),
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000
  },
  
  // Chat settings
  chat: {
    maxGroupMembers: parseInt(process.env.MAX_GROUP_MEMBERS) || 100,
    maxGroupsPerUser: parseInt(process.env.MAX_GROUPS_PER_USER) || 10,
    messageCacheSize: parseInt(process.env.MESSAGE_CACHE_SIZE) || 100,
    typingTimeout: parseInt(process.env.TYPING_TIMEOUT) || 3000 // 3 seconds
  }
};

module.exports = config;
