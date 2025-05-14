const fs = require('fs');
const path = require('path');

// Create fixtures directory
const fixturesDir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

// Create a simple test image (1x1 pixel transparent GIF)
const testImage = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
fs.writeFileSync(path.join(fixturesDir, 'test-image.jpg'), testImage);

console.log('Test fixtures created successfully!');
