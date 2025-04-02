const socket = io();
const messageInput = document.getElementById("messageInput");
const chat = document.getElementById("chat");

// ارسال پیام با Enter یا کلیک
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message === "") return;
    
    // نمایش پیام خود کاربر بلافاصله
    displayMessage({
        text: `شما: ${message}`,
        time: new Date().toLocaleTimeString("fa-IR"),
        isMe: true
    });
    
    socket.emit("message", message);
    messageInput.value = "";
    messageInput.focus();
}

// نمایش پیشرفته پیام‌ها
function displayMessage(data) {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${data.isMe ? "my-message" : data.isSystem ? "system-message" : "other-message"}`;
    
    messageElement.innerHTML = `
        <div class="message-content">${data.text}</div>
        <div class="message-time" style="text-align: ${data.isMe ? "left" : "right"}">
            ${data.time || new Date().toLocaleTimeString("fa-IR")}
        </div>
    `;
    
    chat.appendChild(messageElement);
    chat.scrollTop = chat.scrollHeight;
}

// مدیریت رویدادهای سرور
socket.on("connect", () => {
    displayMessage({
        text: "به چت آنلاین متصل شدید",
        isSystem: true
    });
});

socket.on("disconnect", () => {
    displayMessage({
        text: "اتصال قطع شد. در حال تلاش برای اتصال مجدد...",
        isSystem: true
    });
});

socket.on("user connected", (msg) => {
    displayMessage({
        text: msg,
        isSystem: true
    });
});

socket.on("user disconnected", (msg) => {
    displayMessage({
        text: msg,
        isSystem: true
    });
});

socket.on("message", (data) => {
    displayMessage({
        text: data.sender === socket.id ? `شما: ${data.text}` : data.text,
        time: data.time,
        isMe: data.sender === socket.id
    });
});

// اتوماتیک فوکوس روی اینپوت هنگام لود صفحه
window.addEventListener("load", () => {
    messageInput.focus();
});
