const sanitizeHtml = require('sanitize-html');
const store = require('../../models/memoryStore');

beforeEach(() => {
    // Clear store before each test
    store.messages.clear();
    store.pinnedMessages.clear();
    store.messageHistory.clear();
    store.searchIndex.clear();
    store.reactions.clear();
    store.fileUploads.clear();
    store.typingUsers.clear();
});

describe('Message Handling', () => {
    test('should sanitize message text', () => {
        const unsafeText = '<script>alert("xss")</script>Hello <b>World</b>';
        const sanitizedText = sanitizeHtml(unsafeText, { 
            allowedTags: ['b', 'i', 'u', 'br'],
            allowedAttributes: {}
        });
        
        expect(sanitizedText).toBe('Hello <b>World</b>');
    });

    test('should validate message length', async () => {
        const maxLength = parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000;
        const longMessage = 'a'.repeat(maxLength + 1);
        
        let error;
        try {
            await store.validateMessage({ text: longMessage });
            error = null;
        } catch (err) {
            error = err;
        }
        expect(error).toBeTruthy();
        expect(error.message).toContain('Message too long');
    });
});

describe('Message Management', () => {
    test('should handle message pinning', async () => {
        const message = {
            id: 'test-pin-id',
            text: 'Test message',
            sender: 'test-sender',
            username: 'test-user',
            groupId: 'test-group',
            metadata: {
                pinned: false,
                pinnedBy: null,
                pinnedAt: null
            }
        };
        
        // Store the message
        await store.createMessage(message);
        
        // Pin the message
        const pinnedMessage = await store.pinMessage(message.id, 'admin-id');
        
        expect(pinnedMessage.metadata.pinned).toBe(true);
        expect(pinnedMessage.metadata.pinnedBy).toBe('admin-id');
        expect(pinnedMessage.metadata.pinnedAt).toBeInstanceOf(Date);
        
        // Check the group's pinned messages
        const groupPinnedMessages = store.pinnedMessages.get(message.groupId) || [];
        expect(groupPinnedMessages.length).toBe(1);
        expect(groupPinnedMessages[0].id).toBe(message.id);
    });

    test('should handle message editing', async () => {
        const originalText = 'Original text';
        const message = {
            id: 'test-edit-id',
            text: originalText,
            sender: 'test-sender',
            username: 'test-user',
            groupId: 'test-group',
            metadata: {
                edited: false,
                editHistory: []
            }
        };
        
        // Store the message
        await store.createMessage(message);
        
        // Edit the message
        const newText = 'Updated text';
        const editedMessage = await store.editMessage(message.id, newText);
        
        expect(editedMessage.text).toBe(newText);
        expect(editedMessage.metadata.edited).toBe(true);
        expect(editedMessage.metadata.editHistory).toHaveLength(1);
        expect(editedMessage.metadata.editHistory[0].text).toBe(originalText);
    });

    test('should handle message search', async () => {
        // Create test messages
        const messages = [
            {
                id: 'test-search-1',
                text: 'Test message one',
                sender: 'test-sender',
                username: 'test-user',
                groupId: 'test-group'
            },
            {
                id: 'test-search-2',
                text: 'Another test message',
                sender: 'test-sender',
                username: 'test-user',
                groupId: 'test-group'
            }
        ];
        
        // Store messages
        for (const msg of messages) {
            await store.createMessage(msg);
        }
        
        // Search messages
        const foundMessages = store.searchMessages('test');
        expect(Array.isArray(foundMessages)).toBe(true);
        expect(foundMessages).toHaveLength(2);
    });
});