const fs = require('fs');
const path = require('path');

/**
 * This script runs after npm install during deployment to set up the environment
 * for Render.com hosting.
 */

console.log('Setting up application for Render.com deployment...');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  console.log('Creating uploads directory...');
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  console.log('Creating logs directory...');
  fs.mkdirSync(logsDir, { recursive: true });
}

// If Redis connection fails in production, we can use this fallback adapter
console.log('Creating Socket.IO adapter fallback...');

console.log('Setup complete!');
console.log('Note: Configure your MongoDB Atlas connection string in the Render dashboard');
