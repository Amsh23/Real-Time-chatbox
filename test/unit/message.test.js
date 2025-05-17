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
        const maxLength = 2000;
        const longMessage = 'a'.repeat(maxLength + 1);
        
        const message = await store.createMessage({
            id: 'test-id',
            text: longMessage,
            sender: 'test-sender',
            username: 'test-user',
            groupId: 'test-group'
        }).catch(err => err);

        expect(message).toHaveProperty('error');
        expect(message.error).toContain('Message too long');
    });
});

describe('Message Management', () => {
    test('should handle message pinning', async () => {
        const message = await store.createMessage({
            id: 'test-pin-id',
            text: 'Test message',
            sender: 'test-sender',
            username: 'test-user',
            groupId: 'test-group'
        });

        await store.pinMessage('test-pin-id', 'admin-id');
        const pinnedMessage = await store.findMessages({ id: 'test-pin-id' });
        
        expect(pinnedMessage[0].metadata.pinned).toBeTruthy();
        expect(pinnedMessage[0].metadata.pinnedBy).toBe('admin-id');

        await message.validate();
        expect(message.metadata.pinned).toBeTruthy();
        expect(message.metadata.pinnedBy).toBe('admin-id');
    });

    test('should handle message replies', async () => {
        const message = new Message({
            id: 'test-reply-id',
            text: 'Reply message',
            sender: 'test-sender',
            username: 'test-user',
            groupId: 'test-group',
            metadata: {
                replyTo: {
                    message: 'Original message',
                    username: 'original-user'
                }
            }
        });

        await message.validate();
        expect(message.metadata.replyTo.message).toBe('Original message');
        expect(message.metadata.replyTo.username).toBe('original-user');
    });

    test('should handle message editing', async () => {
        const message = new Message({
            id: 'test-edit-id',
            text: 'Original text',
            sender: 'test-sender',
            username: 'test-user',
            groupId: 'test-group'
        });

        await message.save();
        await message.editText('Updated text');

        expect(message.text).toBe('Updated text');
        expect(message.metadata.edited).toBeTruthy();
        expect(message.metadata.editHistory).toHaveLength(1);
        expect(message.metadata.editHistory[0].text).toBe('Original text');
    });

    test('should handle message search', async () => {
        // Create test messages
        await Message.create([
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
        ]);

        const messages = await Message.find({
            groupId: 'test-group',
            $or: [
                { text: { $regex: 'test', $options: 'i' } },
                { username: { $regex: 'test', $options: 'i' } }
            ]
        });

        expect(Array.isArray(messages)).toBeTruthy();
        expect(messages.length).toBe(2);
    });
});