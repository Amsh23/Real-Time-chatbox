require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Initialize Express app
const app = express();

// Import required modules
const sanitizeHtml = require('sanitize-html');
const cors = require('cors');
const session = require('express-session');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { scheduleMaintenanceTasks } = require('./utils/maintenance');
const monitor = require('./utils/monitoring');
const crypto = require('crypto');
const logger = require('./utils/logger');
const config = require('./config');

// Import socket handlers
const initializeSocketHandlers = require('./handlers/socket');

// Add custom shutdown handler for Render
const gracefulShutdown = require('./utils/gracefulShutdown');

// Add a console log message at startup
console.log('Starting Real-Time Chatbox server...');

// Dynamic Redis adapter import for memory optimization
let redisAdapter = null;
let RedisStore = null;
let redisClient = null;

// Only load Redis if enabled in config
if (config.redis.enabled) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    redisAdapter = createAdapter;
    RedisStore = require('connect-redis').default;

    redisClient = createClient({ url: config.redis.url });
    logger.info('Redis modules loaded successfully');
  } catch (err) {
    logger.error('Failed to load Redis modules, falling back to in-memory adapter', err);
  }
}

// Memory optimization for Render free tier
if (config.isProduction) {
  // Force garbage collection every 10 minutes (requires --expose-gc flag)
  if (global.gc) {
    logger.info('Enabling periodic garbage collection');
    setInterval(() => {
      try {
        global.gc();
        logger.debug('Manual garbage collection completed');
      } catch (err) {
        logger.error('Error during manual garbage collection', err);
      }
    }, config.memory.gcInterval);
  }
}

// Core configuration from config module
const PORT = config.port;
const NODE_ENV = config.env;
const MONGODB_URI = config.mongodb.uri;
// Use MongoDB Manager for enhanced connection management
const mongoManager = require('./utils/mongoManager');

// Connect to MongoDB with enhanced error handling and reconnection logic
mongoManager.connect().catch(err => {
    logger.error('Failed to connect to MongoDB:', err);
    // Don't exit the process, let the manager handle reconnection
});
const server = http.createServer(app);

// Configure Socket.IO with optimal settings for Render
const socketConfig = {
    cors: {
        origin: NODE_ENV === 'development' 
            ? "*" 
            : [process.env.FRONTEND_URL, process.env.RENDER_EXTERNAL_URL].filter(Boolean),
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    path: '/socket.io', // Explicit path to ensure proxy compatibility
    // Settings optimized for Render
    pingTimeout: 30000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6, // 1 MB
    allowEIO3: true // For backwards compatibility
};

const io = socketIo(server, socketConfig);

// Init Redis adapter if available
let pubClient = null;
let subClient = null;

if (config.redis.enabled && redisAdapter && redisClient) {
    try {
        logger.info('Attempting to configure Redis adapter...');
        pubClient = redisClient;
        subClient = pubClient.duplicate();
        
        Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
            io.adapter(redisAdapter(pubClient, subClient));
            logger.info('✅ Redis adapter configured successfully');
        }).catch(err => {
            logger.error('❌ Redis connection error:', err);
            logger.info('Falling back to in-memory adapter');
        });
    } catch (err) {
        logger.error('Error setting up Redis adapter:', err);
        logger.info('Falling back to in-memory adapter');
    }
} else {
    logger.info('Redis not configured, using in-memory adapter');
}

// Initialize Socket.IO with monitoring and optimized for Render
io.on('connection', (socket) => {
    monitor.trackConnection();
    
    // Setup socket error tracking
    socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
        monitor.trackError(error);
    });
    
    // Track disconnect reasons for better debugging
    socket.on('disconnect', (reason) => {
        logger.debug(`Socket ${socket.id} disconnected: ${reason}`);
    });
    
    // Optimize handshake for faster reconnections
    socket.conn.on('packet', (packet) => {
        if (packet.type === 'ping') {
            monitor.trackHeartbeat(socket.id);
        }
    });
});

// Get allowed origins for Content Security Policy
const getAllowedOrigins = () => {
    const origins = ["'self'"];
    
    // Add Render URL if available
    if (process.env.RENDER_EXTERNAL_URL) {
        try {
            const renderUrl = new URL(process.env.RENDER_EXTERNAL_URL);
            origins.push(renderUrl.origin);
        } catch (e) {
            logger.warn('Invalid RENDER_EXTERNAL_URL');
        }
    }
    
    // Add custom frontend URL if available
    if (process.env.FRONTEND_URL) {
        try {
            const frontendUrl = new URL(process.env.FRONTEND_URL);
            origins.push(frontendUrl.origin);
        } catch (e) {
            logger.warn('Invalid FRONTEND_URL');
        }
    }
    
    return origins;
};

// Enhanced Security middleware optimized for Render
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'wss:', 'ws:', ...getAllowedOrigins()],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: { policy: "credentialless" }, // More compatible with third-party services
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // More compatible with third-party auth
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Needed for accessing resources across origins
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Enhanced Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests, please try again later.',
            retryAfter: Math.ceil(limiter.windowMs / 1000)
        });
    }
});

// Apply rate limiting to all routes
app.use(limiter);

// Add compression for better performance
app.use(compression());
app.use(cors({
    origin: NODE_ENV === 'development' ? "*" : process.env.FRONTEND_URL,
    credentials: true
}));

// Configure session storage based on available resources
let sessionStore;

if (config.redis.enabled && RedisStore && pubClient) {
    logger.info('Using Redis for session storage');
    sessionStore = new RedisStore({ client: pubClient });
} else {
    // Memory session store with warning
    logger.info('Redis unavailable, using in-memory session store');
    // Memory store is included with express-session
    sessionStore = new session.MemoryStore();
    
    if (config.isProduction) {
        logger.warn('Using in-memory session store in production is not recommended');
    }
}

