const { Message, User } = require('../../models');
const monitor = require('../../utils/monitoring');

// Track typing status per group
const typingUsers = new Map(); // groupId -> Map of typing user socketIds -> timeout
const messageReadStatus = new Map(); // messageId -> Set of user socketIds who read it

const statusHandlers = (io, socket, users, groups) => {
    const handleTyping = ({ groupId, isTyping }) => {
        const user = users.get(socket.id);
        if (!user || !groupId) return;

        if (!typingUsers.has(groupId)) {
            typingUsers.set(groupId, new Map());
        }

        const groupTyping = typingUsers.get(groupId);
        
        // Clear existing timeout if any
        if (groupTyping.has(socket.id)) {
            clearTimeout(groupTyping.get(socket.id));
        }

        if (isTyping) {
            // Set new timeout
            const timeout = setTimeout(() => {
                if (typingUsers.get(groupId)?.has(socket.id)) {
                    typingUsers.get(groupId).delete(socket.id);
                    emitTypingStatus(groupId);
                }
            }, parseInt(process.env.TYPING_TIMEOUT) || 3000);
            
            groupTyping.set(socket.id, timeout);
        } else {
            groupTyping.delete(socket.id);
        }

        emitTypingStatus(groupId);
    };

    const emitTypingStatus = (groupId) => {
        const groupTyping = typingUsers.get(groupId);
        if (!groupTyping) return;

        // Get usernames of all typing users except current user
        const typingUsernames = Array.from(groupTyping.keys())
            .filter(id => id !== socket.id)
            .map(id => users.get(id)?.username)
            .filter(Boolean);

        // Format typing message based on number of users
        let typingMessage = '';
        if (typingUsernames.length === 1) {
            typingMessage = `${typingUsernames[0]} در حال نوشتن است...`;
        } else if (typingUsernames.length === 2) {
            typingMessage = `${typingUsernames[0]} و ${typingUsernames[1]} در حال نوشتن هستند...`;
        } else if (typingUsernames.length > 2) {
            typingMessage = `${typingUsernames.length} نفر در حال نوشتن هستند...`;
        }

        // Emit typing status to group
        io.to(groupId).emit('typing-status', {
            users: typingUsernames,
            message: typingMessage
        });
    };

    const handleMessageRead = async ({ messageId, groupId }) => {
        try {
            const user = users.get(socket.id);
            if (!user) return;

            // Update read status in memory
            if (!messageReadStatus.has(messageId)) {
                messageReadStatus.set(messageId, new Set());
            }
            messageReadStatus.get(messageId).add(socket.id);

            // Update message read status in database
            const message = await Message.findOneAndUpdate(
                { id: messageId },
                { 
                    $addToSet: { readBy: socket.id },
                    status: 'read'
                },
                { new: true }
            );

            if (!message) return;

            // Get read receipt details
            const readBy = Array.from(messageReadStatus.get(messageId))
                .map(id => {
                    const user = users.get(id);
                    return user ? {
                        socketId: id,
                        username: user.username,
                        avatar: user.avatar,
                        timestamp: new Date()
                    } : null;
                })
                .filter(Boolean);

            // Notify group about read status
            io.to(groupId).emit('message-read', {
                messageId,
                readBy,
                readCount: readBy.length
            });

            // Send delivery receipt to sender
            if (message.sender && message.sender !== socket.id) {
                io.to(message.sender).emit('message-delivered', {
                    messageId,
                    readBy: user.username,
                    timestamp: new Date()
                });
            }
        } catch (err) {
            console.error('Error updating read status:', err);
        }
    };

    const handleMarkGroupRead = async (groupId) => {
        try {
            const user = users.get(socket.id);
            if (!user) return;

            // Get all unread messages in group
            const unreadMessages = await Message.find({
                groupId,
                readBy: { $ne: socket.id }
            });

            // Mark all messages as read
            for (const message of unreadMessages) {
                await handleMessageRead({ 
                    messageId: message.id, 
                    groupId 
                });
            }

            socket.emit('group-read', { 
                groupId,
                timestamp: new Date()
            });
        } catch (err) {
            console.error('Error marking group as read:', err);
        }
    };

    const handleUserDisconnect = () => {
        // Clean up typing status
        for (const [groupId, groupTyping] of typingUsers.entries()) {
            if (groupTyping.has(socket.id)) {
                clearTimeout(groupTyping.get(socket.id));
                groupTyping.delete(socket.id);
                emitTypingStatus(groupId);
            }
            
            // Remove empty typing maps
            if (groupTyping.size === 0) {
                typingUsers.delete(groupId);
            }
        }
    };

    // Clean up old read receipts periodically
    const cleanupReadReceipts = () => {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        
        for (const [messageId, readers] of messageReadStatus.entries()) {
            const message = messages?.get(messageId);
            if (!message || now - message.timestamp > oneDay) {
                messageReadStatus.delete(messageId);
            }
        }
    };

    // Run cleanup every hour
    setInterval(cleanupReadReceipts, 60 * 60 * 1000);

    const updateTypingStatus = (groupId, isTyping) => {
        const user = users.get(socket.id);
        if (!user) return;

        if (isTyping) {
            if (!user.typingIn) user.typingIn = new Set();
            user.typingIn.add(groupId);
        } else {
            if (user.typingIn) user.typingIn.delete(groupId);
        }

        const typingUsers = Array.from(users.values())
            .filter(u => u.typingIn && u.typingIn.has(groupId))
            .map(u => ({ id: u.id, username: u.username }));

        socket.to(groupId).emit('typing-status', typingUsers);
    };

    const updateUserStatus = async (status) => {
        try {
            const user = users.get(socket.id);
            if (!user) return;

            user.status = status;
            user.lastStatusUpdate = new Date();

            await User.findOneAndUpdate(
                { id: socket.id },
                { 
                    status,
                    lastStatusUpdate: user.lastStatusUpdate
                }
            );

            // Notify all groups the user is part of
            const userGroups = Array.from(groups.values())
                .filter(group => group.members.includes(socket.id))
                .map(group => group.id);

            userGroups.forEach(groupId => {
                const groupMembers = Array.from(users.values())
                    .filter(u => groups.get(groupId).members.includes(u.id))
                    .map(u => ({
                        id: u.id,
                        username: u.username,
                        status: u.status,
                        lastSeen: u.lastStatusUpdate
                    }));

                io.to(groupId).emit('user-status-update', groupMembers);
            });

            monitor.trackUserStatus(status);

        } catch (err) {
            console.error('Error updating user status:', err);
        }
    };

    // Typing indicator handlers
    socket.on('typing-start', ({ groupId }) => updateTypingStatus(groupId, true));
    socket.on('typing-stop', ({ groupId }) => updateTypingStatus(groupId, false));

    // User status handlers
    socket.on('set-status', updateUserStatus);

    // Auto-away detection
    let inactivityTimer;
    const startInactivityTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            updateUserStatus('away');
        }, 5 * 60 * 1000); // 5 minutes
    };

    socket.on('activity', () => {
        const user = users.get(socket.id);
        if (user && user.status === 'away') {
            updateUserStatus('online');
        }
        startInactivityTimer();
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
        clearTimeout(inactivityTimer);
        const user = users.get(socket.id);
        if (user) {
            updateUserStatus('offline');
        }
    });

    return {
        handleTyping,
        handleMessageRead,
        handleMarkGroupRead,
        handleUserDisconnect,
        typingUsers,
        messageReadStatus,
        updateTypingStatus,
        updateUserStatus
    };
};

module.exports = statusHandlers;