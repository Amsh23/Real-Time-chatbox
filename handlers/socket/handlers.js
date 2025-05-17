const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const rateLimiter = require('../../utils/rateLimiter');
const store = require('../../models/memoryStore');

class SocketHandlers {
    constructor(io) {
        this.io = io;
        this.store = store;
        this.messageCache = new Map();
        this.userCache = new Map();
        this.groupCache = new Map();
    }

    handleConnection(socket) {
        console.log(`User connected: ${socket.id}`);
        this.setupMessageHandlers(socket);
        this.setupUserHandlers(socket);
        this.setupGroupHandlers(socket);
        this.setupStatusHandlers(socket);
        this.setupFileHandlers(socket);

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            this.handleDisconnect(socket);
        });
    }

    // Optimized message handling
    setupMessageHandlers(socket) {
        const handlers = {
            'send-message': async (data, callback) => {
                try {
                    callback = callback || (() => {});
                    const { text, groupId } = data;

                    if (!text || !groupId) {
                        return callback({ error: 'Invalid message data' });
                    }

                    const rateLimited = await rateLimiter.checkLimit(socket.id, 'message');
                    if (rateLimited) {
                        return callback({ error: 'Rate limit exceeded' });
                    }

                    const message = {
                        id: uuidv4(),
                        text: sanitizeHtml(text),
                        sender: socket.id,
                        username: socket.username || 'Anonymous',
                        groupId,
                        timestamp: new Date()
                    };

                    await this.store.createMessage(message);
                    this.io.to(groupId).emit('new-message', message);
                    callback({ success: true, messageId: message.id });

                } catch (err) {
                    console.error('Error sending message:', err);
                    callback({ error: 'Failed to send message' });
                }
            },

            'edit-message': async (data, callback) => {
                try {
                    callback = callback || (() => {});
                    const { messageId, text, groupId } = data;

                    if (!messageId || !text || !groupId) {
                        return callback({ error: 'Invalid edit data' });
                    }

                    const message = await this.store.editMessage(messageId, text);
                    if (!message) {
                        return callback({ error: 'Message not found' });
                    }

                    this.io.to(groupId).emit('message-updated', message);
                    callback({ success: true });

                } catch (err) {
                    console.error('Error editing message:', err);
                    callback({ error: 'Failed to edit message' });
                }
            },

            'delete-message': async (data, callback) => {
                try {
                    callback = callback || (() => {});
                    const { messageId, groupId } = data;

                    if (!messageId || !groupId) {
                        return callback({ error: 'Invalid delete data' });
                    }

                    await this.store.deleteMessage(messageId);
                    this.io.to(groupId).emit('message-deleted', { messageId });
                    callback({ success: true });

                } catch (err) {
                    console.error('Error deleting message:', err);
                    callback({ error: 'Failed to delete message' });
                }
            },

            'pin-message': async (data, callback) => {
                try {
                    callback = callback || (() => {});
                    const { messageId, groupId } = data;

                    if (!messageId || !groupId) {
                        return callback({ error: 'Invalid pin data' });
                    }

                    const message = await this.store.pinMessage(messageId, socket.id);
                    if (!message) {
                        return callback({ error: 'Message not found' });
                    }

                    this.io.to(groupId).emit('message-pinned', message);
                    callback({ success: true });

                } catch (err) {
                    console.error('Error pinning message:', err);
                    callback({ error: 'Failed to pin message' });
                }
            }
        };

        // Register all handlers with proper callback handling
        Object.entries(handlers).forEach(([event, handler]) => {
            socket.on(event, (...args) => {
                const callback = typeof args[args.length - 1] === 'function' 
                    ? args.pop() 
                    : () => {};
                handler(args[0], callback);
            });
        });
    }

    // User handlers
    setupUserHandlers(socket) {
        socket.on('set-username', async (username, callback) => {
            try {
                callback = callback || (() => {});
                
                if (!username || typeof username !== 'string') {
                    return callback({ error: 'Invalid username' });
                }

                socket.username = username;
                this.userCache.set(socket.id, { id: socket.id, username });
                callback({ success: true });

            } catch (err) {
                console.error('Error setting username:', err);
                callback({ error: 'Failed to set username' });
            }
        });
    }

    // Group handlers
    setupGroupHandlers(socket) {
        const handlers = {
            'join-group': async (data, callback) => {
                try {
                    callback = callback || (() => {});
                    const { groupId } = data;

                    if (!groupId) {
                        return callback({ error: 'Invalid group data' });
                    }

                    const group = await this.store.groups.get(groupId);
                    if (!group) {
                        return callback({ error: 'Group not found' });
                    }

                    socket.join(groupId);
                    group.members.push(socket.id);
                    this.store.groups.set(groupId, group);
                    callback({ success: true });

                } catch (err) {
                    console.error('Error joining group:', err);
                    callback({ error: 'Failed to join group' });
                }
            },

            'leave-group': async (data, callback) => {
                try {
                    callback = callback || (() => {});
                    const { groupId } = data;

                    if (!groupId) {
                        return callback({ error: 'Invalid group data' });
                    }

                    socket.leave(groupId);
                    const group = this.store.groups.get(groupId);
                    if (group) {
                        group.members = group.members.filter(id => id !== socket.id);
                        this.store.groups.set(groupId, group);
                    }
                    callback({ success: true });

                } catch (err) {
                    console.error('Error leaving group:', err);
                    callback({ error: 'Failed to leave group' });
                }
            }
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            socket.on(event, (...args) => {
                const callback = typeof args[args.length - 1] === 'function' 
                    ? args.pop() 
                    : () => {};
                handler(args[0], callback);
            });
        });
    }

    // Status handlers
    setupStatusHandlers(socket) {
        socket.on('typing-start', groupId => {
            this.io.to(groupId).emit('user-typing', {
                userId: socket.id,
                username: socket.username
            });
        });

        socket.on('typing-stop', groupId => {
            this.io.to(groupId).emit('user-stopped-typing', {
                userId: socket.id
            });
        });
    }

    // File handlers with optimized upload
    setupFileHandlers(socket) {
        socket.on('upload-file', async (data, callback) => {
            try {
                callback = callback || (() => {});
                const { file, groupId } = data;

                if (!file || !groupId) {
                    return callback({ error: 'Invalid file data' });
                }

                const rateLimited = await rateLimiter.checkLimit(socket.id, 'upload');
                if (rateLimited) {
                    return callback({ error: 'Upload rate limit exceeded' });
                }

                const fileId = uuidv4();
                const fileData = {
                    id: fileId,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    uploadedBy: socket.id,
                    uploadedAt: new Date(),
                    groupId
                };

                await this.store.fileUploads.set(fileId, fileData);
                this.io.to(groupId).emit('file-uploaded', fileData);
                callback({ success: true, fileId });

            } catch (err) {
                console.error('Error uploading file:', err);
                callback({ error: 'Failed to upload file' });
            }
        });
    }

    // Cleanup on disconnect
    handleDisconnect(socket) {
        this.userCache.delete(socket.id);
        
        // Clean up group memberships
        this.store.groups.forEach((group, groupId) => {
            if (group.members.includes(socket.id)) {
                group.members = group.members.filter(id => id !== socket.id);
                this.store.groups.set(groupId, group);
            }
        });

        // Emit offline status
        this.io.emit('user-offline', { userId: socket.id });
    }
}

module.exports = SocketHandlers;
