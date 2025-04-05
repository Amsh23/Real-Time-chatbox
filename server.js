const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// تنظیمات ذخیره‌سازی فایل‌ها
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|mp4|webm|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('فقط فایل‌های تصویر، ویدئو و PDF مجاز هستند!'));
  }
});

// مسیر آپلود فایل
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'هیچ فایلی آپلود نشد' });
  }
  
  res.json({
    url: `/uploads/${req.file.filename}`,
    type: getFileType(req.file.mimetype),
    size: req.file.size,
    originalName: req.file.originalname
  });
});

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype === 'application/pdf') return 'document';
  return 'file';
}

// فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// مدیریت سوکت‌ها
const users = new Map();
const groups = new Map();
const messages = [];
const groupMessages = new Map();
const roles = new Map(); // نقش کاربران
const inviteTokens = new Map(); // ذخیره توکن‌های دعوت

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ارسال وضعیت آنلاین به همه کاربران
  socket.broadcast.emit('user-status', { userId: socket.id, status: 'online' });

  // تنظیم نقش پیش‌فرض
  roles.set(socket.id, 'guest'); // نقش پیش‌فرض: مهمان

  socket.on('set-username', (username) => {
    users.set(socket.id, username);
    io.emit('online-count', users.size);
  });

  socket.on('create-group', (groupName) => {
    const groupId = uuidv4();
    const inviteCode = generateInviteCode();

    groups.set(groupId, {
        name: groupName,
        admin: socket.id,
        members: [socket.id],
        inviteCode
    });

    socket.join(`group_${groupId}`);

    socket.emit('group-created', { 
        groupId, 
        inviteLink: `${socket.handshake.headers.origin}?join=${groupId}:${inviteCode}`
    });

    const welcomeMessage = {
        id: Date.now(),
        text: `گروه "${groupName}" با موفقیت ایجاد شد!`,
        sender: 'system',
        username: 'سیستم',
        timestamp: new Date(),
        attachments: []
    };

    if (!groupMessages.has(groupId)) {
        groupMessages.set(groupId, []);
    }
    groupMessages.get(groupId).push(welcomeMessage);

    io.to(`group_${groupId}`).emit('new-message', welcomeMessage);
  });

  socket.on('join-group', ({ groupId, inviteCode }) => {
    const group = groups.get(groupId);
    
    if (group && group.inviteCode === inviteCode) {
        group.members.push(socket.id);
        socket.join(`group_${groupId}`);
        
        const messages = groupMessages.get(groupId) || [];
        socket.emit('group-joined', {
            groupId,
            name: group.name,
            messages: messages
        });
    } else {
        socket.emit('group-error', 'کد دعوت نامعتبر است');
    }
  });

  socket.on('send-message', (message, callback) => {
    if (!message.text || !message.groupId) {
        return callback({ success: false });
    }

    const newMessage = {
        id: uuidv4(),
        text: message.text,
        sender: socket.id,
        groupId: message.groupId,
        timestamp: Date.now(),
        attachments: message.attachments || []
    };

    if (!groupMessages.has(message.groupId)) {
        groupMessages.set(message.groupId, []);
    }
    groupMessages.get(message.groupId).push(newMessage);

    io.to(`group_${message.groupId}`).emit('new-message', newMessage);
    callback({ success: true, message: newMessage });
  });

  socket.on('set-role', ({ userId, role }) => {
    if (roles.get(socket.id) === 'admin') { // فقط ادمین می‌تواند نقش‌ها را تغییر دهد
      roles.set(userId, role);
      socket.emit('role-updated', { userId, role });
    } else {
      socket.emit('error', 'شما دسترسی لازم برای تغییر نقش‌ها را ندارید');
    }
  });

  socket.on('get-role', (callback) => {
    callback(roles.get(socket.id));
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    socket.broadcast.emit('user-status', { userId: socket.id, status: 'offline' });
    users.delete(socket.id);
    roles.delete(socket.id);
    io.emit('online-count', users.size);
  });
});

app.get('/groups', (req, res) => {
  const groupList = Array.from(groups.entries()).map(([groupId, group]) => ({
    groupId,
    name: group.name,
    members: group.members.length
  }));
  res.json(groupList);
});

app.get('/users', (req, res) => {
  const userList = Array.from(users.entries()).map(([socketId, username]) => ({
    socketId,
    username
  }));
  res.json(userList);
});

app.post('/generate-invite', (req, res) => {
    const { role } = req.body; // نقش موردنظر برای دعوت
    if (!['user', 'moderator'].includes(role)) {
        return res.status(400).json({ error: 'نقش نامعتبر است' });
    }

    const token = uuidv4();
    inviteTokens.set(token, role);
    res.json({ inviteLink: `${req.protocol}://${req.get('host')}/join?token=${token}` });
});

app.post('/join', (req, res) => {
    const { token } = req.body;
    const role = inviteTokens.get(token);

    if (!role) {
        return res.status(400).json({ error: 'توکن نامعتبر است' });
    }

    inviteTokens.delete(token); // توکن یک‌بارمصرف است
    roles.set(req.socket.id, role); // تنظیم نقش کاربر
    res.json({ success: true, role });
});

function generateInviteCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
  console.log(`آدرس دسترسی: http://localhost:${PORT}`);
});
