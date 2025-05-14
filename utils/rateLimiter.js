const { RateLimiter } = require('limiter');

class MessageRateLimiter {
    constructor() {
        // Rate limits for different operations
        this.limits = {
            sendMessage: new RateLimiter({
                tokensPerInterval: 10,
                interval: 'second'
            }),
            fileUpload: new RateLimiter({
                tokensPerInterval: 5,
                interval: 'minute'
            }),
            reaction: new RateLimiter({
                tokensPerInterval: 20,
                interval: 'second'
            }),
            search: new RateLimiter({
                tokensPerInterval: 5,
                interval: 'second'
            })
        };

        // Track per-user rate limits
        this.userLimits = new Map();
    }

    async checkRateLimit(socketId, operation) {
        // Get or create user-specific limiter
        if (!this.userLimits.has(socketId)) {
            this.userLimits.set(socketId, {
                sendMessage: new RateLimiter({
                    tokensPerInterval: 30,
                    interval: 'minute'
                }),
                fileUpload: new RateLimiter({
                    tokensPerInterval: 10,
                    interval: 'minute'
                })
            });
        }

        const userLimiter = this.userLimits.get(socketId);
        
        try {
            // Check global limit
            await this.limits[operation].removeTokens(1);
            
            // Check user-specific limit if it exists
            if (userLimiter[operation]) {
                await userLimiter[operation].removeTokens(1);
            }

            return true;
        } catch (err) {
            return false;
        }
    }

    getTimeToNext(socketId, operation) {
        const globalNext = this.limits[operation].getTokensRemaining();
        const userLimiter = this.userLimits.get(socketId);
        
        if (!userLimiter || !userLimiter[operation]) {
            return Math.ceil(globalNext * 1000);
        }

        const userNext = userLimiter[operation].getTokensRemaining();
        return Math.max(Math.ceil(globalNext * 1000), Math.ceil(userNext * 1000));
    }

    resetLimits(socketId) {
        this.userLimits.delete(socketId);
    }

    getRateLimitInfo(socketId) {
        const info = {};
        for (const [operation, limiter] of Object.entries(this.limits)) {
            info[operation] = {
                remaining: limiter.getTokensRemaining(),
                timeToNext: this.getTimeToNext(socketId, operation)
            };
        }
        return info;
    }
}

module.exports = new MessageRateLimiter();
