// MessageCache implementation with optimized memory usage
class MessageCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.lru = new Map();
    }

    set(groupId, messages) {
        if (!Array.isArray(messages)) {
            messages = [messages];
        }

        if (!this.cache.has(groupId)) {
            this.cache.set(groupId, new Map());
        }

        const groupCache = this.cache.get(groupId);
        const now = Date.now();

        messages.forEach(msg => {
            groupCache.set(msg.id, msg);
            this.lru.set(msg.id, now);
        });

        this.cleanup(groupId);
    }

    cleanup(groupId) {
        const groupCache = this.cache.get(groupId);
        if (!groupCache || groupCache.size <= this.maxSize) return;

        const sortedMessages = [...this.lru.entries()]
            .filter(([messageId]) => groupCache.has(messageId))
            .sort((a, b) => a[1] - b[1]);

        const toDelete = sortedMessages.slice(0, groupCache.size - this.maxSize);
        toDelete.forEach(([messageId]) => {
            groupCache.delete(messageId);
            this.lru.delete(messageId);
        });
    }

    get(groupId, messageId) {
        const groupCache = this.cache.get(groupId);
        if (!groupCache) return null;

        const message = groupCache.get(messageId);
        if (message) {
            this.lru.set(messageId, Date.now());
        }
        return message;
    }

    invalidate(groupId) {
        if (groupId) {
            const groupCache = this.cache.get(groupId);
            if (groupCache) {
                groupCache.forEach((_, messageId) => this.lru.delete(messageId));
                this.cache.delete(groupId);
            }
        } else {
            this.cache.clear();
            this.lru.clear();
        }
    }

    getGroupMessages(groupId) {
        return Array.from(this.cache.get(groupId)?.values() || []);
    }

    size(groupId) {
        return this.cache.get(groupId)?.size || 0;
    }
}

module.exports = MessageCache;
