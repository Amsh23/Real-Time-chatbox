const io = require('socket.io-client');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const store = require('../../models/memoryStore');
const initializeSocketHandlers = require('../../handlers/socket');

describe('Real-time Features', () => {
    let httpServer;
    let app;
    let ioServer;
    let socket1, socket2;
    let port;

    beforeAll(async () => {
        // Setup Express and Socket.IO server
        app = express();
        httpServer = createServer(app);
        ioServer = new Server(httpServer);
        
        // Initialize socket handlers with in-memory store
        initializeSocketHandlers(ioServer, store);

        // Start server
        await new Promise(resolve => httpServer.listen(0, resolve));
        port = httpServer.address().port;
        const url = `http://localhost:${port}`;

        // Create test sockets
        socket1 = io(url, { forceNew: true });
        socket2 = io(url, { forceNew: true });

        // Wait for connections
        await Promise.all([
            new Promise(resolve => socket1.on('connect', resolve)),
            new Promise(resolve => socket2.on('connect', resolve))
        ]);

        // Set up test users
        store.users.set(socket1.id, { id: socket1.id, username: 'testUser1' });
        store.users.set(socket2.id, { id: socket2.id, username: 'testUser2' });

        // Set up test group
        store.groups.set('test-group', {
            id: 'test-group',
            name: 'Test Group',
            members: [socket1.id, socket2.id],
            admin: socket1.id,
            inviteCode: 'test123'
        });
    }, 30000);

    afterAll(async () => {
        await new Promise(resolve => httpServer.close(resolve));
        socket1.close();
        socket2.close();

        // Clear all stores
        store.messages.clear();
        store.users.clear();
        store.groups.clear();
        store.pinnedMessages.clear();
        store.messageHistory.clear();
        store.searchIndex.clear();
        store.reactions.clear();
        store.fileUploads.clear();
        store.typingUsers.clear();
        store.offlineQueue.clear();
        store.messageDeliveryStatus.clear();
    });

    test('should handle concurrent message sending', async () => {
        const messages = [];
        for (let i = 0; i < 5; i++) {
            messages.push({
                text: `Test message ${i}`,
                groupId: 'test-group',
                sender: socket1.id,
                username: 'testUser1'
            });
        }

        const results = await Promise.all(
            messages.map(async msg => 
                new Promise(resolve => {
                    socket1.emit('send-message', msg, (response) => {
                        resolve(response);
                    });
                })
            )
        );

        expect(results.every(r => r && r.success)).toBe(true);
        const storedMessages = Array.from(store.messages.values());
        expect(storedMessages.length).toBeGreaterThanOrEqual(messages.length);
    }, 10000);

    test('should handle real-time updates', async () => {
        const messageReceived = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Message not received')), 4000);
            socket2.once('new-message', message => {
                clearTimeout(timeout);
                expect(message.text).toBe('Real-time test');
                resolve();
            });
        });

        socket1.emit('send-message', {
            text: 'Real-time test',
            groupId: 'test-group',
            sender: socket1.id,
            username: 'testUser1'
        });

        await messageReceived;
    }, 5000);

    test('should handle message updates', async () => {
        // Create and store a test message
        const message = {
            id: 'test-update-id',
            text: 'Original text',
            groupId: 'test-group',
            sender: socket1.id,
            username: 'testUser1'
        };
        await store.createMessage(message);

        // Listen for the update event
        const updateReceived = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Update not received')), 4000);
            socket2.once('message-updated', updatedMessage => {
                clearTimeout(timeout);
                expect(updatedMessage.text).toBe('Updated text');
                resolve();
            });
        });

        // Emit the update
        socket1.emit('edit-message', {
            messageId: message.id,
            text: 'Updated text',
            groupId: 'test-group'
        });

        await updateReceived;
    }, 5000);

    test('should handle file uploads', async () => {
        const fileData = {
            name: 'test.txt',
            type: 'text/plain',
            size: 100,
            data: Buffer.from('Test file content')
        };

        const uploadComplete = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Upload not completed')), 4000);
            socket2.once('file-uploaded', file => {
                clearTimeout(timeout);
                expect(file.name).toBe(fileData.name);
                expect(file.type).toBe(fileData.type);
                resolve();
            });
        });

        socket1.emit('upload-file', {
            file: fileData,
            groupId: 'test-group'
        });

        await uploadComplete;
    }, 5000);

    test('should handle group role changes', async () => {
        const roleChangeReceived = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Role change not received')), 4000);
            socket2.once('role-updated', data => {
                clearTimeout(timeout);
                expect(data.role).toBe('moderator');
                resolve();
            });
        });

        socket1.emit('update-role', {
            userId: socket2.id,
            groupId: 'test-group',
            role: 'moderator'
        });

        await roleChangeReceived;
    }, 5000);

    test('should handle message caching and offline queue', async () => {
        // Create test socket for offline testing
        const socket3 = io(`http://localhost:${port}`, { forceNew: true });
        await new Promise(resolve => socket3.on('connect', resolve));

        // Set up test user and add to group
        const offlineUserId = 'offline-test-user';
        store.users.set(offlineUserId, { 
            id: offlineUserId, 
            username: 'offlineUser'
        });
        store.groups.get('test-group').members.push(offlineUserId);

        // Prepare to track offline messages
        const offlineMessages = [];
        socket3.on('new-message', msg => offlineMessages.push(msg));

        // Disconnect the socket
        socket3.disconnect();

        // Send messages while socket is offline
        const messagesToSend = [
            'Offline message 1',
            'Offline message 2',
            'Offline message 3'
        ];

        for (const text of messagesToSend) {
            socket1.emit('send-message', {
                text,
                groupId: 'test-group',
                sender: socket1.id,
                username: 'testUser1'
            });
            // Give time for message to be processed
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Verify messages were queued
        const queuedMessages = Array.from(store.offlineQueue.values())
            .filter(msg => msg.recipients.includes(offlineUserId));
        expect(queuedMessages.length).toBe(messagesToSend.length);

        // Reconnect and verify message delivery
        const syncPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Sync timeout')), 4000);
            socket3.once('offline-messages-sync', messages => {
                clearTimeout(timeout);
                expect(messages.length).toBe(messagesToSend.length);
                messagesToSend.forEach((text, i) => {
                    expect(messages[i].text).toBe(text);
                });
                resolve();
            });
        });

        socket3.connect();
        await syncPromise;

        // Cleanup
        socket3.disconnect();
        store.groups.get('test-group').members = 
            store.groups.get('test-group').members
                .filter(id => id !== offlineUserId);
        store.users.delete(offlineUserId);
    }, 10000);

    test('should handle concurrent operations', async () => {
        // Add some test messages to work with
        const testMessages = [];
        for (let i = 0; i < 5; i++) {
            const msg = {
                id: `concurrent-msg-${i}`,
                text: `Original message ${i}`,
                groupId: 'test-group',
                sender: socket1.id,
                username: 'testUser1',
                timestamp: new Date()
            };
            testMessages.push(msg);
            await store.createMessage(msg);
        }

        // Test concurrent reads and updates
        const operations = [
            // Read operation
            new Promise(resolve => {
                socket1.emit('get-messages', { groupId: 'test-group' }, messages => {
                    expect(messages.length).toBeGreaterThanOrEqual(testMessages.length);
                    resolve();
                });
            }),
            // Update operation
            new Promise(resolve => {
                const updatePromise = new Promise(resolveUpdate => {
                    socket2.once('message-updated', msg => {
                        expect(msg.text).toBe('Updated concurrently 1');
                        resolveUpdate();
                    });
                });
                
                socket1.emit('edit-message', {
                    messageId: testMessages[0].id,
                    text: 'Updated concurrently 1',
                    groupId: 'test-group'
                });

                Promise.all([updatePromise]).then(resolve);
            }),
            // Another update operation
            new Promise(resolve => {
                const updatePromise = new Promise(resolveUpdate => {
                    socket2.once('message-updated', msg => {
                        expect(msg.text).toBe('Updated concurrently 2');
                        resolveUpdate();
                    });
                });
                
                socket1.emit('edit-message', {
                    messageId: testMessages[1].id,
                    text: 'Updated concurrently 2',
                    groupId: 'test-group'
                });

                Promise.all([updatePromise]).then(resolve);
            }),
            // Pin operation
            new Promise(resolve => {
                const pinPromise = new Promise(resolvePin => {
                    socket2.once('message-pinned', msg => {
                        expect(msg.id).toBe(testMessages[2].id);
                        resolvePin();
                    });
                });
                
                socket1.emit('pin-message', {
                    messageId: testMessages[2].id,
                    groupId: 'test-group'
                });

                Promise.all([pinPromise]).then(resolve);
            })
        ];

        // Execute all operations concurrently
        await Promise.all(operations);

        // Verify final state
        const finalMessages = Array.from(store.messages.values());
        expect(finalMessages.find(m => m.id === testMessages[0].id).text).toBe('Updated concurrently 1');
        expect(finalMessages.find(m => m.id === testMessages[1].id).text).toBe('Updated concurrently 2');
        expect(Array.from(store.pinnedMessages.values())).toContainEqual(
            expect.objectContaining({ id: testMessages[2].id })
        );
    }, 10000);
});