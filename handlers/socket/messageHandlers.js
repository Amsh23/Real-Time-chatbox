const { Message, Group } = require('../../models');
const sanitizeHtml = require('sanitize-html');
const { v4: uuidv4 } = require('uuid');
const { encrypt, decrypt } = require('../../utils/encryption');

// In-memory message cache
const messages = new Map();

const messageHandlers = (io, socket, users, groups) => {
    const handleSendMessage = async ({ text, groupId, attachments = [] }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'شما عضو این گروه نیستید' });
            }

            const sanitizedText = sanitizeHtml(text || '', { 
                allowedTags: ['b', 'i', 'u', 'br'], 
                allowedAttributes: {} 
            });

            // Encrypt message if encryption is enabled for the group
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

            await Message.create(message);

            if (!messages.has(groupId)) {
                messages.set(groupId, []);
            }
            messages.get(groupId).push(message);

            const maxCacheSize = parseInt(process.env.MESSAGE_CACHE_SIZE) || 100;
            if (messages.get(groupId).length > maxCacheSize) {
                messages.get(groupId).shift();
            }

            // Decrypt message for sending to clients
            const messageToSend = { ...message };
            if (message.encrypted) {
                messageToSend.text = decrypt(message.text, group.encryptionKey);
            }

            io.to(groupId).emit('new-message', messageToSend);
            callback({ success: true, message: messageToSend });

        } catch (err) {
            console.error('Error sending message:', err);
            callback({ error: 'خطا در ارسال پیام' });
        }
    };

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

    const handlePinMessage = async ({ messageId, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.isAdminOrModerator(socket.id)) {
                return callback({ error: 'شما دسترسی لازم را ندارید' });
            }

            const message = await Message.findOne({ id: messageId });
            if (!message) return callback({ error: 'پیام یافت نشد' });

            message.metadata.pinned = true;
            message.metadata.pinnedBy = socket.id;
            message.metadata.pinnedAt = new Date();
            await message.save();

            io.to(groupId).emit('message-pinned', {
                messageId,
                pinnedBy: user.username,
                timestamp: message.metadata.pinnedAt
            });

            callback({ success: true });
        } catch (err) {
            console.error('Error pinning message:', err);
            callback({ error: 'خطا در پین کردن پیام' });
        }
    };

    const handleEditMessage = async ({ messageId, newText, groupId }, callback) => {
        try {
            const message = await Message.findOne({ id: messageId });
            if (!message) return callback({ error: 'پیام یافت نشد' });
            
            if (message.sender !== socket.id) {
                return callback({ error: 'شما نمی‌توانید این پیام را ویرایش کنید' });
            }

            const sanitizedText = sanitizeHtml(newText || '', { 
                allowedTags: ['b', 'i', 'u', 'br'],
                allowedAttributes: {}
            });

            await message.editText(sanitizedText);

            io.to(groupId).emit('message-edited', {
                messageId,
                newText: sanitizedText,
                editHistory: message.metadata.editHistory
            });

            callback({ success: true });
        } catch (err) {
            console.error('Error editing message:', err);
            callback({ error: 'خطا در ویرایش پیام' });
        }
    };

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

    const handleSearchMessages = async ({ query, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group || !group.members.includes(socket.id)) {
                return callback({ error: 'شما عضو این گروه نیستید' });
            }

            // Search in database
            const searchResults = await Message.find({
                groupId,
                $or: [
                    { text: { $regex: query, $options: 'i' } },
                    { username: { $regex: query, $options: 'i' } },
                    { 'attachments.originalName': { $regex: query, $options: 'i' } }
                ]
            }).sort({ timestamp: -1 }).limit(20);

            // Decrypt messages if needed
            const decryptedResults = searchResults.map(msg => {
                if (msg.encrypted) {
                    return {
                        ...msg.toObject(),
                        text: decrypt(msg.text, group.encryptionKey)
                    };
                }
                return msg.toObject();
            });

            callback({ success: true, messages: decryptedResults });
        } catch (err) {
            console.error('Error searching messages:', err);
            callback({ error: 'خطا در جستجوی پیام‌ها' });
        }
    };

    // Queue for storing offline messages
    const offlineMessageQueue = new Map();

    const handleQueuedMessages = async (userId) => {
        try {
            const queuedMessages = offlineMessageQueue.get(userId) || [];
            if (queuedMessages.length === 0) return;

            // Send queued messages
            for (const msg of queuedMessages) {
                await handleSendMessage(msg, () => {});
            }

            // Clear queue after sending
            offlineMessageQueue.delete(userId);
        } catch (err) {
            console.error('Error processing queued messages:', err);
        }
    };

    socket.on('reconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            handleQueuedMessages(socket.id);
        }
    });

    const handleOfflineMessage = async (message) => {
        const { sender } = message;
        if (!offlineMessageQueue.has(sender)) {
            offlineMessageQueue.set(sender, []);
        }
        offlineMessageQueue.get(sender).push(message);
    };

    return {
        handleSendMessage,
        handleLoadMessages,
        handleLoadMoreMessages,
        handleReaction,
        handleSticker,
        handlePinMessage,
        handleEditMessage,
        handleDeleteMessage,
        handleOfflineMessage,
        handleQueuedMessages,
        handleSearchMessages,
        messages
    };
};

module.exports = messageHandlers;