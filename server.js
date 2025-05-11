require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const cors = require('cors');
const mongoose = require('mongoose');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { scheduleMaintenanceTasks } = require('./utils/maintenance');
const monitor = require('./utils/monitoring');

const initializeSocketHandlers = require('./handlers/socket');

// Core configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Initialize Redis clients
const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

// MongoDB Connection with Retry Logic
const connectWithRetry = async () => {
    const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4
    };

    try {
        await mongoose.connect(MONGODB_URI, options);
        console.log('✅ Connected to MongoDB successfully');
        console.log('Database connection mode:', NODE_ENV);
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        setTimeout(connectWithRetry, 5000);
    }
};

connectWithRetry();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: NODE_ENV === 'development' ? "*" : process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Promise to handle Redis connection
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Redis adapter configured successfully');
}).catch(err => {
    console.error('❌ Redis connection error:', err);
});

// Initialize Socket.IO with Redis Adapter and monitoring
io.on('connection', (socket) => {
    monitor.trackConnection();
    
    socket.on('error', (error) => {
        monitor.trackError(error);
    });
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'wss:', 'ws:']
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
});

app.use(limiter);
app.use(compression());
app.use(cors({
    origin: NODE_ENV === 'development' ? "*" : process.env.FRONTEND_URL,
    credentials: true
}));

// Session configuration with Redis
const sessionMiddleware = session({
    store: new RedisStore({ client: pubClient }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 15 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '').split(',');
        const ext = path.extname(file.originalname).toLowerCase().substring(1);
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('نوع فایل مجاز نیست'));
        }
    }
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'فایلی آپلود نشد' });
        }
        
        res.json({
            url: `/uploads/${req.file.filename}`,
            type: req.file.mimetype,
            size: req.file.size,
            originalName: sanitizeHtml(req.file.originalname)
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'خطا در آپلود فایل' });
    }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Add health check endpoint
app.get('/health', async (req, res) => {
    const health = await monitor.getHealthStatus();
    res.status(health.status === 'critical' ? 503 : 200).json(health);
});

// Add metrics endpoint (protected)
app.get('/metrics', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const metrics = await monitor.getBasicMetrics();
    res.json(metrics);
});

// Initialize socket handlers
initializeSocketHandlers(io);

// Initialize maintenance tasks
const { messages } = require('./handlers/socket/messageHandlers');
const { typingUsers } = require('./handlers/socket/statusHandlers');
const { messageReadStatus } = require('./handlers/socket/statusHandlers');

scheduleMaintenanceTasks(messages, typingUsers, messageReadStatus);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'خطای داخلی سرور' });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`سرور در حال اجرا روی پورت ${PORT}`);
    console.log(`حالت: ${NODE_ENV}`);
    if (NODE_ENV === 'development') {
        console.log(`آدرس دسترسی: http://localhost:${PORT}`);
    }
});