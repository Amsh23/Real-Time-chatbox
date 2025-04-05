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
        origin: "*", // Allow access from all domains
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
    const filetypes = /jpeg|jpg|png|gif|mp4|webm|pdf|docx|xlsx/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image, video, and PDF files are allowed!'));
  }
});

// مسیر آپلود فایل
app.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
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
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`سرور در حال اجرا روی پورت ${PORT}`);
    console.log(`آدرس دسترسی: http://localhost:${PORT}`);
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
const userGroups = new Map(); // Reverse mapping of users to groups
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
    if (typeof username !== 'string' || username.trim() === '') {
      return socket.emit('error', 'Invalid username. Please provide a valid username.');
    }
    users.set(socket.id, username.trim());
  socket.on('create-group', (groupName) => {
    // Check if a group with the same name already exists
    const existingGroup = Array.from(groups.values()).find(group => group.name === groupName);
    if (existingGroup) {
        return socket.emit('group-error', `گروهی با نام "${groupName}" از قبل وجود دارد`);
    }

    const groupId = uuidv4();
    const inviteCode = generateInviteCode();

    groups.set(groupId, {
        name: groupName,
        admin: socket.id,
        members: [socket.id],
        inviteCode
    });

    socket.join(`group_${groupId}`);
    if (!userGroups.has(socket.id)) {
        userGroups.set(socket.id, new Set());
    }
    userGroups.get(socket.id).add(groupId);

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

    const sanitizeHtml = require('sanitize-html');

    const newMessage = {
        id: uuidv4(),
        text: sanitizeHtml(message.text, {
            allowedTags: [],
            allowedAttributes: {}
        }),
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

    socket.on('set-role', ({ userId, role, groupId }) => {
        const group = groups.get(groupId);

        if (!group) {
            return socket.emit('error', 'گروه وجود ندارد');
        }

        if (!group.members.includes(socket.id)) {
            return socket.emit('error', 'شما عضو این گروه نیستید');
        }

        if (group.admin !== socket.id) {
            return socket.emit('error', 'شما دسترسی لازم برای تغییر نقش‌ها را ندارید');
        }

        const validRoles = ['user', 'moderator', 'admin']; // نقش‌های معتبر
        if (!validRoles.includes(role)) {
            return socket.emit('error', 'نقش نامعتبر است');
        }

        roles.set(userId, role);
        socket.emit('role-updated', { userId, role });
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

        const userGroupIds = userGroups.get(socket.id) || [];
        userGroupIds.forEach(groupId => {
            const group = groups.get(groupId);
            if (group) {
                group.members = group.members.filter(member => member !== socket.id);
                io.to(`group_${groupId}`).emit('user-left', { userId: socket.id, groupId });
            }
        });
        userGroups.delete(socket.id);
    });

    // Update online count
    io.emit('online-count', users.size);
  });
});

app.get('/groups', (req, res) => {
    const groupList = Array.from(groups.entries()).map(([groupId, group]) => ({
        groupId,
        name: sanitizeGroupName(group.name),
        members: group.members.length
    }));
    res.json(groupList);
});

function sanitizeGroupName(name) {
    const sanitizeHtml = require('sanitize-html');
    return sanitizeHtml(name, {
        allowedTags: [],
        allowedAttributes: {}
    });
}

app.get('/users', (req, res) => {
    const userList = Array.from(users.entries()).map(([socketId, username]) => ({
        socketId,
        username
    }));
    res.json(userList);
});

app.post('/join', (req, res) => {
    const { token, userId } = req.body;

    // Validate token format
    if (!token || typeof token !== 'string' || token.length !== 6) {
        return res.status(400).json({ error: 'Invalid token format' });
    }

    // Validate userId format
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        return res.status(400).json({ error: 'Invalid or missing user ID' });
    }

    const role = inviteTokens.get(token);

    if (!role) {
        return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    // Check if userId exists in the users map
    if (!users.has(userId)) {
        return res.status(404).json({ error: 'User ID not found' });
    }

    // Ensure the userId is valid and not already assigned a role
    if (roles.has(userId)) {
        return res.status(400).json({ error: 'User already has a role assigned' });
    }

    roles.set(userId, role); // Assign user role

    inviteTokens.delete(token); // توکن یک‌بارمصرف است
    res.json({ success: true, message: 'User joined successfully', role });
});

// Generate invite code function
function generateInviteCode() {
    const crypto = require('crypto');
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // Generates a 6-character secure code
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`سرور در حال اجرا روی پورت ${PORT}`);
    console.log(`آدرس دسترسی: http://localhost:${PORT}`);
});
