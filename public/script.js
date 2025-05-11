// Initialize socket connection
const socket = io();

// Initialize DOM elements
const elements = {
    usernameInput: document.getElementById('username-input'),
    saveUsernameBtn: document.getElementById('save-username'),
    onlineCount: document.getElementById('online-count'),
    createGroupBtn: document.getElementById('create-group'),
    joinGroupBtn: document.getElementById('join-group'),
    groupInfo: document.getElementById('current-group-info'),
    groupName: document.getElementById('group-name'),
    inviteCode: document.getElementById('invite-code'),
    copyInviteBtn: document.getElementById('copy-invite'),
    chatTitle: document.getElementById('chat-title'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    attachBtn: document.getElementById('attach-btn'),
    fileInput: document.getElementById('file-input'),
    previewArea: document.getElementById('preview-area'),
    filePreviews: document.getElementById('file-previews'),
    clearPreview: document.getElementById('clear-preview'),
    toggleThemeBtn: document.getElementById('toggle-theme'),
    stickerBtn: document.getElementById('sticker-btn'),
    stickerPanel: document.getElementById('sticker-panel'),
    stickerTabs: document.querySelector('.sticker-tabs'),
    stickerContent: document.querySelector('.sticker-content'),
};

// State management
let currentUsername = localStorage.getItem('username') || '';
let currentGroup = null;
let attachments = [];
let isLightMode = localStorage.getItem('theme') === 'light';
let isLoadingMore = false;
let hasMoreMessages = true;
let offlineQueue = [];
let lastMessageTimestamp = null;
let isOnline = true;

// Add sticker packs data
const STICKER_PACKS = [
    {
        id: 'emotions',
        name: 'احساسات',
        icon: '😊',
        stickers: [
            { id: 'happy', url: '/stickers/emotions/happy.png', emoji: '😊' },
            { id: 'sad', url: '/stickers/emotions/sad.png', emoji: '😢' },
            { id: 'love', url: '/stickers/emotions/love.png', emoji: '❤️' },
            { id: 'laugh', url: '/stickers/emotions/laugh.png', emoji: '😂' },
            { id: 'angry', url: '/stickers/emotions/angry.png', emoji: '😠' }
        ]
    },
    {
        id: 'animals',
        name: 'حیوانات',
        icon: '🐱',
        stickers: [
            { id: 'cat', url: '/stickers/animals/cat.png', emoji: '🐱' },
            { id: 'dog', url: '/stickers/animals/dog.png', emoji: '🐶' },
            { id: 'rabbit', url: '/stickers/animals/rabbit.png', emoji: '🐰' },
            { id: 'bear', url: '/stickers/animals/bear.png', emoji: '🐻' }
        ]
    },
    {
        id: 'food',
        name: 'غذاها',
        icon: '🍕',
        stickers: [
            { id: 'pizza', url: '/stickers/food/pizza.png', emoji: '🍕' },
            { id: 'burger', url: '/stickers/food/burger.png', emoji: '🍔' },
            { id: 'icecream', url: '/stickers/food/icecream.png', emoji: '🍦' },
            { id: 'cake', url: '/stickers/food/cake.png', emoji: '🎂' }
        ]
    },
    {
        id: 'activities',
        name: 'فعالیت‌ها',
        icon: '⚽',
        stickers: [
            { id: 'soccer', url: '/stickers/activities/soccer.png', emoji: '⚽' },
            { id: 'basketball', url: '/stickers/activities/basketball.png', emoji: '🏀' },
            { id: 'gaming', url: '/stickers/activities/gaming.png', emoji: '🎮' },
            { id: 'music', url: '/stickers/activities/music.png', emoji: '🎵' }
        ]
    }
];

// Initialize Intersection Observer for infinite scroll
const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore && hasMoreMessages && currentGroup) {
        loadMoreMessages();
    }
}, { threshold: 0.1 });

// Add scroll sentinel element to chat messages
const scrollSentinel = document.createElement('div');
scrollSentinel.className = 'scroll-sentinel';
elements.chatMessages.prepend(scrollSentinel);
scrollObserver.observe(scrollSentinel);

