"use strict";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

const $ = (id) => document.getElementById(id);

const userInput = $("userInput");
const roomInput = $("roomInput");
const joinButton = $("joinButton");
const joinError = $("joinError");
const joinPanel = $("joinPanel");
const chatPanel = $("chatPanel");
const currentUserLabel = $("currentUserLabel");
const currentRoomLabel = $("currentRoomLabel");
const roomSwitchInput = $("roomSwitchInput");
const switchRoomButton = $("switchRoomButton");
const messageInput = $("messageInput");
const sendButton = $("sendButton");
const messages = $("messages");

let currentUser = null;
let currentRoom = null;

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

function clearMessages() { messages.innerHTML = ""; }

// --- Incoming ---

connection.on("ReceiveMessage", (user, message, room) => {
    const div = document.createElement("div");
    if (room === "announcements") {
        div.className = "p-1 mb-1 rounded bg-warning-subtle";
        div.innerHTML = `📢 <strong>${escapeHtml(user)}</strong> <span class="text-muted small">#announcements</span>: ${escapeHtml(message)}`;
    } else {
        div.innerHTML = `<strong>${escapeHtml(user)}</strong> <span class="text-muted small">#${escapeHtml(room)}</span>: ${escapeHtml(message)}`;
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
});

connection.on("UserJoined", (user, room) => addSystemMessage(`${user} joined #${room}`));
connection.on("UserLeft", (user, room) => addSystemMessage(`${user} left #${room}`));

connection.on("RoomChanged", (room) => {
    currentRoom = room;
    currentRoomLabel.textContent = `#${room}`;
    clearMessages();
    addSystemMessage(`You joined #${room}`);
    messageInput.focus();
});

// --- Join ---

async function join() {
    joinError.textContent = "";

    const name = userInput.value.trim();
    const room = roomInput.value;

    if (!name) { joinError.textContent = "Please enter a username."; return; }

    if (connection.state !== signalR.HubConnectionState.Connected) {
        joinError.textContent = "Not connected. Please wait for the reconnect.";
        return;
    }

    joinButton.disabled = true;
    try {
        await connection.invoke("RegisterUser", name, room);
        currentUser = name;
        currentRoom = room;
        currentUserLabel.textContent = name;
        currentRoomLabel.textContent = `#${room}`;
        joinPanel.classList.add("d-none");
        chatPanel.classList.remove("d-none");
        clearMessages();
        addSystemMessage(`You joined #${room}`);
        messageInput.focus();
    } catch (err) {
        joinError.textContent = err.message ?? "Could not join.";
        joinButton.disabled = false;
    }
}

// --- Switch room ---

async function switchRoom() {
    const room = roomSwitchInput.value;
    if (!room || room === currentRoom) return;

    if (connection.state !== signalR.HubConnectionState.Connected) {
        addSystemMessage("Not connected — waiting for reconnect…");
        return;
    }

    try {
        await connection.invoke("ChangeRoom", room);
        // UI update happens in the RoomChanged handler above.
    } catch (err) {
        addSystemMessage(`Could not switch: ${err.message}`);
    }
}

// --- Send ---

async function sendMessage() {
    if (!currentUser) return;
    const text = messageInput.value.trim();
    if (!text) return;

    if (connection.state !== signalR.HubConnectionState.Connected) {
        addSystemMessage("Not connected — waiting for reconnect…");
        return;
    }

    try {
        await connection.invoke("SendMessage", text);
        messageInput.value = "";
        messageInput.focus();
    } catch (err) {
        addSystemMessage(`Error: ${err.message}`);
    }
}

joinButton.addEventListener("click", join);
userInput.addEventListener("keydown", (e) => { if (e.key === "Enter") join(); });
switchRoomButton.addEventListener("click", switchRoom);
sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// --- Reconnect ---

connection.onreconnecting(() => addSystemMessage("Reconnecting…"));
connection.onreconnected(async () => {
    if (!currentUser) return;
    try {
        await connection.invoke("RegisterUser", currentUser, currentRoom);
        addSystemMessage("Reconnected");
    } catch (err) {
        addSystemMessage(`Could not re-register: ${err.message}`);
    }
});

connection.start()
    .then(() => console.log("Connected to /chatHub"))
    .catch((err) => {
        console.error("Connection failed:", err);
        joinError.textContent = "Could not connect to the chat server.";
    });