const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
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
        size: Number
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
            type: String, 
            ref: 'Message',
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
        pinnedAt: Date
    }
});

// Add compound indexes for better query performance
MessageSchema.index({ groupId: 1, timestamp: -1 });
MessageSchema.index({ sender: 1, status: 1 });
MessageSchema.index({ groupId: 1, readBy: 1 });

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

// Static methods
MessageSchema.statics.getGroupMessages = function(groupId, options = {}) {
    const query = this.find({ groupId })
        .sort({ timestamp: options.sort || -1 });
    
    if (options.limit) {
        query.limit(options.limit);
    }
    
    if (options.before) {
        query.where('timestamp').lt(options.before);
    }
    
    if (options.after) {
        query.where('timestamp').gt(options.after);
    }

    return query.lean();
};

MessageSchema.statics.getUnreadMessages = function(userId, groupId) {
    return this.find({
        groupId,
        readBy: { $ne: userId }
    }).sort({ timestamp: 1 }).lean();
};

module.exports = mongoose.model('Message', MessageSchema);