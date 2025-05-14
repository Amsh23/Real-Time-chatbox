const { expect } = require('chai');
const io = require('socket.io-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Message, Group, User } = require('../../models');
const createMessageHandlers = require('../../handlers/socket/messageHandlers');

describe('Message Handler Integration Tests', () => {
    let httpServer;
    let ioServer;
    let clientSocket1;
    let clientSocket2;
    let users;
    let groups;
    let group;

    beforeEach(async () => {
        // Setup server
        httpServer = createServer();
        ioServer = new Server(httpServer);
        users = new Map();
        groups = new Map();

        // Create test users and group
        const user1 = { id: 'user1', username: 'User 1' };
        const user2 = { id: 'user2', username: 'User 2' };
        users.set('user1', user1);
        users.set('user2', user2);

        group = new Group({
            id: 'group1',
            name: 'Test Group',
            members: ['user1', 'user2']
        });
        await group.save();
        groups.set('group1', group);

        // Setup client sockets
        await new Promise(resolve => httpServer.listen(0, resolve));
        const port = httpServer.address().port;
        clientSocket1 = io(`http://localhost:${port}`);
        clientSocket2 = io(`http://localhost:${port}`);

        // Initialize handlers
        const handlers = createMessageHandlers(ioServer, clientSocket1, users, groups);
    });

    afterEach(() => {
        ioServer.close();
        clientSocket1.close();
        clientSocket2.close();
        httpServer.close();
    });

    describe('Message Sending', () => {
        it('should send and receive messages', (done) => {
            clientSocket2.on('new-message', (message) => {
                expect(message).to.have.property('text', 'Test message');
                expect(message).to.have.property('sender', 'user1');
                done();
            });

            clientSocket1.emit('send-message', {
                text: 'Test message',
                groupId: 'group1'
            });
        });

        it('should handle offline messages', async () => {
            clientSocket1.disconnect();
            
            await new Promise(resolve => {
                clientSocket1.emit('send-message', {
                    text: 'Offline message',
                    groupId: 'group1'
                }, (response) => {
                    expect(response.queued).to.be.true;
                    resolve();
                });
            });

            clientSocket1.connect();
            
            const messages = await Message.find({ groupId: 'group1' });
            expect(messages).to.have.lengthOf(1);
            expect(messages[0].text).to.equal('Offline message');
        });
    });

    describe('Message Operations', () => {
        it('should pin and unpin messages', async () => {
            const message = await Message.create({
                id: 'msg1',
                text: 'Pin test',
                groupId: 'group1',
                sender: 'user1'
            });

            await new Promise(resolve => {
                clientSocket1.emit('pin-message', {
                    messageId: 'msg1',
                    groupId: 'group1'
                }, (response) => {
                    expect(response.success).to.be.true;
                    resolve();
                });
            });

            const updatedMessage = await Message.findOne({ id: 'msg1' });
            expect(updatedMessage.isPinned).to.be.true;
        });

        it('should handle message reactions', async () => {
            const message = await Message.create({
                id: 'msg1',
                text: 'React test',
                groupId: 'group1',
                sender: 'user1'
            });

            await new Promise(resolve => {
                clientSocket1.emit('reaction', {
                    messageId: 'msg1',
                    emoji: '👍',
                    groupId: 'group1'
                }, (response) => {
                    expect(response.success).to.be.true;
                    resolve();
                });
            });

            const updatedMessage = await Message.findOne({ id: 'msg1' });
            expect(updatedMessage.reactions[0].emoji).to.equal('👍');
        });
    });

    describe('Message Loading', () => {
        it('should load messages with pagination', async () => {
            // Create test messages
            for (let i = 0; i < 25; i++) {
                await Message.create({
                    id: `msg${i}`,
                    text: `Message ${i}`,
                    groupId: 'group1',
                    sender: 'user1',
                    timestamp: new Date(Date.now() - i * 1000)
                });
            }

            const loadPromise = new Promise(resolve => {
                clientSocket1.emit('load-messages', 'group1', (response) => {
                    expect(response.success).to.be.true;
                    expect(response.messages).to.have.lengthOf(20); // Default page size
                    expect(response.messages[0].text).to.equal('Message 0');
                    resolve();
                });
            });

            await loadPromise;
        });
    });
});
