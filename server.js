const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// داده‌های سرور
const users = new Map();
const groups = new Map();
const messages = new Map();
const cooldowns = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('اتصال جدید:', socket.id);

  // 2. پروفایل کاربری
  socket.on('set-username', (username) => {
    users.set(socket.id, { username, lastMessage: 0 });
    updateOnlineCount();
  });

  // 1. ارسال پیام + 4. تایمر ضد اسپم
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    const now = Date.now();
    
    if (now - user.lastMessage < 3000) {
      return socket.emit('cooldown-warning');
    }

    const messageId = `msg_${now}`;
    const message = {
      id: messageId,
      text: data.text,
      username: user.username,
      topic: data.topic,
      timestamp: now,
      sender: socket.id
    };
    
    messages.set(messageId, message);
    user.lastMessage = now;
    
    if (data.groupId) {
      // 3. ارسال به گروه
      const group = groups.get(data.groupId);
      if (group) {
        group.members.forEach(member => {
          io.to(member).emit('new-message', message);
        });
      }
    } else {
      io.emit('new-message', message);
    }
  });

  // 6. حذف پیام
  socket.on('delete-message', (messageId) => {
    const message = messages.get(messageId);
    if (message && message.sender === socket.id) {
      messages.delete(messageId);
      io.emit('message-deleted', messageId);
    }
  });

  // 3. ایجاد گروه
  socket.on('create-group', ({name, members}) => {
    const groupId = `group_${Date.now()}`;
    groups.set(groupId, {
      name,
      members: [...members, socket.id],
      admin: socket.id
    });
    socket.emit('group-created', groupId);
  });

  // 8. مینی گیم
  socket.on('game-choice', (choice) => {
    const choices = ['✊', '✋', '✌️'];
    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result;
    
    if (choice === botChoice) result = 'مساوی!';
    else if (
      (choice === '✊' && botChoice === '✌️') ||
      (choice === '✋' && botChoice === '✊') ||
      (choice === '✌️' && botChoice === '✋')
    ) result = 'شما برنده شدید!';
    else result = 'ربات برنده شد!';
    
    socket.emit('game-result', {user: choice, bot: botChoice, result});
  });

  // 10. استیکر
  socket.on('send-sticker', (stickerId) => {
    io.emit('new-sticker', {
      id: `sticker_${Date.now()}`,
      stickerId,
      username: users.get(socket.id)?.username,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    updateOnlineCount();
  });

  function updateOnlineCount() {
    // 5. تعداد آنلاین‌ها
    io.emit('online-count', users.size);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
});
