// Socket connection and state management
const socket = io();
const state = {
    currentUsername: localStorage.getItem('username') || '',
    currentGroup: null,
    isLightMode: localStorage.getItem('theme') === 'light',
    isOnline: true,
    pinnedMessages: [],
    fileUploads: []
};

// DOM Elements
const elements = {
    usernameInput: document.getElementById('username-input'),
    saveUsernameBtn: document.getElementById('save-username'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    chatMessages: document.getElementById('chat-messages'),
    onlineCount: document.getElementById('online-count'),
    chatTitle: document.getElementById('chat-title'),
    toggleThemeBtn: document.getElementById('toggle-theme'),
    fileInput: document.getElementById('file-input'),
    filePreviewContainer: document.getElementById('file-preview-container'),
    pinnedMessagesContainer: document.getElementById('pinned-messages'),
    searchInput: document.getElementById('search-input')
};

// Show connecting message
showToast('در حال اتصال...', 'info');

// Initialize UI state
function initializeUI() {
    if (elements.messageInput) {
        elements.messageInput.disabled = !state.currentUsername;
    }
    if (elements.sendButton) {
        elements.sendButton.disabled = !state.currentUsername;
    }
    if (state.isLightMode) {
        document.body.classList.add('light-mode');
    }
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.appendChild(toast);
    document.body.appendChild(container);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(container);
        }, 300);
    }, 3000);
}

// File upload handling
function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    state.fileUploads = files;
    
    elements.filePreviewContainer.innerHTML = '';
    files.forEach(file => {
        const preview = createFilePreview(file);
        elements.filePreviewContainer.appendChild(preview);
    });
}

function createFilePreview(file) {
    const preview = document.createElement('div');
    preview.className = 'file-preview';
    
    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        preview.appendChild(img);
    } else {
        preview.classList.add('document');
        const icon = document.createElement('i');
        icon.className = 'fas fa-file';
        const name = document.createElement('span');
        name.textContent = file.name;
        preview.appendChild(icon);
        preview.appendChild(name);
    }
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => {
        state.fileUploads = state.fileUploads.filter(f => f !== file);
        preview.remove();
    };
    
    preview.appendChild(removeBtn);
    return preview;
}

// Message handling
function sendMessage() {
    if (!state.currentUsername || !elements.messageInput.value.trim()) return;
    
    const messageData = {
        text: elements.messageInput.value,
        username: state.currentUsername,
        files: state.fileUploads
    };
    
    socket.emit('chat message', messageData);
    elements.messageInput.value = '';
    state.fileUploads = [];
    elements.filePreviewContainer.innerHTML = '';
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
        <span class="username">${message.username}</span>
        <span class="time">${new Date().toLocaleTimeString()}</span>
    `;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message.text;
    
    messageElement.appendChild(header);
    messageElement.appendChild(content);
    
    if (message.files?.length) {
        const filesContainer = document.createElement('div');
        filesContainer.className = 'message-files';
        message.files.forEach(file => {
            // Handle file display logic
        });
        messageElement.appendChild(filesContainer);
    }
    
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Search functionality
function searchMessages(query) {
    const messages = elements.chatMessages.querySelectorAll('.message');
    messages.forEach(message => {
        const text = message.textContent.toLowerCase();
        message.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
    });
}

// Event listeners
if (elements.messageInput) {
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

if (elements.sendButton) {
    elements.sendButton.addEventListener('click', sendMessage);
}

if (elements.fileInput) {
    elements.fileInput.addEventListener('change', handleFileUpload);
}

if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
        searchMessages(e.target.value);
    });
}

if (elements.toggleThemeBtn) {
    elements.toggleThemeBtn.addEventListener('click', () => {
        state.isLightMode = !state.isLightMode;
        document.body.classList.toggle('light-mode');
        localStorage.setItem('theme', state.isLightMode ? 'light' : 'dark');
    });
}

// Socket event handlers
socket.on('connect', () => {
    showToast('اتصال برقرار شد!', 'success');
});

socket.on('disconnect', () => {
    showToast('اتصال قطع شد. در حال تلاش مجدد...', 'error');
    state.isOnline = false;
});

socket.on('chat message', (message) => {
    displayMessage(message);
});

socket.on('user count', (count) => {
    if (elements.onlineCount) {
        elements.onlineCount.textContent = count;
    }
});

// Initialize
initializeUI();
