const socket = io();
const chat = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const onlineCount = document.getElementById('onlineCount');

// تنظیم نام کاربری
let username = localStorage.getItem('username') || prompt('لطفاً نام کاربری خود را وارد کنید:') || 'کاربر';
localStorage.setItem('username', username);
socket.emit('set-username', username);

// ارسال پیام
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('send-message', { text: message });
        messageInput.value = '';
    }
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// دریافت پیام جدید
socket.on('new-message', (data) => {
    const isMe = data.username === username;
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isMe ? 'my-message' : 'other-message'}`;
    messageElement.id = `msg-${data.id}`;
    
    messageElement.innerHTML = `
        ${isMe ? '<button class="delete-btn" onclick="deleteMessage(\'' + data.id + '\')">×</button>' : ''}
        <strong>${data.username}</strong>
        <div>${data.text}</div>
        <small>${new Date(data.timestamp).toLocaleTimeString('fa-IR')}</small>
    `;
    
    chat.appendChild(messageElement);
    chat.scrollTop = chat.scrollHeight;
});

// حذف پیام
window.deleteMessage = function(messageId) {
    socket.emit('delete-message', messageId);
    document.getElementById(`msg-${messageId}`)?.remove();
};

socket.on('message-deleted', (messageId) => {
    document.getElementById(`msg-${messageId}`)?.remove();
});

// به‌روزرسانی تعداد کاربران آنلاین
socket.on('online-count', (count) => {
    onlineCount.textContent = count;
});

// مدیریت اتصال مجدد
socket.on('connect', () => {
    console.log('به سرور متصل شدید');
    socket.emit('set-username', username);
});
