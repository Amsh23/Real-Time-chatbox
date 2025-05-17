const sanitizeHtml = require('sanitize-html');
const { v4: uuidv4 } = require('uuid');
const { encrypt, decrypt } = require('../../utils/encryption');
const messageSearch = require('../../utils/messageSearch');
const rateLimiter = require('../../utils/rateLimiter');
const store = require('../../models/memoryStore');
const MessageCache = require('../../models/messageCache');
const messageMetrics = require('../../utils/messageMetrics');

// Initialize cache
const messageCache = new MessageCache(1000);

// Message handlers with optimized performance
module.exports = function(io, socket) {
    const messageHandlers = {
        'send-message': async (data, callback = () => {}) => {
            const start = Date.now();
            try {
                const { text, groupId } = data;
                if (!text || !groupId) {
                    return callback({ error: 'Invalid message data' });
                }

                // Rate limiting check
                const rateLimited = await rateLimiter.checkLimit(socket.id, 'message');
                if (rateLimited) {
                    return callback({ error: 'Rate limit exceeded' });
                }

                // Create and store message
                const message = {
                    id: uuidv4(),
                    text: sanitizeHtml(text),
                    sender: socket.id,
                    username: socket.username || 'Anonymous',
                    groupId,
                    timestamp: new Date()
                };

                await store.createMessage(message);
                messageCache.set(groupId, message);

                // Broadcast to group
                io.to(groupId).emit('new-message', message);
                callback({ success: true, messageId: message.id });

                // Record metrics
                messageMetrics.recordMetric('send', Date.now() - start);

            } catch (err) {
                console.error('Error sending message:', err);
                messageMetrics.recordMetric('error', Date.now() - start);
                callback({ error: 'Failed to send message' });
            }
        },

        'edit-message': async (data, callback = () => {}) => {
            const start = Date.now();
            try {
                const { messageId, text, groupId } = data;
                if (!messageId || !text || !groupId) {
                    return callback({ error: 'Invalid edit data' });
                }

                const message = await store.editMessage(messageId, text);
                if (!message) {
                    return callback({ error: 'Message not found' });
                }

                messageCache.invalidate(groupId);
                io.to(groupId).emit('message-updated', message);
                callback({ success: true });

                messageMetrics.recordMetric('edit', Date.now() - start);

            } catch (err) {
                console.error('Error editing message:', err);
                messageMetrics.recordMetric('error', Date.now() - start);
                callback({ error: 'Failed to edit message' });
            }
        },

        'pin-message': async (data, callback = () => {}) => {
            const start = Date.now();
            try {
                const { messageId, groupId } = data;
                if (!messageId || !groupId) {
                    return callback({ error: 'Invalid pin data' });
                }

                const message = await store.pinMessage(messageId, socket.id);
                if (!message) {
                    return callback({ error: 'Message not found' });
                }

                io.to(groupId).emit('message-pinned', message);
                callback({ success: true });

                messageMetrics.recordMetric('pin', Date.now() - start);

            } catch (err) {
                console.error('Error pinning message:', err);
                messageMetrics.recordMetric('error', Date.now() - start);
                callback({ error: 'Failed to pin message' });
            }
        },

        'get-messages': async (data, callback = () => {}) => {
            const start = Date.now();
            try {
                const { groupId } = data;
                if (!groupId) {
                    return callback({ error: 'Invalid request' });
                }

                // Try cache first
                const cachedMessages = messageCache.getGroupMessages(groupId);
                if (cachedMessages.length > 0) {
                    messageMetrics.recordCacheHit();
                    return callback({ success: true, messages: cachedMessages });
                }

                // Cache miss, get from store
                messageMetrics.recordCacheMiss();
                const messages = await store.findMessages({ groupId });
                messageCache.set(groupId, messages);
                callback({ success: true, messages });

                messageMetrics.recordMetric('get', Date.now() - start);

            } catch (err) {
                console.error('Error getting messages:', err);
                messageMetrics.recordMetric('error', Date.now() - start);
                callback({ error: 'Failed to get messages' });
            }
        }
    };

    // Register handlers
    Object.entries(messageHandlers).forEach(([event, handler]) => {
        socket.on(event, (data, callback) => {
            if (typeof callback !== 'function') {
                callback = () => {};
            }
            handler(data, callback);
        });
    });

    return messageHandlers;
};