"use strict";

// 1. Build the connection
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

const userInput = document.getElementById("userInput");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messages = document.getElementById("messages");

// 2. Handle incoming messages
connection.on("ReceiveMessage", (user, message) => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(message)}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight; // auto-scroll to newest
});

// Prevent HTML injection since messages are user-supplied
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// 3. Send a message
async function sendMessage() {
    const user = userInput.value.trim() || "Anonymous";
    const message = messageInput.value.trim();
    if (!message) return;

    try {
        await connection.invoke("SendMessage", user, message);
        messageInput.value = "";
        messageInput.focus();
    } catch (err) {
        console.error("Send failed:", err);
    }
}

sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});

// 4. Start the connection
connection.start()
    .then(() => console.log("Connected to /chatHub"))
    .catch((err) => {
        console.error("Connection failed:", err);
        messages.innerHTML = "<em class='text-danger'>Could not connect to chat.</em>";
    });