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

    return {
        handleCreateGroup,
        handleJoinGroup,
        handleLeaveGroup,
        groups,
        userGroups
    };
};

module.exports = groupHandlers;