// Add lazy loading for images and videos
const mediaObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const media = entry.target;
            if (media.dataset.src) {
                media.src = media.dataset.src;
                delete media.dataset.src;
                mediaObserver.unobserve(media);
            }
        }
    });
}, { threshold: 0.1 });

// Event Listeners
elements.saveUsernameBtn?.addEventListener('click', handleSaveUsername);
elements.createGroupBtn?.addEventListener('click', handleCreateGroup);
elements.joinGroupBtn?.addEventListener('click', handleJoinGroup);
elements.copyInviteBtn?.addEventListener('click', handleCopyInvite);
elements.sendButton?.addEventListener('click', handleSendMessage);
elements.messageInput?.addEventListener('keypress', handleMessageKeypress);
elements.attachBtn?.addEventListener('click', () => elements.fileInput.click());
elements.fileInput?.addEventListener('change', handleFileSelect);
elements.clearPreview?.addEventListener('click', clearAttachments);
elements.toggleThemeBtn?.addEventListener('click', toggleTheme);
elements.stickerBtn?.addEventListener('click', toggleStickerPanel);
elements.messageInput?.addEventListener('input', handleTyping);

let typingTimeout;

// Message handling functions
async function handleSendMessage() {
    const text = elements.messageInput.value.trim();
    if (text === '' && attachments.length === 0) {
        showToast('لطفاً پیام یا فایل وارد کنید', 'error');
        return;
    }

    const message = {
        text,
        groupId: currentGroup,
        attachments: attachments,
        timestamp: new Date()
    };

    if (!isOnline) {
        offlineQueue.push(message);
        showToast('پیام در صف ارسال قرار گرفت');
        elements.messageInput.value = '';
        clearAttachments();
        return;
    }

    sendMessage(message);
}

function sendMessage(message) {
    socket.emit('send-message', message, handleMessageResponse);

    elements.messageInput.value = '';
    clearAttachments();
}

function handleMessageKeypress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
}

function handleMessageResponse(response) {
    if (response.success) {
        displayMessage(response.message, true);
    } else {
        showToast('خطا در ارسال پیام', 'error');
    }
}

// User management functions
function handleSaveUsername() {
    const username = elements.usernameInput.value.trim();
    if (!username) {
        showToast('لطفاً نام کاربری معتبر وارد کنید', 'error');
        return;
    }

    socket.emit('set-username', username, (response) => {
        if (response.success) {
            currentUsername = username;
            localStorage.setItem('username', username);
            showToast('نام کاربری با موفقیت ذخیره شد');
        } else {
            showToast(response.error || 'خطا در ذخیره نام کاربری', 'error');
        }
    });
}

// Group management functions
function handleCreateGroup() {
    if (!currentUsername) {
        showToast('لطفا ابتدا نام کاربری خود را تنظیم کنید', 'error');
        return;
    }

    const groupName = prompt('لطفاً نام گروه را وارد کنید:');
    if (!groupName?.trim()) return;

    socket.emit('create-group', groupName.trim(), (response) => {
        if (response.success) {
            currentGroup = response.group.id;
            updateGroupInfo(response.group);
            showToast('گروه با موفقیت ایجاد شد');
            
            // Update UI to show we're in a group
            elements.chatTitle.textContent = `گروه: ${response.group.name}`;
            elements.chatMessages.innerHTML = ''; // Clear previous messages
        } else {
            showToast(response.error || 'خطا در ایجاد گروه', 'error');
        }
    });
}

