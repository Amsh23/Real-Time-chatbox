// Simple chat server with no external dependencies
require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// In-memory storage
const users = new Map();
const groups = new Map();
const messages = new Map();
const pinnedMessages = new Map();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Set username
  socket.on('set-username', (username, callback) => {
    if (!username || username.trim() === '') {
      return callback({ error: 'Username cannot be empty' });
    }
    
    socket.username = username;
    users.set(socket.id, { id: socket.id, username });
    console.log(`Username set: ${socket.id} => ${username}`);
    callback({ success: true });
  });
  
  // Create group
  socket.on('create-group', (callback) => {
    const groupId = uuidv4().substring(0, 8);
    const group = {
      id: groupId,
      name: `Group ${groupId}`,
      creator: socket.id,
      members: [socket.id],
      createdAt: new Date()
    };
    
    groups.set(groupId, group);
    socket.join(groupId);
    console.log(`Group created: ${groupId} by user ${socket.id}`);
    callback({ success: true, group });
  });
  
  // Join group
  socket.on('join-group', (groupId, callback) => {
    const group = groups.get(groupId);
    if (!group) {
      return callback({ error: 'Group not found' });
    }
    
    if (!group.members.includes(socket.id)) {
      group.members.push(socket.id);
    }
    
    socket.join(groupId);
    console.log(`User ${socket.id} joined group ${groupId}`);
    callback({ success: true, group });
    
    // Notify other members
    socket.to(groupId).emit('user-joined', {
      userId: socket.id,
      username: socket.username || 'Anonymous',
      groupId
    });
  });
  
  // Send message
  socket.on('send-message', (data, callback) => {
    const { text, groupId } = data;
    if (!text || !groupId) {
      return callback({ error: 'Invalid message data' });
    }
    
    const group = groups.get(groupId);
    if (!group) {
      return callback({ error: 'Group not found' });
    }
    
    const message = {
      id: uuidv4(),
      text,
      sender: socket.id,
      username: socket.username || 'Anonymous',
      groupId,
      timestamp: new Date()
    };
    
    // Store message
    if (!messages.has(groupId)) {
      messages.set(groupId, []);
    }
    messages.get(groupId).push(message);
    
    // Keep messages limited
    const groupMessages = messages.get(groupId);
    if (groupMessages.length > 100) {
      messages.set(groupId, groupMessages.slice(-100));
    }
    
    // Broadcast to group
    io.to(groupId).emit('new-message', message);
    callback({ success: true, messageId: message.id });
  });
  
  // Get messages
  socket.on('get-messages', (data, callback) => {
    const { groupId } = data;
    if (!groupId) {
      return callback({ error: 'Group ID required' });
    }
    
    const groupMessages = messages.get(groupId) || [];
    callback({ success: true, messages: groupMessages });
  });
  
  // Pin message
  socket.on('pin-message', (data, callback) => {
    const { messageId, groupId } = data;
    if (!messageId || !groupId) {
      return callback({ error: 'Invalid pin data' });
    }
    
    const groupMessages = messages.get(groupId) || [];
    const message = groupMessages.find(msg => msg.id === messageId);
    
    if (!message) {
      return callback({ error: 'Message not found' });
    }
    
    // Mark as pinned
    message.pinned = true;
    message.pinnedAt = new Date();
    message.pinnedBy = socket.id;
    
    // Store in pinned collection
    if (!pinnedMessages.has(groupId)) {
      pinnedMessages.set(groupId, []);
    }
    pinnedMessages.get(groupId).push(message);
    
    // Notify group
    io.to(groupId).emit('message-pinned', message);
    callback({ success: true });
  });
  
  // Get pinned messages
  socket.on('get-pinned-messages', (groupId, callback) => {
    const pinned = pinnedMessages.get(groupId) || [];
    callback({ success: true, messages: pinned });
  });
  
  // User is typing
  socket.on('typing', (groupId) => {
    socket.to(groupId).emit('user-typing', {
      userId: socket.id,
      username: socket.username || 'Anonymous',
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    users.delete(socket.id);
    
    // Remove user from groups
    for (const [groupId, group] of groups.entries()) {
      const index = group.members.indexOf(socket.id);
      if (index !== -1) {
        group.members.splice(index, 1);
        
        // Delete empty groups
        if (group.members.length === 0) {
          groups.delete(groupId);
          messages.delete(groupId);
          pinnedMessages.delete(groupId);
        } else {
          // Notify other members
          socket.to(groupId).emit('user-left', {
            userId: socket.id,
            username: socket.username || 'Anonymous',
            groupId
          });
        }
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access URL: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});