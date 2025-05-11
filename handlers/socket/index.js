const userHandlers = require('./userHandlers');
const groupHandlers = require('./groupHandlers');
const messageHandlers = require('./messageHandlers');
const statusHandlers = require('./statusHandlers');

const initializeSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        console.log('کاربر متصل شد:', socket.id);

        // Initialize handlers
        const { handleSetUsername, handleDisconnect, users, onlineUsers } = userHandlers(io, socket);
        const { handleCreateGroup, handleJoinGroup, handleLeaveGroup, groups } = groupHandlers(io, socket, users);
        const { handleSendMessage, handleReaction, handleSticker, handleLoadMessages } = messageHandlers(io, socket, users, groups);
        const { handleTyping, handleMessageRead, handleUserDisconnect } = statusHandlers(io, socket, users);

        // User events
        socket.on('set-username', handleSetUsername);
        socket.on('disconnect', () => {
            handleUserDisconnect();
            handleDisconnect();
        });

        // Group events
        socket.on('create-group', handleCreateGroup);
        socket.on('join-group', handleJoinGroup);
        socket.on('leave-group', handleLeaveGroup);

        // Message events
        socket.on('send-message', handleSendMessage);
        socket.on('add-reaction', handleReaction);
        socket.on('send-sticker', handleSticker);
        socket.on('load-messages', handleLoadMessages);

        // Status events
        socket.on('typing', handleTyping);
        socket.on('message-read', handleMessageRead);

        // Error handling for uncaught socket events
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            socket.emit('error', { message: 'خطای داخلی سرور' });
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