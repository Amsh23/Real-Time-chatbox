/**
 * Rate limiter for Socket.IO events
 * Uses in-memory storage with configurable limits
 */

class RateLimiter {
    constructor() {
        // Store request counts by client ID and action type
        this.requests = new Map();
        
        // Default rate limits (can be overridden in .env)
        this.limits = {
            'message': parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            'join': 10,
            'search': 30,
            'upload': 5
        };
        
        // Time window in milliseconds (default: 1 minute)
        this.windowMs = parseInt(process.env.RATE_LIMIT_WINDOW) || 60000;
        
        // Clean up expired entries every minute
        setInterval(() => this.cleanup(), 60000);
    }
    
    /**
     * Check if a client has exceeded their rate limit for a given action
     * @param {string} clientId - Socket.io client ID
     * @param {string} action - Action type (message, join, etc.)
     * @returns {boolean} - True if rate limited, false otherwise
     */
    async checkLimit(clientId, action = 'message') {
        const key = `${clientId}:${action}`;
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        // Get current requests or initialize a new array
        const clientRequests = this.requests.get(key) || [];
        
        // Filter out expired requests
        const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);
        
        // Get the limit for this action
        const limit = this.limits[action] || this.limits.message;
        
        // Check if limit exceeded
        if (validRequests.length >= limit) {
            return true; // Rate limited
        }
        
        // Add current request and update the store
        validRequests.push(now);
        this.requests.set(key, validRequests);
        
        return false; // Not rate limited
    }
    
    /**
     * Remove expired entries to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        for (const [key, timestamps] of this.requests.entries()) {
            // Filter out expired timestamps
            const validTimestamps = timestamps.filter(ts => ts > windowStart);
            
            if (validTimestamps.length === 0) {
                // Remove empty entries
                this.requests.delete(key);
            } else if (validTimestamps.length !== timestamps.length) {
                // Update with only valid timestamps
                this.requests.set(key, validTimestamps);
            }
        }
    }
}

// Export singleton instance
module.exports = new RateLimiter();
