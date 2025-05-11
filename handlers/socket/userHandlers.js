const sanitizeHtml = require('sanitize-html');
const { User } = require('../../models');

// In-memory storage for quick access
const users = new Map();
const onlineUsers = new Set();

const userHandlers = (io, socket) => {
    const handleSetUsername = async (username, callback = () => {}) => {
        try {
            if (!username?.trim()) {
                return callback({ error: 'نام کاربری نمی‌تواند خالی باشد' });
            }

            const sanitizedUsername = sanitizeHtml(username.trim(), { 
                allowedTags: [], 
                allowedAttributes: {} 
            });

            // Create or update user in database
            const user = await User.findOneAndUpdate(
                { socketId: socket.id },
                {
                    socketId: socket.id,
                    username: sanitizedUsername,
                    status: 'online',
                    lastSeen: new Date()
                },
                { upsert: true, new: true }
            );

            if (!user.avatar) {
                user.avatar = user.generateAvatar();
                await user.save();
            }

            // Update in-memory storage
            users.set(socket.id, {
                username: user.username,
                role: user.role,
                avatar: user.avatar,
                status: 'online'
            });
            
            onlineUsers.add(socket.id);

            // Broadcast user connection
            io.emit('user-connected', {
                username: user.username,
                avatar: user.avatar,
                socketId: socket.id
            });
            
            io.emit('online-count', onlineUsers.size);
            callback({ success: true, user: users.get(socket.id) });
        } catch (err) {
            console.error('Error in set-username:', err);
            callback({ error: 'خطا در تنظیم نام کاربری' });
        }
    };

    const handleDisconnect = async () => {
        try {
            const user = users.get(socket.id);
            if (!user) return;

            // Update user status in database
            await User.findOneAndUpdate(
                { socketId: socket.id },
                { 
                    status: 'offline',
                    lastSeen: new Date()
                }
            );

            // Clean up in-memory storage
            users.delete(socket.id);
            onlineUsers.delete(socket.id);

            // Broadcast disconnect
            io.emit('user-disconnected', { username: user.username });
            io.emit('online-count', onlineUsers.size);
        } catch (err) {
            console.error('Error handling disconnect:', err);
        }
    };

    const handleTyping = (data) => {
        const user = users.get(socket.id);
        if (!user || !data.groupId) return;

        io.to(data.groupId).emit('user-typing', {
            username: user.username,
            isTyping: data.isTyping
        });
    };

    return {
        handleSetUsername,
        handleDisconnect,
        handleTyping,
        users,
        onlineUsers
    };
};

module.exports = userHandlers;