// بهبود عملکرد پیوستن به گروه
async function handleJoinGroup() {
    if (!currentUsername) {
        showToast('لطفا ابتدا نام کاربری خود را تنظیم کنید', 'error');
        return;
    }

    const inviteLink = prompt('لطفاً لینک یا کد دعوت گروه را وارد کنید:');
    if (!inviteLink?.trim()) return;

    try {
        let groupId, inviteCode;
        
        // پشتیبانی از فرمت‌های مختلف لینک
        if (inviteLink.includes('/api/groups/')) {
            const parts = inviteLink.split('/');
            groupId = parts[parts.length - 3];
            inviteCode = parts[parts.length - 1];
        } else if (inviteLink.includes('?join=')) {
            const code = inviteLink.split('?join=')[1];
            [groupId, inviteCode] = code.split(':');
        } else {
            [groupId, inviteCode] = inviteLink.split(':');
        }

        if (!groupId || !inviteCode) {
            showToast('فرمت لینک دعوت نامعتبر است', 'error');
            return;
        }

        // اول چک کردن اعتبار لینک
        const response = await fetch(`/api/groups/${groupId}/join/${inviteCode}`);
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'لینک دعوت نامعتبر است', 'error');
            return;
        }

        // حالا به گروه بپیوندید
        socket.emit('join-group', { groupId, inviteCode }, handleJoinGroupResponse);

    } catch (err) {
        showToast('خطا در پیوستن به گروه', 'error');
        console.error('Error joining group:', err);
    }
}

function handleJoinGroupResponse(response) {
    if (response.success) {
        currentGroup = response.group.id;
        updateGroupInfo(response.group);
        showToast(`به گروه ${response.group.name} پیوستید`);
        
        // Update UI
        elements.chatTitle.textContent = `گروه: ${response.group.name}`;
        elements.chatMessages.innerHTML = ''; // Clear previous messages
        
        // Load group messages
        if (response.messages?.length > 0) {
            loadGroupMessages(response.messages);
        }

        // Update members list if available
        if (response.group.members?.length > 0) {
            updateMembersList(response.group.members);
        }
    } else {
        showToast(response.error || 'خطا در پیوستن به گروه', 'error');
    }
}

// File handling functions
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
        if (file.size > 15 * 1024 * 1024) {
            showToast(`فایل ${file.name} بزرگتر از حد مجاز است`, 'error');
            return;
        }

        const preview = createFilePreview(file);
        elements.filePreviews.appendChild(preview);
        attachments.push(file);
    });

    elements.previewArea.style.display = 'block';
}

