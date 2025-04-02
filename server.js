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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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

    socket.emit('group-created', { 
      groupId, 
      inviteLink: `${groupId}:${inviteCode}` 
    });
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

  socket.on('send-message', (message) => {
    const newMessage = {
      id: Date.now(),
      text: message.text,
      sender: socket.id,
      username: users.get(socket.id),
      timestamp: new Date(),
      attachments: message.attachments || []
    };

    if (message.groupId) {
      if (!groupMessages.has(message.groupId)) {
        groupMessages.set(message.groupId, []);
      }
      groupMessages.get(message.groupId).push(newMessage);
      io.to(`group_${message.groupId}`).emit('new-message', newMessage);
    } else {
      messages.push(newMessage);
      io.emit('new-message', newMessage);
    }
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('online-count', users.size);
  });
});

function generateInviteCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
  console.log(`آدرس دسترسی: http://localhost:${PORT}`);
});
