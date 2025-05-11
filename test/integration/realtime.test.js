const io = require('socket.io-client');
const { createServer } = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { Message, User, Group } = require('../../models');

describe('Real-time Features', () => {
    let mongoServer;
    let httpServer;
    let socket1, socket2;
    let uri;

    beforeAll(async () => {
        // Setup in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        uri = mongoServer.getUri();
        await mongoose.connect(uri);

        // Setup test server
        httpServer = createServer();
        httpServer.listen();
        const port = httpServer.address().port;
        const url = `http://localhost:${port}`;

        // Create test sockets
        socket1 = io(url);
        socket2 = io(url);
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
        httpServer.close();
        socket1.close();
        socket2.close();
    });

    test('should handle concurrent message sending', (done) => {
        const messages = [];
        for (let i = 0; i < 10; i++) {
            messages.push({
                text: `Test message ${i}`,
                groupId: 'test-group'
            });
        }

        // Send messages concurrently
        Promise.all(messages.map(msg => 
            new Promise(resolve => {
                socket1.emit('send-message', msg, resolve);
            })
        )).then(responses => {
            expect(responses.every(r => r.success)).toBeTruthy();
            done();
        });
    });

    test('should handle real-time updates', (done) => {
        socket2.on('new-message', (message) => {
            expect(message.text).toBe('Real-time test');
            done();
        });

        socket1.emit('send-message', {
            text: 'Real-time test',
            groupId: 'test-group'
        });
    });

    test('should handle offline message queue', async () => {
        socket1.disconnect();
        
        const offlineMessage = {
            text: 'Offline message',
            groupId: 'test-group',
            timestamp: new Date()
        };

        // Queue message while offline
        socket1.emit('send-message', offlineMessage);
        
        // Reconnect and verify message is sent
        socket1.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const message = await Message.findOne({ text: 'Offline message' });
        expect(message).toBeTruthy();
    });

    test('should handle concurrent file uploads', (done) => {
        const files = Array(5).fill().map((_, i) => ({
            name: `test-file-${i}.txt`,
            type: 'text/plain',
            size: 1024
        }));

        Promise.all(files.map(file => 
            new Promise(resolve => {
                socket1.emit('upload-file', file, resolve);
            })
        )).then(responses => {
            expect(responses.every(r => r.success)).toBeTruthy();
            done();
        });
    });

    test('should handle group role changes', (done) => {
        socket2.on('role-updated', (data) => {
            expect(data.role).toBe('moderator');
            done();
        });

        socket1.emit('update-role', {
            userId: socket2.id,
            groupId: 'test-group',
            role: 'moderator'
        });
    });
});