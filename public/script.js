const socket = io();
let currentUsername = '';
let currentGroup = null;
let attachments = [];

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
    clearPreview: document.getElementById('clear-preview')
};

// نصب openpgp.js در پروژه
// npm install openpgp

import * as openpgp from 'openpgp';

// کلید عمومی و خصوصی برای رمزنگاری
let publicKey = ''; // کلید عمومی ادمین یا گیرنده
let privateKey = ''; // کلید خصوصی کاربر
let passphrase = ''; // رمز عبور کلید خصوصی

function isValidPrivateKey(key) {
    try {
        return openpgp.readPrivateKey({ armoredKey: key }) !== null;
    } catch {
        return false;
    }
}

async function validateAndReadKey(key) {
    try {
        return await openpgp.readKey({ armoredKey: key });
    } catch (error) {
        throw new Error('Invalid public key format');
    }
}

async function encryptMessage(message) {
    if (!message || message.trim() === '') {
        return ''; // Skip encryption for empty messages
    }
    const encrypted = await openpgp.encrypt({
        privateKey: privateKey && isValidPrivateKey(privateKey) ? await openpgp.readPrivateKey({ armoredKey: privateKey }) : (() => { throw new Error('Private key is not set or invalid'); })(),
        encryptionKeys: publicKey ? await validateAndReadKey(publicKey) : (() => { throw new Error('Public key is not set'); })()
    });
    return encrypted;
}

async function decryptMessage(encryptedMessage) {
    const privateKeyObj = await openpgp.decryptKey({
        privateKey: privateKey ? await openpgp.readPrivateKey({ armoredKey: privateKey }) : (() => { throw new Error('Private key is not set'); })(),
        passphrase
    });

    const decrypted = await openpgp.decrypt({
        message: await openpgp.readMessage({ armoredMessage: encryptedMessage }),
        decryptionKeys: privateKeyObj
    });

    return decrypted.data;
}

// مدیریت کاربران
elements.saveUsernameBtn.addEventListener('click', () => {
    const username = elements.usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        localStorage.setItem('username', username);
        socket.emit('set-username', username);
        showToast('نام کاربری با موفقیت ذخیره شد');
    } else {
        showToast('لطفاً نام کاربری معتبر وارد کنید', 'error');
    }
});

// مدیریت گروه‌ها
elements.createGroupBtn.addEventListener('click', () => {
    const groupName = prompt('لطفاً نام گروه را وارد کنید:');
    if (groupName && groupName.trim()) {
        socket.emit('create-group', groupName.trim());
    } else if (groupName !== null) {
        showToast('نام گروه نمی‌تواند خالی باشد', 'error');
    }
});

elements.joinGroupBtn.addEventListener('click', () => {
    const inviteLink = prompt('لطفاً کد دعوت گروه را وارد کنید:');
    if (inviteLink && inviteLink.trim()) {
        const [groupId, inviteCode] = inviteLink.split(':');
        socket.emit('join-group', { 
            groupId: groupId.trim(), 
            inviteCode: (inviteCode || '').trim() 
        });
    } else if (inviteLink !== null) {
        showToast('کد دعوت نمی‌تواند خالی باشد', 'error');
    }
});

elements.copyInviteBtn.addEventListener('click', () => {
    const inviteLink = `${window.location.origin}?join=${currentGroup}`;
    navigator.clipboard.writeText(inviteLink)
        .then(() => showToast('لینک دعوت با موفقیت کپی شد'))
        .catch(() => showToast('خطا در کپی لینک', 'error'));
});

// مدیریت فایل‌ها
elements.attachBtn.addEventListener('click', () => elements.fileInput.click());

// Removed the incomplete duplicate definition of handleFileSelect

