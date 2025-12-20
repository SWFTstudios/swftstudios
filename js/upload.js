/**
 * SWFT Notes Chat Interface
 * 
 * Chat messenger-style note upload with threads, auto-tagging, and multi-format support
 */

(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================
  
  const CONFIG = {
    maxFileSizes: {
      image: 10 * 1024 * 1024, // 10MB
      audio: 50 * 1024 * 1024, // 50MB
      video: 100 * 1024 * 1024  // 100MB
    },
    allowedTypes: {
      image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'],
      video: ['video/mp4', 'video/quicktime', 'video/webm']
    },
    supabaseUrl: 'https://mnrteunavnzrglbozpfc.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucnRldW5hdm56cmdsYm96cGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTM5NjUsImV4cCI6MjA4MTY2OTk2NX0.7XORw2dbCDG64i2HfiAaTt70ZJTg89BVO7DAPeSCsU8'
  };

  // ==========================================================================
  // State
  // ==========================================================================
  
  let state = {
    supabase: window.SWFTAuth?.supabase,
    currentUser: null,
    messages: [],
    attachments: [],
    isSubmitting: false
  };

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  
  const elements = {
    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    messagesList: document.getElementById('messages-list'),
    attachmentBtn: document.getElementById('attachment-btn'),
    attachmentMenu: document.getElementById('attachment-menu'),
    attachmentsContainer: document.getElementById('message-attachments'),
    sendBtn: document.getElementById('send-btn'),
    signOutBtn: document.getElementById('sign-out-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    imageFileInput: document.getElementById('image-file-input'),
    audioFileInput: document.getElementById('audio-file-input'),
    videoFileInput: document.getElementById('video-file-input'),
    fileInput: document.getElementById('file-input')
  };

  // ==========================================================================
  // Authentication
  // ==========================================================================
  
  async function checkAuth() {
    try {
      if (!state.supabase) {
        console.error('Supabase not initialized');
        window.location.href = '/auth.html';
        return false;
      }

      const { data: { session }, error } = await state.supabase.auth.getSession();

      if (error) throw error;

      if (!session || !session.user) {
        console.log('No session found, redirecting to auth');
        window.location.href = '/auth.html';
        return false;
      }

      state.currentUser = session.user;

      // All authenticated users can upload
      console.log('User authenticated:', session.user.email);
      return true;

    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/auth.html';
      return false;
    }
  }

  // ==========================================================================
  // Message Management
  // ==========================================================================
  
  function loadMessages() {
    const threadId = window.ThreadManager?.currentThreadId || 'default';
    const stored = localStorage.getItem(`swft-messages-${threadId}`);
    
    if (stored) {
      try {
        state.messages = JSON.parse(stored);
        renderMessages();
      } catch (e) {
        console.error('Error loading messages:', e);
        state.messages = [];
      }
    } else {
      state.messages = [];
      renderEmptyState();
    }
  }

  function saveMessages() {
    const threadId = window.ThreadManager?.currentThreadId || 'default';
    localStorage.setItem(`swft-messages-${threadId}`, JSON.stringify(state.messages));
  }

  function addMessage(message) {
    state.messages.push(message);
    saveMessages();
    renderMessages();
    
    // Update thread message count
    if (window.ThreadManager) {
      const thread = window.ThreadManager.getCurrentThread();
      if (thread) {
        window.ThreadManager.updateThread(thread.id, {
          messageCount: state.messages.length
        });
      }
    }
    
    // Scroll to bottom
    scrollToBottom();
  }

  function renderMessages() {
    if (state.messages.length === 0) {
      renderEmptyState();
      return;
    }
    
    elements.messagesList.innerHTML = state.messages.map(msg => `
      <div class="message">
        <div class="message-bubble ${msg.content ? 'has-content' : ''}">
          <div class="message-header">
            <span class="message-author">${escapeHtml(msg.author)}</span>
            <span class="message-time">${formatTime(msg.timestamp)}</span>
          </div>
          
          ${msg.content ? `<div class="message-content">${marked.parse(msg.content)}</div>` : ''}
          
          ${msg.attachments && msg.attachments.length > 0 ? `
            <div class="message-attachment">
              ${msg.attachments.map(att => renderAttachment(att)).join('')}
            </div>
          ` : ''}
          
          ${msg.tags && msg.tags.length > 0 ? `
            <div class="message-tags">
              ${msg.tags.map(tag => `<span class="message-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderEmptyState() {
    elements.messagesList.innerHTML = `
      <div class="messages-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <p>No messages yet. Start by sending a note!</p>
      </div>
    `;
  }

  function renderAttachment(attachment) {
    if (attachment.type === 'image') {
      return `<img src="${escapeHtml(attachment.url)}" alt="Image attachment" loading="lazy">`;
    } else if (attachment.type === 'audio') {
      return `<audio controls src="${escapeHtml(attachment.url)}"></audio>`;
    } else if (attachment.type === 'video') {
      return `<video controls src="${escapeHtml(attachment.url)}"></video>`;
    }
    return '';
  }

  function scrollToBottom() {
    setTimeout(() => {
      elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
    }, 100);
  }

  // ==========================================================================
  // Attachments
  // ==========================================================================
  
  function toggleAttachmentMenu() {
    elements.attachmentMenu.hidden = !elements.attachmentMenu.hidden;
  }

  function setupAttachmentHandlers() {
    // Attachment menu items
    const menuItems = document.querySelectorAll('.attachment-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        handleAttachmentType(type);
        elements.attachmentMenu.hidden = true;
      });
    });

    // File input handlers
    elements.imageFileInput.addEventListener('change', (e) => handleFileSelect(e, 'image'));
    elements.audioFileInput.addEventListener('change', (e) => handleFileSelect(e, 'audio'));
    elements.videoFileInput.addEventListener('change', (e) => handleFileSelect(e, 'video'));
    elements.fileInput.addEventListener('change', (e) => handleFileSelect(e, 'file'));
  }

  function handleAttachmentType(type) {
    switch (type) {
      case 'image':
        elements.imageFileInput.click();
        break;
      case 'audio':
        elements.audioFileInput.click();
        break;
      case 'video':
        elements.videoFileInput.click();
        break;
      case 'file':
        elements.fileInput.click();
        break;
    }
  }

  async function handleFileSelect(event, type) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      // Validate file
      if (!validateFile(file, type)) {
        showError(`Invalid ${type} file: ${file.name}`);
        continue;
      }

      // Add to attachments
      state.attachments.push({
        file: file,
        type: type,
        preview: await generatePreview(file, type)
      });
    }

    renderAttachments();
    
    // Clear input
    event.target.value = '';
  }

  function validateFile(file, type) {
    const maxSize = CONFIG.maxFileSizes[type] || 10 * 1024 * 1024;
    
    if (file.size > maxSize) {
      return false;
    }

    if (type !== 'file' && CONFIG.allowedTypes[type]) {
      return CONFIG.allowedTypes[type].includes(file.type);
    }

    return true;
  }

  async function generatePreview(file, type) {
    if (type === 'image') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }
    return null;
  }

  function renderAttachments() {
    if (state.attachments.length === 0) {
      elements.attachmentsContainer.hidden = true;
      return;
    }

    elements.attachmentsContainer.hidden = false;
    elements.attachmentsContainer.innerHTML = state.attachments.map((att, index) => `
      <div class="attachment-preview">
        ${att.preview ? `<img src="${att.preview}" alt="Preview">` : `
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
        `}
        <button type="button" class="attachment-preview-remove" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');

    // Attach remove handlers
    document.querySelectorAll('.attachment-preview-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        state.attachments.splice(index, 1);
        renderAttachments();
      });
    });
  }

  // ==========================================================================
  // Message Submission
  // ==========================================================================
  
  async function submitMessage(event) {
    console.log('submitMessage called', { event, hasEvent: !!event });
    
    if (event) {
      event.preventDefault();
    }

    const content = elements.messageInput.value.trim();
    console.log('Content check:', { content, contentLength: content.length, attachmentsCount: state.attachments.length });
    
    if (!content && state.attachments.length === 0) {
      console.warn('Submission blocked: empty content and no attachments');
      return;
    }

    if (state.isSubmitting) {
      console.warn('Submission blocked: already submitting');
      return;
    }

    console.log('Starting submission...');
    state.isSubmitting = true;
    setLoading(true);

    try {
      // Upload attachments to Supabase
      const uploadedAttachments = await uploadAttachments();

      // Get tags from auto-tagger
      const tags = window.AutoTagger?.getSelectedTags() || [];

      // Save note directly to Supabase
      const title = generateTitle(content);
      const fileUrls = uploadedAttachments.map(att => att.url);
      const externalLinks = extractLinks(content);
      const contentType = determineContentType(content, uploadedAttachments);
      const threadId = window.ThreadManager?.currentThreadId || null;
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload.js:366',message:'Before Supabase insert - payload values',data:{userId:state.currentUser?.id,userEmail:state.currentUser?.email,title,contentLength:content?.length,tags:JSON.stringify(tags),contentType,fileUrls:JSON.stringify(fileUrls),externalLinks:JSON.stringify(externalLinks),threadId,status:'published'},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      const insertPayload = {
        user_id: state.currentUser.id,
        user_email: state.currentUser.email,
        title: title,
        content: content,
        tags: tags,
        content_type: contentType,
        file_urls: fileUrls,
        external_links: externalLinks,
        status: 'published'
      };
      
      // Only include thread_id if it's not null/undefined (column may not exist in database)
      // Add explicit checks for both null and undefined to be safe
      if (threadId !== null && threadId !== undefined) {
        insertPayload.thread_id = threadId;
      }
      
      // Defensive cleanup: ensure thread_id is never null/undefined in payload
      if (insertPayload.thread_id === null || insertPayload.thread_id === undefined) {
        delete insertPayload.thread_id;
      }
      
      // Console log for debugging payload (can be removed after verification)
      console.log('Insert payload (thread_id excluded if null):', JSON.stringify(insertPayload, null, 2));
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload.js:392',message:'Supabase insert payload',data:{payload:JSON.stringify(insertPayload),includesThreadId:threadId!==null&&threadId!==undefined,threadIdValue:threadId},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const { data: noteData, error: noteError } = await state.supabase
        .from('notes')
        .insert(insertPayload)
        .select()
        .single();

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload.js:395',message:'Supabase insert response',data:{hasData:!!noteData,hasError:!!noteError,errorMessage:noteError?.message,errorCode:noteError?.code,errorDetails:noteError?.details,errorHint:noteError?.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (noteError) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload.js:400',message:'Supabase error thrown',data:{error:JSON.stringify(noteError),message:noteError?.message,code:noteError?.code,details:noteError?.details,hint:noteError?.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
        throw noteError;
      }

      // Add message to local state
      const message = {
        id: noteData.id,
        author: state.currentUser.email.split('@')[0],
        content: content,
        attachments: uploadedAttachments,
        tags: tags,
        timestamp: noteData.created_at
      };

      console.log('Note saved successfully:', noteData.id);
      addMessage(message);

      // Clear form
      elements.messageInput.value = '';
      state.attachments = [];
      renderAttachments();
      window.AutoTagger?.hideSuggestions();

      // Reset textarea height
      elements.messageInput.style.height = 'auto';

    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload.js:430',message:'Submit error caught',data:{errorMessage:error?.message,errorCode:error?.code,errorDetails:error?.details,errorHint:error?.hint,errorString:String(error),errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.error('Submit error:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      });
      
      // More specific error message for thread_id column errors
      let errorMessage = 'Failed to send message. Please try again.';
      if (error?.code === 'PGRST204' && error?.message?.includes('thread_id')) {
        errorMessage = 'Database schema issue detected. Please refresh the page and try again.';
        console.error('thread_id column error - this should not happen with the current fix. Please check if the updated code is deployed.');
      }
      
      showError(errorMessage);
    } finally {
      console.log('Submission finished, resetting state');
      state.isSubmitting = false;
      setLoading(false);
    }
  }

  async function uploadAttachments() {
    const uploaded = [];

    for (const attachment of state.attachments) {
      try {
        const bucket = attachment.type === 'image' ? 'notes-images' : 
                       attachment.type === 'audio' ? 'notes-audio' :
                       attachment.type === 'video' ? 'notes-videos' : 'notes-files';

        const fileName = `${state.currentUser.id}/${Date.now()}-${attachment.file.name}`;

        const { data, error } = await state.supabase.storage
          .from(bucket)
          .upload(fileName, attachment.file);

        if (error) throw error;

        const { data: { publicUrl } } = state.supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);

        uploaded.push({
          type: attachment.type,
          url: publicUrl,
          name: attachment.file.name
        });

      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    return uploaded;
  }

  function generateMarkdown(content, attachments, tags) {
    let markdown = `---
title: "${generateTitle(content)}"
date: "${new Date().toISOString()}"
author: "${state.currentUser.email}"
tags: [${tags.map(t => `"${t}"`).join(', ')}]
---

${content}

`;

    // Add attachments
    attachments.forEach(att => {
      if (att.type === 'image') {
        markdown += `\n![${att.name}](${att.url})\n`;
      } else if (att.type === 'audio') {
        markdown += `\n<audio controls src="${att.url}"></audio>\n`;
      } else if (att.type === 'video') {
        markdown += `\n<video controls src="${att.url}"></video>\n`;
      }
    });

    return markdown;
  }

  function generateTitle(content) {
    if (!content) return 'Untitled Note';
    
    const firstLine = content.split('\n')[0];
    const title = firstLine.substring(0, 60);
    return title || 'Untitled Note';
  }

  function determineContentType(content, attachments) {
    if (attachments.length > 0) {
      return attachments[0].type;
    }
    return 'text';
  }

  function extractLinks(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.match(urlRegex) || [];
  }

  // ==========================================================================
  // UI Helpers
  // ==========================================================================
  
  function setLoading(loading) {
    elements.sendBtn.disabled = loading;
    elements.messageInput.disabled = loading;
  }

  function showError(message) {
    // Simple alert for now - can be enhanced with better UI
    alert(message);
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  
  function setupEventListeners() {
    // Form submission
    if (elements.messageForm) {
      console.log('Setting up form submit listener');
      elements.messageForm.addEventListener('submit', submitMessage);
    } else {
      console.error('messageForm element not found!');
    }
    
    // Also add click handler to send button as backup
    if (elements.sendBtn) {
      console.log('Setting up send button click listener');
      elements.sendBtn.addEventListener('click', (e) => {
        console.log('Send button clicked');
        e.preventDefault();
        submitMessage(e);
      });
    } else {
      console.error('sendBtn element not found!');
    }

    // Attachment button
    if (elements.attachmentBtn) {
      elements.attachmentBtn.addEventListener('click', () => {
        toggleAttachmentMenu();
      });
    }

    // Close attachment menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!elements.attachmentBtn.contains(e.target) && 
          !elements.attachmentMenu.contains(e.target)) {
        elements.attachmentMenu.hidden = true;
      }
    });

    // Auto-resize textarea
    if (elements.messageInput) {
      elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';

        // Auto-suggest tags
        if (window.AutoTagger) {
          window.AutoTagger.autoSuggest(elements.messageInput.value);
        }
      });

      // Submit on Enter (not Shift+Enter)
      elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitMessage();
        }
      });
    }

    // Sign out
    if (elements.signOutBtn) {
      elements.signOutBtn.addEventListener('click', async () => {
        await state.supabase.auth.signOut();
        window.location.href = '/blog.html';
      });
    }

    // Settings button
    if (elements.settingsBtn) {
      elements.settingsBtn.addEventListener('click', () => {
        if (window.Settings) {
          window.Settings.showModal();
        }
      });
    }

    // Thread switching
    window.addEventListener('thread-switched', () => {
      loadMessages();
    });

    // Setup attachment handlers
    setupAttachmentHandlers();

    // Setup auto-tagger
    if (window.AutoTagger && elements.messageInput) {
      window.AutoTagger.setupAutoSuggest(elements.messageInput);
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // Check auth
    const authorized = await checkAuth();
    if (!authorized) return;

    // Initialize thread manager
    if (window.ThreadManager) {
      await window.ThreadManager.init(state.supabase, state.currentUser);
    }

    // Load messages for current thread
    loadMessages();

    // Setup event listeners
    setupEventListeners();

    console.log('Chat interface initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
