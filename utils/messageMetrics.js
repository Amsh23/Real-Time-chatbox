const { performance } = require('perf_hooks');
const { MessageCache } = require('../../handlers/socket/messageHandlers');

class MessageHandlerMetrics {
    constructor() {
        this.metrics = {
            sendMessage: [],
            loadMessages: [],
            cacheHits: 0,
            cacheMisses: 0,
            offlineQueueSize: 0
        };
    }

    recordMetric(operation, duration) {
        if (!this.metrics[operation]) {
            this.metrics[operation] = [];
        }
        this.metrics[operation].push(duration);

        // Keep only last 1000 measurements
        if (this.metrics[operation].length > 1000) {
            this.metrics[operation].shift();
        }
    }

    getAverageMetric(operation) {
        const measurements = this.metrics[operation];
        if (!measurements || measurements.length === 0) return 0;
        return measurements.reduce((a, b) => a + b, 0) / measurements.length;
    }

    recordCacheHit() {
        this.metrics.cacheHits++;
    }

    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }

    getCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        if (total === 0) return 0;
        return this.metrics.cacheHits / total;
    }

    updateOfflineQueueSize(size) {
        this.metrics.offlineQueueSize = size;
    }

    getMetrics() {
        return {
            averageSendTime: this.getAverageMetric('sendMessage'),
            averageLoadTime: this.getAverageMetric('loadMessages'),
            cacheHitRate: this.getCacheHitRate(),
            offlineQueueSize: this.metrics.offlineQueueSize
        };
    }
}

module.exports = new MessageHandlerMetrics();
