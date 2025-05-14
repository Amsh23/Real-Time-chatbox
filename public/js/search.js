class MessageSearch {
    constructor() {
        this.searchInProgress = false;
        this.searchTimeout = null;
        this.elements = {
            searchInput: document.getElementById('search-input'),
            searchBtn: document.getElementById('search-btn'),
            searchResults: document.getElementById('search-results'),
            closeSearch: document.getElementById('close-search'),
            resultsContainer: document.getElementById('results-container')
        };
        this.bindEvents();
    }

    bindEvents() {
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => this.handleSearch(), 500);
            });
        }

        if (this.elements.searchBtn) {
            this.elements.searchBtn.addEventListener('click', () => {
                clearTimeout(this.searchTimeout);
                this.handleSearch();
            });
        }

        if (this.elements.closeSearch) {
            this.elements.closeSearch.addEventListener('click', () => this.hideResults());
        }

        document.addEventListener('click', (e) => {
            if (!this.elements.searchResults?.contains(e.target) && 
                !this.elements.searchInput?.contains(e.target) && 
                !this.elements.searchBtn?.contains(e.target)) {
                this.hideResults();
            }
        });
    }

    async handleSearch() {
        const query = this.elements.searchInput?.value.trim();
        
        if (!query || query.length < 2) {
            this.hideResults();
            return;
        }

        if (this.searchInProgress || !window.currentGroup) return;
        this.searchInProgress = true;

        this.showSearching();
        
        window.socket.emit('search-messages', {
            query: query,
            groupId: window.currentGroup
        }, (response) => this.handleSearchResponse(response));
    }

    handleSearchResponse(response) {
        this.searchInProgress = false;
        this.hideSearching();
        
        if (!response.success) {
            window.showToast?.(response.error || 'Search failed', 'error');
            return;
        }

        this.showResults(response.messages);
    }

    showResults(messages) {
        if (!this.elements.resultsContainer) return;

        if (!messages?.length) {
            this.elements.resultsContainer.innerHTML = '<div class="no-results">No messages found</div>';
        } else {
            const html = messages.map(msg => this.createResultHTML(msg)).join('');
            this.elements.resultsContainer.innerHTML = html;
        }

        if (this.elements.searchResults) {
            this.elements.searchResults.style.display = 'block';
        }
    }

    createResultHTML(message) {
        const preview = message.text 
            ? (message.text.length > 100 ? message.text.substring(0, 100) + '...' : message.text)
            : (message.attachments?.length ? 'Media message' : '');

        return '<div class="search-result" onclick="messageSearch.highlightMessage(\'' + message.id + '\')">' +
               '<div class="username">' + (message.username || 'Unknown') + '</div>' +
               '<div class="message-preview">' + preview + '</div>' +
               '<div class="timestamp">' + this.formatDate(message.timestamp) + '</div>' +
               '</div>';
    }

    highlightMessage(messageId) {
        const messageEl = document.querySelector('.message[data-id="' + messageId + '"]');
        if (!messageEl) return;

        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.classList.add('highlighted');
        setTimeout(() => messageEl.classList.remove('highlighted'), 2000);

        this.hideResults();
    }

    hideResults() {
        if (this.elements.searchResults) {
            this.elements.searchResults.style.display = 'none';
        }
    }

    showSearching() {
        if (this.elements.searchBtn) {
            this.elements.searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
    }

    hideSearching() {
        if (this.elements.searchBtn) {
            this.elements.searchBtn.innerHTML = '<i class="fas fa-search"></i>';
        }
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        
        return date.toLocaleDateString();
    }
}

// Initialize search functionality
const messageSearch = new MessageSearch();