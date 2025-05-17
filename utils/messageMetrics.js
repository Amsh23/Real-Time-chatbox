const { performance } = require('perf_hooks');
const MessageCache = require('../models/messageCache');

class MessageHandlerMetrics {
    constructor() {
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageResponseTime: 0,
            offlineQueueSize: 0
        };
        this.operationTimes = new Map();
    }

    recordMetric(operation, duration) {
        const times = this.operationTimes.get(operation) || [];
        times.push(duration);
        if (times.length > 100) times.shift(); // Keep last 100 measurements
        this.operationTimes.set(operation, times);
    }

    getAverageMetric(operation) {
        const times = this.operationTimes.get(operation);
        if (!times || times.length === 0) return 0;
        return times.reduce((a, b) => a + b, 0) / times.length;
    }

    recordCacheHit() {
        this.metrics.cacheHits++;
    }

    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }

    getCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        return total === 0 ? 0 : (this.metrics.cacheHits / total) * 100;
    }

    updateOfflineQueueSize(size) {
        this.metrics.offlineQueueSize = size;
    }

    getMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.getCacheHitRate(),
            averageOperationTimes: Object.fromEntries(
                Array.from(this.operationTimes.entries()).map(([op, times]) => [
                    op,
                    times.reduce((a, b) => a + b, 0) / times.length
                ])
            )
        };
    }
}

module.exports = new MessageHandlerMetrics();
