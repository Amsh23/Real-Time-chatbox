const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// داده‌های سرور
let onlineUsers = 0;
const users = {};
const messages = {};
const groups = {};

// 1. مدیریت اتصالات
io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('online-count', onlineUsers);

    // 2. ثبت نام کاربر
    socket.on('set-username', (username) => {
        users[socket.id] = username;
    });

    // 3. مدیریت پیام‌ها
    socket.on('chat-message', (data) => {
        const messageId = `msg_${Date.now()}`;
        messages[messageId] = {
            id: messageId,
            ...data,
            sender: socket.id
        };
        io.emit('chat-message', {
            ...messages[messageId],
            isMe: false
        });
    });

    // 4. مدیریت گروه‌ها
    socket.on('create-group', ({ name, members }) => {
        const groupId = `group_${Date.now()}`;
        groups[groupId] = { name, members };
        members.forEach(memberId => {
            io.to(memberId).emit('group-created', groupId);
        });
    });

    // 5. مدیریت استیکر
    socket.on('sticker', (data) => {
        io.emit('sticker', data);
    });

    // 6. مدیریت بازی
    socket.on('game-choice', (choice) => {
        const choices = ['✊', '✋', '✌️'];
        const botChoice = choices[Math.floor(Math.random() * 3)];
        let result = '';
        
        if(choice === botChoice) result = 'مساوی!';
        else if(
            (choice === '✊' && botChoice === '✌️') ||
            (choice === '✋' && botChoice === '✊') ||
            (choice === '✌️' && botChoice === '✋')
        ) result = 'شما برنده شدید! 🎉';
        else result = 'ربات برنده شد! 🤖';
        
        socket.emit('game-result', result);
    });

    // 7. حذف پیام
    socket.on('delete-message', (messageId) => {
        if(messages[messageId]?.sender === socket.id) {
            delete messages[messageId];
            io.emit('message-deleted', messageId);
        }
    });

    // 8. قطع ارتباط
    socket.on('disconnect', () => {
        onlineUsers--;
        delete users[socket.id];
        io.emit('online-count', onlineUsers);
    });
});

// تنظیمات سرور
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`سرور در حال اجرا روی پورت ${PORT}`);
});
