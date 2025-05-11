const { Message } = require('../../models');

// Track typing status per group
const typingUsers = new Map(); // groupId -> Set of typing user socketIds
const messageReadStatus = new Map(); // messageId -> Set of user socketIds who read it

const statusHandlers = (io, socket, users) => {
    const handleTyping = ({ groupId, isTyping }) => {
        const user = users.get(socket.id);
        if (!user || !groupId) return;

        if (!typingUsers.has(groupId)) {
            typingUsers.set(groupId, new Set());
        }

        const groupTyping = typingUsers.get(groupId);
        
        if (isTyping) {
            groupTyping.add(socket.id);
        } else {
            groupTyping.delete(socket.id);
        }

        // Get usernames of all typing users except current user
        const typingUsernames = Array.from(groupTyping)
            .filter(id => id !== socket.id)
            .map(id => users.get(id)?.username)
            .filter(Boolean);

        // Emit typing status to group
        io.to(groupId).emit('typing-status', {
            users: typingUsernames
        });

        // Clear typing status after timeout
        if (isTyping) {
            setTimeout(() => {
                if (typingUsers.get(groupId)?.has(socket.id)) {
                    typingUsers.get(groupId).delete(socket.id);
                    handleTyping({ groupId, isTyping: false });
                }
            }, parseInt(process.env.TYPING_TIMEOUT) || 3000);
        }
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
            await Message.findOneAndUpdate(
                { id: messageId },
                { $addToSet: { readBy: socket.id } }
            );

            // Notify group about read status
            io.to(groupId).emit('message-read', {
                messageId,
                readBy: Array.from(messageReadStatus.get(messageId))
                    .map(id => ({
                        socketId: id,
                        username: users.get(id)?.username
                    }))
                    .filter(user => user.username)
            });
        } catch (err) {
            console.error('Error updating read status:', err);
        }
    };

    const handleUserDisconnect = () => {
        // Clean up typing status
        for (const [groupId, typingSet] of typingUsers.entries()) {
            if (typingSet.has(socket.id)) {
                typingSet.delete(socket.id);
                handleTyping({ groupId, isTyping: false });
            }
        }
    };

    return {
        handleTyping,
        handleMessageRead,
        handleUserDisconnect,
        typingUsers,
        messageReadStatus
    };
};

module.exports = statusHandlers;