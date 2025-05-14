const userHandlers = require('./userHandlers');
const groupHandlers = require('./groupHandlers');
const messageHandlers = require('./messageHandlers');
const statusHandlers = require('./statusHandlers');

const initializeSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        console.log('کاربر متصل شد:', socket.id);

        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;

        // Initialize handlers
        const { handleSetUsername, handleDisconnect, users, onlineUsers } = userHandlers(io, socket);
        const { handleCreateGroup, handleJoinGroup, handleLeaveGroup, groups } = groupHandlers(io, socket, users);
        const { handleSendMessage, handleReaction, handleSticker, handleLoadMessages, handleOfflineMessage } = messageHandlers(io, socket, users, groups);
        const { handleTyping, handleMessageRead, handleUserDisconnect } = statusHandlers(io, socket, users);

        // Connection recovery handling
        socket.on('reconnect_attempt', () => {
            reconnectAttempts++;
            if (reconnectAttempts <= maxReconnectAttempts) {
                socket.emit('reconnection_status', {
                    attempt: reconnectAttempts,
                    max: maxReconnectAttempts
                });
            }
        });

        socket.on('reconnect', () => {
            reconnectAttempts = 0;
            const user = users.get(socket.id);
            if (user) {
                handleSetUsername(user.username, () => {});
                socket.emit('reconnected', { success: true });
            }
        });

        socket.on('reconnect_failed', () => {
            socket.emit('connection_error', {
                error: 'اتصال مجدد ناموفق بود. لطفاً صفحه را رفرش کنید.'
            });
        });

        // User events with enhanced error handling
        socket.on('set-username', (username, callback) => {
            try {
                handleSetUsername(username, callback);
            } catch (error) {
                console.error('Error in set-username:', error);
                callback?.({ error: 'خطا در تنظیم نام کاربری: ' + error.message });
            }
        });

        socket.on('disconnect', async () => {
            try {
                await handleUserDisconnect();
                await handleDisconnect();
            } catch (error) {
                console.error('Error in disconnect:', error);
            }
        });

        // Group events with enhanced validation
        socket.on('create-group', async (groupName, callback) => {
            try {
                if (!groupName?.trim()) {
                    return callback?.({ error: 'نام گروه نمی‌تواند خالی باشد' });
                }
                await handleCreateGroup(groupName, callback);
            } catch (error) {
                console.error('Error in create-group:', error);
                callback?.({ error: 'خطا در ایجاد گروه: ' + error.message });
            }
        });

        socket.on('join-group', handleJoinGroup);
        socket.on('leave-group', handleLeaveGroup);

        // Message events with offline support
        socket.on('send-message', async (message, callback) => {
            try {
                if (!socket.connected) {
                    await handleOfflineMessage(message);
                    return callback?.({ queued: true });
                }
                await handleSendMessage(message, callback);
            } catch (error) {
                console.error('Error in send-message:', error);
                callback?.({ error: 'خطا در ارسال پیام: ' + error.message });
            }
        });

        socket.on('add-reaction', handleReaction);
        socket.on('send-sticker', handleSticker);
        socket.on('load-messages', handleLoadMessages);

        // Status events
        socket.on('typing', handleTyping);
        socket.on('message-read', handleMessageRead);

        // Error handling for uncaught socket events
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            socket.emit('error', { 
                message: 'خطای داخلی سرور',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        });

        // Send initial online users count
        socket.emit('online-count', onlineUsers.size);
    });

    // Handle server-wide errors
    io.engine.on('connection_error', (err) => {
        console.error('Connection error:', err);
    });
};

module.exports = initializeSocketHandlers;