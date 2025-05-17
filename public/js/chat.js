// Simple chat client
class ChatClient {
    constructor() {
        this.socket = null;
        this.currentGroup = null;
        this.username = localStorage.getItem('username') || '';
        this.typingTimeout = null;
        this.setup();
        this.initUI();
    }

    // Connect to server and setup event handlers
    setup() {
        this.socket = io();

        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.showToast('متصل شدید', 'success');
            
            // Set username if available
            if (this.username) {
                this.setUsername(this.username);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showToast('ارتباط قطع شد، در حال تلاش مجدد...', 'error');
        });

        // Message events
        this.socket.on('new-message', (message) => {
            this.addMessageToUI(message);
        });

        this.socket.on('message-pinned', (message) => {
            this.addPinnedMessageToUI(message);
        });

        this.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data.username);
        });

        this.socket.on('user-joined', (data) => {
            this.showToast(`${data.username} به گروه پیوست`, 'info');
        });

        this.socket.on('user-left', (data) => {
            this.showToast(`${data.username} گروه را ترک کرد`, 'info');
        });
    }

    // Initialize UI elements and event listeners
    initUI() {
        // Username
        document.getElementById('set-username').addEventListener('click', () => {
            const input = document.getElementById('username-input');
            const username = input.value.trim();
            if (username) {
                this.setUsername(username);
            }
        });

        // Create group
        document.getElementById('create-group').addEventListener('click', () => {
            this.createGroup();
        });

        // Join group
        document.getElementById('join-group').addEventListener('click', () => {
            const input = document.getElementById('group-code');
            const groupId = input.value.trim();
            if (groupId) {
                this.joinGroup(groupId);
            }
        });

        // Send message
        document.getElementById('send-message').addEventListener('click', () => {
            this.sendMessage();
        });
        
        document.getElementById('message-input').addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
            this.handleTyping();
        });

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            this.searchMessages(query);
        });

        document.getElementById('clear-search').addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            document.getElementById('search-results').innerHTML = '';
        });
    }

    // Username handling
    setUsername(username) {
        this.socket.emit('set-username', username, (response) => {
            if (response.success) {
                this.username = username;
                localStorage.setItem('username', username);
                document.getElementById('username-input').value = username;
                this.showToast(`نام کاربری به ${username} تغییر یافت`, 'success');
            } else {
                this.showToast(response.error, 'error');
            }
        });
    }

    // Group handling
    createGroup() {
        this.socket.emit('create-group', (response) => {
            if (response.success) {
                const group = response.group;
                this.addGroupToUI(group);
                this.joinGroup(group.id);
                this.showToast(`گروه ${group.id} ایجاد شد`, 'success');
                
                // Copy group ID to clipboard
                navigator.clipboard.writeText(group.id)
                    .then(() => this.showToast('کد گروه در کلیپبورد ذخیره شد', 'info'));
            } else {
                this.showToast(response.error, 'error');
            }
        });
    }

    joinGroup(groupId) {
        this.socket.emit('join-group', groupId, (response) => {
            if (response.success) {
                this.currentGroup = response.group;
                this.addGroupToUI(response.group);
                this.clearMessages();
                this.loadMessages(groupId);
                this.loadPinnedMessages(groupId);
                document.getElementById('group-code').value = '';
                
                // Update UI to show active group
                const groupElements = document.querySelectorAll('.group-item');
                groupElements.forEach(el => {
                    el.classList.remove('active');
                    if (el.dataset.groupId === groupId) {
                        el.classList.add('active');
                    }
                });
                
                this.showToast(`به گروه ${groupId} پیوستید`, 'success');
            } else {
                this.showToast(response.error, 'error');
            }
        });
    }

    // Message handling
    sendMessage() {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        
        if (!text || !this.currentGroup) return;
        
        this.socket.emit('send-message', {
            text,
            groupId: this.currentGroup.id
        }, (response) => {
            if (response.success) {
                input.value = '';
            } else {
                this.showToast(response.error, 'error');
            }
        });
    }

    loadMessages(groupId) {
        this.socket.emit('get-messages', { groupId }, (response) => {
            if (response.success) {
                this.clearMessages();
                const messages = response.messages;
                messages.forEach(msg => this.addMessageToUI(msg));
            } else {
                this.showToast(response.error, 'error');
            }
        });
    }

    // Pinned messages
    pinMessage(messageId) {
        if (!this.currentGroup) return;
        
        this.socket.emit('pin-message', {
            messageId,
            groupId: this.currentGroup.id
        }, (response) => {
            if (response.success) {
                this.showToast('پیام پین شد', 'success');
            } else {
                this.showToast(response.error, 'error');
            }
        });
    }

    loadPinnedMessages(groupId) {
        this.socket.emit('get-pinned-messages', groupId, (response) => {
            if (response.success) {
                const pinnedContainer = document.getElementById('pinned-messages');
                pinnedContainer.innerHTML = '';
                
                response.messages.forEach(msg => {
                    this.addPinnedMessageToUI(msg);
                });
            }
        });
    }

    // Typing indicator
    handleTyping() {
        if (!this.currentGroup) return;
        
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        this.socket.emit('typing', this.currentGroup.id);
        this.typingTimeout = setTimeout(() => {
            this.typingTimeout = null;
        }, 2000);
    }

    showTypingIndicator(username) {
        const typingElement = document.getElementById('typing-indicator');
        typingElement.textContent = `${username} در حال نوشتن...`;
        typingElement.style.display = 'block';
        
        // Hide after 2 seconds
        setTimeout(() => {
            typingElement.style.display = 'none';
        }, 2000);
    }

    // Search functionality
    searchMessages(query) {
        if (!query || !this.currentGroup) return;
        
        const messagesContainer = document.getElementById('messages');
        const messages = messagesContainer.querySelectorAll('.message');
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = '';
        
        let found = false;
        
        messages.forEach(message => {
            const text = message.querySelector('.message-text').textContent.toLowerCase();
            if (text.includes(query)) {
                found = true;
                const clone = message.cloneNode(true);
                resultsContainer.appendChild(clone);
                
                // Highlight the matched text
                const messageText = clone.querySelector('.message-text');
                messageText.innerHTML = messageText.textContent.replace(
                    new RegExp(query, 'gi'),
                    match => `<span class="highlight">${match}</span>`
                );
                
                // Add click event to jump to original message
                clone.addEventListener('click', () => {
                    message.scrollIntoView({ behavior: 'smooth' });
                    message.classList.add('highlight-message');
                    setTimeout(() => message.classList.remove('highlight-message'), 2000);
                });
            }
        });
        
        if (!found) {
            resultsContainer.innerHTML = '<div class="no-results">هیچ پیامی یافت نشد</div>';
        }
    }

    // UI Helpers
    addMessageToUI(message) {
        const messagesContainer = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.dataset.id = message.id;
        
        if (message.sender === this.socket.id) {
            messageElement.classList.add('outgoing');
        } else {
            messageElement.classList.add('incoming');
        }
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-username">${message.username}</span>
                <span class="message-time">${timestamp}</span>
            </div>
            <div class="message-text">${message.text}</div>
            <div class="message-actions">
                <button class="pin-button" title="پین کردن"><i class="fas fa-thumbtack"></i></button>
            </div>
        `;
        
        // Add event listener for pin button
        const pinButton = messageElement.querySelector('.pin-button');
        pinButton.addEventListener('click', () => {
            this.pinMessage(message.id);
        });
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addPinnedMessageToUI(message) {
        const pinnedContainer = document.getElementById('pinned-messages');
        
        // Check if already pinned
        const existingPin = pinnedContainer.querySelector(`[data-id="${message.id}"]`);
        if (existingPin) return;
        
        const pinnedElement = document.createElement('div');
        pinnedElement.className = 'pinned-message';
        pinnedElement.dataset.id = message.id;
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        pinnedElement.innerHTML = `
            <div class="pinned-header">
                <span class="pinned-username">${message.username}</span>
                <span class="pinned-time">${timestamp}</span>
            </div>
            <div class="pinned-text">${message.text}</div>
        `;
        
        // Add click event to scroll to original message
        pinnedElement.addEventListener('click', () => {
            const originalMessage = document.querySelector(`.message[data-id="${message.id}"]`);
            if (originalMessage) {
                originalMessage.scrollIntoView({ behavior: 'smooth' });
                originalMessage.classList.add('highlight-message');
                setTimeout(() => originalMessage.classList.remove('highlight-message'), 2000);
            }
        });
        
        pinnedContainer.appendChild(pinnedElement);
    }

    addGroupToUI(group) {
        const groupList = document.getElementById('group-list');
        
        // Check if group already exists in UI
        let groupElement = groupList.querySelector(`[data-group-id="${group.id}"]`);
        
        if (!groupElement) {
            groupElement = document.createElement('div');
            groupElement.className = 'group-item';
            groupElement.dataset.groupId = group.id;
            groupElement.innerHTML = `
                <span class="group-name">${group.name || `گروه ${group.id}`}</span>
                <span class="group-code">${group.id}</span>
            `;
            
            groupElement.addEventListener('click', () => {
                this.joinGroup(group.id);
            });
            
            groupList.appendChild(groupElement);
        }
    }

    clearMessages() {
        document.getElementById('messages').innerHTML = '';
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Force reflow
        toast.offsetHeight;
        
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatClient = new ChatClient();
});
