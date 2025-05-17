const sanitizeHtml = require('sanitize-html');
const { v4: uuidv4 } = require('uuid');
const { encrypt, decrypt } = require('../../utils/encryption');
const messageSearch = require('../../utils/messageSearch');
const rateLimiter = require('../../utils/rateLimiter');
const store = require('../../models/memoryStore');

// Message cache with LRU implementation
class MessageCache {
    constructor(maxSize = 100) {
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
        messages.forEach(msg => {
            groupCache.set(msg.id, msg);
            this.lru.set(msg.id, Date.now());
        });

        // Cleanup if cache is too large
        if (groupCache.size > this.maxSize) {
            const sortedEntries = [...this.lru.entries()]
                .sort((a, b) => a[1] - b[1])
                .slice(0, groupCache.size - this.maxSize);

            sortedEntries.forEach(([messageId]) => {
                groupCache.delete(messageId);
                this.lru.delete(messageId);
            });
        }
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

    getGroupMessages(groupId, limit = 50) {
        const groupCache = this.cache.get(groupId);
        if (!groupCache) return [];

        return [...groupCache.values()]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    invalidate(groupId, messageId) {
        const groupCache = this.cache.get(groupId);
        if (groupCache) {
            groupCache.delete(messageId);
            this.lru.delete(messageId);
        }
    }

    clear(groupId) {
        if (groupId) {
            this.cache.delete(groupId);
            // Clear LRU entries for this group
            const groupMessageIds = [...this.lru.entries()]
                .filter(([_, timestamp]) => timestamp.startsWith(groupId))
                .map(([id]) => id);
            groupMessageIds.forEach(id => this.lru.delete(id));
        } else {
            this.cache.clear();
            this.lru.clear();
        }
    }

    size(groupId) {
        if (groupId) {
            return this.cache.get(groupId)?.size || 0;
        }
        return [...this.cache.values()].reduce((total, group) => total + group.size, 0);
    }

    getRecentMessages(groupId, before = Date.now(), limit = 50) {
        const groupCache = this.cache.get(groupId);
        if (!groupCache) return [];

        return [...groupCache.values()]
            .filter(msg => msg.timestamp < before)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    updateMessage(groupId, messageId, updates) {
        const groupCache = this.cache.get(groupId);
        if (!groupCache) return false;

        const message = groupCache.get(messageId);
        if (!message) return false;

        Object.assign(message, updates);
        this.lru.set(messageId, Date.now());
        return true;
    }

    cleanup() {
        const now = Date.now();
        const expireTime = 24 * 60 * 60 * 1000; // 24 hours

        this.cache.forEach((groupCache, groupId) => {
            const oldMessages = [...groupCache.entries()]
                .filter(([_, msg]) => now - msg.timestamp > expireTime)
                .map(([id]) => id);

            oldMessages.forEach(id => {
                groupCache.delete(id);
                this.lru.delete(id);
            });

            if (groupCache.size === 0) {
                this.cache.delete(groupId);
            }
        });
    }
}

// Initialize message cache
const messageCache = new MessageCache(parseInt(process.env.MESSAGE_CACHE_SIZE) || 100);

// Queue for storing offline messages
class OfflineMessageQueue {
    constructor() {
        this.queues = new Map();
    }

    addMessage(groupId, message) {
        if (!this.queues.has(groupId)) {
            this.queues.set(groupId, []);
        }
        this.queues.get(groupId).push({
            message,
            timestamp: Date.now()
        });
    }

    async processQueue(groupId) {
        const queue = this.queues.get(groupId) || [];
        const processed = [];
        const failed = [];

        for (const item of queue) {
            try {
                await Message.create(item.message);
                processed.push(item);
            } catch (err) {
                console.error('Error processing offline message:', err);
                if (Date.now() - item.timestamp < 24 * 60 * 60 * 1000) {
                    failed.push(item);
                }
            }
        }

        this.queues.set(groupId, failed);
        return processed.map(item => item.message);
    }
}

// Initialize offline message queue
const offlineQueue = new OfflineMessageQueue();

const createMessageHandlers = (io, socket, users, groups) => {
    // Handle sending messages
    const handleSendMessage = async ({ text, groupId, attachments = [] }, callback) => {
        try {
            const user = store.users.get(socket.id);
            if (!user) return callback({ error: 'Authentication required' });

            const group = store.groups.get(groupId);
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'Group access denied' });
            }

            const sanitizedText = sanitizeHtml(text || '', { 
                allowedTags: ['b', 'i', 'u', 'br'], 
                allowedAttributes: {} 
            });

            const messageText = group.settings.messageEncryption ? 
                encrypt(sanitizedText, group.encryptionKey) : 
                sanitizedText;

            const message = {
                id: uuidv4(),
                text: messageText,
                encrypted: group.settings.messageEncryption,
                sender: socket.id,
                username: user.username,
                avatar: user.avatar,
                groupId: groupId,
                timestamp: new Date(),
                attachments: attachments.map(att => ({
                    url: att.url,
                    type: att.type,
                    originalName: sanitizeHtml(att.originalName, { allowedTags: [], allowedAttributes: {} }),
                    size: att.size
                }))
            };

            // Store message in memory
            await store.createMessage(message);
            messageCache.set(groupId, message);

            const messageToSend = { ...message };
            if (message.encrypted) {
                messageToSend.text = decrypt(message.text, group.encryptionKey);
            }

            io.to(groupId).emit('new-message', messageToSend);
            callback({ success: true, message: messageToSend });

        } catch (err) {
            console.error('Error sending message:', err);
            callback({ error: 'Failed to send message' });
        }
    };

