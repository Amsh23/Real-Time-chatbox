const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    socketId: { type: String, index: true },
    username: { 
        type: String, 
        required: true,
        minLength: [3, 'نام کاربری باید حداقل ۳ کاراکتر باشد'],
        maxLength: [30, 'نام کاربری نمی‌تواند بیشتر از ۳۰ کاراکتر باشد']
    },
    role: { 
        type: String, 
        enum: ['user', 'admin'], 
        default: 'user' 
    },
    avatar: String,
    status: { 
        type: String, 
        enum: ['online', 'offline', 'away'], 
        default: 'offline' 
    },
    lastSeen: Date,
    groups: [{ type: String, ref: 'Group' }],
    createdAt: { type: Date, default: Date.now },
    settings: {
        theme: { type: String, enum: ['light', 'dark'], default: 'dark' },
        notifications: { type: Boolean, default: true },
        language: { type: String, default: 'fa' }
    }
});

// Add method to generate avatar URL
UserSchema.methods.generateAvatar = function() {
    const colors = ['6a1b9a', '4a148c', '7b1fa2', '9c4dcc'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.username)}&background=${color}&color=fff`;
};

// Add method to update online status
UserSchema.methods.updateStatus = function(status) {
    this.status = status;
    if (status === 'offline') {
        this.lastSeen = new Date();
    }
    return this.save();
};

// Add static method to find online users
UserSchema.statics.getOnlineUsers = function() {
    return this.find({ status: 'online' }).select('username avatar role').lean();
};

module.exports = mongoose.model('User', UserSchema);