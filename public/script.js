const socket = io();
const messageInput = document.getElementById('messageInput');
const chat = document.getElementById('chat');
let lastMessageTime = 0;

// 1. پروفایل کاربری
document.getElementById('save-username').addEventListener('click', () => {
    const username = document.getElementById('username').value.trim();
    if(username) {
        localStorage.setItem('username', username);
        socket.emit('set-username', username);
    }
});

// 2. ارسال پیام با پاک شدن خودکار
function sendMessage() {
    const now = Date.now();
    if(now - lastMessageTime < 3000) {
        alert('⏳ لطفاً 3 ثانیه بین ارسال پیام‌ها فاصله بگذارید!');
        return;
    }
    
    const message = messageInput.value.trim();
    if(message) {
        const topic = document.getElementById('topic').value;
        const username = localStorage.getItem('username') || 'ناشناس';
        
        socket.emit('chat-message', {
            text: message,
            username,
            topic,
            timestamp: now
        });
        
        messageInput.value = '';
        lastMessageTime = now;
    }
}

// 3. سیستم گروه‌ها
document.getElementById('create-group').addEventListener('click', () => {
    const members = prompt('آی‌دی کاربران را وارد کنید (با کاما جدا کنید):');
    if(members) {
        socket.emit('create-group', {
            name: `گروه ${Date.now().toString(36)}`,
            members: members.split(',')
        });
    }
});

// 4. استیکرها
document.querySelectorAll('.sticker').forEach(sticker => {
    sticker.addEventListener('click', () => {
        socket.emit('sticker', {
            id: sticker.dataset.id,
            sender: localStorage.getItem('username')
        });
    });
});

// 5. مینی گیم (سنگ-کاغذ-قیچی)
document.getElementById('game-btn').addEventListener('click', () => {
    const choice = prompt('انتخاب کنید (✊, ✋, ✌️):');
    if(choice) socket.emit('game-choice', choice);
});

// 6. نمایش پیام‌ها
socket.on('chat-message', (data) => {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${data.isMe ? 'my-message' : 'other-message'}`;
    messageElement.innerHTML = `
        <strong>${data.username}</strong> (${data.topic}):
        ${data.text}
        <span class="message-time">${new Date(data.timestamp).toLocaleTimeString('fa-IR')}</span>
        ${data.isMe ? `<button class="delete-btn" data-id="${data.id}">🗑️</button>` : ''}
    `;
    chat.appendChild(messageElement);
    chat.scrollTop = chat.scrollHeight;
});

// 7. مدیریت سایر رویدادها
socket.on('online-count', (count) => {
    document.getElementById('online-count').textContent = count;
});

socket.on('sticker', (data) => {
    const stickerElement = document.createElement('img');
    stickerElement.className = 'sticker-message';
    stickerElement.src = `sticker${data.id}.png`;
    chat.appendChild(stickerElement);
});

socket.on('game-result', (result) => {
    alert(`🎮 نتیجه بازی: ${result}`);
});

// 8. حذف پیام
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('delete-btn')) {
        const messageId = e.target.dataset.id;
        socket.emit('delete-message', messageId);
        e.target.parentElement.remove();
    }
});

// راه‌اندازی اولیه
window.addEventListener('load', () => {
    messageInput.focus();
    if(localStorage.getItem('username')) {
        document.getElementById('username').value = localStorage.getItem('username');
    }
});
