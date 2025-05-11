require('dotenv').config({ path: '.env.test' });
const mongoose = require('mongoose');

// Increase timeout for integration tests
jest.setTimeout(30000);

// Clear all mocks between tests
beforeEach(() => {
    jest.clearAllMocks();
});

// Cleanup database after each test
afterEach(async () => {
    if (mongoose.connection.readyState === 1) {
        const collections = await mongoose.connection.db.collections();
        for (let collection of collections) {
            await collection.deleteMany({});
        }
    }
});

// Close database connection after all tests
afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
    }
});