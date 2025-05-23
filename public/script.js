// Initialize socket connection
const socket = io();

// Show connecting message
showToast('در حال اتصال...', 'info');

// Initialize DOM elements
const elements = {
    usernameInput: document.getElementById('username-input'),
    saveUsernameBtn: document.getElementById('save-username'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    chatMessages: document.getElementById('chat-messages'),
    onlineCount: document.getElementById('online-count'),
    chatTitle: document.getElementById('chat-title'),
    toggleThemeBtn: document.getElementById('toggle-theme')
};

// State management
let currentUsername = localStorage.getItem('username') || '';
let currentGroup = null;
let isLightMode = localStorage.getItem('theme') === 'light';
let isOnline = true;

// Disable chat input until username is set
if (elements.messageInput) {
    elements.messageInput.disabled = !currentUsername;
}
if (elements.sendButton) {
    elements.sendButton.disabled = !currentUsername;
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

// Username handling
function handleSetUsername() {
    const username = elements.usernameInput.value.trim();
    if (!username) {
        showToast('لطفاً نام کاربری را وارد کنید', 'error');
        return;
    }
    
    socket.emit('set-username', username, (response) => {
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            currentUsername = username;
            localStorage.setItem('username', username);
            showToast('نام کاربری با موفقیت تنظیم شد', 'success');
            
            // Enable chat functionality
            if (elements.messageInput) {
                elements.messageInput.disabled = false;
            }
            if (elements.sendButton) {
                elements.sendButton.disabled = false;
            }
        }
    });
}

// Theme toggle handler
function toggleTheme() {
    isLightMode = !isLightMode;
    document.body.classList.toggle('light-mode', isLightMode);
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    elements.toggleThemeBtn.innerHTML = `<i class="fas fa-${isLightMode ? 'sun' : 'moon'}"></i>`;
}

// Initialize theme
if (elements.toggleThemeBtn) {
    document.body.classList.toggle('light-mode', isLightMode);
    elements.toggleThemeBtn.innerHTML = `<i class="fas fa-${isLightMode ? 'sun' : 'moon'}"></i>`;
    elements.toggleThemeBtn.addEventListener('click', toggleTheme);
}

// Initialize username on page load
function initializeUsername() {
    if (elements.usernameInput) {
        elements.usernameInput.value = currentUsername;
        if (currentUsername) {
            socket.emit('set-username', currentUsername, (response) => {
                if (response.error) {
                    showToast(response.error, 'error');
                } else {
                    showToast('نام کاربری با موفقیت تنظیم شد', 'success');
                }
            });
        }
    }
}

// Event listeners for username
if (elements.saveUsernameBtn) {
    elements.saveUsernameBtn.addEventListener('click', handleSetUsername);
}

if (elements.usernameInput) {
    elements.usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSetUsername();
        }
    });
}

// Socket event listeners
socket.on('connect', () => {
    isOnline = true;
    showToast('اتصال برقرار شد', 'success');
    // Try to reinitialize username if it exists
    if (currentUsername) {
        initializeUsername();
    }
});

socket.on('disconnect', () => {
    isOnline = false;
    showToast('اتصال قطع شد', 'error');
});

socket.on('error', (error) => {
    showToast(error, 'error');
});

// Initialize the application
initializeUsername();
