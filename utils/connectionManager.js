const { performance } = require('perf_hooks');
const messageMetrics = require('./messageMetrics');

class ConnectionManager {
    constructor() {
        this.reconnectAttempts = new Map();
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
    }

    handleDisconnect(socket, reason) {
        const attempts = this.reconnectAttempts.get(socket.id) || 0;
        
        if (attempts >= this.maxReconnectAttempts) {
            console.warn(`Client ${socket.id} exceeded max reconnection attempts`);
            return false;
        }

        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, attempts),
            this.maxReconnectDelay
        );

        this.reconnectAttempts.set(socket.id, attempts + 1);

        setTimeout(() => {
            if (socket.connected) return;
            socket.connect();
        }, delay);

        return true;
    }

    async handleReconnect(socket, messageCache, offlineQueue) {
        const start = performance.now();
        try {
            // Process any offline messages
            const groups = Array.from(socket.rooms).filter(room => room !== socket.id);
            for (const groupId of groups) {
                const messages = await offlineQueue.processQueue(groupId);
                if (messages.length > 0) {
                    socket.emit('offline-messages-sync', {
                        groupId,
                        messages
                    });
                }

                // Sync missed messages from cache
                const cachedMessages = messageCache.getRecentMessages(groupId);
                if (cachedMessages.length > 0) {
                    socket.emit('message-sync', {
                        groupId,
                        messages: cachedMessages
                    });
                }
            }

            // Reset reconnection counter on successful reconnect
            this.reconnectAttempts.delete(socket.id);

            // Record metrics
            const duration = performance.now() - start;
            messageMetrics.recordMetric('reconnect', duration);

        } catch (err) {
            console.error('Error during reconnection:', err);
            return false;
        }

        return true;
    }

    resetAttempts(socketId) {
        this.reconnectAttempts.delete(socketId);
    }

    getReconnectStatus(socketId) {
        return {
            attempts: this.reconnectAttempts.get(socketId) || 0,
            maxAttempts: this.maxReconnectAttempts,
            nextDelay: this.calculateNextDelay(socketId)
        };
    }

    calculateNextDelay(socketId) {
        const attempts = this.reconnectAttempts.get(socketId) || 0;
        return Math.min(
            this.reconnectDelay * Math.pow(2, attempts),
            this.maxReconnectDelay
        );
    }
}

module.exports = new ConnectionManager();
