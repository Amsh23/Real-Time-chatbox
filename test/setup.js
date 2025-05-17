require('dotenv').config({ path: '.env.test' });
const store = require('../models/memoryStore');

// Increase timeout for integration tests
jest.setTimeout(10000);

// Clear store and mocks between tests
beforeEach(() => {
    // Reset all stores
    store.messages.clear();
    store.users.clear();
    store.groups.clear();
    store.pinnedMessages.clear();
    store.messageHistory.clear();
    store.searchIndex.clear();
    store.reactions.clear();
    store.fileUploads.clear();
    store.typingUsers.clear();
    store.offlineQueue.clear();
    store.messageDeliveryStatus.clear();

    // Clear all Jest mocks
    jest.clearAllMocks();
});