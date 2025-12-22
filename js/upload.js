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
  
  // Initialize Supabase client
  let supabaseClient;
  try {
    if (window.SWFTAuth?.supabase) {
      supabaseClient = window.SWFTAuth.supabase;
    } else if (window.supabase) {
      // Fallback: initialize directly if SWFTAuth not available
      supabaseClient = window.supabase.createClient(
        CONFIG.supabaseUrl,
        CONFIG.supabaseAnonKey
      );
      console.log('Supabase client initialized directly (SWFTAuth not available)');
    } else {
      console.error('Supabase library not loaded');
    }
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
  }

  let state = {
    supabase: supabaseClient,
    currentUser: null,
    notes: [], // All user notes
    currentNote: null, // Currently selected note
    messages: [], // Messages from current note (for backward compat)
    attachments: [],
    isSubmitting: false,
    currentAttachmentPreview: null,
    // Voice recording state
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    recordingStartTime: null,
    recordingTimer: null,
    recognition: null, // Speech recognition
    transcriptionSegments: [],
    lastTranscriptionTime: null
  };

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  
  const elements = {
    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    editorWrapper: document.getElementById('editor-wrapper'),
    messagesList: document.getElementById('messages-list'),
    notesList: document.getElementById('notes-list'),
    attachmentBtn: document.getElementById('attachment-btn'),
    attachmentMenu: document.getElementById('attachment-menu'),
    attachmentsContainer: document.getElementById('message-attachments'),
    sendBtn: document.getElementById('send-btn'),
    signOutBtn: document.getElementById('sign-out-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    previewToggle: document.getElementById('preview-toggle'),
    imageFileInput: document.getElementById('image-file-input'),
    audioFileInput: document.getElementById('audio-file-input'),
    videoFileInput: document.getElementById('video-file-input'),
    fileInput: document.getElementById('file-input'),
    attachmentModal: document.getElementById('attachment-modal'),
    attachmentModalClose: document.getElementById('attachment-modal-close'),
    attachmentModalBody: document.getElementById('attachment-modal-body'),
    attachmentModalTitle: document.getElementById('attachment-modal-title'),
    attachmentDownloadBtn: document.getElementById('attachment-download-btn'),
    newNoteBtn: document.getElementById('new-note-btn'),
    currentNoteTitle: document.getElementById('current-note-title'),
    currentNoteSubtitle: document.getElementById('current-note-subtitle'),
    userProfile: document.getElementById('user-profile'),
    userProfileAvatar: document.getElementById('user-profile-avatar'),
    userProfileName: document.getElementById('user-profile-name'),
    userProfileEmail: document.getElementById('user-profile-email'),
    emptyStateMessage: document.getElementById('empty-state-message'),
    // Voice recording elements
    voiceRecordingContainer: document.getElementById('voice-recording-container'),
    voiceRecordingIndicator: document.getElementById('voice-recording-indicator'),
    voiceRecordingTimer: document.getElementById('voice-recording-timer'),
    voiceRecordingStop: document.getElementById('voice-recording-stop'),
    voiceRecordingWaveform: document.getElementById('voice-recording-waveform'),
    voiceRecordingTranscriptionPreview: document.getElementById('voice-recording-transcription-preview'),
    transcriptionPreviewContent: document.getElementById('transcription-preview-content')
  };

  // CodeMirror editor instance
  let editor = null;
  let previewMode = false;

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
  // Notes Management
  // ==========================================================================
  
  async function loadNotes() {
    try {
      const { data, error } = await state.supabase
        .from('notes')
        .select('id, title, messages, updated_at, created_at, content')
        .eq('user_id', state.currentUser.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      state.notes = data || [];
      
      // Migrate old notes: if messages is empty but content exists, create initial message
      for (const note of state.notes) {
        if ((!note.messages || note.messages.length === 0) && note.content) {
          note.messages = [{
            id: crypto.randomUUID(),
            content: note.content,
            attachments: [],
            tags: [],
            created_at: note.created_at
          }];
          // Update in database
          await state.supabase
            .from('notes')
            .update({ messages: note.messages })
            .eq('id', note.id);
        }
      }

      renderNotesList();
      
      // If no note is selected and notes exist, select the first one
      if (!state.currentNote && state.notes.length > 0) {
        await selectNote(state.notes[0].id);
      } else if (state.notes.length === 0) {
        renderEmptyState('no-notes');
      }
    } catch (error) {
      console.error('Error loading notes:', error);
      state.notes = [];
      renderEmptyState('no-notes');
    }
  }

  function renderNotesList() {
    if (!elements.notesList) return;

    if (state.notes.length === 0) {
      elements.notesList.innerHTML = `
        <div class="thread-item" style="padding: 2rem; text-align: center; color: var(--theme-text-muted);">
          <p>No notes yet</p>
        </div>
      `;
      return;
    }

    elements.notesList.innerHTML = state.notes.map(note => {
      const messages = note.messages || [];
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const preview = lastMessage 
        ? (lastMessage.content || '').substring(0, 50) + (lastMessage.content && lastMessage.content.length > 50 ? '...' : '')
        : 'No messages yet';
      
      return `
        <div class="thread-item ${note.id === state.currentNote?.id ? 'active' : ''}" 
             data-note-id="${note.id}"
             role="button"
             tabindex="0">
          <div class="thread-item-content">
            <h3 class="thread-item-title" data-note-id="${note.id}">
              ${escapeHtml(note.title || 'Untitled')}
              <span class="thread-item-title-edit-icon" title="Click to edit">✎</span>
            </h3>
            <p class="thread-item-preview">${escapeHtml(preview)}</p>
          </div>
          <span class="thread-item-time">${formatTime(note.updated_at)}</span>
        </div>
      `;
    }).join('');

    // Attach click listeners
    attachNoteClickListeners();
    
    // Attach title edit listeners
    attachNoteTitleEditListeners();
  }

  function attachNoteClickListeners() {
    const noteItems = document.querySelectorAll('.thread-item[data-note-id]');
    noteItems.forEach(item => {
      const noteId = item.dataset.noteId;
      
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on title edit icon
        if (e.target.closest('.thread-item-title-edit-icon')) return;
        selectNote(noteId);
      });
      
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectNote(noteId);
        }
      });
    });
  }

  function attachNoteTitleEditListeners() {
    const titleElements = document.querySelectorAll('.thread-item-title[data-note-id]');
    titleElements.forEach(titleEl => {
      const noteId = titleEl.dataset.noteId;
      
      titleEl.addEventListener('click', (e) => {
        // Only trigger if clicking on the edit icon or the title itself
        if (e.target.closest('.thread-item-title-edit-icon') || e.target === titleEl) {
          editNoteTitle(noteId, titleEl);
        }
      });
    });
  }

  async function selectNote(noteId) {
    try {
      const note = state.notes.find(n => n.id === noteId);
      if (!note) {
        // Reload note from database
        const { data, error } = await state.supabase
          .from('notes')
          .select('id, title, messages, updated_at, created_at, content')
          .eq('id', noteId)
          .single();

        if (error) throw error;
        state.currentNote = data;
      } else {
        state.currentNote = note;
      }

      // Update messages from note
      state.messages = state.currentNote.messages || [];
      
      // Update UI
      renderMessages();
      updateActiveNoteInSidebar(noteId);
      updateNoteHeader();
      
      // Scroll to bottom
      scrollToBottom();
    } catch (error) {
      console.error('Error selecting note:', error);
      showError('Failed to load note');
    }
  }

  function updateActiveNoteInSidebar(noteId) {
    const noteItems = document.querySelectorAll('.thread-item[data-note-id]');
    noteItems.forEach(item => {
      if (item.dataset.noteId === noteId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function updateNoteHeader() {
    if (state.currentNote) {
      if (elements.currentNoteTitle) {
        elements.currentNoteTitle.textContent = state.currentNote.title || 'Untitled';
      }
      if (elements.currentNoteSubtitle) {
        const messageCount = (state.currentNote.messages || []).length;
        elements.currentNoteSubtitle.textContent = 
          messageCount === 0 
            ? 'Start your conversation'
            : `${messageCount} message${messageCount === 1 ? '' : 's'}`;
      }
    } else {
      if (elements.currentNoteTitle) {
        elements.currentNoteTitle.textContent = 'Select a note to start';
      }
      if (elements.currentNoteSubtitle) {
        elements.currentNoteSubtitle.textContent = 'Create or select a note to begin your conversation';
      }
    }
  }

  async function createNewNote() {
    try {
      const { data, error } = await state.supabase
        .from('notes')
        .insert({
          user_id: state.currentUser.id,
          user_email: state.currentUser.email,
          title: 'New Note',
          messages: [],
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      state.notes.unshift(data);
      state.currentNote = data;
      
      // Update UI
      renderNotesList();
      await selectNote(data.id);
      
      return data;
    } catch (error) {
      console.error('Error creating note:', error);
      showError('Failed to create note');
      return null;
    }
  }

  async function editNoteTitle(noteId, titleElement) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    const currentTitle = note.title || 'Untitled';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'thread-item-title editing';
    
    // Store original content (including edit icon)
    const originalContent = titleElement.innerHTML;
    const originalText = titleElement.textContent.trim();
    
    // Replace title with input
    titleElement.innerHTML = '';
    titleElement.appendChild(input);
    input.focus();
    input.select();

    const saveTitle = async () => {
      const newTitle = input.value.trim() || 'Untitled';
      if (newTitle !== originalText) {
        try {
          const { error } = await state.supabase
            .from('notes')
            .update({ title: newTitle })
            .eq('id', noteId);

          if (error) throw error;

          note.title = newTitle;
          // Update current note if it's the one being edited
          if (state.currentNote && state.currentNote.id === noteId) {
            state.currentNote.title = newTitle;
            updateNoteHeader();
          }
          renderNotesList();
        } catch (error) {
          console.error('Error updating note title:', error);
          showError('Failed to update title');
          titleElement.innerHTML = originalContent;
        }
      } else {
        titleElement.innerHTML = originalContent;
      }
    };

    const cancelEdit = () => {
      titleElement.innerHTML = originalContent;
    };

    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur(); // Trigger save
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
  }

  async function updateNoteTitle(noteId, newTitle) {
    try {
      const { error } = await state.supabase
        .from('notes')
        .update({ title: newTitle })
        .eq('id', noteId);

      if (error) throw error;

      // Update local state
      const note = state.notes.find(n => n.id === noteId);
      if (note) {
        note.title = newTitle;
        renderNotesList();
      }
    } catch (error) {
      console.error('Error updating note title:', error);
      throw error;
    }
  }

  async function getUserProfile() {
    try {
      if (!state.currentUser) return null;
      
      // Get user metadata from auth
      const { data: { user }, error } = await state.supabase.auth.getUser();
      if (error) throw error;

      return {
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        email: user.email || state.currentUser.email
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return {
        name: state.currentUser.email?.split('@')[0] || 'User',
        email: state.currentUser.email || ''
      };
    }
  }

  function renderUserProfile() {
    getUserProfile().then(profile => {
      if (!profile) return;

      if (elements.userProfileName) {
        elements.userProfileName.textContent = profile.name;
      }
      if (elements.userProfileEmail) {
        elements.userProfileEmail.textContent = profile.email;
      }
      if (elements.userProfileAvatar) {
        // Generate initials
        const initials = profile.name
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);
        elements.userProfileAvatar.textContent = initials;
      }
    });
  }

  function renderMessages() {
    if (!state.currentNote) {
      renderEmptyState('no-note-selected');
      return;
    }

    const messages = state.messages || [];
    
    if (messages.length === 0) {
      renderEmptyState('empty-note');
      return;
    }
    
    elements.messagesList.innerHTML = messages.map(msg => {
      const author = state.currentUser?.email?.split('@')[0] || 'You';
      const timestamp = msg.created_at || msg.timestamp || new Date().toISOString();
      
      return `
        <div class="message">
          <div class="message-bubble ${msg.content ? 'has-content' : ''}">
            <div class="message-header">
              <span class="message-author">${escapeHtml(author)}</span>
              <span class="message-time">${formatTime(timestamp)}</span>
            </div>
            
            ${msg.content ? `<div class="message-content">${marked.parse(msg.content)}</div>` : ''}
            
            ${msg.attachments && msg.attachments.length > 0 ? `
              <div class="message-attachments-list">
                ${msg.attachments.map((att, idx) => {
                  // Ensure transcription is included from stored message data
                  const attachmentWithTranscription = {
                    ...att,
                    transcription: att.transcription || msg.transcription?.[att.url] || null,
                    isVoiceRecording: att.isVoiceRecording || false
                  };
                  return renderAttachment(attachmentWithTranscription, idx);
                }).join('')}
              </div>
            ` : ''}
            
            ${msg.tags && msg.tags.length > 0 ? `
              <div class="message-tags">
                ${msg.tags.map(tag => `<span class="message-tag">${escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for attachment previews
    elements.messagesList.querySelectorAll('.attachment-item[data-attachment-id]').forEach(item => {
      item.addEventListener('click', () => {
        // Find the message container
        const messageBubble = item.closest('.message-bubble');
        if (!messageBubble) return;
        
        // Find the message index
        const messageIndex = Array.from(elements.messagesList.querySelectorAll('.message')).indexOf(
          item.closest('.message')
        );
        
        if (messageIndex >= 0 && messages[messageIndex]) {
          const message = messages[messageIndex];
          if (message.attachments && message.attachments.length > 0) {
            // Find attachment by matching URL
            const img = item.querySelector('img');
            const video = item.querySelector('video');
            const attachment = message.attachments.find(att => 
              (img && att.url === img.src) || 
              (video && att.url === video.src)
            ) || message.attachments[0];
            
            if (attachment) {
              showAttachmentPreview(attachment);
            }
          }
        }
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });
  }

  function renderEmptyState(type = 'no-note-selected') {
    let message = 'Select a note or create a new one to start';
    
    if (type === 'no-notes') {
      message = 'Create your first note to get started';
    } else if (type === 'empty-note') {
      message = 'Start your conversation';
    } else if (type === 'no-note-selected') {
      message = 'Select a note or create a new one to start';
    }

    if (elements.emptyStateMessage) {
      elements.emptyStateMessage.textContent = message;
    }

    elements.messagesList.innerHTML = `
      <div class="messages-empty" id="messages-empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <p id="empty-state-message">${message}</p>
      </div>
    `;
  }

  function renderAttachment(attachment, index = 0) {
    const attachmentId = `attachment-${index}`;
    
    if (attachment.type === 'image') {
      return `
        <div class="attachment-item attachment-image" data-attachment-id="${attachmentId}" role="button" tabindex="0">
          <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name || 'Image')}" loading="lazy">
          <div class="attachment-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Click to preview</span>
          </div>
        </div>
      `;
    } else if (attachment.type === 'audio') {
      const hasTranscription = attachment.transcription && attachment.transcription.trim();
      const isVoiceRecording = attachment.isVoiceRecording;
      
      return `
        <div class="attachment-item attachment-audio ${isVoiceRecording ? 'voice-recording' : ''}">
          <audio controls src="${escapeHtml(attachment.url)}"></audio>
          ${hasTranscription ? `
            <div class="audio-transcription">
              <div class="audio-transcription-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Transcription</span>
              </div>
              <div class="audio-transcription-content">
                ${attachment.transcription.split('\n\n').map(para => 
                  `<p>${escapeHtml(para.replace(/\n/g, ' '))}</p>`
                ).join('')}
              </div>
            </div>
          ` : ''}
          <a href="${escapeHtml(attachment.url)}" download="${escapeHtml(attachment.name || 'audio')}" class="attachment-download-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </a>
        </div>
      `;
    } else if (attachment.type === 'video') {
      return `
        <div class="attachment-item attachment-video" data-attachment-id="${attachmentId}" role="button" tabindex="0">
          <video controls src="${escapeHtml(attachment.url)}"></video>
          <div class="attachment-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Click to preview</span>
          </div>
        </div>
      `;
    } else {
      // File attachment
      return `
        <div class="attachment-item attachment-file">
          <div class="attachment-file-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
          </div>
          <div class="attachment-file-info">
            <span class="attachment-file-name">${escapeHtml(attachment.name || 'File')}</span>
            <a href="${escapeHtml(attachment.url)}" download="${escapeHtml(attachment.name || 'file')}" class="attachment-download-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </a>
          </div>
        </div>
      `;
    }
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
      case 'voice-record':
        startVoiceRecording();
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
    if (event) {
      event.preventDefault();
    }

    // Get content from editor or textarea
    const content = editor ? editor.getValue().trim() : elements.messageInput.value.trim();
    
    if (!content && state.attachments.length === 0) {
      return;
    }

    if (state.isSubmitting) {
      return;
    }

    state.isSubmitting = true;
    setLoading(true);

    try {
      // Ensure we have a current note (create if needed)
      if (!state.currentNote) {
        await createNewNote();
        if (!state.currentNote) {
          throw new Error('Failed to create note');
        }
      }

      // Upload attachments to Supabase
      const uploadedAttachments = await uploadAttachments();

      // Get tags from auto-tagger
      const tags = window.AutoTagger?.getSelectedTags() || [];

      // Process attachments to include transcription
      const processedAttachments = uploadedAttachments.map(att => {
        // Find matching attachment in state to get transcription
        const originalAtt = state.attachments.find(a => 
          a.file && att.name && a.file.name === att.name
        );
        return {
          ...att,
          transcription: originalAtt?.transcription,
          isVoiceRecording: originalAtt?.isVoiceRecording
        };
      });

      // Create new message object
      const newMessage = {
        id: crypto.randomUUID(),
        content: content,
        attachments: processedAttachments,
        tags: tags,
        created_at: new Date().toISOString()
      };

      // Get current messages array
      const currentMessages = state.currentNote.messages || [];
      const updatedMessages = [...currentMessages, newMessage];

      // Generate title from first message if still "New Note"
      let title = state.currentNote.title;
      if (title === 'New Note' && content) {
        title = generateTitle(content);
      }

      // Update note in Supabase
      const fileUrls = uploadedAttachments.map(att => att.url);
      const externalLinks = extractLinks(content);
      const contentType = determineContentType(content, uploadedAttachments);

      // Store transcription data in message attachments
      const messagesWithTranscription = updatedMessages.map(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          msg.attachments = msg.attachments.map(att => ({
            ...att,
            transcription: att.transcription || null,
            isVoiceRecording: att.isVoiceRecording || false
          }));
        }
        return msg;
      });

      const { data: updatedNote, error: updateError } = await state.supabase
        .from('notes')
        .update({
          messages: messagesWithTranscription,
          updated_at: new Date().toISOString(),
          content: content, // For backward compatibility
          title: title,
          tags: tags,
          content_type: contentType,
          file_urls: fileUrls,
          external_links: externalLinks
        })
        .eq('id', state.currentNote.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update local state
      state.currentNote = updatedNote;
      state.messages = updatedNote.messages || [];
      
      // Refresh notes list to update preview and timestamp
      await loadNotes();
      
      // Re-render messages
      renderMessages();
      updateNoteHeader();
      
      // Scroll to bottom
      scrollToBottom();

      // Clear form
      if (editor) {
        editor.setValue('');
      } else {
        elements.messageInput.value = '';
      }
      state.attachments = [];
      renderAttachments();
      window.AutoTagger?.hideSuggestions();

    } catch (error) {
      console.error('Submit error:', error);
      showError('Failed to send message. Please try again.');
    } finally {
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
          name: attachment.file.name,
          transcription: attachment.transcription || null,
          isVoiceRecording: attachment.isVoiceRecording || false
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

        // Auto-create note if typing in empty state
        if (!state.currentNote && elements.messageInput.value.trim().length > 0) {
          createNewNote();
        }

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

    // New note button
    if (elements.newNoteBtn) {
      elements.newNoteBtn.addEventListener('click', async () => {
        await createNewNote();
      });
    }

    // Voice recording stop button
    if (elements.voiceRecordingStop) {
      elements.voiceRecordingStop.addEventListener('click', () => {
        stopVoiceRecording();
      });
    }

    // Add click handler to close transcription preview after recording
    // User can click outside or on a close action to dismiss the transcription view
    if (elements.voiceRecordingContainer) {
      document.addEventListener('click', (e) => {
        // If clicking outside the recording container while transcription is showing, hide it
        if (!state.isRecording && 
            elements.voiceRecordingContainer && 
            !elements.voiceRecordingContainer.hidden &&
            !elements.voiceRecordingContainer.contains(e.target) &&
            elements.voiceRecordingStop &&
            !elements.voiceRecordingStop.contains(e.target)) {
          // Only hide if transcription is showing (recording is done)
          if (elements.voiceRecordingTranscriptionPreview && 
              !elements.voiceRecordingTranscriptionPreview.hidden) {
            elements.voiceRecordingContainer.hidden = true;
          }
        }
      });
    }

    // Setup attachment handlers
    setupAttachmentHandlers();

    // Setup auto-tagger
    if (window.AutoTagger) {
      if (editor) {
      // Setup for CodeMirror editor
      editor.on('change', () => {
        // Auto-create note if typing in empty state
        if (!state.currentNote && editor.getValue().trim().length > 0) {
          createNewNote();
        }
        
        if (window.AutoTagger) {
          window.AutoTagger.analyzeText(editor.getValue());
        }
      });
      } else if (elements.messageInput) {
        window.AutoTagger.setupAutoSuggest(elements.messageInput);
      }
    }

    // Preview toggle
    if (elements.previewToggle) {
      elements.previewToggle.addEventListener('click', togglePreview);
    }

    // Attachment modal close
    if (elements.attachmentModalClose) {
      elements.attachmentModalClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideAttachmentPreview();
      });
    }
    if (elements.attachmentModal) {
      const backdrop = elements.attachmentModal.querySelector('.attachment-modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideAttachmentPreview();
        });
      }
      // Also close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.attachmentModal.hidden) {
          hideAttachmentPreview();
        }
      });
    }

    // Setup drag and drop on textarea if no editor
    if (!editor && elements.messageInput) {
      setupDragAndDrop(elements.messageInput);
    }
  }

  // ==========================================================================
  // Markdown Editor Setup
  // ==========================================================================
  
  function initMarkdownEditor() {
    if (!elements.messageInput || !window.CodeMirror) {
      console.warn('CodeMirror not available, using plain textarea');
      return;
    }

    try {
      editor = CodeMirror.fromTextArea(elements.messageInput, {
        mode: 'markdown',
        lineNumbers: false,
        lineWrapping: true,
        theme: 'default',
        placeholder: 'Type a note... (Markdown supported). Drag and drop files here!',
        autofocus: false,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 2,
        tabSize: 2
      });

      // Update textarea when editor content changes
      editor.on('change', () => {
        elements.messageInput.value = editor.getValue();
        // Trigger auto-tagger if available
        if (window.AutoTagger) {
          window.AutoTagger.analyzeText(editor.getValue());
        }
      });

      // Setup drag and drop on editor
      setupDragAndDrop(editor.getWrapperElement());
      
      console.log('Markdown editor initialized');
    } catch (error) {
      console.error('Failed to initialize CodeMirror:', error);
    }
  }

  function setupDragAndDrop(element) {
    if (!element) return;

    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        // Check for text content
        const text = e.dataTransfer.getData('text/plain');
        if (text) {
          if (editor) {
            const cursor = editor.getCursor();
            editor.replaceRange(text, cursor);
          } else {
            elements.messageInput.value += text;
          }
        }
        return;
      }

      // Handle file drops
      for (const file of files) {
        await handleDroppedFile(file);
      }
    });
  }

  async function handleDroppedFile(file) {
    // Determine file type
    let type = 'file';
    if (file.type.startsWith('image/')) {
      type = 'image';
    } else if (file.type.startsWith('audio/')) {
      type = 'audio';
    } else if (file.type.startsWith('video/')) {
      type = 'video';
    }

    // Validate and add to attachments
    if (validateFile(file, type)) {
      const preview = await generatePreview(file, type);
      state.attachments.push({
        file: file,
        type: type,
        preview: preview
      });
      
      // Insert markdown image reference if it's an image
      if (type === 'image' && editor) {
        const fileName = file.name;
        const cursor = editor.getCursor();
        editor.replaceRange(`![${fileName}](attachment:${state.attachments.length - 1})\n`, cursor);
      }
      
      renderAttachments();
    } else {
      showError(`Invalid file: ${file.name}`);
    }
  }

  function togglePreview() {
    if (!editor) return;
    
    previewMode = !previewMode;
    
    if (previewMode) {
      // Show markdown preview
      const content = editor.getValue();
      const previewHtml = window.marked ? window.marked.parse(content) : escapeHtml(content).replace(/\n/g, '<br>');
      
      // Create preview element
      const previewDiv = document.createElement('div');
      previewDiv.className = 'markdown-preview';
      previewDiv.innerHTML = previewHtml;
      
      // Replace editor with preview
      const wrapper = editor.getWrapperElement();
      wrapper.style.display = 'none';
      wrapper.parentElement.insertBefore(previewDiv, wrapper.nextSibling);
      
      if (elements.previewToggle) {
        elements.previewToggle.classList.add('active');
      }
    } else {
      // Hide preview, show editor
      const preview = document.querySelector('.markdown-preview');
      if (preview) {
        preview.remove();
      }
      
      const wrapper = editor.getWrapperElement();
      wrapper.style.display = 'block';
      
      if (elements.previewToggle) {
        elements.previewToggle.classList.remove('active');
      }
    }
  }

  // ==========================================================================
  // Attachment Preview Modal
  // ==========================================================================
  
  function showAttachmentPreview(attachment) {
    if (!elements.attachmentModal) return;
    
    state.currentAttachmentPreview = attachment;
    
    // Set title
    if (elements.attachmentModalTitle) {
      elements.attachmentModalTitle.textContent = attachment.name || 'Attachment';
    }
    
    // Set download link
    if (elements.attachmentDownloadBtn && attachment.url) {
      elements.attachmentDownloadBtn.href = attachment.url;
      elements.attachmentDownloadBtn.download = attachment.name || 'attachment';
    }
    
    // Render preview content
    if (elements.attachmentModalBody) {
      let previewHtml = '';
      
      if (attachment.type === 'image' && attachment.url) {
        previewHtml = `<img src="${attachment.url}" alt="${attachment.name || 'Image'}" class="attachment-preview-image">`;
      } else if (attachment.type === 'video' && attachment.url) {
        previewHtml = `<video controls class="attachment-preview-video"><source src="${attachment.url}" type="video/mp4">Your browser does not support the video tag.</video>`;
      } else if (attachment.type === 'audio' && attachment.url) {
        previewHtml = `<audio controls class="attachment-preview-audio"><source src="${attachment.url}">Your browser does not support the audio tag.</audio>`;
      } else {
        previewHtml = `
          <div class="attachment-preview-file">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            <p>${attachment.name || 'File'}</p>
          </div>
        `;
      }
      
      elements.attachmentModalBody.innerHTML = previewHtml;
    }
    
    // Show modal
    elements.attachmentModal.hidden = false;
    elements.attachmentModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function hideAttachmentPreview() {
    if (elements.attachmentModal) {
      elements.attachmentModal.hidden = true;
      elements.attachmentModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    state.currentAttachmentPreview = null;
  }

  // ==========================================================================
  // Voice Recording
  // ==========================================================================
  
  async function startVoiceRecording() {
    try {
      // Close attachment menu
      elements.attachmentMenu.hidden = true;

      // Check for browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support audio recording');
        return;
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                      MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' :
                      'audio/ogg';
      
      state.mediaRecorder = new MediaRecorder(stream, { mimeType });
      state.audioChunks = [];
      state.transcriptionSegments = [];
      state.lastTranscriptionTime = Date.now();

      // Collect audio chunks
      state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          state.audioChunks.push(event.data);
        }
      };

      // Initialize Speech Recognition (Web Speech API)
      // Note: Works in Chrome, Edge, Safari. Firefox doesn't support it natively.
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        state.recognition = new SpeechRecognition();
        state.recognition.continuous = true;
        state.recognition.interimResults = true;
        state.recognition.lang = 'en-US';
        
        // Handle errors gracefully
        state.recognition.onend = () => {
          // Restart if still recording (browser may auto-stop)
          if (state.isRecording && state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            try {
              state.recognition.start();
            } catch (e) {
              console.warn('Could not restart speech recognition:', e);
            }
          }
        };

        state.recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
              // Store final segment with timestamp
              const currentTime = Date.now();
              const pauseDuration = state.lastTranscriptionTime ? 
                (currentTime - state.lastTranscriptionTime) : 0;
              
              state.transcriptionSegments.push({
                text: transcript.trim(),
                timestamp: currentTime,
                pauseDuration: pauseDuration
              });
              state.lastTranscriptionTime = currentTime;
            } else {
              interimTranscript += transcript;
            }
          }

          // Don't update preview during recording - transcription will show after recording stops
        };

        state.recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          // Don't stop recording on recognition errors
          // Some errors are recoverable (e.g., 'no-speech' when user pauses)
          if (event.error === 'not-allowed') {
            console.warn('Microphone permission denied for speech recognition');
          }
        };

        try {
          state.recognition.start();
        } catch (error) {
          console.warn('Could not start speech recognition:', error);
          // Continue recording even if transcription fails
        }
      } else {
        console.warn('Speech recognition not available in this browser. Recording will continue without live transcription.');
      }

      // Start recording
      state.mediaRecorder.start(1000); // Collect data every second
      state.isRecording = true;
      state.recordingStartTime = Date.now();

      // Show recording UI
      if (elements.voiceRecordingContainer) {
        elements.voiceRecordingContainer.hidden = false;
      }

      // Start timer
      startRecordingTimer();

      // Start waveform visualization
      startWaveformVisualization(stream);

      console.log('Voice recording started');
    } catch (error) {
      console.error('Error starting voice recording:', error);
      showError('Failed to start recording. Please check microphone permissions.');
      stopVoiceRecording();
    }
  }

  function stopVoiceRecording() {
    if (!state.isRecording) return;

    state.isRecording = false;

    // Stop MediaRecorder
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }

    // Stop Speech Recognition
    if (state.recognition) {
      state.recognition.stop();
    }

    // Stop all tracks
    if (state.mediaRecorder && state.mediaRecorder.stream) {
      state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    // Stop timer
    if (state.recordingTimer) {
      clearInterval(state.recordingTimer);
      state.recordingTimer = null;
    }

    // Process recording
    processVoiceRecording();
  }

  async function processVoiceRecording() {
    try {
      // Wait for MediaRecorder to finish
      await new Promise((resolve) => {
        if (state.mediaRecorder) {
          state.mediaRecorder.onstop = resolve;
          // If already stopped, resolve immediately
          if (state.mediaRecorder.state === 'inactive') {
            resolve();
          }
        } else {
          resolve();
        }
      });

      // Create audio blob
      const audioBlob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType });
      
      // Format transcription with paragraph breaks
      const formattedTranscription = formatTranscriptionWithPauses(state.transcriptionSegments);

      // Create file from blob
      const fileExtension = state.mediaRecorder.mimeType.split('/')[1] || 'webm';
      const fileName = `voice-recording-${Date.now()}.${fileExtension}`;
      const audioFile = new File([audioBlob], fileName, { type: state.mediaRecorder.mimeType });

      // Add to attachments with transcription
      state.attachments.push({
        file: audioFile,
        type: 'audio',
        preview: null,
        transcription: formattedTranscription || null,
        isVoiceRecording: true
      });

      // Show transcription preview with final formatted transcription
      // Update the segments first so formatTranscriptionWithPauses can use them
      if (formattedTranscription && formattedTranscription.trim()) {
        // Update preview content directly since we already have formatted transcription
        if (elements.voiceRecordingTranscriptionPreview && elements.transcriptionPreviewContent) {
          elements.voiceRecordingTranscriptionPreview.hidden = false;
          elements.transcriptionPreviewContent.innerHTML = formattedTranscription
            .split('\n\n')
            .map(para => {
              const paraWithBreaks = para.replace(/\n/g, '<br>');
              return `<p>${escapeHtml(paraWithBreaks)}</p>`;
            })
            .join('');
        }
        // Keep recording UI visible to show transcription
      } else {
        // Hide recording UI if no transcription
        if (elements.voiceRecordingContainer) {
          elements.voiceRecordingContainer.hidden = true;
        }
        if (elements.voiceRecordingTranscriptionPreview) {
          elements.voiceRecordingTranscriptionPreview.hidden = true;
        }
      }

      // Render attachments
      renderAttachments();

      // Reset state
      state.audioChunks = [];
      state.transcriptionSegments = [];
      state.lastTranscriptionTime = null;
      state.mediaRecorder = null;
      state.recognition = null;

      console.log('Voice recording processed');
    } catch (error) {
      console.error('Error processing voice recording:', error);
      showError('Failed to process recording');
    }
  }

  function formatTranscriptionWithPauses(segments) {
    if (!segments || segments.length === 0) {
      return '';
    }

    const PAUSE_THRESHOLD = 1500; // 1.5 seconds for paragraph break
    const SENTENCE_PAUSE = 800; // 0.8 seconds for sentence break

    let formatted = '';
    let currentParagraph = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const pause = segment.pauseDuration || 0;

      currentParagraph.push(segment.text);

      // Check if we should break paragraph
      if (pause > PAUSE_THRESHOLD && i < segments.length - 1) {
        // End current paragraph
        if (currentParagraph.length > 0) {
          formatted += currentParagraph.join(' ') + '\n\n';
          currentParagraph = [];
        }
      } else if (pause > SENTENCE_PAUSE && i < segments.length - 1) {
        // Add sentence break
        currentParagraph.push('\n');
      }
    }

    // Add remaining paragraph
    if (currentParagraph.length > 0) {
      formatted += currentParagraph.join(' ');
    }

    return formatted.trim();
  }

  function updateTranscriptionPreview() {
    if (!elements.transcriptionPreviewContent || !elements.voiceRecordingTranscriptionPreview) return;

    const formatted = formatTranscriptionWithPauses(state.transcriptionSegments);
    
    if (formatted && formatted.trim()) {
      elements.voiceRecordingTranscriptionPreview.hidden = false;
      // Format with line breaks - paragraphs get <p> tags, sentence breaks get <br>
      elements.transcriptionPreviewContent.innerHTML = formatted
        .split('\n\n')
        .map(para => {
          // Replace sentence breaks (\n) with <br> tags within paragraphs
          const paraWithBreaks = para.replace(/\n/g, '<br>');
          return `<p>${escapeHtml(paraWithBreaks)}</p>`;
        })
        .join('');
    } else {
      // Hide if no transcription
      elements.voiceRecordingTranscriptionPreview.hidden = true;
      elements.transcriptionPreviewContent.innerHTML = '';
    }
  }

  function startRecordingTimer() {
    state.recordingStartTime = Date.now();
    
    state.recordingTimer = setInterval(() => {
      if (!state.isRecording) {
        clearInterval(state.recordingTimer);
        return;
      }

      const elapsed = Date.now() - state.recordingStartTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      
      if (elements.voiceRecordingTimer) {
        elements.voiceRecordingTimer.textContent = 
          `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }, 100);
  }

  function startWaveformVisualization(stream) {
    if (!elements.voiceRecordingWaveform) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    analyser.fftSize = 256;
    microphone.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      if (!state.isRecording) return;

      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Create simple waveform visualization
      const bars = 20;
      const barWidth = 100 / bars;
      let waveformHtml = '';

      for (let i = 0; i < bars; i++) {
        const index = Math.floor((i / bars) * bufferLength);
        const value = dataArray[index];
        const height = (value / 255) * 100;
        
        waveformHtml += `<div class="waveform-bar" style="height: ${Math.max(height, 5)}%; width: ${barWidth}%;"></div>`;
      }

      if (elements.voiceRecordingWaveform) {
        elements.voiceRecordingWaveform.innerHTML = waveformHtml;
      }
    }

    draw();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // Check auth
    const authorized = await checkAuth();
    if (!authorized) return;

    // Ensure attachment modal is hidden on initialization
    if (elements.attachmentModal) {
      elements.attachmentModal.hidden = true;
      elements.attachmentModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    // Initialize markdown editor
    initMarkdownEditor();

    // Load notes
    await loadNotes();

    // Render user profile
    renderUserProfile();

    // Setup event listeners
    setupEventListeners();

    console.log('Notes interface initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
