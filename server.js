require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const cors = require('cors');

// تنظیمات پایه برای Render.com
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ایجاد اپلیکیشن Express
const app = express();
const server = http.createServer(app);

// پیکربندی Socket.io برای Render.com
const io = socketIo(server, {
  cors: {
    origin: NODE_ENV === 'development' ? "*" : process.env.FRONTEND_URL,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middlewareهای ضروری
app.use(cors({
  origin: NODE_ENV === 'development' ? "*" : process.env.FRONTEND_URL
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|mp4|webm|pdf|docx|xlsx/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('فقط فایل‌های تصویر، ویدئو، PDF و اسناد مجاز هستند!'));
  }
});

// ساختارهای داده
const users = new Map();
const groups = new Map();
const messages = new Map();
const userGroups = new Map();
const onlineUsers = new Set();
const notifications = new Map();

// مسیر آپلود فایل
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'هیچ فایلی آپلود نشد' });
    }
    
    res.json({
      url: `/uploads/${req.file.filename}`,
      type: getFileType(req.file.mimetype),
      size: req.file.size,
      originalName: sanitizeHtml(req.file.originalname, { allowedTags: [], allowedAttributes: {} })
    });
  } catch (err) {
    res.status(500).json({ error: 'خطا در آپلود فایل' });
  }
});

// مسیرهای API
app.get('/api/groups', (req, res) => {
  const groupList = Array.from(groups.values()).map(group => ({
    id: group.id,
    name: sanitizeHtml(group.name, { allowedTags: [], allowedAttributes: {} }),
    admin: group.admin,
    members: group.members.length,
    createdAt: group.createdAt
  }));
  res.json(groupList);
});

app.get('/api/groups/:groupId/messages', (req, res) => {
  const groupId = req.params.groupId;
  if (!groups.has(groupId)) {
    return res.status(404).json({ error: 'گروه یافت نشد' });
  }
  res.json(messages.get(groupId) || []);
});

app.get('/api/users/online', (req, res) => {
  const onlineList = Array.from(onlineUsers).map(socketId => {
    const user = users.get(socketId);
    return user ? {
      username: user.username,
      avatar: user.avatar,
      role: user.role
    } : null;
  }).filter(Boolean);
  res.json(onlineList);
});

