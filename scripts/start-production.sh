#!/bin/bash

# Production startup script for Render.com deployment

echo "Starting application in production mode..."

# Check environment variables
if [ -z "$MONGODB_URI" ]; then
  echo "ERROR: MONGODB_URI environment variable is not set"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "WARNING: SESSION_SECRET not set, using a random value"
  export SESSION_SECRET=$(openssl rand -hex 32)
fi

# Create necessary directories
mkdir -p public/uploads
mkdir -p logs

# Set proper permissions
chmod -R 755 public/uploads
chmod -R 755 logs

# Apply memory optimizations for Render free tier
export NODE_OPTIONS="--max_old_space_size=512"

# Enable source maps for better debugging
export NODE_ENV=production
export SOURCE_MAPS=true

# Start the application
echo "Starting server..."
node server.js
