const os = require('os');
const mongoose = require('mongoose');

class SystemMonitor {
    constructor() {
        this.stats = {
            startTime: Date.now(),
            connections: 0,
            messagesSent: 0,
            messagesReceived: 0,
            activeGroups: 0,
            errors: 0,
            lastError: null,
            memoryUsage: {},
            cpuUsage: {},
            dbStats: {}
        };
    }

    // Track new connection
    trackConnection() {
        this.stats.connections++;
    }

    // Track message metrics
    trackMessage(type = 'sent') {
        if (type === 'sent') {
            this.stats.messagesSent++;
        } else {
            this.stats.messagesReceived++;
        }
    }

    // Track errors
    trackError(error) {
        this.stats.errors++;
        this.stats.lastError = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date()
        };
    }

    // Update system metrics
    async updateMetrics() {
        // Memory usage
        const memUsage = process.memoryUsage();
        this.stats.memoryUsage = {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            rss: Math.round(memUsage.rss / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
        };

        // CPU usage
        const cpus = os.cpus();
        this.stats.cpuUsage = {
            cores: cpus.length,
            model: cpus[0].model,
            speed: cpus[0].speed,
            loadAvg: os.loadavg()
        };

        // MongoDB stats
        if (mongoose.connection.readyState === 1) {
            try {
                const db = mongoose.connection.db;
                this.stats.dbStats = await db.stats();
                
                // Add collection-specific stats
                this.stats.dbStats.collections = {
                    messages: await db.collection('messages').stats(),
                    groups: await db.collection('groups').stats(),
                    users: await db.collection('users').stats()
                };
            } catch (err) {
                console.error('Error getting DB stats:', err);
            }
        }

        return this.stats;
    }

    // Get health check status
    async getHealthStatus() {
        await this.updateMetrics();

        const uptime = Math.round((Date.now() - this.stats.startTime) / 1000);
        const memoryThreshold = 90; // 90% of heap
        const heapUsedPercent = (this.stats.memoryUsage.heapUsed / this.stats.memoryUsage.heapTotal) * 100;

        return {
            status: this.determineHealthStatus(heapUsedPercent),
            uptime,
            connections: this.stats.connections,
            messages: {
                sent: this.stats.messagesSent,
                received: this.stats.messagesReceived
            },
            memory: {
                used: this.stats.memoryUsage.heapUsed,
                total: this.stats.memoryUsage.heapTotal,
                percentage: Math.round(heapUsedPercent)
            },
            errors: {
                count: this.stats.errors,
                last: this.stats.lastError
            },
            database: {
                status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
                collections: this.stats.dbStats.collections || {}
            }
        };
    }

    // Determine system health status
    determineHealthStatus(heapUsedPercent) {
        if (heapUsedPercent > 90 || this.stats.errors > 1000) {
            return 'critical';
        }
        if (heapUsedPercent > 70 || this.stats.errors > 100) {
            return 'warning';
        }
        return 'healthy';
    }

    // Reset error count
    resetErrors() {
        this.stats.errors = 0;
        this.stats.lastError = null;
    }

    // Get basic metrics for monitoring
    getBasicMetrics() {
        return {
            uptime: Math.round((Date.now() - this.stats.startTime) / 1000),
            connections: this.stats.connections,
            messagesSent: this.stats.messagesSent,
            messagesReceived: this.stats.messagesReceived,
            errors: this.stats.errors,
            memoryUsage: this.stats.memoryUsage
        };
    }
}

// Create singleton instance
const monitor = new SystemMonitor();

module.exports = monitor;