// Session configuration optimized for Render
const sessionMiddleware = session({
    store: sessionStore,
    secret: config.security.sessionSecret,
    name: 'chatapp.sid', // Custom name to avoid default name detection
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session with each request
    cookie: {
        secure: config.isProduction, // HTTPS in production
        httpOnly: true,
        sameSite: config.isProduction ? 'lax' : 'none', // Better compatibility with Render
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        domain: config.isProduction ? process.env.COOKIE_DOMAIN : undefined
    }
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true }));

// File upload configuration with enhanced security
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate secure filename
        const ext = path.extname(file.originalname).toLowerCase();
        const randomName = crypto.randomBytes(32).toString('hex');
        cb(null, `${randomName}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Validate file type
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '').split(',');
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    
    // Check file extension
    if (!allowedTypes.includes(ext)) {
        return cb(new Error('نوع فایل مجاز نیست'), false);
    }
    
    // Check MIME type
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif',
        'video/mp4', 'video/webm',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('نوع فایل مجاز نیست'), false);
    }

    // Validate file size
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 15 * 1024 * 1024; // 15MB default
    if (parseInt(req.headers['content-length']) > maxSize) {
        return cb(new Error('حجم فایل بیش از حد مجاز است'), false);
    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 15 * 1024 * 1024,
        files: 5 // Max number of files per request
    }
});

// File upload route with improved security
app.post('/upload', 
    // Rate limiting for uploads
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 50 // limit each IP to 50 uploads per windowMs
    }),
    // Authentication middleware
    (req, res, next) => {
        if (!req.session?.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    },
    // Handle the upload
    (req, res, next) => {
        upload.single('file')(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ error: 'File too large' });
                }
                if (err.code === 'LIMIT_FILE_COUNT') {
                    return res.status(413).json({ error: 'Too many files' });
                }
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    },
    // Process the upload
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'فایلی آپلود نشد' });
            }

            // Scan file for viruses if in production
            if (process.env.NODE_ENV === 'production') {
                try {
                    await require('./utils/virus-scan').scanFile(req.file.path);
                } catch (err) {
                    // Delete the file if it fails virus scan
                    await fs.promises.unlink(req.file.path);
                    return res.status(400).json({ error: 'فایل مشکوک به بدافزار است' });
                }
            }

            // Generate thumbnail for images
            let thumbnail;
            if (req.file.mimetype.startsWith('image/')) {
                thumbnail = await require('./utils/image-processing').createThumbnail(req.file.path);
            }
            
            res.json({
                url: `/uploads/${req.file.filename}`,
                type: req.file.mimetype,
                size: req.file.size,
                originalName: sanitizeHtml(req.file.originalname),
                thumbnail: thumbnail ? `/uploads/thumbnails/${thumbnail}` : undefined
            });
        } catch (err) {
            console.error('Upload error:', err);
            // Clean up any uploaded files on error
            if (req.file) {
                await fs.promises.unlink(req.file.path).catch(() => {});
            }
            res.status(500).json({ error: 'خطا در آپلود فایل' });
        }
    }
);

// Serve uploaded files with security headers
app.use('/uploads', 
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginOpenerPolicy: { policy: "same-origin" }
    }),
    express.static(path.join(__dirname, 'uploads'), {
        maxAge: '1d',
        setHeaders: (res, path) => {
            if (path.endsWith('.pdf')) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'inline');
            }
        }
    })
);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Serve static files
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connections: io ? io.engine.clientsCount : 0
    });
});

// Add health check endpoint optimized for Render
app.get('/health', async (req, res) => {
    try {
        const health = await monitor.getHealthStatus();
        
        // Include database connection status
        health.database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        
        // Include memory stats for Render monitoring
        const memoryStats = process.memoryUsage();
        health.memory = {
            rss: Math.round(memoryStats.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memoryStats.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memoryStats.heapUsed / 1024 / 1024) + 'MB',
            external: Math.round(memoryStats.external / 1024 / 1024) + 'MB',
        };
        
        res.status(health.status === 'critical' ? 503 : 200).json(health);
    } catch (err) {
        logger.error('Health check error:', err);
        res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
});

// Add metrics endpoint (protected)
app.get('/metrics', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== config.security.adminApiKey) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const metrics = await monitor.getBasicMetrics();
        res.json(metrics);
    } catch (err) {
        logger.error('Metrics endpoint error:', err);
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

// Initialize socket handlers
initializeSocketHandlers(io);

// Initialize maintenance tasks with memory-optimized settings
const { messages } = require('./handlers/socket/messageHandlers');
const { typingUsers } = require('./handlers/socket/statusHandlers');
const { messageReadStatus } = require('./handlers/socket/statusHandlers');

scheduleMaintenanceTasks(messages, typingUsers, messageReadStatus);

// Initialize anti-sleep mechanism for Render free tier
const antiSleep = require('./utils/antiSleep');
antiSleep.start();

// Register for graceful shutdown
gracefulShutdown.registerServer(server, io, pubClient);

// Error handling middleware with better logging
app.use((err, req, res, next) => {
    logger.error('Express error:', err);
    res.status(500).json({ error: 'خطای داخلی سرور' });
});

// Add catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Not Found'
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`سرور در حال اجرا روی پورت ${PORT}`);
    logger.info(`حالت: ${NODE_ENV}`);
    if (NODE_ENV === 'development') {
        logger.info(`آدرس دسترسی: http://localhost:${PORT}`);
    } else {
        logger.info(`Running in production mode on Render.com`);
    }
});