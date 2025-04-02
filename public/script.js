const socket = io();
const chat = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const onlineCount = document.getElementById('onlineCount');
const usernameInput = document.getElementById('usernameInput');
const topicSelect = document.getElementById('topicSelect');
let currentUsername = localStorage.getItem('username') || '';

// 2. مدیریت پروفایل کاربری
document.getElementById('saveUsername').addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        localStorage.setItem('username', username);
        socket.emit('set-username', username);
        alert('پروفایل با موفقیت به‌روز شد!');
    }
});

// 1. ارسال پیام با پاک شدن خودکار
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        const topic = topicSelect.value;
        socket.emit('send-message', {
            text: message,
            topic
        });
        messageInput.value = ''; // پاک کردن خودکار
    }
}

// 4. تایمر ضد اسپم
let lastMessageTime = 0;
document.getElementById('sendBtn').addEventListener('click', () => {
    const now = Date.now();
    if (now - lastMessageTime < 3000) {
        alert('لطفاً 3 ثانیه بین ارسال پیام‌ها فاصله بگذارید!');
        return;
    }
    lastMessageTime = now;
    sendMessage();
});

// 5. نمایش تعداد آنلاین‌ها
socket.on('online-count', (count) => {
    onlineCount.textContent = count;
});

// 6. حذف پیام
function deleteMessage(messageId) {
    socket.emit('delete-message', messageId);
}

socket.on('message-deleted', (messageId) => {
    const messageElement = document.getElementById(`msg-${messageId}`);
    if (messageElement) messageElement.remove();
});

// 3. مدیریت گروه‌ها
document.getElementById('createGroupBtn').addEventListener('click', () => {
    const members = prompt('آی‌دی کاربران را وارد کنید (با کاما جدا کنید):');
    if (members) {
        socket.emit('create-group', {
            name: `گروه ${currentUsername}`,
            members: members.split(',').map(m => m.trim())
        });
    }
});

socket.on('group-created', (groupId) => {
    alert(`گروه با موفقیت ایجاد شد! (کد گروه: ${groupId})`);
});

// 7. تغییر تاپیک
topicSelect.addEventListener('change', () => {
    document.getElementById('currentTopic').textContent = topicSelect.value;
});

// 8. مینی گیم
document.getElementById('gameBtn').addEventListener('click', () => {
    const gamePanel = document.getElementById('gamePanel');
    gamePanel.style.display = gamePanel.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('.game-choice').forEach(btn => {
    btn.addEventListener('click', () => {
        socket.emit('game-choice', btn.dataset.choice);
    });
});

socket.on('game-result', (result) => {
    alert(`
        شما: ${result.user}
        ربات: ${result.bot}
        نتیجه: ${result.result}
    `);
});

// 10. استیکرها
document.getElementById('stickerBtn').addEventListener('click', () => {
    const stickerPanel = document.getElementById('stickerPanel');
    stickerPanel.style.display = stickerPanel.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('.sticker').forEach(sticker => {
    sticker.addEventListener('click', () => {
        socket.emit('send-sticker', sticker.dataset.id);
    });
});

socket.on('new-sticker', (stickerData) => {
    const stickerElement = document.createElement('img');
    stickerElement.className = 'sticker-message';
    stickerElement.src = `/stickers/sticker${stickerData.stickerId}.png`;
    stickerElement.dataset.id = stickerData.id;
    
    const container = document.createElement('div');
    container.className = 'message';
    container.id = `msg-${stickerData.id}`;
    container.innerHTML = `
        <strong>${stickerData.username}</strong>
        <div class="message-time">
            ${new Date(stickerData.timestamp).toLocaleTimeString('fa-IR')}
        </div>
    `;
    container.appendChild(stickerElement);
    
    chat.appendChild(container);
    chat.scrollTop = chat.scrollHeight;
});

// دریافت پیام‌های معمولی
socket.on('new-message', (message) => {
    const isMe = message.username === currentUsername;
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isMe ? 'my-message' : 'other-message'}`;
    messageElement.id = `msg-${message.id}`;
    
    messageElement.innerHTML = `
        ${isMe ? `<button class="delete-btn" onclick="deleteMessage('${message.id}')">×</button>` : ''}
        <strong>${message.username}</strong>
        <div>${message.text}</div>
        <div class="message-time">
            ${new Date(message.timestamp).toLocaleTimeString('fa-IR')} | 
            ${message.topic}
        </div>
    `;
    
    chat.appendChild(messageElement);
    chat.scrollTop = chat.scrollHeight;
});

// راه‌اندازی اولیه
window.addEventListener('load', () => {
    if (currentUsername) {
        usernameInput.value = currentUsername;
        socket.emit('set-username', currentUsername);
    }
    messageInput.focus();
});
