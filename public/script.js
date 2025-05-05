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
    toggleThemeBtn: document.getElementById('toggle-theme')
};

// State management
let currentUsername = localStorage.getItem('username') || '';
let currentGroup = null;
let attachments = [];
let isLightMode = localStorage.getItem('theme') === 'light';

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

// Message handling functions
function handleSendMessage() {
    const text = elements.messageInput.value.trim();
    if (text === '' && attachments.length === 0) {
        showToast('لطفاً پیام یا فایل وارد کنید', 'error');
        return;
    }

    socket.emit('send-message', {
        text,
        groupId: currentGroup,
        attachments: attachments
    }, handleMessageResponse);

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
    const groupName = prompt('لطفاً نام گروه را وارد کنید:');
    if (!groupName?.trim()) return;

    socket.emit('create-group', groupName.trim(), (response) => {
        if (response.success) {
            currentGroup = response.group.id;
            updateGroupInfo(response.group);
            showToast('گروه با موفقیت ایجاد شد');
        } else {
            showToast(response.error || 'خطا در ایجاد گروه', 'error');
        }
    });
}

function handleJoinGroup() {
    const inviteLink = prompt('لطفاً کد دعوت گروه را وارد کنید:');
    if (!inviteLink?.trim()) return;

    const [groupId, inviteCode] = inviteLink.split(':');
    socket.emit('join-group', { groupId, inviteCode }, handleJoinGroupResponse);
}

function handleJoinGroupResponse(response) {
    if (response.success) {
        currentGroup = response.group.id;
        updateGroupInfo(response.group);
        showToast(`به گروه ${response.group.name} پیوستید`);
        loadGroupMessages(response.messages);
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
    elements.inviteCode.textContent = group.inviteCode;
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
    navigator.clipboard.writeText(inviteText)
        .then(() => showToast('کد دعوت کپی شد'))
        .catch(() => showToast('خطا در کپی کد دعوت', 'error'));
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
});

socket.on('user-left', data => {
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
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;
    messageElement.dataset.id = message.id;

    let attachmentsHTML = '';
    if (message.attachments?.length > 0) {
        attachmentsHTML = message.attachments.map(att => {
            if (att.type === 'image') {
                return `<div class="attachment image"><img src="${att.url}" alt="تصویر"></div>`;
            }
            return `<div class="attachment file">
                <a href="${att.url}" target="_blank" download>
                    <i class="fas ${getFileIcon(att.type)}"></i>
                    <span>${att.originalName}</span>
                </a>
            </div>`;
        }).join('');
    }

    messageElement.innerHTML = `
        <strong>${message.username || 'ناشناس'}</strong>
        ${attachmentsHTML}
        ${message.text ? `<div class="message-text">${message.text}</div>` : ''}
        <small>${new Date(message.timestamp).toLocaleTimeString('fa-IR')}</small>
    `;

    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Initialize
if (currentUsername) {
    elements.usernameInput.value = currentUsername;
}

// URL params handling
const urlParams = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get('join');
if (joinGroupId) {
    const inviteCode = urlParams.get('code');
    if (inviteCode) {
        socket.emit('join-group', { groupId: joinGroupId, inviteCode });
    }
}
