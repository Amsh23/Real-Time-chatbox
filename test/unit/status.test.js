const { expect } = require('chai');
const io = require('socket.io-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { User } = require('../../models');
const statusHandlers = require('../../handlers/socket/statusHandlers');

describe('Status Handlers', () => {
    let clientSocket;
    let serverSocket;
    let httpServer;
    let ioServer;
    let users;
    let groups;

    beforeEach((done) => {
        httpServer = createServer();
        ioServer = new Server(httpServer);
        users = new Map();
        groups = new Map();

        httpServer.listen(() => {
            const port = httpServer.address().port;
            clientSocket = io(`http://localhost:${port}`);

            ioServer.on('connection', (socket) => {
                serverSocket = socket;
                users.set(socket.id, {
                    id: socket.id,
                    username: 'testUser',
                    status: 'online'
                });

                statusHandlers(ioServer, socket, users, groups);
            });

            clientSocket.on('connect', done);
        });
    });

    afterEach(() => {
        ioServer.close();
        clientSocket.close();
        httpServer.close();
        users.clear();
        groups.clear();
    });

    describe('Typing Indicators', () => {
        it('should emit typing status to group members', (done) => {
            const groupId = 'testGroup';
            groups.set(groupId, {
                id: groupId,
                members: [serverSocket.id]
            });

            clientSocket.on('typing-status', (typingUsers) => {
                expect(typingUsers).to.be.an('array');
                expect(typingUsers).to.have.lengthOf(1);
                expect(typingUsers[0].username).to.equal('testUser');
                done();
            });

            clientSocket.emit('typing-start', { groupId });
        });

        it('should clear typing status when user stops typing', (done) => {
            const groupId = 'testGroup';
            groups.set(groupId, {
                id: groupId,
                members: [serverSocket.id]
            });

            let typingStarted = false;

            clientSocket.on('typing-status', (typingUsers) => {
                if (!typingStarted) {
                    typingStarted = true;
                    expect(typingUsers).to.have.lengthOf(1);
                    clientSocket.emit('typing-stop', { groupId });
                } else {
                    expect(typingUsers).to.have.lengthOf(0);
                    done();
                }
            });

            clientSocket.emit('typing-start', { groupId });
        });
    });

    describe('User Status', () => {
        it('should update user status', (done) => {
            clientSocket.on('user-status-update', (members) => {
                expect(members).to.be.an('array');
                expect(members[0].status).to.equal('away');
                done();
            });

            clientSocket.emit('set-status', 'away');
        });

        it('should mark user as offline on disconnect', (done) => {
            clientSocket.on('user-status-update', (members) => {
                if (members[0].status === 'offline') {
                    expect(members[0].status).to.equal('offline');
                    done();
                }
            });

            clientSocket.close();
        });

        it('should update last seen timestamp', (done) => {
            const before = new Date();
            
            clientSocket.on('user-status-update', (members) => {
                const after = new Date();
                const lastSeen = new Date(members[0].lastSeen);
                
                expect(lastSeen.getTime()).to.be.at.least(before.getTime());
                expect(lastSeen.getTime()).to.be.at.most(after.getTime());
                done();
            });

            clientSocket.emit('set-status', 'away');
        });
    });
});