    // Handle message pinning
    const handlePinMessage = async ({ messageId, groupId }, callback) => {
        try {
            const user = store.users.get(socket.id);
            if (!user) return callback({ error: 'Authentication required' });

            const group = store.groups.get(groupId);
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'Group access denied' });
            }

            const message = await store.findMessages({ id: messageId })[0];
            if (!message) return callback({ error: 'Message not found' });

            await store.pinMessage(messageId, socket.id);
            messageCache.updateMessage(groupId, messageId, {
                isPinned: true,
                pinnedBy: user.username,
                pinnedAt: new Date()
            });

            io.to(groupId).emit('message-pinned', {
                messageId,
                pinnedBy: user.username,
                timestamp: new Date()
            });

            callback({ success: true });

        } catch (err) {
            console.error('Error pinning message:', err);
            callback({ error: 'Failed to pin message' });
        }
    };

    // Handle message editing
    const handleEditMessage = async ({ messageId, newText, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'Authentication required' });

            const message = await Message.findOne({ id: messageId });
            if (!message) return callback({ error: 'Message not found' });
            
            if (message.sender !== socket.id) {
                return callback({ error: 'You can only edit your own messages' });
            }

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'Group access denied' });
            }

            const sanitizedText = sanitizeHtml(newText || '', { 
                allowedTags: ['b', 'i', 'u', 'br'], 
                allowedAttributes: {} 
            });

            const encryptedText = group.settings.messageEncryption ? 
                encrypt(sanitizedText, group.encryptionKey) : 
                sanitizedText;

            message.text = encryptedText;
            message.edited = true;
            message.editedAt = new Date();
            await message.save();

            // Update cache
            const cachedMessages = messages.get(groupId);
            if (cachedMessages) {
                const cachedMessage = cachedMessages.find(m => m.id === messageId);
                if (cachedMessage) {
                    cachedMessage.text = encryptedText;
                    cachedMessage.edited = true;
                    cachedMessage.editedAt = message.editedAt;
                }
            }

            const messageToSend = {
                ...message.toObject(),
                text: group.settings.messageEncryption ? 
                    decrypt(encryptedText, group.encryptionKey) : 
                    encryptedText
            };

            io.to(groupId).emit('message-edited', messageToSend);
            callback({ success: true, message: messageToSend });

        } catch (err) {
            console.error('Error editing message:', err);
            callback({ error: 'Failed to edit message' });
        }
    };

    // Handle message deletion
    const handleDeleteMessage = async ({ messageId, groupId }, callback) => {
        try {
            const message = await Message.findOne({ id: messageId });
            if (!message) return callback({ error: 'پیام یافت نشد' });

            const group = await Group.findOne({ id: groupId });
            if (!group) return callback({ error: 'گروه یافت نشد' });

            if (message.sender !== socket.id && !group.isAdminOrModerator(socket.id)) {
                return callback({ error: 'شما دسترسی لازم را ندارید' });
            }

            await message.remove();

            io.to(groupId).emit('message-deleted', { messageId });
            callback({ success: true });
        } catch (err) {
            console.error('Error deleting message:', err);
            callback({ error: 'خطا در حذف پیام' });
        }
    };

    // Handle message reactions
    const handleReaction = async ({ messageId, emoji, groupId }, callback) => {
        try {
            const message = await Message.findOne({ id: messageId });
            if (!message) return callback({ error: 'پیام یافت نشد' });

            const reaction = message.reactions.find(r => r.emoji === emoji);
            if (reaction) {
                if (!reaction.users.includes(socket.id)) {
                    reaction.users.push(socket.id);
                }
            } else {
                message.reactions.push({ emoji, users: [socket.id] });
            }

            await message.save();

            // Update cache if message exists
            const cachedMessages = messages.get(groupId);
            if (cachedMessages) {
                const cachedMessage = cachedMessages.find(m => m.id === messageId);
                if (cachedMessage) {
                    cachedMessage.reactions = message.reactions;
                }
            }

            io.to(groupId).emit('message-reacted', { 
                messageId,
                reactions: message.reactions 
            });
            callback({ success: true });

        } catch (err) {
            console.error('Error adding reaction:', err);
            callback({ error: 'خطا در افزودن واکنش' });
        }
    };

    // Handle sticker messages
    const handleSticker = async ({ packId, stickerId, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await groups.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'شما عضو این گروه نیستید' });
            }

            if (!group.settings.allowStickers) {
                return callback({ error: 'استیکر در این گروه غیرفعال است' });
            }

            const message = {
                id: uuidv4(),
                sender: socket.id,
                username: user.username,
                avatar: user.avatar,
                groupId: groupId,
                timestamp: new Date(),
                sticker: {
                    packId,
                    stickerId
                }
            };

            await Message.create(message);

            // Update cache
            if (!messages.has(groupId)) {
                messages.set(groupId, []);
            }
            messages.get(groupId).push(message);

            io.to(groupId).emit('new-message', message);
            callback({ success: true });

        } catch (err) {
            console.error('Error sending sticker:', err);
            callback({ error: 'خطا در ارسال استیکر' });
        }
    };

    // Handle loading messages
    const handleLoadMessages = async (groupId, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'شما عضو این گروه نیستید' });
            }

            let groupMessages = messages.get(groupId);
            
            if (!groupMessages) {
                groupMessages = await Message.getGroupMessages(groupId);
                messages.set(groupId, groupMessages);
            }

            // Decrypt messages before sending
            const decryptedMessages = groupMessages.map(msg => {
                if (msg.encrypted) {
                    return {
                        ...msg,
                        text: decrypt(msg.text, group.encryptionKey)
                    };
                }
                return msg;
            });

            callback({ success: true, messages: decryptedMessages });

        } catch (err) {
            console.error('Error loading messages:', err);
            callback({ error: 'خطا در بارگذاری پیام‌ها' });
        }
    };

    // Handle loading more messages
    const handleLoadMoreMessages = async ({ groupId, before }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'شما عضو این گروه نیستید' });
            }

            const moreMessages = await Message.getGroupMessages(groupId, {
                before,
                limit: 20,
                sort: -1
            });

            // Decrypt messages if needed
            const decryptedMessages = moreMessages.map(msg => {
                if (msg.encrypted) {
                    return {
                        ...msg,
                        text: decrypt(msg.text, group.encryptionKey)
                    };
                }
                return msg;
            });

            callback({ success: true, messages: decryptedMessages });
        } catch (err) {
            console.error('Error loading more messages:', err);
            callback({ error: 'خطا در بارگذاری پیام‌ها' });
        }
    };

    // Handle unpinning messages
    const handleUnpinMessage = async ({ messageId, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'Authentication required' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'Group access denied' });
            }

            if (!group.pinnedMessages) {
                return callback({ error: 'No pinned messages in this group' });
            }

            const messageIndex = group.pinnedMessages.indexOf(messageId);
            if (messageIndex === -1) {
                return callback({ error: 'Message is not pinned' });
            }

            // Remove from group's pinned messages
            group.pinnedMessages.splice(messageIndex, 1);
            await group.save();

            // Update message
            const message = await Message.findOne({ id: messageId });
            if (message) {
                message.isPinned = false;
                await message.save();

                // Update cache
                const cachedMessages = messages.get(groupId);
                if (cachedMessages) {
                    const cachedMessage = cachedMessages.find(m => m.id === messageId);
                    if (cachedMessage) {
                        cachedMessage.isPinned = false;
                    }
                }
            }

            io.to(groupId).emit('message-unpinned', {
                messageId,
                unpinnedBy: {
                    id: socket.id,
                    username: user.username
                },
                timestamp: new Date()
            });

            callback({ success: true });
        } catch (err) {
            console.error('Error unpinning message:', err);
            callback({ error: 'Failed to unpin message' });
        }
    };

    // Get pinned messages
    const getPinnedMessages = async ({ groupId }, callback) => {
        try {
            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'Group access denied' });
            }

            if (!group.pinnedMessages || group.pinnedMessages.length === 0) {
                return callback({ success: true, messages: [] });
            }

            const pinnedMessages = await Message.find({
                id: { $in: group.pinnedMessages }
            }).sort({ timestamp: -1 });

            callback({
                success: true,
                messages: pinnedMessages.map(msg => ({
                    ...msg.toObject(),
                    text: msg.encrypted ? 
                        decrypt(msg.text, group.encryptionKey) : 
                        msg.text
                }))
            });
        } catch (err) {
            console.error('Error fetching pinned messages:', err);
            callback({ error: 'Failed to fetch pinned messages' });
        }
    };

    // Handle message search
    const handleSearchMessages = async ({ query, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'Please set your username first' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'You are not a member of this group' });
            }

            // Check rate limit
            if (!(await rateLimiter.checkRateLimit(socket.id, 'search'))) {
                const timeToNext = rateLimiter.getTimeToNext(socket.id, 'search');
                return callback({
                    error: `Please wait ${Math.ceil(timeToNext / 1000)} seconds before searching again`
                });
            }

            const searchResults = await messageSearch.search(groupId, query);

            // Decrypt messages if needed
            const decryptedResults = searchResults.map(msg => {
                const processedMsg = {
                    ...msg,
                    text: msg.encrypted ? decrypt(msg.text, group.encryptionKey) : msg.text
                };

                // Highlight matched text
                if (processedMsg.text) {
                    processedMsg.text = messageSearch.highlightMatches(processedMsg.text, query);
                }
                if (processedMsg.username) {
                    processedMsg.username = messageSearch.highlightMatches(processedMsg.username, query);
                }
                return processedMsg;
            });

            callback({ success: true, messages: decryptedResults });
        } catch (err) {
            console.error('Error searching messages:', err);
            callback({ error: 'Error searching messages' });
        }
    };

    // Handle replying to messages
    const handleReplyToMessage = async ({ text, groupId, replyTo, attachments = [] }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'Authentication required' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'Group access denied' });
            }

            const originalMessage = await Message.findOne({ id: replyTo });
            if (!originalMessage) {
                return callback({ error: 'Original message not found' });
            }

            const sanitizedText = sanitizeHtml(text || '', { 
                allowedTags: ['b', 'i', 'u', 'br'], 
                allowedAttributes: {} 
            });

            const messageText = group.settings.messageEncryption ? 
                encrypt(sanitizedText, group.encryptionKey) : 
                sanitizedText;

            const message = {
                id: uuidv4(),
                text: messageText,
                encrypted: group.settings.messageEncryption,
                sender: socket.id,
                username: user.username,
                avatar: user.avatar,
                groupId: groupId,
                timestamp: new Date(),
                replyTo: {
                    id: originalMessage.id,
                    text: originalMessage.text,
                    username: originalMessage.username,
                    timestamp: originalMessage.timestamp
                },
                attachments: attachments.map(att => ({
                    url: att.url,
                    type: att.type,
                    originalName: sanitizeHtml(att.originalName, { allowedTags: [], allowedAttributes: {} }),
                    size: att.size
                }))
            };

            await Message.create(message);

            if (!messages.has(groupId)) {
                messages.set(groupId, []);
            }
            messages.get(groupId).push(message);

            // Cache management
            const maxCacheSize = parseInt(process.env.MESSAGE_CACHE_SIZE) || 100;
            if (messages.get(groupId).length > maxCacheSize) {
                messages.get(groupId).shift();
            }

            const messageToSend = { ...message };
            if (message.encrypted) {
                messageToSend.text = decrypt(message.text, group.encryptionKey);
                if (messageToSend.replyTo) {
                    messageToSend.replyTo.text = decrypt(messageToSend.replyTo.text, group.encryptionKey);
                }
            }

            io.to(groupId).emit('new-message', messageToSend);
            callback({ success: true, message: messageToSend });

        } catch (err) {
            console.error('Error sending reply:', err);
            callback({ error: 'Failed to send reply' });
        }
    };

    // Handle reconnection and process offline queue
    socket.on('reconnect', async () => {
        const user = users.get(socket.id);
        if (!user) return;

        const userGroups = Array.from(groups.values())
            .filter(group => group.members.includes(socket.id))
            .map(group => group.id);

        for (const groupId of userGroups) {
            const processedMessages = await offlineQueue.processQueue(groupId);
            if (processedMessages.length > 0) {
                socket.emit('offline-messages-synced', {
                    groupId,
                    messages: processedMessages
                });
            }
        }
    });

    // Register all event handlers
    socket.on('send-message', handleSendMessage);
    socket.on('pin-message', handlePinMessage);
    socket.on('edit-message', handleEditMessage);
    socket.on('delete-message', handleDeleteMessage);
    socket.on('reaction', handleReaction);
    socket.on('sticker', handleSticker);
    socket.on('load-messages', handleLoadMessages);
    socket.on('load-more-messages', handleLoadMoreMessages);
    socket.on('unpin-message', handleUnpinMessage);
    socket.on('get-pinned-messages', getPinnedMessages);
    socket.on('search-messages', handleSearchMessages);
    socket.on('reply-message', handleReplyToMessage);

    // Clear search cache when messages are deleted/edited
    socket.on('message-deleted', ({ groupId }) => {
        messageSearch.clearGroupCache(groupId);
    });

    socket.on('message-edited', ({ groupId }) => {
        messageSearch.clearGroupCache(groupId);
    });

    // Return public interface
    return {
        handleSendMessage,
        handlePinMessage,
        handleEditMessage,
        handleDeleteMessage,
        handleReaction,
        handleSticker,
        handleLoadMessages,
        handleLoadMoreMessages,
        handleUnpinMessage,
        getPinnedMessages,
        handleSearchMessages,
        handleReplyToMessage
    };
};

module.exports = createMessageHandlers;