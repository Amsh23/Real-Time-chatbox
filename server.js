const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // اجازه دسترسی از همه دامنه‌ها
        methods: ["GET", "POST"]
    }
});

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
    cb(new Error('Only image, video, and PDF files are allowed!'));
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
  roles.set(socket.id, 'guest'); // Default role: guest

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
        return callback({ success: false, error: 'Message text or groupId is missing' });
    }

    const group = groups.get(message.groupId);
    if (!group) {
        return callback({ success: false, error: 'Group does not exist' });
    }

    if (!group.members.includes(socket.id)) {
        return callback({ success: false, error: 'You are not a member of this group' });
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
      const validRoles = ['user', 'moderator', 'admin']; // نقش‌های معتبر
      if (!validRoles.includes(role)) {
        return socket.emit('error', 'نقش نامعتبر است');
      }
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

    // Remove user from users map
    users.delete(socket.id);
    io.emit('online-count', users.size);

    // Remove user from roles map
    roles.delete(socket.id);

    // Remove user from all groups they were part of
    groups.forEach((group, groupId) => {
      const memberIndex = group.members.indexOf(socket.id);
      if (memberIndex !== -1) {
        group.members.splice(memberIndex, 1);

        // Notify group members about the user leaving
        io.to(`group_${groupId}`).emit('user-left', { userId: socket.id, groupId });
      }
    });

    // Update online count
    io.emit('online-count', users.size);
  });

  socket.on('online-count', (count) => {
    elements.onlineCount.textContent = count;
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
    if (!req.body || typeof req.body.role !== 'string') {
        return res.status(400).json({ error: 'ساختار درخواست نامعتبر است' });
    }

    const { role } = req.body; // نقش موردنظر برای دعوت
    if (!['user', 'moderator'].includes(role)) {
        return res.status(400).json({ error: 'نقش نامعتبر است' });
    }
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
        return res.status(400).json({ error: 'Invalid or expired invite token' });
    }
    const userId = req.body.userId; // Expecting userId to be sent in the request body
    if (!userId) {
        return res.status(400).json({ error: 'User ID not provided' });
    }
    roles.set(userId, role); // Assign user role

    inviteTokens.delete(token); // توکن یک‌بارمصرف است
function generateInviteCode() {
  const crypto = require('crypto');
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // Generates a 6-character secure code
}

function generateInviteCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

const PORT = process.env.PORT || 3000;
  console.log(`Server is running on port ${PORT}`);
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
  console.log(`آدرس دسترسی: http://localhost:${PORT}`);
});
