const socket = io();
const messageInput = document.getElementById("messageInput");
const chat = document.getElementById("chat");

// ارسال پیام با قابلیت ارسال با Enter
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message === "") return;
    
    socket.emit("message", message);
    messageInput.value = "";
    messageInput.focus();
    
    // نمایش پیام خود کاربر بلافاصله
    displayMessage(`شما: ${message}`, "my-message");
}

// نمایش پیام‌ها با فرمت بهتر
function displayMessage(msg, className = "") {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${className}`;
    messageElement.innerHTML = `
        <div class="message-content">${msg}</div>
        <div class="message-time">${new Date().toLocaleTimeString("fa-IR")}</div>
    `;
    chat.appendChild(messageElement);
    chat.scrollTop = chat.scrollHeight; // اسکرول خودکار به پایین
}

// دریافت پیام از سرور
socket.on("message", (msg) => {
    displayMessage(msg, "other-message");
});

// اتصال/قطع ارتباط
socket.on("connect", () => {
    displayMessage("به چت آنلاین متصل شدید", "system-message");
});

socket.on("disconnect", () => {
    displayMessage("اتصال قطع شد. در حال تلاش برای اتصال مجدد...", "system-message");
});
