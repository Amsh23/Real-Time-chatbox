// In-memory data store with MongoDB-like API
class MemoryStore {
    constructor() {
        this.messages = new Map();
        this.users = new Map();
        this.groups = new Map();
        this.pinnedMessages = new Map();
        this.messageHistory = new Map();
        this.searchIndex = new Map();
        this.reactions = new Map();
        this.typingUsers = new Map();
        this.fileUploads = new Map();
        this.offlineQueue = new Map();
        this.messageDeliveryStatus = new Map();
    }

    // Message validation
    async validateMessage(message) {
        const maxLength = parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000;
        if (message.text && message.text.length > maxLength) {
            throw new Error(`Message too long. Maximum length is ${maxLength} characters.`);
        }
        return true;
    }

    // Create a message with validation
    async createMessage({ id, text, sender, username, groupId, metadata = {} }) {
        // Validate message length
        await this.validateMessage({ text });

        const message = {
            id,
            text,
            sender,
            username,
            groupId,
            metadata,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.messages.set(id, message);
        this.updateSearchIndex(message);
        return message;
    }

    async findMessages(query = {}) {
        return Array.from(this.messages.values()).filter(msg => {
            return Object.entries(query).every(([key, value]) => {
                if (key === '$or') {
                    return value.some(condition => {
                        const [field, operator] = Object.entries(condition)[0];
                        if (operator.$regex) {
                            const regex = new RegExp(operator.$regex, operator.$options);
                            return regex.test(msg[field]);
                        }
                        return msg[field] === condition[field];
                    });
                }
                return msg[key] === value;
            });
        });
    }

    async updateMessage(id, updates) {
        const message = this.messages.get(id);
        if (!message) return null;

        const updatedMessage = { ...message, ...updates, updatedAt: new Date() };
        this.messages.set(id, updatedMessage);
        this.updateSearchIndex(updatedMessage);
        return updatedMessage;
    }

    async deleteMessage(id) {
        const message = this.messages.get(id);
        if (!message) return false;
        this.messages.delete(id);
        return true;
    }

    // Search functionality
    updateSearchIndex(message) {
        const tokens = [
            ...message.text.toLowerCase().split(/\s+/),
            message.username.toLowerCase()
        ];
        tokens.forEach(token => {
            let messages = this.searchIndex.get(token) || [];
            messages.push(message);
            this.searchIndex.set(token, messages);
        });
    }

    async searchMessages(query, groupId) {
        const searchText = query.toLowerCase();
        return Array.from(this.messages.values())
            .filter(msg => {
                if (groupId && msg.groupId !== groupId) return false;
                const indexed = this.searchIndex.get(msg.id) || '';
                return indexed.includes(searchText);
            })
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    // Message history tracking
    async addToHistory(messageId, change) {
        const history = this.messageHistory.get(messageId) || [];
        history.push({ ...change, timestamp: new Date() });
        this.messageHistory.set(messageId, history);
    }

    async getMessageHistory(messageId) {
        return this.messageHistory.get(messageId) || [];
    }

    // Pinned messages
    async pinMessage(messageId, userId) {
        const message = this.messages.get(messageId);
        if (!message) {
            throw new Error('Message not found');
        }

        message.metadata = {
            ...message.metadata,
            pinned: true,
            pinnedBy: userId,
            pinnedAt: new Date()
        };

        let groupPinnedMessages = this.pinnedMessages.get(message.groupId) || [];
        if (!groupPinnedMessages.some(m => m.id === messageId)) {
            groupPinnedMessages = [...groupPinnedMessages, message];
            this.pinnedMessages.set(message.groupId, groupPinnedMessages);
        }

        return message;
    }

    async unpinMessage(messageId) {
        const message = this.messages.get(messageId);
        if (!message) return null;

        message.metadata = {
            ...message.metadata,
            pinned: false,
            pinnedBy: null,
            pinnedAt: null
        };
        this.pinnedMessages.delete(messageId);
        return message;
    }

    async getPinnedMessages(groupId) {
        return Array.from(this.pinnedMessages.values())
            .filter(msg => msg.groupId === groupId);
    }

    // Message editing
    async editMessage(messageId, newText) {
        const message = this.messages.get(messageId);
        if (!message) {
            throw new Error('Message not found');
        }

        const oldText = message.text;
        message.text = newText;
        message.metadata = {
            ...message.metadata,
            edited: true,
            editHistory: [
                ...(message.metadata.editHistory || []),
                { text: oldText, timestamp: new Date() }
            ]
        };
        message.updatedAt = new Date();

        return message;
    }

    // Validation
    async validateMessage(message) {
        const maxLength = parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000;
        if (message.text && message.text.length > maxLength) {
            throw new Error(`Message too long. Maximum length is ${maxLength} characters.`);
        }
        return true;
    }

    // Cleanup methods
    async cleanup() {
        const now = Date.now();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

        for (const [id, message] of this.messages) {
            if (now - message.createdAt.getTime() > maxAge) {
                this.messages.delete(id);
                this.searchIndex.delete(id);
                this.messageHistory.delete(id);
                this.pinnedMessages.delete(id);
            }
        }
    }
}

module.exports = new MemoryStore();
