const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');

// Configure storage engine with improved security
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            const thumbsDir = path.join(uploadDir, 'thumbnails');
            await fs.mkdir(thumbsDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        // Generate cryptographically secure random filename
        const ext = path.extname(file.originalname).toLowerCase();
        const randomName = crypto.randomBytes(32).toString('hex');
        cb(null, `${randomName}${ext}`);
    }
});

// Strict file filter with comprehensive MIME type validation
const fileFilter = (req, file, cb) => {
    const allowedMimes = new Set([
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);

    // Check MIME type
    if (!allowedMimes.has(file.mimetype)) {
        return cb(new Error('Invalid file type'), false);
    }

    // Verify file extension matches MIME type
    const ext = path.extname(file.originalname).toLowerCase();
    const validExts = {
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/gif': ['.gif'],
        'image/webp': ['.webp'],
        'video/mp4': ['.mp4'],
        'video/webm': ['.webm'],
        'application/pdf': ['.pdf'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    };

    if (!validExts[file.mimetype]?.includes(ext)) {
        return cb(new Error('File extension does not match its content'), false);
    }

    // Check file size (15MB limit)
    const maxSize = 15 * 1024 * 1024;
    if (parseInt(req.headers['content-length']) > maxSize) {
        return cb(new Error('File too large'), false);
    }

    cb(null, true);
};

// Configure Multer with security options
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB
        files: 5 // Maximum 5 files per upload
    }
});

// Image processing with error handling and validation
const processImage = async (filePath) => {
    try {
        // Validate file exists
        await fs.access(filePath);
        
        // Get original image metadata
        const metadata = await sharp(filePath).metadata();
        if (!metadata) {
            console.error('Invalid image file:', filePath);
            return null;
        }

        const ext = path.extname(filePath).toLowerCase();
        const filename = path.basename(filePath, ext);
        const uploadsDir = path.dirname(filePath);
        const thumbnailDir = path.join(uploadsDir, 'thumbnails');
        const thumbnailPath = path.join(thumbnailDir, `${filename}_thumb${ext}`);

        // Generate optimized thumbnail
        await sharp(filePath)
            .resize(200, 200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({
                quality: 80,
                progressive: true,
                force: false
            })
            .png({
                compressionLevel: 9,
                force: false
            })
            .webp({
                quality: 80,
                force: false
            })
            .toFile(thumbnailPath);

        // Optimize original if it's large
        if (metadata.width > 2048 || metadata.height > 2048 || metadata.size > 1024 * 1024) {
            const optimizedPath = path.join(uploadsDir, `${filename}_optimized${ext}`);
            
            await sharp(filePath)
                .resize(2048, 2048, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({
                    quality: 85,
                    progressive: true,
                    force: false
                })
                .png({
                    compressionLevel: 9,
                    force: false
                })
                .webp({
                    quality: 85,
                    force: false
                })
                .toFile(optimizedPath);

            // Replace original with optimized version
            await fs.unlink(filePath);
            await fs.rename(optimizedPath, filePath);
        }

        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: metadata.size,
            thumbnail: path.relative(uploadsDir, thumbnailPath)
        };

    } catch (err) {
        console.error('Error processing image:', err);
        try {
            // Cleanup on error
            await fs.unlink(filePath).catch(() => {});
        } catch (cleanupErr) {
            console.error('Error cleaning up file:', cleanupErr);
        }
        return null;
    }
};

// Handle file upload with comprehensive validation and error handling
const handleFileUpload = async (req, res) => {
    const uploadedFile = req.file;
    const originalPath = uploadedFile ? uploadedFile.path : null;

    try {
        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Basic sanitization
        const sanitizedName = sanitizeHtml(uploadedFile.originalname, {
            allowedTags: [],
            allowedAttributes: {}
        });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = path.join('uploads', uploadedFile.filename);
        
        const fileInfo = {
            url: `${baseUrl}/${fileUrl}`,
            originalName: sanitizedName,
            type: uploadedFile.mimetype,
            size: uploadedFile.size
        };

        // Process images for thumbnails and optimization
        if (uploadedFile.mimetype.startsWith('image/')) {
            const imageData = await processImage(originalPath);
            if (imageData) {
                fileInfo.thumbnail = `${baseUrl}/uploads/thumbnails/${imageData.thumbnail}`;
                fileInfo.dimensions = {
                    width: imageData.width,
                    height: imageData.height
                };
            }
        }

        res.json({
            success: true,
            file: fileInfo
        });

    } catch (err) {
        console.error('File upload error:', err);
        
        // Cleanup on error
        if (originalPath) {
            try {
                await fs.unlink(originalPath).catch(() => {});
            } catch (cleanupErr) {
                console.error('Error cleaning up file:', cleanupErr);
            }
        }

        res.status(500).json({
            error: 'File upload failed',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

module.exports = {
    upload,
    handleFileUpload,
    processImage
};
