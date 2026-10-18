"use strict";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

const userInput = document.getElementById("userInput");
const joinButton = document.getElementById("joinButton");
const joinError = document.getElementById("joinError");
const joinPanel = document.getElementById("joinPanel");
const chatPanel = document.getElementById("chatPanel");
const currentUserLabel = document.getElementById("currentUserLabel");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messages = document.getElementById("messages");

let currentUser = null; // set only after RegisterUser succeeds

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function addSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "text-muted fst-italic small";
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

// --- Incoming handlers ---

connection.on("ReceiveMessage", (user, message) => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(message)}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
});

connection.on("UserJoined", (user) => addSystemMessage(`${user} joined the chat`));
connection.on("UserLeft",   (user) => addSystemMessage(`${user} left the chat`));

// --- Join flow ---

async function join() {
    joinError.textContent = "";

    const name = userInput.value.trim();
    if (!name) {
        joinError.textContent = "Please enter a username.";
        return;
    }

    joinButton.disabled = true;
    try {
        await connection.invoke("RegisterUser", name);
        currentUser = name;
        currentUserLabel.textContent = name;
        joinPanel.classList.add("d-none");
        chatPanel.classList.remove("d-none");
        addSystemMessage(`You joined as ${name}`);
        messageInput.focus();
    } catch (err) {
        joinError.textContent = err.message ?? "Could not join. Try a different username.";
        joinButton.disabled = false;
    }
}

// --- Sending ---

async function sendMessage() {
    if (!currentUser) return; // not registered → nothing to do

    const text = messageInput.value.trim();
    if (!text) return;

    try {
        await connection.invoke("SendMessage", text); // note: no name argument anymore
        messageInput.value = "";
        messageInput.focus();
    } catch (err) {
        addSystemMessage(`Error: ${err.message}`);
    }
}

joinButton.addEventListener("click", join);
userInput.addEventListener("keydown", (e) => { if (e.key === "Enter") join(); });
sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// --- Reconnect: must re-register (new ConnectionId) ---

connection.onreconnecting(() => addSystemMessage("Reconnecting…"));
connection.onreconnected(async () => {
    if (!currentUser) return; // never joined → nothing to re-register
    try {
        await connection.invoke("RegisterUser", currentUser);
        addSystemMessage("Reconnected");
    } catch (err) {
        addSystemMessage(`Could not re-register: ${err.message}`);
    }
});

// --- Start connection (does NOT register; registration is explicit) ---

connection.start()
    .then(() => console.log("Connected to /chatHub"))
    .catch((err) => {
        console.error("Connection failed:", err);
        joinError.textContent = "Could not connect to the chat server.";
    });