function createFilePreview(file) {
    const preview = document.createElement('div');
    preview.className = 'file-preview';
    
    const fileType = file.type.split('/')[0];
    if (fileType === 'image') {
        preview.innerHTML = `
            <img src="${URL.createObjectURL(file)}" alt="${file.name}">
            <div class="file-info">
                <span>${file.name}</span>
                <button class="remove-file" data-index="${attachments.length}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    } else {
        preview.innerHTML = `
            <div class="file-icon">
                <i class="fas ${getFileIcon(file.type)}"></i>
            </div>
            <div class="file-info">
                <span>${file.name}</span>
                <button class="remove-file" data-index="${attachments.length}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }

    const removeBtn = preview.querySelector('.remove-file');
    removeBtn.addEventListener('click', () => {
        const index = parseInt(removeBtn.dataset.index);
        attachments.splice(index, 1);
        preview.remove();
        if (attachments.length === 0) {
            elements.previewArea.style.display = 'none';
        }
    });

    return preview;
}

// UI helper functions
function updateGroupInfo(group) {
    elements.groupInfo.style.display = 'block';
    elements.groupName.textContent = `گروه: ${group.name}`;
    elements.inviteCode.textContent = `${group.id}:${group.inviteCode}`;
    elements.chatTitle.textContent = `گروه: ${group.name}`;
}

function clearAttachments() {
    attachments = [];
    elements.filePreviews.innerHTML = '';
    elements.previewArea.style.display = 'none';
    elements.fileInput.value = '';
}

function handleCopyInvite() {
    const inviteText = elements.inviteCode.textContent;
    const currentUrl = window.location.origin;
    const inviteLink = `${currentUrl}/api/groups/${inviteText.split(':')[0]}/join/${inviteText.split(':')[1]}`;
    
    navigator.clipboard.writeText(inviteLink)
        .then(() => {
            showToast('لینک دعوت کپی شد');
            // ذخیره لینک در localStorage برای بازیابی بعدی
            localStorage.setItem('lastInviteLink', inviteLink);
        })
        .catch(() => showToast('خطا در کپی لینک دعوت', 'error'));
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Theme management
function toggleTheme() {
    isLightMode = !isLightMode;
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    document.body.classList.toggle('light-mode', isLightMode);
    elements.toggleThemeBtn.innerHTML = `<i class="fas fa-${isLightMode ? 'sun' : 'moon'}"></i>`;
}

// Initialize theme
document.body.classList.toggle('light-mode', isLightMode);

// Socket event listeners
socket.on('connect', () => {
    if (currentUsername) {
        socket.emit('set-username', currentUsername);
    }
});

socket.on('online-count', count => {
    elements.onlineCount.textContent = count;
});

socket.on('new-message', message => {
    displayMessage(message, message.sender === socket.id);
});

socket.on('user-joined', data => {
    showToast(`${data.username} وارد شد`);
    if (data.groupId === currentGroup) {
        updateMembersList(data.members);
    }
});

socket.on('user-left', data => {
    showToast(`${data.username} از گروه خارج شد`);
    if (data.groupId === currentGroup) {
        updateMembersList(data.members);
    }
});

socket.on('group-updated', data => {
    if (data.id === currentGroup) {
        updateMembersList(data.members);
    }
});

socket.on('user-disconnected', data => {
    showToast(`${data.username} خارج شد`);
});

// Helper functions
function getFileIcon(mimetype) {
    if (mimetype.includes('pdf')) return 'fa-file-pdf';
    if (mimetype.includes('word')) return 'fa-file-word';
    if (mimetype.includes('excel')) return 'fa-file-excel';
    return 'fa-file';
}

function displayMessage(message, isMyMessage = false) {
    const messageElement = createMessageElement(message, isMyMessage);
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function createMessageElement(message, isMyMessage = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;
    messageElement.dataset.id = message.id;

    // Message actions menu
    const actionsHTML = isMyMessage ? `
        <div class="message-actions">
            <button class="action-btn edit-btn" onclick="handleEditClick('${message.id}')">
                <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete-btn" onclick="handleDeleteClick('${message.id}')">
                <i class="fas fa-trash"></i>
            </button>
            <button class="action-btn reply-btn" onclick="handleReplyClick('${message.id}')">
                <i class="fas fa-reply"></i>
            </button>
            <button class="action-btn pin-btn" onclick="handlePinClick('${message.id}')">
                <i class="fas fa-thumbtack"></i>
            </button>
        </div>
    ` : `
        <div class="message-actions">
            <button class="action-btn reply-btn" onclick="handleReplyClick('${message.id}')">
                <i class="fas fa-reply"></i>
            </button>
            <button class="action-btn pin-btn" onclick="handlePinClick('${message.id}')">
                <i class="fas fa-thumbtack"></i>
            </button>
        </div>
    `;

    // Reply info if this is a reply
    const replyHTML = message.metadata?.replyTo ? `
        <div class="reply-info">
            <i class="fas fa-reply"></i>
            <span class="reply-to">${message.metadata.replyTo.username}:</span>
            <span class="reply-text">${message.metadata.replyTo.message}</span>
        </div>
    ` : '';

    // Pinned indicator
    const pinnedHTML = message.metadata?.pinned ? `
        <div class="pinned-indicator">
            <i class="fas fa-thumbtack"></i>
            <span>پین شده توسط ${message.metadata.pinnedBy}</span>
        </div>
    ` : '';

    // Edited indicator
    const editedHTML = message.metadata?.edited ? `
        <span class="edited-indicator">(ویرایش شده)</span>
    ` : '';

    // Handle attachments with lazy loading
    let attachmentsHTML = '';
    if (message.attachments?.length > 0) {
        attachmentsHTML = message.attachments.map(att => {
            if (att.type.startsWith('image/')) {
                const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E`;
                return `
                    <div class="attachment image">
                        <img src="${placeholder}" data-src="${att.url}" alt="تصویر" 
                             loading="lazy" class="lazy-media">
                    </div>`;
            } else if (att.type.startsWith('video/')) {
                return `
                    <div class="attachment video">
                        <video controls preload="none" data-src="${att.url}" 
                               poster="/images/video-placeholder.png" class="lazy-media">
                            <source type="${att.type}" data-src="${att.url}">
                        </video>
                    </div>`;
            }
            return `
                <div class="attachment file">
                    <a href="${att.url}" target="_blank" download>
                        <i class="fas ${getFileIcon(att.type)}"></i>
                        <span>${att.originalName}</span>
                    </a>
                </div>`;
        }).join('');
    }

    messageElement.innerHTML = `
        ${pinnedHTML}
        ${replyHTML}
        <div class="message-header">
            <strong>${message.username || 'ناشناس'}</strong>
            ${actionsHTML}
        </div>
        ${attachmentsHTML}
        ${message.text ? `<div class="message-text">${message.text}</div>` : ''}
        ${message.sticker ? `<div class="sticker-message"><img src="${message.sticker.url}" alt="استیکر"></div>` : ''}
        ${reactionsHTML || ''}
        <div class="message-footer">
            <small>${new Date(message.timestamp).toLocaleTimeString('fa-IR')}</small>
            ${editedHTML}
        </div>
    `;

    // Observe lazy-loaded media
    messageElement.querySelectorAll('.lazy-media').forEach(media => {
        mediaObserver.observe(media);
    });

    return messageElement;
}

// Message editing handlers
function handleEditClick(messageId) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    const textEl = messageEl.querySelector('.message-text');
    if (!textEl) return;

    const originalText = textEl.textContent;
    textEl.innerHTML = `
        <div class="edit-container">
            <textarea class="edit-input">${originalText}</textarea>
            <div class="edit-actions">
                <button onclick="saveEdit('${messageId}')">
                    <i class="fas fa-check"></i>
                </button>
                <button onclick="cancelEdit('${messageId}', '${originalText}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
}

function saveEdit(messageId) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    const editInput = messageEl.querySelector('.edit-input');
    if (!editInput) return;

    const newText = editInput.value.trim();
    if (!newText) return;

    socket.emit('edit-message', {
        messageId,
        newText,
        groupId: currentGroup
    }, response => {
        if (!response.success) {
            showToast(response.error || 'خطا در ویرایش پیام', 'error');
        }
    });
}

function cancelEdit(messageId, originalText) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    const textEl = messageEl.querySelector('.message-text');
    textEl.innerHTML = originalText;
}

// Message delete handler
function handleDeleteClick(messageId) {
    if (confirm('آیا از حذف این پیام مطمئن هستید؟')) {
        socket.emit('delete-message', {
            messageId,
            groupId: currentGroup
        }, response => {
            if (!response.success) {
                showToast(response.error || 'خطا در حذف پیام', 'error');
            }
        });
    }
}

// Message reply handler
function handleReplyClick(messageId) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    const messageText = messageEl.querySelector('.message-text')?.textContent || '';
    const username = messageEl.querySelector('strong').textContent;

    elements.messageInput.dataset.replyTo = messageId;
    showReplyPreview(username, messageText);
}

function showReplyPreview(username, text) {
    const preview = document.createElement('div');
    preview.className = 'reply-preview';
    preview.innerHTML = `
        <div class="reply-content">
            <i class="fas fa-reply"></i>
            <span class="reply-to">${username}:</span>
            <span class="reply-text">${text.substring(0, 50)}${text.length > 50 ? '...' : ''}</span>
        </div>
        <button onclick="cancelReply()">
            <i class="fas fa-times"></i>
        </button>
    `;

    const inputArea = elements.messageInput.parentElement;
    inputArea.insertBefore(preview, elements.messageInput);
}

function cancelReply() {
    delete elements.messageInput.dataset.replyTo;
    document.querySelector('.reply-preview')?.remove();
}

// Message pin handler
function handlePinClick(messageId) {
    socket.emit('pin-message', {
        messageId,
        groupId: currentGroup
    }, response => {
        if (!response.success) {
            showToast(response.error || 'خطا در پین کردن پیام', 'error');
        }
    });
}

// Add socket listeners for new message events
socket.on('message-edited', data => {
    const messageEl = document.querySelector(`.message[data-id="${data.messageId}"]`);
    if (messageEl) {
        const textEl = messageEl.querySelector('.message-text');
        if (textEl) {
            textEl.innerHTML = data.newText;
            messageEl.querySelector('.message-footer').innerHTML += `
                <span class="edited-indicator">(ویرایش شده)</span>
            `;
        }
    }
});

socket.on('message-deleted', data => {
    const messageEl = document.querySelector(`.message[data-id="${data.messageId}"]`);
    if (messageEl) {
        messageEl.remove();
    }
});

socket.on('message-pinned', data => {
    const messageEl = document.querySelector(`.message[data-id="${data.messageId}"]`);
    if (messageEl) {
        const pinnedIndicator = document.createElement('div');
        pinnedIndicator.className = 'pinned-indicator';
        pinnedIndicator.innerHTML = `
            <i class="fas fa-thumbtack"></i>
            <span>پین شده توسط ${data.pinnedBy}</span>
        `;
        messageEl.insertBefore(pinnedIndicator, messageEl.firstChild);
    }
});

function loadGroupMessages(messages) {
    elements.chatMessages.innerHTML = '';
    messages.forEach(msg => {
        displayMessage(msg, msg.sender === socket.id);
    });
}

// Initialize
if (currentUsername) {
    elements.usernameInput.value = currentUsername;
}

// URL params handling
const urlParams = new URLSearchParams(window.location.search);
const joinCode = urlParams.get('join');
if (joinCode) {
    const [groupId, inviteCode] = joinCode.split(':');
    if (groupId && inviteCode) {
        socket.emit('join-group', { groupId, inviteCode });
    }
}

function updateMembersList(members) {
    // Create members list if it doesn't exist
    if (!elements.membersList) {
        elements.membersList = document.createElement('div');
        elements.membersList.className = 'members-list';
        elements.groupInfo.appendChild(elements.membersList);
    }

    elements.membersList.innerHTML = `
        <h4>اعضای گروه (${members.length})</h4>
        ${members.map(username => `
            <div class="member">
                <i class="fas fa-user"></i>
                ${username}
            </div>
        `).join('')}
    `;
}

function toggleStickerPanel() {
    const isVisible = elements.stickerPanel.style.display === 'flex';
    elements.stickerPanel.style.display = isVisible ? 'none' : 'flex';
    
    if (!isVisible && !elements.stickerPanel.dataset.initialized) {
        initializeStickerPanel();
    }
}

function initializeStickerPanel() {
    // Create tabs
    elements.stickerTabs.innerHTML = STICKER_PACKS.map(pack => `
        <div class="sticker-tab" data-pack="${pack.id}">
            ${pack.icon}
        </div>
    `).join('');

    // Add tab click handlers
    elements.stickerTabs.querySelectorAll('.sticker-tab').forEach(tab => {
        tab.addEventListener('click', () => showStickerPack(tab.dataset.pack));
    });

    // Show first pack
    showStickerPack(STICKER_PACKS[0].id);
    elements.stickerPanel.dataset.initialized = 'true';
}

function showStickerPack(packId) {
    const pack = STICKER_PACKS.find(p => p.id === packId);
    if (!pack) return;

    elements.stickerContent.innerHTML = pack.stickers.map(sticker => `
        <div class="sticker-item" data-pack="${pack.id}" data-sticker="${sticker.id}">
            <img src="${sticker.url}" alt="${sticker.emoji}">
        </div>
    `).join('');

    elements.stickerContent.querySelectorAll('.sticker-item').forEach(item => {
        item.addEventListener('click', () => sendSticker(item.dataset.pack, item.dataset.sticker));
    });
}

function sendSticker(packId, stickerId) {
    if (!currentGroup) {
        showToast('لطفا ابتدا وارد یک گروه شوید', 'error');
        return;
    }

    socket.emit('send-sticker', {
        packId,
        stickerId,
        groupId: currentGroup
    }, response => {
        if (!response.success) {
            showToast(response.error || 'خطا در ارسال استیکر', 'error');
        }
    });

    toggleStickerPanel();
}

function addReaction(messageId, emoji) {
    socket.emit('add-reaction', {
        messageId,
        emoji,
        groupId: currentGroup
    }, response => {
        if (!response.success) {
            showToast(response.error || 'خطا در افزودن واکنش', 'error');
        }
    });
}

function handleTyping() {
    if (!currentGroup) return;

    socket.emit('typing', {
        groupId: currentGroup,
        isTyping: true
    });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', {
            groupId: currentGroup,
            isTyping: false
        });
    }, 1000);
}