// مدیریت سوکت‌ها
io.on('connection', (socket) => {
  console.log('کاربر متصل شد:', socket.id);

  // تنظیم نام کاربری
  socket.on('set-username', (username, callback) => {
    try {
      if (!username || username.trim() === '') {
        return callback({ error: 'نام کاربری نمی‌تواند خالی باشد' });
      }

      const sanitizedUsername = sanitizeHtml(username, { allowedTags: [], allowedAttributes: {} });
      const avatarColors = ['6a1b9a', '4a148c', '7b1fa2', '9c4dcc'];
      const color = avatarColors[Math.floor(Math.random() * avatarColors.length)];
      
      users.set(socket.id, { 
        username: sanitizedUsername,
        role: 'user',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(sanitizedUsername)}&background=${color}&color=fff`,
        status: 'online'
      });
      
      onlineUsers.add(socket.id);
      io.emit('user-connected', { 
        username: sanitizedUsername,
        avatar: users.get(socket.id).avatar,
        socketId: socket.id
      });
      io.emit('online-count', onlineUsers.size);
      callback({ success: true });
    } catch (err) {
      callback({ error: 'خطا در تنظیم نام کاربری' });
    }
  });

  // ایجاد گروه
  socket.on('create-group', (groupName, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

      const sanitizedGroupName = sanitizeHtml(groupName, { allowedTags: [], allowedAttributes: {} });
      const groupId = uuidv4();
      const inviteCode = generateInviteCode();
      
      groups.set(groupId, {
        id: groupId,
        name: sanitizedGroupName,
        admin: socket.id,
        members: [socket.id],
        inviteCode: inviteCode,
        createdAt: new Date().toISOString()
      });
      
      socket.join(groupId);
      const userGroupsSet = userGroups.get(socket.id) || new Set();
      userGroupsSet.add(groupId);
      userGroups.set(socket.id, userGroupsSet);
      
      // پیام خوشامدگویی
      const welcomeMessage = createSystemMessage(
        `گروه "${sanitizedGroupName}" با موفقیت ایجاد شد!`,
        groupId
      );
      addMessageToGroup(groupId, welcomeMessage);
      
      callback({
        success: true,
        group: {
          id: groupId,
          name: sanitizedGroupName,
          inviteCode: inviteCode
        }
      });
      
      io.to(groupId).emit('new-message', welcomeMessage);
    } catch (err) {
      callback({ error: 'خطا در ایجاد گروه' });
    }
  });

  // پیوستن به گروه
  socket.on('join-group', ({ groupId, inviteCode }, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

      const group = groups.get(groupId);
      if (!group || group.inviteCode !== inviteCode) {
        return callback({ error: 'کد دعوت نامعتبر است' });
      }

      group.members.push(socket.id);
      socket.join(groupId);
      const userGroupsSet = userGroups.get(socket.id) || new Set();
      userGroupsSet.add(groupId);
      userGroups.set(socket.id, userGroupsSet);
      
      // پیام ورود به گروه
      const joinMessage = createSystemMessage(
        `${user.username} به گروه پیوست!`,
        groupId
      );
      addMessageToGroup(groupId, joinMessage);
      
      callback({
        success: true,
        group: {
          id: groupId,
          name: group.name,
          members: group.members.map(m => users.get(m)?.username).filter(Boolean)
        },
        messages: messages.get(groupId) || []
      });
      
      io.to(groupId).emit('new-message', joinMessage);
      io.to(groupId).emit('group-updated', {
        id: groupId,
        members: group.members.map(m => ({
          username: users.get(m)?.username,
          avatar: users.get(m)?.avatar,
          role: users.get(m)?.role
        })).filter(Boolean)
      });
    } catch (err) {
      callback({ error: 'خطا در پیوستن به گروه' });
    }
  });

  // ارسال پیام
  socket.on('send-message', ({ text, groupId, attachments = [] }, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

      const group = groups.get(groupId);
      if (!group || !group.members.includes(socket.id)) {
        return callback({ error: 'شما عضو این گروه نیستید' });
      }

      const sanitizedText = sanitizeHtml(text || '', { 
        allowedTags: ['b', 'i', 'u', 'br'], 
        allowedAttributes: {} 
      });

      const message = {
        id: uuidv4(),
        text: sanitizedText,
        sender: socket.id,
        username: user.username,
        avatar: user.avatar,
        groupId: groupId,
        timestamp: new Date().toISOString(),
        attachments: attachments.map(att => ({
          url: att.url,
          type: att.type,
          originalName: sanitizeHtml(att.originalName, { allowedTags: [], allowedAttributes: {} })
        }))
      };

      addMessageToGroup(groupId, message);
      io.to(groupId).emit('new-message', message);
      callback({ success: true, message });
    } catch (err) {
      callback({ error: 'خطا در ارسال پیام' });
    }
  });

  // قطع ارتباط
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      user.status = 'offline';
      io.emit('user-disconnected', { username: user.username });
      io.emit('online-count', onlineUsers.size);
      
      // اطلاع به گروه‌ها
      const userGroupsSet = userGroups.get(socket.id) || new Set();
      userGroupsSet.forEach(groupId => {
        io.to(groupId).emit('user-left', { username: user.username });
      });
    }
  });
});

// توابع کمکی
function createSystemMessage(text, groupId) {
  return {
    id: uuidv4(),
    text: sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }),
    sender: 'system',
    username: 'سیستم',
    avatar: '',
    groupId: groupId,
    timestamp: new Date().toISOString(),
    attachments: []
  };
}

function addMessageToGroup(groupId, message) {
  if (!messages.has(groupId)) {
    messages.set(groupId, []);
  }
  messages.get(groupId).push(message);
}

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype === 'application/pdf') return 'document';
  if (mimetype.includes('word')) return 'word';
  if (mimetype.includes('excel')) return 'excel';
  return 'file';
}

// فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// مسیر ریشه
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// شروع سرور
server.listen(PORT, '0.0.0.0', () => {
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
  console.log(`حالت: ${NODE_ENV}`);
  if (NODE_ENV === 'development') {
    console.log(`آدرس دسترسی: http://localhost:${PORT}`);
  }
});