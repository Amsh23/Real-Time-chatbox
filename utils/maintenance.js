const { Message, Group } = require('../models');
const fs = require('fs').promises;
const path = require('path');

// Clean up old messages
const cleanupOldMessages = async (daysOld = 30) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await Message.deleteMany({
            timestamp: { $lt: cutoffDate },
            attachments: { $size: 0 } // Don't delete messages with attachments
        });

        console.log(`Cleaned up ${result.deletedCount} old messages`);
    } catch (err) {
        console.error('Error cleaning up old messages:', err);
    }
};

// Clean up unused uploads
const cleanupUnusedUploads = async () => {
    try {
        const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
        const files = await fs.readdir(uploadsDir);
        
        // Get all attachment URLs from database
        const attachmentUrls = new Set();
        const messages = await Message.find({ 'attachments.0': { $exists: true } });
        
        messages.forEach(message => {
            message.attachments.forEach(attachment => {
                if (attachment.url) {
                    const filename = path.basename(attachment.url);
                    attachmentUrls.add(filename);
                }
            });
        });

        // Delete files not referenced in database
        for (const file of files) {
            if (!attachmentUrls.has(file)) {
                await fs.unlink(path.join(uploadsDir, file));
                console.log(`Deleted unused file: ${file}`);
            }
        }
    } catch (err) {
        console.error('Error cleaning up unused uploads:', err);
    }
};

// Clean up inactive groups
const cleanupInactiveGroups = async (daysInactive = 90) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

        const inactiveGroups = await Group.find({
            lastActivity: { $lt: cutoffDate }
        });

        for (const group of inactiveGroups) {
            // Delete all messages in the group
            await Message.deleteMany({ groupId: group.id });
            // Delete the group
            await group.delete();
            console.log(`Cleaned up inactive group: ${group.name}`);
        }
    } catch (err) {
        console.error('Error cleaning up inactive groups:', err);
    }
};

// Memory cache cleanup
const cleanupMemoryCache = (messages, typingUsers, messageReadStatus) => {
    try {
        // Clear old messages from cache
        for (const [groupId, groupMessages] of messages.entries()) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 1); // Keep last 24 hours

            const filteredMessages = groupMessages.filter(msg => 
                msg.timestamp > cutoffDate
            );

            if (filteredMessages.length === 0) {
                messages.delete(groupId);
            } else {
                messages.set(groupId, filteredMessages);
            }
        }

        // Clear empty typing indicators
        for (const [groupId, typingSet] of typingUsers.entries()) {
            if (typingSet.size === 0) {
                typingUsers.delete(groupId);
            }
        }

        // Clear old read receipts
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        for (const [messageId, readers] of messageReadStatus.entries()) {
            const message = messages.get(messageId);
            if (!message || now - message.timestamp > oneDay) {
                messageReadStatus.delete(messageId);
            }
        }

        console.log('Memory cache cleanup completed');
    } catch (err) {
        console.error('Error in memory cache cleanup:', err);
    }
};

// Schedule regular maintenance
const scheduleMaintenanceTasks = (messages, typingUsers, messageReadStatus) => {
    // Run memory cache cleanup every hour
    setInterval(() => {
        cleanupMemoryCache(messages, typingUsers, messageReadStatus);
    }, 60 * 60 * 1000);

    // Run file and database cleanup daily
    setInterval(() => {
        cleanupOldMessages();
        cleanupUnusedUploads();
        cleanupInactiveGroups();
    }, 24 * 60 * 60 * 1000);
};

module.exports = {
    cleanupOldMessages,
    cleanupUnusedUploads,
    cleanupInactiveGroups,
    cleanupMemoryCache,
    scheduleMaintenanceTasks
};