// Add socket event listeners
socket.on('message-reacted', data => {
    const messageEl = document.querySelector(`.message[data-id="${data.messageId}"]`);
    if (messageEl) {
        const reactionsEl = messageEl.querySelector('.message-reactions');
        if (data.reactions.length > 0) {
            reactionsEl.innerHTML = data.reactions.map(reaction => `
                <button class="reaction-btn" onclick="addReaction('${data.messageId}', '${reaction.emoji}')">
                    ${reaction.emoji} ${reaction.users.length}
                </button>
            `).join('');
        }
    }
});

socket.on('user-typing', data => {
    const typingEl = document.querySelector('.typing-indicator') || 
                    document.createElement('div');
    typingEl.className = 'typing-indicator';
    
    if (data.isTyping) {
        typingEl.textContent = `${data.username} در حال نوشتن...`;
        elements.chatMessages.appendChild(typingEl);
    } else {
        typingEl.remove();
    }
});

async function loadMoreMessages() {
    if (!currentGroup || isLoadingMore || !hasMoreMessages) return;
    
    isLoadingMore = true;
    showLoadingIndicator();

    socket.emit('load-more-messages', {
        groupId: currentGroup,
        before: lastMessageTimestamp
    }, handleLoadMoreResponse);
}

function handleLoadMoreResponse(response) {
    isLoadingMore = false;
    hideLoadingIndicator();

    if (response.success) {
        if (response.messages.length === 0) {
            hasMoreMessages = false;
            return;
        }

        // Insert messages at the top
        const fragment = document.createDocumentFragment();
        response.messages.forEach(msg => {
            const messageEl = createMessageElement(msg, msg.sender === socket.id);
            fragment.appendChild(messageEl);
        });

        // Update last message timestamp for pagination
        const oldestMessage = response.messages[response.messages.length - 1];
        lastMessageTimestamp = oldestMessage.timestamp;

        // Preserve scroll position when adding messages
        const firstMsg = elements.chatMessages.firstElementChild;
        const oldHeight = elements.chatMessages.scrollHeight;
        
        elements.chatMessages.insertBefore(fragment, firstMsg);
        
        const newHeight = elements.chatMessages.scrollHeight;
        elements.chatMessages.scrollTop = newHeight - oldHeight;
    }
}

// Offline support
window.addEventListener('online', handleOnlineStatus);
window.addEventListener('offline', handleOnlineStatus);

function handleOnlineStatus(event) {
    isOnline = event.type === 'online';
    showOnlineStatus();

    if (isOnline) {
        socket.connect();
        processOfflineQueue();
    }
}

function showOnlineStatus() {
    const status = document.createElement('div');
    status.className = `connection-status ${isOnline ? 'online' : 'offline'}`;
    status.textContent = isOnline ? 'اتصال برقرار شد' : 'اتصال قطع است';
    document.body.appendChild(status);

    setTimeout(() => status.remove(), 3000);
}

function processOfflineQueue() {
    while (offlineQueue.length > 0) {
        const message = offlineQueue.shift();
        sendMessage(message);
    }
}

// Helper functions
function showLoadingIndicator() {
    const loader = document.createElement('div');
    loader.className = 'loading-indicator';
    loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال بارگذاری...';
    elements.chatMessages.insertBefore(loader, elements.chatMessages.firstChild);
}

function hideLoadingIndicator() {
    const loader = document.querySelector('.loading-indicator');
    if (loader) loader.remove();
}