elements.fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach((file) => {
        if (file.size > 10 * 1024 * 1024) {
            showToast(`فایل ${file.name} بزرگتر از حد مجاز است و ارسال نمی‌شود`, 'error');
            return; // Skip this file and continue with the next one
        }

        const preview = createFilePreview(file);
        elements.filePreviews.appendChild(preview);
        attachments.push(file);
    });
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
                <button class="remove-file" data-index="${attachments.indexOf(file)}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    } else if (fileType === 'video') {
        preview.innerHTML = `
            <video controls>
                <source src="${URL.createObjectURL(file)}" type="${file.type}">
            </video>
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
                <i class="fas ${getFileIcon(file)}"></i>
            </div>
            <div class="file-info">
                <span>${file.name}</span>
                <button class="remove-file" data-index="${attachments.length}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }
    
    return preview;
}

function getFileIcon(file) {
    if (file.type.includes('pdf')) return 'fa-file-pdf';
    return 'fa-file';
}

function updatePreviews() {
    elements.filePreviews.innerHTML = '';
    
    if (attachments.length === 0) {
        elements.previewArea.style.display = 'none';
        elements.fileInput.value = '';
        return;
    }
    
    attachments.forEach((file, index) => {
        const preview = createFilePreview(file);
        const removeButton = preview.querySelector('.remove-file');
        removeButton.dataset.index = index;
        const handleRemove = () => {
            attachments.splice(index, 1);
            updatePreviews();
        };

        removeButton.removeEventListener('click', handleRemove); // Remove old listener
        removeButton.addEventListener('click', handleRemove); // Add new listener
        elements.filePreviews.appendChild(preview);
    });
}

elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (text === '' && attachments.length === 0) {
        showToast('لطفاً پیام یا فایل وارد کنید', 'error');
        return;
    }

    const tempMessageId = `temp-${Date.now()}`;
    displayMessage({ id: tempMessageId, text, username: currentUsername, timestamp: Date.now() }, true);

    const messageData = {
        text,
        groupId: currentGroup || null,
        attachments: []
    };

    socket.emit('send-message', messageData, (response) => {
        if (response.success) {
            document.querySelector(`.message[data-id="${tempMessageId}"]`).remove();
            displayMessage(response.message, true);
        } else {
            showToast('خطا در ارسال پیام', 'error');
        }
    });

    elements.messageInput.value = '';
    clearAttachments();
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        return await response.json();
    } catch (error) {
        console.error('Upload error:', error);
        showToast('خطا در آپلود فایل', 'error');
        return null;
    }
}
function displayMessage(message, isMyMessage = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isMyMessage ? 'my-message' : 'other-message'} ${message.groupId ? 'group-message' : ''}`;
    
    let attachmentsHTML = '';
    message.attachments?.forEach((attachment) => {
        const attachmentType = (attachment && attachment.type) ? attachment.type : 'unknown';
        if (attachmentType === 'image') {
            attachmentsHTML += `
                <div class="attachment image">
                    <img src="${attachment.url}" alt="تصویر">
                </div>
            `;
        } else if (attachmentType === 'video') {
            attachmentsHTML += `
                <div class="attachment video">
                    <video controls>
                        <source src="${attachment.url}" type="video/mp4">
                        مرورگر شما از ویدئو پشتیبانی نمی‌کند.
                    </video>
                </div>
            `;
        } else {
            attachmentsHTML += `
                <div class="attachment file">
                    <a href="${attachment.url}" target="_blank" download="${attachment.originalName}">
                        <i class="fas ${getFileIcon(attachment)}"></i>
                        <span>${attachment.originalName}</span>
                    </a>
                </div>
            `;
        }
    });
    
    messageElement.innerHTML = `
        <strong>${message.username || 'ناشناس'}</strong>
        ${attachmentsHTML}
        ${message.text ? `<div class="message-text">${message.text}</div>` : ''}
        <small>${formatTime(message.timestamp)}</small>
    `;
    
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// نمایش نوتیفیکیشن
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// رویدادهای سوکت
socket.on('online-count', (count) => {
    elements.onlineCount.textContent = count;
});

socket.on('group-created', ({ groupId, inviteLink }) => {
    currentGroup = groupId;
    elements.groupInfo.style.display = 'block';
    elements.groupName.textContent = `گروه: ${groupId}`;
    elements.inviteCode.textContent = inviteLink;
    elements.chatTitle.textContent = `گروه: ${groupId}`;
    showToast('گروه با موفقیت ایجاد شد و شما به آن اضافه شدید');
});

socket.on('group-joined', (group) => {
    currentGroup = group.groupId;
    elements.groupInfo.style.display = 'block';
    elements.groupName.textContent = `گروه: ${group.name}`;
    elements.chatTitle.textContent = `گروه: ${group.name}`;
    
    group.messages.forEach(msg => {
        displayMessage(msg, msg.sender === socket.id);
    });
    
    showToast(`به گروه ${group.name} پیوستید`);
});

socket.on('new-message', (message) => {
    const isMyMessage = message.sender === socket.id;
    displayMessage(message, isMyMessage);
    
    if (!isMyMessage) {
        playNotificationSound();
    }
});

