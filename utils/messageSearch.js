const Message = require('../models/message');
const { rateLimiter } = require('./rateLimiter');

class MessageSearch {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    }

    getCacheKey(groupId, query) {
        return `${groupId}:${query}`;
    }

    async search(groupId, query, options = {}) {
        const cacheKey = this.getCacheKey(groupId, query);
        const cachedResults = this.cache.get(cacheKey);
        
        if (cachedResults && Date.now() - cachedResults.timestamp < this.CACHE_TTL) {
            return cachedResults.results;
        }

        const {
            limit = 20,
            skip = 0,
            sort = { timestamp: -1 }
        } = options;

        const results = await Message.find({
            groupId,
            $or: [
                { text: { $regex: query, $options: 'i' } },
                { username: { $regex: query, $options: 'i' } },
                { 'attachments.originalName': { $regex: query, $options: 'i' } }
            ]
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

        this.cache.set(cacheKey, {
            results,
            timestamp: Date.now()
        });

        return results;
    }

    clearCache() {
        this.cache.clear();
    }

    clearGroupCache(groupId) {
        for (const [key] of this.cache) {
            if (key.startsWith(`${groupId}:`)) {
                this.cache.delete(key);
            }
        }
    }

    // For highlighting matched text
    static highlightMatches(text, query) {
        if (!query || !text) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    }
}

module.exports = new MessageSearch();
