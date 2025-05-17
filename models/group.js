const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { generateRoomKey } = require('../utils/encryption');

const GroupSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    name: { 
        type: String, 
        required: true,
        minLength: [3, 'نام گروه باید حداقل ۳ کاراکتر باشد'],
        maxLength: [50, 'نام گروه نمی‌تواند بیشتر از ۵۰ کاراکتر باشد']
    },
    admin: { type: String, required: true },
    moderators: [{ type: String }],
    members: [{ type: String, index: true }],
    inviteCode: { 
        type: String, 
        required: true,
        unique: true,
        index: true 
    },
    encryptionKey: { 
        type: String,
        required: true,
        default: generateRoomKey
    },
    settings: {
        maxMembers: { type: Number, default: 100 },
        isPrivate: { type: Boolean, default: false },
        allowStickers: { type: Boolean, default: true },
        allowFiles: { type: Boolean, default: true },
        messageEncryption: { type: Boolean, default: true }
    },
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
});

// Compound indexes for better query performance
GroupSchema.index({ inviteCode: 1 });
GroupSchema.index({ admin: 1, createdAt: -1 });

// Generate invite code
GroupSchema.methods.generateInviteCode = function() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Add member to group
GroupSchema.methods.addMember = async function(socketId) {
    if (this.members.length >= this.settings.maxMembers) {
        throw new Error('گروه به حداکثر ظرفیت خود رسیده است');
    }
    if (!this.members.includes(socketId)) {
        this.members.push(socketId);
        this.lastActivity = new Date();
        await this.save();
    }
    return this;
};

// Remove member from group
GroupSchema.methods.removeMember = async function(socketId) {
    this.members = this.members.filter(id => id !== socketId);
    if (this.moderators.includes(socketId)) {
        this.moderators = this.moderators.filter(id => id !== socketId);
    }
    this.lastActivity = new Date();
    return this.save();
};

// Check if user is admin or moderator
GroupSchema.methods.isAdminOrModerator = function(socketId) {
    return this.admin === socketId || this.moderators.includes(socketId);
};

// Static method to find active groups
GroupSchema.statics.findActiveGroups = function() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    return this.find({
        lastActivity: { $gte: oneWeekAgo }
    })
    .select('name members createdAt lastActivity')
    .sort({ lastActivity: -1 })
    .limit(50)
    .lean();
};

// Pre-save middleware to ensure group has an ID and invite code
GroupSchema.pre('save', function(next) {
    if (this.isNew) {
        this.id = this.id || uuidv4();
        this.inviteCode = this.inviteCode || this.generateInviteCode();
    }
    next();
});

module.exports = mongoose.model('Group', GroupSchema);