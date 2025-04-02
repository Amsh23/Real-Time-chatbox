const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.static("public"));
app.use(express.json());

// مدیریت اتصالات Socket.io
io.on("connection", (socket) => {
    console.log(`کارگر جدید متصل شد (ID: ${socket.id})`);

    // ارسال پیام به همه کاربران
    socket.on("message", (msg) => {
        if (typeof msg !== "string" || msg.trim() === "") return;
        
        const timestamp = new Date().toLocaleTimeString("fa-IR");
        const messageData = {
            text: msg,
            sender: socket.id,
            time: timestamp
        };
        
        io.emit("message", messageData);
        console.log(`پیام جدید: ${msg}`);
    });

    // مدیریت قطع ارتباط
    socket.on("disconnect", () => {
        console.log(`کاربر قطع شد (ID: ${socket.id})`);
        io.emit("user disconnected", `${socket.id} از چت خارج شد`);
    });

    // اطلاع رسانی ورود کاربر جدید
    io.emit("user connected", `کاربر جدید به چت پیوست`);
});

// راه‌اندازی سرور
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`سرور در حال اجرا روی پورت ${PORT}...`);
    console.log(`آدرس دسترسی: http://localhost:${PORT}`);
});
