const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const MessageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, default: uuidv4 },
    text: {
        type: String,
        maxlength: [parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000, 'پیام نمی‌تواند بیشتر از {MAXLENGTH} کاراکتر باشد']
    },
    encrypted: { type: Boolean, default: false },
    sender: { type: String, required: true, index: true },
    username: { type: String, required: true },
    avatar: String,
    groupId: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    attachments: [{
        url: String,
        type: String,
        originalName: String,
        size: Number,
        metadata: {
            width: Number,
            height: Number,
            duration: Number,
            thumbnail: String
        }
    }],
    sticker: {
        packId: String,
        stickerId: String,
        url: String
    },
    reactions: [{
        emoji: String,
        users: [String]
    }],
    readBy: [{ type: String, index: true }],
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read'], 
        default: 'sent' 
    },
    metadata: {
        clientId: String,
        replyTo: {
            messageId: { type: String, ref: 'Message' },
            message: String,
            username: String
        },
        forwarded: Boolean,
        edited: { type: Boolean, default: false },
        editHistory: [{
            text: String,
            timestamp: Date
        }],
        pinned: { type: Boolean, default: false },
        pinnedBy: String,
        pinnedAt: Date,
        readAt: { type: Map, of: Date }
    }
});

// Add compound indexes for better query performance
MessageSchema.index({ groupId: 1, timestamp: -1 });
MessageSchema.index({ sender: 1, status: 1 });
MessageSchema.index({ groupId: 1, readBy: 1 });
MessageSchema.index({ 'text': 'text', 'username': 'text' });

// Instance methods
MessageSchema.methods.markAsDelivered = function() {
    this.status = 'delivered';
    return this.save();
};

MessageSchema.methods.markAsRead = function(userId) {
    if (!this.readBy.includes(userId)) {
        this.readBy.push(userId);
        this.status = 'read';
    }
    return this.save();
};

MessageSchema.methods.addReaction = function(emoji, userId) {
    let reaction = this.reactions.find(r => r.emoji === emoji);
    if (reaction) {
        if (!reaction.users.includes(userId)) {
            reaction.users.push(userId);
        }
    } else {
        this.reactions.push({ emoji, users: [userId] });
    }
    return this.save();
};

MessageSchema.methods.editText = function(newText) {
    if (this.metadata.edited) {
        this.metadata.editHistory.push({
            text: this.text,
            timestamp: new Date()
        });
    } else {
        this.metadata.edited = true;
        this.metadata.editHistory = [{
            text: this.text,
            timestamp: this.timestamp
        }];
    }
    this.text = newText;
    return this.save();
};

MessageSchema.methods.markReadBy = async function(userId) {
    if (!this.metadata.readBy.includes(userId)) {
        this.metadata.readBy.push(userId);
        this.metadata.readAt.set(userId, new Date());
        await this.save();
    }
};

// Static methods
MessageSchema.statics.getGroupMessages = async function(groupId, options = {}) {
    const {
        before = new Date(),
        limit = 50,
        sort = -1,
        filter = {}
    } = options;

    const query = {
        groupId,
        timestamp: { $lt: before },
        ...filter
    };

    return this.find(query)
        .sort({ timestamp: sort })
        .limit(limit)
        .lean();
};

MessageSchema.statics.getUnreadMessages = function(userId, groupId) {
    return this.find({
        groupId,
        readBy: { $ne: userId }
    }).sort({ timestamp: 1 }).lean();
};

MessageSchema.statics.cleanOldMessages = async function(groupId, daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.deleteMany({
        groupId,
        timestamp: { $lt: cutoffDate },
        'attachments.0': { $exists: false },
        'metadata.pinned': false
    });
};

MessageSchema.statics.searchMessages = async function(groupId, query, options = {}) {
    const {
        limit = 20,
        skip = 0,
        sort = { timestamp: -1 }
    } = options;

    return this.find({
        groupId,
        $text: { $search: query }
    })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
};

// Virtual for read receipt count
MessageSchema.virtual('readCount').get(function() {
    return this.metadata.readBy.length;
});

// Add attachment validation
MessageSchema.pre('save', function(next) {
    if (this.attachments && this.attachments.length > 0) {
        const maxSize = 15 * 1024 * 1024; // 15MB
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf'];
        
        for (const attachment of this.attachments) {
            if (attachment.size > maxSize) {
                next(new Error('File size exceeds maximum limit'));
                return;
            }
            if (!allowedTypes.includes(attachment.type)) {
                next(new Error('File type not allowed'));
                return;
            }
        }
    }
    next();
});

module.exports = mongoose.model('Message', MessageSchema);