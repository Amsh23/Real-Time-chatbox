const socket = io();

function sendMessage() {
    let message = document.getElementById("messageInput").value;
    socket.emit("message", message);
}

socket.on("message", (msg) => {
    let chat = document.getElementById("chat");
    let p = document.createElement("p");
    p.innerText = msg;
    chat.appendChild(p);
});
