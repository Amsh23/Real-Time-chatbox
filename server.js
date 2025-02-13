const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("یک کاربر جدید وصل شد!");

    socket.on("message", (msg) => {
        io.emit("message", msg);
    });

    socket.on("disconnect", () => {
        console.log("یک کاربر خارج شد!");
    });
});

server.listen(3000, () => {
    console.log("سرور در حال اجرا روی پورت 3000...");
});
