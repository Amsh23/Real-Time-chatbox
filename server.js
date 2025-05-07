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
const mongoose = require('mongoose');

// تنظیمات پایه برای Render.com
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';

// اتصال به MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
  // Verify collections exist
  return Promise.all([
    mongoose.connection.db.collection('groups').stats(),
    mongoose.connection.db.collection('messages').stats()
  ]);
})
.then(() => {
  console.log('✅ Database collections validated');
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);  // Exit if database connection fails
});

// تعریف مدل‌های MongoDB
const GroupSchema = new mongoose.Schema({
  id: String,
  name: String,
  admin: String,
  members: [String],
  inviteCode: String,
  createdAt: Date
});

const MessageSchema = new mongoose.Schema({
  id: String,
  text: String,
  sender: String,
  username: String,
  avatar: String,
  groupId: String,
  timestamp: Date,
  attachments: [{
    url: String,
    type: String,
    originalName: String
  }],
  sticker: {
    packId: String,
    stickerId: String,
    url: String
  },
  reactions: [{
    emoji: String,
    users: [String]
  }]
});

const StickerPackSchema = new mongoose.Schema({
  id: String,
  name: String,
  stickers: [{
    id: String,
    url: String,
    emoji: String
  }]
});

const Group = mongoose.model('Group', GroupSchema);
const Message = mongoose.model('Message', MessageSchema);
const StickerPack = mongoose.model('StickerPack', StickerPackSchema);

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
  socket.on('create-group', async (groupName, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

      const sanitizedGroupName = sanitizeHtml(groupName, { allowedTags: [], allowedAttributes: {} });
      const groupId = uuidv4();
      const inviteCode = generateInviteCode();
      
      const group = new Group({
        id: groupId,
        name: sanitizedGroupName,
        admin: socket.id,
        members: [socket.id],
        inviteCode: inviteCode,
        createdAt: new Date()
      });
      
      await group.save();
      groups.set(groupId, group);
      
      socket.join(groupId);
      const userGroupsSet = userGroups.get(socket.id) || new Set();
      userGroupsSet.add(groupId);
      userGroups.set(socket.id, userGroupsSet);
      
      // پیام خوشامدگویی
      const welcomeMessage = createSystemMessage(
        `گروه "${sanitizedGroupName}" با موفقیت ایجاد شد!`,
        groupId
      );
      await addMessageToGroup(groupId, welcomeMessage);
      
      callback({
        success: true,
        group: {
          id: groupId,
          name: sanitizedGroupName,
          inviteCode: `${groupId}:${inviteCode}` // فرمت جدید کد دعوت
        }
      });
      
      io.to(groupId).emit('new-message', welcomeMessage);
    } catch (err) {
      console.error('Error creating group:', err);
      callback({ error: 'خطا در ایجاد گروه' });
    }
  });

  // پیوستن به گروه
  socket.on('join-group', async ({ groupId, inviteCode }, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

      const group = await Group.findOne({ id: groupId });
      if (!group) {
        return callback({ error: 'گروه یافت نشد' });
      }
      
      if (group.inviteCode !== inviteCode) {
        return callback({ error: 'کد دعوت نامعتبر است' });
      }

      if (group.members.includes(socket.id)) {
        return callback({ error: 'شما قبلاً عضو این گروه هستید' });
      }

      // Update MongoDB
      group.members.push(socket.id);
      await group.save();
      
      // Update in-memory data
      if (!groups.has(groupId)) {
        groups.set(groupId, group);
      } else {
        groups.get(groupId).members = group.members;
      }
      
      socket.join(groupId);
      const userGroupsSet = userGroups.get(socket.id) || new Set();
      userGroupsSet.add(groupId);
      userGroups.set(socket.id, userGroupsSet);
      
      // Load last 100 messages
      const groupMessages = await Message.find({ groupId })
        .sort({ timestamp: -1 })
        .limit(100)
        .lean();
      
      // Update in-memory messages
      if (!messages.has(groupId)) {
        messages.set(groupId, groupMessages.reverse());
      }
      
      // پیام ورود به گروه
      const joinMessage = createSystemMessage(
        `${user.username} به گروه پیوست!`,
        groupId
      );
      await addMessageToGroup(groupId, joinMessage);
      
      callback({
        success: true,
        group: {
          id: groupId,
          name: group.name,
          inviteCode: group.inviteCode,
          members: group.members.map(m => users.get(m)?.username).filter(Boolean)
        },
        messages: messages.get(groupId)
      });
      
      // Notify other members
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
      console.error('Error joining group:', err);
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

  // Handle sticker messages
  socket.on('send-sticker', async ({ packId, stickerId, groupId }, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

      const stickerPack = await StickerPack.findOne({ id: packId });
      const sticker = stickerPack?.stickers.find(s => s.id === stickerId);
      
      if (!sticker) return callback({ error: 'استیکر یافت نشد' });

      const message = {
        id: uuidv4(),
        sender: socket.id,
        username: user.username,
        avatar: user.avatar,
        groupId: groupId,
        timestamp: new Date().toISOString(),
        sticker: {
          packId,
          stickerId,
          url: sticker.url
        }
      };

      await addMessageToGroup(groupId, message);
      io.to(groupId).emit('new-message', message);
      callback({ success: true });
    } catch (err) {
      callback({ error: 'خطا در ارسال استیکر' });
    }
  });

  // Handle message reactions
  socket.on('add-reaction', async ({ messageId, emoji, groupId }, callback) => {
    try {
      const message = await Message.findOne({ id: messageId });
      if (!message) return callback({ error: 'پیام یافت نشد' });

      const reaction = message.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (!reaction.users.includes(socket.id)) {
          reaction.users.push(socket.id);
        }
      } else {
        message.reactions.push({ emoji, users: [socket.id] });
      }

      await message.save();
      io.to(groupId).emit('message-reacted', { 
        messageId,
        reactions: message.reactions 
      });
      callback({ success: true });
    } catch (err) {
      callback({ error: 'خطا در افزودن واکنش' });
    }
  });

  // Handle typing indicators
  socket.on('typing', ({ groupId, isTyping }) => {
    const user = users.get(socket.id);
    if (user) {
      io.to(groupId).emit('user-typing', {
        username: user.username,
        isTyping
      });
    }
  });

  // قطع ارتباط
  socket.on('disconnect', async () => {
    const user = users.get(socket.id);
    if (user) {
        try {
            // Update online status
            onlineUsers.delete(socket.id);
            user.status = 'offline';
            
            // Remove user from groups in MongoDB
            const userGroupsSet = userGroups.get(socket.id) || new Set();
            for (const groupId of userGroupsSet) {
                const group = await Group.findOne({ id: groupId });
                if (group) {
                    // Remove user from group members
                    group.members = group.members.filter(id => id !== socket.id);
                    await group.save();
                    
                    // Update in-memory data
                    if (groups.has(groupId)) {
                        groups.get(groupId).members = group.members;
                    }
                    
                    // Create leave message
                    const leaveMessage = createSystemMessage(
                        `${user.username} از گروه خارج شد`,
                        groupId
                    );
                    await addMessageToGroup(groupId, leaveMessage);
                    
                    // Notify remaining members
                    io.to(groupId).emit('new-message', leaveMessage);
                    io.to(groupId).emit('user-left', { 
                        username: user.username,
                        groupId: groupId 
                    });
                    io.to(groupId).emit('group-updated', {
                        id: groupId,
                        members: group.members.map(m => ({
                            username: users.get(m)?.username,
                            avatar: users.get(m)?.avatar,
                            role: users.get(m)?.role
                        })).filter(Boolean)
                    });
                }
            }
            
            // Clean up user data
            users.delete(socket.id);
            userGroups.delete(socket.id);
            
            // Broadcast online count update
            io.emit('user-disconnected', { username: user.username });
            io.emit('online-count', onlineUsers.size);
        } catch (err) {
            console.error('Error handling disconnect:', err);
        }
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

async function addMessageToGroup(groupId, message) {
  const newMessage = new Message({
    ...message,
    timestamp: new Date(message.timestamp)
  });
  await newMessage.save();
  
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

// فایل‌های استاتیک - Move this BEFORE the catch-all route
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// مسیر ریشه - This should be the last route
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