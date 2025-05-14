const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const { expect } = require('chai');
const { createServer } = require('../../../server');
const { processImage } = require('../../../handlers/fileHandler');

describe('File Upload Handling', () => {
    let app;
    let testFilePath;

    before(async () => {
        app = await createServer();
        testFilePath = path.join(__dirname, '../../fixtures/test-image.jpg');
        
        // Create test image if it doesn't exist
        try {
            await fs.access(testFilePath);
        } catch {
            const testImageBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
            await fs.mkdir(path.dirname(testFilePath), { recursive: true });
            await fs.writeFile(testFilePath, testImageBuffer);
        }
    });

    after(async () => {
        try {
            await fs.unlink(testFilePath);
        } catch (err) {
            console.error('Error cleaning up test file:', err);
        }
    });

    it('should upload file successfully', async () => {
        const response = await request(app)
            .post('/upload')
            .attach('file', testFilePath)
            .expect(200);

        expect(response.body.success).to.be.true;
        expect(response.body.file).to.have.property('url');
        expect(response.body.file).to.have.property('thumbnail');
        expect(response.body.file).to.have.property('dimensions');
    });

    it('should reject files that exceed size limit', async () => {
        const largePath = path.join(__dirname, '../../fixtures/large-file.jpg');
        const largeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16MB

        await fs.writeFile(largePath, largeBuffer);

        try {
            await request(app)
                .post('/upload')
                .attach('file', largePath)
                .expect(413);
        } finally {
            await fs.unlink(largePath);
        }
    });

    it('should reject invalid file types', async () => {
        const invalidPath = path.join(__dirname, '../../fixtures/test.exe');
        await fs.writeFile(invalidPath, 'invalid file');

        try {
            await request(app)
                .post('/upload')
                .attach('file', invalidPath)
                .expect(400);
        } finally {
            await fs.unlink(invalidPath);
        }
    });

    describe('Image Processing', () => {
        it('should generate thumbnails for images', async () => {
            const imagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
            const result = await processImage(imagePath);

            expect(result).to.have.property('thumbnail');
            expect(result).to.have.property('width', 200);
            expect(result).to.have.property('height', 200);
        });

        it('should handle non-image files', async () => {
            const textPath = path.join(__dirname, '../../fixtures/test.txt');
            await fs.writeFile(textPath, 'test content');

            try {
                const result = await processImage(textPath);
                expect(result).to.be.null;
            } finally {
                await fs.unlink(textPath);
            }
        });

        it('should optimize original images', async () => {
            const imagePath = path.join(__dirname, '../../fixtures/large-image.jpg');
            const largeBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB

            await fs.writeFile(imagePath, largeBuffer);

            try {
                await processImage(imagePath);
                const stats = await fs.stat(imagePath);
                expect(stats.size).to.be.lessThan(5 * 1024 * 1024);
            } finally {
                await fs.unlink(imagePath);
            }
        });
    });
});
