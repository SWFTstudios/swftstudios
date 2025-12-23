/**
 * Thread Manager
 * 
 * Manages multiple conversation threads for organizing notes
 * Stores threads in Supabase for cross-device sync
 */

(function() {
  'use strict';

  // ==========================================================================
  // State
  // ==========================================================================
  
  const ThreadManager = {
    supabase: null,
    currentUser: null,
    threads: [],
    currentThreadId: 'default',
    
    // ==========================================================================
    // Initialize
    // ==========================================================================
    
    async init(supabase, user) {
      this.supabase = supabase;
      this.currentUser = user;
      
      // Create default thread if needed
      await this.ensureDefaultThread();
      
      // Load threads from Supabase
      await this.loadThreads();
      
      // Render threads list
      this.renderThreads();
      
      // Setup event listeners
      this.setupEventListeners();
    },
    
    // ==========================================================================
    // Thread Operations
    // ==========================================================================
    
    async ensureDefaultThread() {
      // Check if default thread exists in localStorage
      let threads = this.getLocalThreads();
      
      if (!threads.find(t => t.id === 'default')) {
        const defaultThread = {
          id: 'default',
          name: 'General Thought Sessions',
          userId: this.currentUser.email,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0
        };
        
        threads.unshift(defaultThread);
        this.saveLocalThreads(threads);
      }
    },
    
    async loadThreads() {
      // Try to load from Supabase first
      try {
        // For now, use localStorage until Supabase schema is set up
        this.threads = this.getLocalThreads();
      } catch (error) {
        console.error('Error loading threads:', error);
        this.threads = this.getLocalThreads();
      }
    },
    
    async createThread(name) {
      const newThread = {
        id: `thread-${Date.now()}`,
        name: name || `Thread ${this.threads.length + 1}`,
        userId: this.currentUser.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0
      };
      
      this.threads.unshift(newThread);
      this.saveLocalThreads(this.threads);
      
      // TODO: Save to Supabase when schema is ready
      
      this.renderThreads();
      this.switchThread(newThread.id);
      
      return newThread;
    },
    
    async switchThread(threadId) {
      this.currentThreadId = threadId;
      
      // Update active state in UI
      const threadItems = document.querySelectorAll('.thread-item');
      threadItems.forEach(item => {
        if (item.dataset.threadId === threadId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      
      // Update header
      const thread = this.threads.find(t => t.id === threadId);
      if (thread) {
        document.getElementById('current-thread-name').textContent = thread.name;
      }
      
      // Dispatch event for upload.js to load messages
      window.dispatchEvent(new CustomEvent('thread-switched', {
        detail: { threadId }
      }));
    },
    
    async updateThread(threadId, updates) {
      const threadIndex = this.threads.findIndex(t => t.id === threadId);
      if (threadIndex !== -1) {
        this.threads[threadIndex] = {
          ...this.threads[threadIndex],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        this.saveLocalThreads(this.threads);
        // TODO: Update in Supabase
        
        this.renderThreads();
      }
    },
    
    async deleteThread(threadId) {
      if (threadId === 'default') {
        console.warn('Cannot delete default thread');
        return;
      }
      
      this.threads = this.threads.filter(t => t.id !== threadId);
      this.saveLocalThreads(this.threads);
      
      // TODO: Delete from Supabase
      
      // If deleted current thread, switch to default
      if (this.currentThreadId === threadId) {
        this.switchThread('default');
      }
      
      this.renderThreads();
    },
    
    getCurrentThread() {
      return this.threads.find(t => t.id === this.currentThreadId);
    },
    
    // ==========================================================================
    // LocalStorage Helpers
    // ==========================================================================
    
    getLocalThreads() {
      const stored = localStorage.getItem('swft-threads');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Error parsing threads:', e);
          return [];
        }
      }
      return [];
    },
    
    saveLocalThreads(threads) {
      localStorage.setItem('swft-threads', JSON.stringify(threads));
    },
    
    // ==========================================================================
    // Rendering
    // ==========================================================================
    
    renderThreads() {
      const threadsList = document.getElementById('threads-list');
      if (!threadsList) return;
      
      threadsList.innerHTML = this.threads.map(thread => `
        <div class="thread-item ${thread.id === this.currentThreadId ? 'active' : ''}" 
             data-thread-id="${thread.id}"
             role="button"
             tabindex="0">
          <div class="thread-item-content">
            <h3 class="thread-item-title">${this.escapeHtml(thread.name)}</h3>
            <p class="thread-item-preview">
              ${thread.messageCount === 0 ? 'No messages' : `${thread.messageCount} message${thread.messageCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <span class="thread-item-time">${this.formatTime(thread.updatedAt)}</span>
        </div>
      `).join('');
      
      // Re-attach event listeners
      this.attachThreadClickListeners();
    },
    
    attachThreadClickListeners() {
      const threadItems = document.querySelectorAll('.thread-item');
      threadItems.forEach(item => {
        item.addEventListener('click', () => {
          this.switchThread(item.dataset.threadId);
        });
        
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.switchThread(item.dataset.threadId);
          }
        });
      });
    },
    
    // ==========================================================================
    // Event Listeners
    // ==========================================================================
    
    setupEventListeners() {
      const newThreadBtn = document.getElementById('new-thread-btn');
      if (newThreadBtn) {
        newThreadBtn.addEventListener('click', () => {
          this.promptNewThread();
        });
      }
    },
    
    promptNewThread() {
      const name = prompt('Enter thread name:');
      if (name && name.trim()) {
        this.createThread(name.trim());
      }
    },
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    formatTime(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'Now';
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };
  
  // Export to window
  window.ThreadManager = ThreadManager;
  
})();
