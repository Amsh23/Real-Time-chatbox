const { Group, Message } = require('../../models');
const sanitizeHtml = require('sanitize-html');
const { v4: uuidv4 } = require('uuid');

// In-memory storage
const groups = new Map();
const userGroups = new Map();

const groupHandlers = (io, socket, users) => {
    const handleCreateGroup = async (groupName, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const sanitizedGroupName = sanitizeHtml(groupName, { 
                allowedTags: [], 
                allowedAttributes: {} 
            });

            // Create new group
            const group = new Group({
                id: uuidv4(),
                name: sanitizedGroupName,
                admin: socket.id,
                members: [socket.id]
            });
            
            await group.save();
            
            // Update in-memory storage
            groups.set(group.id, group);
            const userGroupsSet = userGroups.get(socket.id) || new Set();
            userGroupsSet.add(group.id);
            userGroups.set(socket.id, userGroupsSet);
            
            // Join socket room
            socket.join(group.id);
            
            // Create welcome message
            const welcomeMessage = {
                id: uuidv4(),
                text: `گروه "${sanitizedGroupName}" با موفقیت ایجاد شد!`,
                sender: 'system',
                username: 'سیستم',
                groupId: group.id,
                timestamp: new Date().toISOString()
            };

            await Message.create(welcomeMessage);
            
            // Send response
            callback({
                success: true,
                group: {
                    id: group.id,
                    name: group.name,
                    inviteCode: group.inviteCode
                }
            });
            
            io.to(group.id).emit('new-message', welcomeMessage);
        } catch (err) {
            console.error('Error creating group:', err);
            callback({ error: 'خطا در ایجاد گروه' });
        }
    };

    const handleJoinGroup = async ({ groupId, inviteCode }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            // Find group in database
            const group = await Group.findOne({ id: groupId, inviteCode });
            if (!group) {
                return callback({ error: 'گروه یا کد دعوت نامعتبر است' });
            }

            // Add member to group
            await group.addMember(socket.id);
            
            // Update in-memory storage
            groups.set(groupId, group);
            const userGroupsSet = userGroups.get(socket.id) || new Set();
            userGroupsSet.add(groupId);
            userGroups.set(socket.id, userGroupsSet);
            
            // Join socket room
            socket.join(groupId);
            
            // Load recent messages
            const messages = await Message.getGroupMessages(groupId);
            
            // Create join message
            const joinMessage = {
                id: uuidv4(),
                text: `${user.username} به گروه پیوست!`,
                sender: 'system',
                username: 'سیستم',
                groupId: groupId,
                timestamp: new Date().toISOString()
            };

            await Message.create(joinMessage);
            
            // Send response
            callback({
                success: true,
                group: {
                    id: group.id,
                    name: group.name,
                    members: group.members.map(id => {
                        const user = users.get(id);
                        return user ? {
                            username: user.username,
                            avatar: user.avatar,
                            role: user.role
                        } : null;
                    }).filter(Boolean)
                },
                messages
            });
            
            // Notify group members
            io.to(groupId).emit('new-message', joinMessage);
            io.to(groupId).emit('group-updated', {
                id: groupId,
                members: group.members.map(id => {
                    const user = users.get(id);
                    return user ? {
                        username: user.username,
                        avatar: user.avatar,
                        role: user.role
                    } : null;
                }).filter(Boolean)
            });
        } catch (err) {
            console.error('Error joining group:', err);
            callback({ error: 'خطا در پیوستن به گروه' });
        }
    };

    const handleLeaveGroup = async (groupId, callback = () => {}) => {
        try {
            const user = users.get(socket.id);
            if (!user) return;

            const group = await Group.findOne({ id: groupId });
            if (!group) return;

            // Remove member from group
            await group.removeMember(socket.id);
            
            // Update in-memory storage
            if (groups.has(groupId)) {
                groups.get(groupId).members = group.members;
            }
            
            const userGroupsSet = userGroups.get(socket.id);
            if (userGroupsSet) {
                userGroupsSet.delete(groupId);
                if (userGroupsSet.size === 0) {
                    userGroups.delete(socket.id);
                }
            }
            
            // Leave socket room
            socket.leave(groupId);
            
            // Create leave message
            const leaveMessage = {
                id: uuidv4(),
                text: `${user.username} از گروه خارج شد`,
                sender: 'system',
                username: 'سیستم',
                groupId: groupId,
                timestamp: new Date().toISOString()
            };

            await Message.create(leaveMessage);
            
            // Notify remaining members
            io.to(groupId).emit('new-message', leaveMessage);
            io.to(groupId).emit('user-left', {
                username: user.username,
                groupId: groupId
            });
            io.to(groupId).emit('group-updated', {
                id: groupId,
                members: group.members.map(id => {
                    const user = users.get(id);
                    return user ? {
                        username: user.username,
                        avatar: user.avatar,
                        role: user.role
                    } : null;
                }).filter(Boolean)
            });

            callback?.({ success: true });
        } catch (err) {
            console.error('Error leaving group:', err);
            callback?.({ error: 'خطا در خروج از گروه' });
        }
    };

    const handleChangeRole = async ({ userId, groupId, role }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group) return callback({ error: 'گروه یافت نشد' });

            // Verify admin permissions
            if (group.admin !== socket.id) {
                return callback({ error: 'فقط مدیر گروه می‌تواند نقش‌ها را تغییر دهد' });
            }

            // Prevent admin from changing their own role
            if (userId === group.admin) {
                return callback({ error: 'مدیر گروه نمی‌تواند نقش خود را تغییر دهد' });
            }

            // Validate role
            const validRoles = ['member', 'moderator'];
            if (!validRoles.includes(role)) {
                return callback({ error: 'نقش نامعتبر است' });
            }

            // Update role
            if (role === 'moderator') {
                if (!group.moderators.includes(userId)) {
                    group.moderators.push(userId);
                }
            } else {
                group.moderators = group.moderators.filter(id => id !== userId);
            }

            await group.save();

            // Update in-memory storage
            if (groups.has(groupId)) {
                groups.get(groupId).moderators = group.moderators;
            }

            // Notify group members
            const targetUser = users.get(userId);
            io.to(groupId).emit('role-changed', {
                userId,
                username: targetUser?.username,
                role,
                changedBy: user.username
            });

            // Create system message about role change
            const systemMessage = {
                id: uuidv4(),
                text: `${targetUser?.username} به عنوان ${role === 'moderator' ? 'مدیر' : 'کاربر عادی'} منصوب شد`,
                sender: 'system',
                username: 'سیستم',
                groupId: groupId,
                timestamp: new Date()
            };

            await Message.create(systemMessage);
            io.to(groupId).emit('new-message', systemMessage);

            callback({ success: true });
        } catch (err) {
            console.error('Error changing role:', err);
            callback({ error: 'خطا در تغییر نقش کاربر' });
        }
    };

    const handleChangeGroupSettings = async ({ groupId, settings }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group) return callback({ error: 'گروه یافت نشد' });

            // Verify admin or moderator permissions
            if (!group.isAdminOrModerator(socket.id)) {
                return callback({ error: 'شما دسترسی لازم را ندارید' });
            }

            // Validate and update settings
            const validSettings = {
                maxMembers: typeof settings.maxMembers === 'number' && settings.maxMembers > 0,
                isPrivate: typeof settings.isPrivate === 'boolean',
                allowStickers: typeof settings.allowStickers === 'boolean',
                allowFiles: typeof settings.allowFiles === 'boolean',
                messageEncryption: typeof settings.messageEncryption === 'boolean'
            };

            if (!Object.values(validSettings).every(Boolean)) {
                return callback({ error: 'تنظیمات نامعتبر است' });
            }

            // Update settings
            group.settings = {
                ...group.settings,
                ...settings
            };

            await group.save();

            // Update in-memory storage
            if (groups.has(groupId)) {
                groups.get(groupId).settings = group.settings;
            }

            // Notify group members
            io.to(groupId).emit('group-settings-changed', {
                groupId,
                settings: group.settings,
                changedBy: user.username
            });

            callback({ success: true, settings: group.settings });
        } catch (err) {
            console.error('Error changing group settings:', err);
            callback({ error: 'خطا در تغییر تنظیمات گروه' });
        }
    };

    const handleRemoveMember = async ({ userId, groupId }, callback) => {
        try {
            const user = users.get(socket.id);
            if (!user) return callback({ error: 'لطفا ابتدا نام کاربری خود را تنظیم کنید' });

            const group = await Group.findOne({ id: groupId });
            if (!group) return callback({ error: 'گروه یافت نشد' });

            // Check permissions
            if (!group.isAdminOrModerator(socket.id)) {
                return callback({ error: 'شما دسترسی لازم را ندارید' });
            }

            // Admin can't be removed
            if (userId === group.admin) {
                return callback({ error: 'مدیر گروه نمی‌تواند حذف شود' });
            }

            // Moderator can't remove other moderators
            if (group.moderators.includes(userId) && !group.admin === socket.id) {
                return callback({ error: 'فقط مدیر گروه می‌تواند مدیران را حذف کند' });
            }

            await group.removeMember(userId);

            // Remove from moderators if applicable
            if (group.moderators.includes(userId)) {
                group.moderators = group.moderators.filter(id => id !== userId);
                await group.save();
            }

            // Update in-memory storage
            if (groups.has(groupId)) {
                const groupData = groups.get(groupId);
                groupData.members = group.members;
                groupData.moderators = group.moderators;
            }

            // Remove from user's groups
            const userGroupsSet = userGroups.get(userId);
            if (userGroupsSet) {
                userGroupsSet.delete(groupId);
            }

            // Notify group members
            const removedUser = users.get(userId);
            io.to(groupId).emit('member-removed', {
                userId,
                username: removedUser?.username,
                removedBy: user.username
            });

            // Notify removed user
            io.to(userId).emit('removed-from-group', {
                groupId,
                groupName: group.name,
                removedBy: user.username
            });

            callback({ success: true });
        } catch (err) {
            console.error('Error removing member:', err);
            callback({ error: 'خطا در حذف کاربر از گروه' });
        }
    };

    return {
        handleCreateGroup,
        handleJoinGroup,
        handleLeaveGroup,
        handleChangeRole,
        handleChangeGroupSettings,
        handleRemoveMember,
        groups,
        userGroups
    };
};

module.exports = groupHandlers;