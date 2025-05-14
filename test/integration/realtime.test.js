const io = require('socket.io-client');
const express = require('express');
const { createServer } = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { Message, User, Group } = require('../../models');
const { Server } = require('socket.io');
const initializeSocketHandlers = require('../../handlers/socket');

describe('Real-time Features', () => {
    let mongoServer;
    let httpServer;
    let app;
    let ioServer;
    let socket1, socket2;
    let uri;

    beforeAll(async () => {
        // Setup in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        uri = mongoServer.getUri();
        await mongoose.connect(uri);

        // Setup Express and Socket.IO server
        app = express();
        httpServer = createServer(app);
        ioServer = new Server(httpServer);
        
        // Initialize socket handlers
        const users = new Map();
        const groups = new Map();
        initializeSocketHandlers(ioServer, users, groups);

        // Start server
        await new Promise(resolve => httpServer.listen(0, resolve));
        const port = httpServer.address().port;
        const url = `http://localhost:${port}`;

        // Create test sockets
        socket1 = io(url, { forceNew: true });
        socket2 = io(url, { forceNew: true });

        // Wait for connections
        await Promise.all([
            new Promise(resolve => socket1.on('connect', resolve)),
            new Promise(resolve => socket2.on('connect', resolve))
        ]);
    }, 30000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
        await new Promise(resolve => httpServer.close(resolve));
        socket1.close();
        socket2.close();
    });

    test('should handle concurrent message sending', async () => {
        const messages = [];
        for (let i = 0; i < 10; i++) {
            messages.push({
                text: `Test message ${i}`,
                groupId: 'test-group'
            });
        }

        const responses = await Promise.all(
            messages.map(msg => 
                new Promise(resolve => {
                    socket1.emit('send-message', msg, resolve);
                })
            )
        );

        expect(responses.every(r => r.success)).toBeTruthy();
    }, 10000);

    test('should handle real-time updates', async () => {
        const messageReceived = new Promise(resolve => {
            socket2.on('new-message', message => {
                expect(message.text).toBe('Real-time test');
                resolve();
            });
        });

        socket1.emit('send-message', {
            text: 'Real-time test',
            groupId: 'test-group'
        });

        await messageReceived;
    }, 5000);

    test('should handle offline message queue', async () => {
        socket1.disconnect();
        
        const offlineMessage = {
            text: 'Offline message',
            groupId: 'test-group',
            timestamp: new Date()
        };

        // Queue message while offline
        socket1.emit('send-message', offlineMessage);
        
        // Reconnect and wait for message processing
        socket1.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const message = await Message.findOne({ text: 'Offline message' });
        expect(message).toBeTruthy();
    }, 5000);

    test('should handle concurrent file uploads', async () => {
        const files = Array(5).fill().map((_, i) => ({
            name: `test-file-${i}.txt`,
            type: 'text/plain',
            size: 1024
        }));

        const responses = await Promise.all(
            files.map(file => 
                new Promise(resolve => {
                    socket1.emit('upload-file', file, resolve);
                })
            )
        );

        expect(responses.every(r => r.success)).toBeTruthy();
    }, 10000);

    test('should handle group role changes', async () => {
        const roleUpdated = new Promise(resolve => {
            socket2.on('role-updated', data => {
                expect(data.role).toBe('moderator');
                resolve();
            });
        });

        socket1.emit('update-role', {
            userId: socket2.id,
            groupId: 'test-group',
            role: 'moderator'
        });

        await roleUpdated;
    }, 5000);

    test('should handle message caching and offline queue', async () => {
        const user1 = { id: 'user1', username: 'User 1' };
        const user2 = { id: 'user2', username: 'User 2' };
        const group = { id: 'group1', name: 'Test Group' };

        // Create test users and group
        await User.create([user1, user2]);
        await Group.create({
            ...group,
            members: [user1.id, user2.id]
        });

        // Connect sockets
        const socket1 = io('http://localhost:' + httpServer.address().port);
        const socket2 = io('http://localhost:' + httpServer.address().port);

        await Promise.all([
            new Promise(resolve => socket1.on('connect', resolve)),
            new Promise(resolve => socket2.on('connect', resolve))
        ]);

        // Set usernames
        await Promise.all([
            new Promise(resolve => 
                socket1.emit('set-username', user1.username, resolve)
            ),
            new Promise(resolve => 
                socket2.emit('set-username', user2.username, resolve)
            )
        ]);

        // Join group
        await Promise.all([
            new Promise(resolve => 
                socket1.emit('join-group', { groupId: group.id }, resolve)
            ),
            new Promise(resolve => 
                socket2.emit('join-group', { groupId: group.id }, resolve)
            )
        ]);

        // Test message sending and caching
        const messagePromise = new Promise(resolve => {
            socket2.on('new-message', message => {
                expect(message.text).toBe('Hello from User 1');
                resolve();
            });
        });

        socket1.emit('send-message', {
            text: 'Hello from User 1',
            groupId: group.id
        });

        await messagePromise;

        // Test offline queue
        socket2.disconnect();

        const offlineMessages = [];
        for (let i = 0; i < 3; i++) {
            await new Promise(resolve => {
                socket1.emit('send-message', {
                    text: `Offline message ${i + 1}`,
                    groupId: group.id
                }, resolve);
            });
            offlineMessages.push(`Offline message ${i + 1}`);
        }

        const syncPromise = new Promise(resolve => {
            socket2.on('offline-messages-synced', ({ messages }) => {
                expect(messages).toHaveLength(offlineMessages.length);
                messages.forEach((msg, i) => {
                    expect(msg.text).toBe(offlineMessages[i]);
                });
                resolve();
            });
        });

        socket2.connect();
        await syncPromise;

        // Cleanup
        socket1.disconnect();
        socket2.disconnect();
    }, 10000);

    test('should handle concurrent message operations', async () => {
        const user = { id: 'user1', username: 'User 1' };
        const group = { id: 'group1', name: 'Test Group' };

        await User.create(user);
        await Group.create({
            ...group,
            members: [user.id]
        });

        const socket = io('http://localhost:' + httpServer.address().port);
        await new Promise(resolve => socket.on('connect', resolve));
        await new Promise(resolve => 
            socket.emit('set-username', user.username, resolve)
        );
        await new Promise(resolve => 
            socket.emit('join-group', { groupId: group.id }, resolve)
        );

        // Send multiple messages concurrently
        const messages = Array(10).fill().map((_, i) => `Message ${i + 1}`);
        const results = await Promise.all(
            messages.map(text => 
                new Promise(resolve => 
                    socket.emit('send-message', {
                        text,
                        groupId: group.id
                    }, resolve)
                )
            )
        );

        // Verify all messages were sent successfully
        results.forEach(result => {
            expect(result.success).toBe(true);
        });

        // Verify messages are in correct order
        const storedMessages = await Message.find({ groupId: group.id })
            .sort({ timestamp: 1 });

        expect(storedMessages).toHaveLength(messages.length);
        storedMessages.forEach((msg, i) => {
            expect(msg.text).toBe(messages[i]);
        });

        socket.disconnect();
    }, 10000);
});