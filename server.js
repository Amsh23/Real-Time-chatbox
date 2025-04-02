const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// مدیریت کاربران آنلاین
let onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('کاربر جدید متصل شد:', socket.id);
  
  // تنظیم نام کاربری
  socket.on('set-username', (username) => {
    onlineUsers.set(socket.id, username);
    updateOnlineCount();
  });

  // دریافت پیام
  socket.on('send-message', (data) => {
    const messageData = {
      id: Date.now().toString(),
      text: data.text,
      username: onlineUsers.get(socket.id) || 'ناشناس',
      timestamp: new Date().toISOString()
    };
    io.emit('new-message', messageData);
  });

  // حذف پیام
  socket.on('delete-message', (messageId) => {
    io.emit('message-deleted', messageId);
  });

  // قطع ارتباط
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    updateOnlineCount();
    console.log('کاربر قطع شد:', socket.id);
  });

  function updateOnlineCount() {
    io.emit('online-count', onlineUsers.size);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
});