socket.on('group-error', (error) => {
    showToast(error, 'error');
});

socket.on('user-status', ({ userId, status }) => {
    const userElement = document.querySelector(`.user[data-id="${userId}"]`);
    if (userElement) {
        userElement.classList.toggle('online', status === 'online');
    }
});

// پخش صدای نوتیفیکیشن
function playNotificationSound() {
    const audio = new Audio('/sounds/notification.wav'); // Ensure the file exists in the specified path
    audio.volume = 0.2;
    audio.play().catch(e => {
        console.log('Cannot play sound:', e);
        showToast('خطا در پخش صدای نوتیفیکیشن', 'error');
    });
}

const savedUsername = localStorage.getItem('username');
if (savedUsername) {
    currentUsername = savedUsername;
    socket.emit('set-username', savedUsername);
}

const urlParams = new URLSearchParams(window.location.search);
const joinGroup = urlParams.get('join');
if (joinGroup) {
    const inviteCode = prompt('لطفاً کد دعوت گروه را وارد کنید:');
    if (inviteCode) {
        socket.emit('join-group', { 
            groupId: joinGroup.split(':')[0], 
            inviteCode: joinGroup.split(':')[1] || inviteCode 
        });
    }
}

const showGroupsBtn = document.createElement('button');
showGroupsBtn.textContent = 'نمایش گروه‌ها';
showGroupsBtn.addEventListener('click', async () => {
    const response = await fetch('/groups');
    const groups = await response.json();
    let groupList = 'لیست گروه‌ها:\n';
    groups.forEach(group => {
        groupList += `- ${group.name} (اعضا: ${group.members})\n`;
    });
    alert(groupList);
});
document.querySelector('.group-section').appendChild(showGroupsBtn);

const showUsersBtn = document.createElement('button');
showUsersBtn.textContent = 'نمایش کاربران آنلاین';
showUsersBtn.addEventListener('click', async () => {
    const response = await fetch('/users');
    const users = await response.json();
    let userList = 'لیست کاربران آنلاین:\n';
    users.forEach(user => {
        userList += `- ${user.username || 'ناشناس'}\n`;
    });
    alert(userList);
});
document.querySelector('.profile-section').appendChild(showUsersBtn);

// Supported roles and their implications:
// - 'admin': Has full control over the application, including managing users and groups.
// - 'moderator': Can moderate content and manage group activities but has limited administrative privileges.
// - Other roles or undefined: Default user with basic access to chat functionalities.

// Supported roles and their implications:
// - 'admin': Has full control over the application, including managing users and groups.
// - 'moderator': Can moderate content and manage group activities but has limited administrative privileges.
// - Other roles or undefined: Default user with basic access to chat functionalities.

socket.emit('get-role', (role) => {
    console.log(`نقش شما: ${role}`);
    if (role === 'admin') {
        // نمایش قابلیت‌های ادمین
    } else if (role === 'moderator') {
        // نمایش قابلیت‌های مدیر
    }
});

async function generateInvite(role) {
    const response = await fetch('/generate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
    });

    const data = await response.json();
    if (data.inviteLink) {
        navigator.clipboard.writeText(data.inviteLink);
        showToast('لینک دعوت کپی شد');
    } else {
        showToast('خطا در ایجاد لینک دعوت', 'error');
    }
}

// استفاده از لینک دعوت
const token = new URLSearchParams(window.location.search).get('token');
if (token) {
    fetch('/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`شما به‌عنوان ${data.role} وارد شدید`);
        } else {
            showToast('توکن نامعتبر است', 'error');
        }
    });
}

let isLightMode = localStorage.getItem('theme') === 'light';

function updateTheme() {
    if (isLightMode) {
        document.body.classList.add('light-mode');
        document.querySelector('#toggle-theme i').classList.add('fa-sun');
        document.querySelector('#toggle-theme i').classList.remove('fa-moon');
    } else {
        document.body.classList.remove('light-mode');
        document.querySelector('#toggle-theme i').classList.add('fa-moon');
        document.querySelector('#toggle-theme i').classList.remove('fa-sun');
    }
}

function toggleTheme() {
    isLightMode = !isLightMode;
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    updateTheme();
}

document.getElementById('toggle-theme').addEventListener('click', toggleTheme);
updateTheme(); // Initialize theme on page load
