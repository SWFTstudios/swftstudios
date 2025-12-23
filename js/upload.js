/**
 * SWFT Thought Sessions Chat Interface
 * 
 * Chat messenger-style Thought Session creation with threads, auto-tagging, and multi-format support
 * Messages are called "Ideas" - individual text, URLs, images, videos, and audio files
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
    isRecordingVideo: false,
    mediaRecorder: null,
    videoRecorder: null,
    audioChunks: [],
    videoChunks: [],
    recordingStartTime: null,
    recordingTimer: null,
    recognition: null, // Speech recognition
    transcriptionSegments: [],
    liveTranscriptionText: '', // Accumulated final transcription
    interimTranscriptionText: '', // Current interim transcription
    lastTranscriptionTime: null,
    recordingStream: null, // Track the active media stream
    currentMessageMenu: null, // Currently open message menu
    editingMessage: null // Message being edited
  };

  // ==========================================================================
  // Helper Functions (defined early for hoisting)
  // ==========================================================================
  
  /**
   * Get tag color from settings
   */
  function getTagColor(tag) {
    if (window.Settings && window.Settings.getTagColor) {
      return window.Settings.getTagColor(tag);
    }
    // Fallback to default colors
    const defaultColors = {
      'design': '#BEFFF2',
      'idea': '#10b981',
      'personal': '#8b5cf6',
      'tech': '#3b82f6',
      'business': '#f59e0b',
      'tutorial': '#ef4444'
    };
    const normalizedTag = tag.toLowerCase();
    return defaultColors[normalizedTag] || '#BEFFF2';
  }
  
  /**
   * Get contrast color (black or white) for text on colored background
   */
  function getContrastColor(hexColor) {
    if (!hexColor) return '#000000';
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Debug: Verify functions are defined (remove after confirming fix)
  console.log('[Helper Functions] getTagColor defined:', typeof getTagColor === 'function');
  console.log('[Helper Functions] getContrastColor defined:', typeof getContrastColor === 'function');
  console.log('[Helper Functions] escapeHtml defined:', typeof escapeHtml === 'function');

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
    audioRecordBtn: document.getElementById('audio-record-btn'),
    imageFileInput: document.getElementById('image-file-input'),
    audioFileInput: document.getElementById('audio-file-input'),
    videoFileInput: document.getElementById('video-file-input'),
    fileInput: document.getElementById('file-input'),
    attachmentModal: document.getElementById('attachment-modal'),
    attachmentModalClose: document.getElementById('attachment-modal-close'),
    attachmentModalBody: document.getElementById('attachment-modal-body'),
    attachmentModalTitle: document.getElementById('attachment-modal-title'),
    attachmentDownloadBtn: document.getElementById('attachment-download-btn'),
    transcriptModal: document.getElementById('transcript-modal'),
    transcriptModalClose: document.getElementById('transcript-modal-close'),
    transcriptModalBody: document.getElementById('transcript-modal-body'),
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
      console.log('[FIX] loadNotes: Starting, user ID:', state.currentUser?.id);
      
      // Try to select WITHOUT messages column first to avoid the error
      // We'll add messages as empty arrays in memory for compatibility
      let { data, error } = await state.supabase
        .from('notes')
        .select('id, title, updated_at, created_at, content')
        .eq('user_id', state.currentUser.id)
        .order('updated_at', { ascending: false });

      console.log('[FIX] loadNotes: Query result:', { hasData: !!data, dataLength: data?.length, hasError: !!error, errorCode: error?.code });

      if (error) {
        console.error('[FIX] loadNotes: Query failed:', error);
        throw error;
      }

      // Parse messages from content field if stored as JSON, or create from content
      if (data) {
        data = data.map(note => {
          let messages = [];
          
          // Try to parse messages from content if it's JSON
          if (note.content) {
            try {
              const parsed = JSON.parse(note.content);
              if (Array.isArray(parsed)) {
                messages = parsed;
              } else {
                // Content is plain text, create a message from it
                messages = [{
                  id: crypto.randomUUID(),
                  content: note.content,
                  attachments: [],
                  tags: note.tags || [],
                  created_at: note.created_at
                }];
              }
            } catch (e) {
              // Content is not JSON, create message from it
              messages = [{
                id: crypto.randomUUID(),
                content: note.content,
                attachments: [],
                tags: note.tags || [],
                created_at: note.created_at
              }];
            }
          }
          
          return { 
            ...note, 
            messages: messages
          };
        });
        console.log('[FIX] loadNotes: Processed notes, total:', data.length);
      }

      state.notes = data || [];
      
      // Notes are already processed with messages arrays from content field above
      // No need for additional migration here

      renderNotesList();
      
      // If no note is selected and notes exist, select the first one
      if (!state.currentNote && state.notes.length > 0) {
        await selectNote(state.notes[0].id);
      } else if (state.notes.length === 0) {
        renderEmptyState('no-notes');
      }
    } catch (error) {
      console.error('[FIX] Error loading notes:', error);
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
      // Verify helper functions are available before proceeding
      if (typeof getTagColor !== 'function' || typeof getContrastColor !== 'function' || typeof escapeHtml !== 'function') {
        console.error('[selectNote] Helper functions not available:', {
          getTagColor: typeof getTagColor,
          getContrastColor: typeof getContrastColor,
          escapeHtml: typeof escapeHtml
        });
        console.warn('[selectNote] This may be a browser caching issue. Please hard refresh (Cmd+Shift+R or Ctrl+Shift+R)');
        // Don't proceed if functions aren't available
        return;
      }

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
      console.error('Error stack:', error.stack);
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
      console.log('[FIX] createNewNote: Starting');
      
      // Verify user is authenticated
      if (!state.currentUser || !state.currentUser.id) {
        console.error('[FIX] createNewNote: No authenticated user');
        showError('You must be logged in to create notes');
        return null;
      }
      
      // Verify Supabase client
      if (!state.supabase) {
        console.error('[FIX] createNewNote: Supabase client not initialized');
        showError('Database connection error');
        return null;
      }
      
      // Get authenticated user - this ensures the token is valid and matches auth.uid()
      const { data: { user: authUser }, error: authError } = await state.supabase.auth.getUser();
      if (authError) {
        console.error('[FIX] createNewNote: Auth error:', authError);
        showError('Authentication error. Please log in again.');
        return null;
      }
      
      if (!authUser) {
        console.error('[FIX] createNewNote: No authenticated user');
        showError('Session expired. Please log in again.');
        return null;
      }
      
      // Get session for email
      const { data: { session } } = await state.supabase.auth.getSession();
      
      console.log('[FIX] createNewNote: Auth user ID:', authUser.id);
      console.log('[FIX] createNewNote: Auth user email:', authUser.email);
      console.log('[FIX] createNewNote: Session token present:', !!session?.access_token);
      
      // Build payload WITHOUT messages column to avoid errors
      // Use authUser.id which is guaranteed to match auth.uid() in RLS policies
      const insertPayload = {
        user_id: authUser.id, // This MUST match auth.uid() for RLS to pass
        user_email: authUser.email || session?.user?.email,
        title: 'New Note',
        status: 'draft'
      };
      
      console.log('[FIX] createNewNote: Inserting note with payload:', insertPayload);
      console.log('[FIX] createNewNote: Payload user_id (UUID):', insertPayload.user_id);
      console.log('[FIX] createNewNote: Payload user_id type:', typeof insertPayload.user_id);
      
      const { data, error } = await state.supabase
        .from('notes')
        .insert(insertPayload)
        .select()
        .single();

      console.log('[FIX] createNewNote: Result:', { 
        hasData: !!data, 
        hasError: !!error, 
        errorCode: error?.code,
        errorMessage: error?.message,
        errorDetails: error?.details,
        errorHint: error?.hint
      });

      if (error) {
        console.error('[FIX] createNewNote: Error:', error);
        throw error;
      }

      // Add empty messages array for compatibility
      if (data) {
        data.messages = [];
        // Initialize content as empty JSON array for messages
        if (!data.content) {
          data.content = '[]';
        }
        console.log('[FIX] createNewNote: Success, note ID:', data.id);
      }

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
    // Verify helper functions are available at the start
    if (typeof getTagColor !== 'function' || typeof getContrastColor !== 'function' || typeof escapeHtml !== 'function') {
      console.error('[renderMessages] Helper functions not available - this is a critical error');
      console.error('[renderMessages] Functions status:', {
        getTagColor: typeof getTagColor,
        getContrastColor: typeof getContrastColor,
        escapeHtml: typeof escapeHtml
      });
      // Show error to user
      if (elements.messagesList) {
        elements.messagesList.innerHTML = `
          <div class="error-message" style="padding: 2rem; text-align: center; color: #ef4444;">
            <p>Error: Helper functions not loaded. Please refresh the page (Cmd+Shift+R or Ctrl+Shift+R).</p>
          </div>
        `;
      }
      return;
    }

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
      
      const messageIndex = messages.indexOf(msg);
      return `
        <div class="message" data-message-id="${msg.id}" data-message-index="${messageIndex}">
          <div class="message-bubble ${msg.content ? 'has-content' : ''}">
            <div class="message-header">
              <div class="message-header-left">
                <span class="message-author">${escapeHtml(author)}</span>
                <span class="message-time">${formatTime(timestamp)}</span>
              </div>
              <button type="button" class="message-menu-btn" data-message-id="${msg.id}" aria-label="Message options">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
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
                  return renderAttachment(attachmentWithTranscription, idx, messages);
                }).join('')}
              </div>
            ` : ''}
            
            ${msg.tags && msg.tags.length > 0 ? `
              <div class="message-tags">
                ${msg.tags.map(tag => {
                  // Defensive check: ensure functions are available
                  const tagColor = (typeof getTagColor === 'function') 
                    ? getTagColor(tag) 
                    : '#BEFFF2'; // fallback color
                  const contrastColor = (typeof getContrastColor === 'function')
                    ? getContrastColor(tagColor)
                    : '#ffffff'; // fallback to white text
                  const safeTag = (typeof escapeHtml === 'function')
                    ? escapeHtml(tag)
                    : String(tag).replace(/[&<>"']/g, (m) => {
                        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
                        return map[m];
                      });
                  return `<span class="message-tag" style="background-color: ${tagColor}; color: ${contrastColor}">${safeTag}</span>`;
                }).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for message menu buttons
    elements.messagesList.querySelectorAll('.message-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const messageId = btn.getAttribute('data-message-id');
        const message = messages.find(m => m.id === messageId);
        if (message) {
          showMessageMenu(message, btn);
        }
      });
    });

    // Close message menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.message-menu-btn') && !e.target.closest('.message-menu')) {
        hideMessageMenu();
      }
    });
  }

  // ==========================================================================
  // Message Menu Functions
  // ==========================================================================

  /**
   * Show message menu for editing/tagging
   */
  function showMessageMenu(message, button) {
    // Hide any existing menu
    hideMessageMenu();
    
    // Create menu element
    const menu = document.createElement('div');
    menu.className = 'message-menu';
    menu.setAttribute('role', 'menu');
    
    // Position menu near button
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left}px`;
    menu.style.zIndex = '1000';
    
    menu.innerHTML = `
      <button type="button" class="message-menu-item" data-action="edit" role="menuitem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit
      </button>
      <button type="button" class="message-menu-item" data-action="tags" role="menuitem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
          <line x1="7" y1="7" x2="7.01" y2="7"></line>
        </svg>
        Tags
      </button>
    `;
    
    // Add click handlers
    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editMessage(message);
      hideMessageMenu();
    });
    
    menu.querySelector('[data-action="tags"]').addEventListener('click', () => {
      showTagDialog(message);
      hideMessageMenu();
    });
    
    // Store reference
    state.currentMessageMenu = { menu, message, button };
    
    // Add to DOM
    document.body.appendChild(menu);
  }

  /**
   * Hide message menu
   */
  function hideMessageMenu() {
    if (state.currentMessageMenu && state.currentMessageMenu.menu) {
      state.currentMessageMenu.menu.remove();
      state.currentMessageMenu = null;
    }
  }

  /**
   * Edit a message
   */
  function editMessage(message) {
    if (!message) return;
    
    state.editingMessage = message;
    
    // Load message content into editor
    if (editor) {
      editor.setValue(message.content || '');
      editor.focus();
    } else if (elements.messageInput) {
      elements.messageInput.value = message.content || '';
      elements.messageInput.focus();
      autoExpandTextarea();
    }
    
    // Load attachments if any
    if (message.attachments && message.attachments.length > 0) {
      // Note: Attachments are already displayed in the message, 
      // but we can't easily re-upload them, so we'll just show the content
      console.log('Editing message with attachments:', message.attachments.length);
    }
  }

  /**
   * Show tag dialog for a message
   */
  function showTagDialog(message) {
    if (!message) return;
    
    // Get current tags
    const currentTags = message.tags || [];
    
    // Create simple prompt for now (can be enhanced with a modal later)
    const tagInput = prompt('Enter tags (comma-separated):', currentTags.join(', '));
    if (tagInput !== null) {
      const tags = tagInput.split(',').map(t => t.trim()).filter(t => t);
      updateMessageTags(message.id, tags);
    }
  }

  /**
   * Update message tags
   */
  async function updateMessageTags(messageId, tags) {
    try {
      await updateMessageInDatabase(messageId, { tags });
      // Reload messages to show updated tags
      if (state.currentNote) {
        await loadMessages(state.currentNote.id);
      }
    } catch (error) {
      console.error('Error updating message tags:', error);
      showError('Failed to update tags');
    }
  }

  /**
   * Update message content
   */
  async function updateMessageContent(messageId, content) {
    try {
      await updateMessageInDatabase(messageId, { content });
      // Reload messages to show updated content
      if (state.currentNote) {
        await loadMessages(state.currentNote.id);
      }
    } catch (error) {
      console.error('Error updating message content:', error);
      throw error;
    }
  }

  /**
   * Update message in database
   */
  async function updateMessageInDatabase(messageId, updates) {
    if (!state.currentNote || !state.supabase) {
      throw new Error('No current note or Supabase client');
    }
    
    // Get current messages
    const messages = state.currentNote.messages || [];
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex === -1) {
      throw new Error('Message not found');
    }
    
    // Update message
    messages[messageIndex] = {
      ...messages[messageIndex],
      ...updates
    };
    
    // Update note in database
    const { error } = await state.supabase
      .from('notes')
      .update({
        content: JSON.stringify(messages)
      })
      .eq('id', state.currentNote.id)
      .eq('user_id', state.currentUser.id);
    
    if (error) throw error;
    
    // Update local state
    state.currentNote.messages = messages;
    state.messages = messages;

    // Add click handlers for attachment previews (images and videos)
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

    // Add click handlers for audio play buttons
    elements.messagesList.querySelectorAll('.audio-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const audioId = btn.getAttribute('data-audio-id');
        const audio = document.getElementById(audioId);
        if (!audio) return;

        const playIcon = btn.querySelector('.play-icon');
        const pauseIcon = btn.querySelector('.pause-icon');

        if (audio.paused) {
          audio.play();
          playIcon.style.display = 'none';
          pauseIcon.style.display = 'block';
        } else {
          audio.pause();
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
        }
      });
    });

    // Add event listeners for audio elements to update play button state
    elements.messagesList.querySelectorAll('audio').forEach(audio => {
      audio.addEventListener('play', () => {
        const btn = elements.messagesList.querySelector(`.audio-play-btn[data-audio-id="${audio.id}"]`);
        if (btn) {
          const playIcon = btn.querySelector('.play-icon');
          const pauseIcon = btn.querySelector('.pause-icon');
          playIcon.style.display = 'none';
          pauseIcon.style.display = 'block';
        }
      });
      audio.addEventListener('pause', () => {
        const btn = elements.messagesList.querySelector(`.audio-play-btn[data-audio-id="${audio.id}"]`);
        if (btn) {
          const playIcon = btn.querySelector('.play-icon');
          const pauseIcon = btn.querySelector('.pause-icon');
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
        }
      });
      audio.addEventListener('loadedmetadata', () => {
        const durationEl = elements.messagesList.querySelector(`.audio-duration[data-audio-id="${audio.id}"]`);
        if (durationEl && !isNaN(audio.duration)) {
          const minutes = Math.floor(audio.duration / 60);
          const seconds = Math.floor(audio.duration % 60);
          durationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      });
    });

    // Add click handlers for transcript buttons
    elements.messagesList.querySelectorAll('.audio-transcript-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Get message index and attachment URL to find the full transcription
        const messageIndex = parseInt(btn.getAttribute('data-message-index') || '-1');
        const attachmentUrl = btn.getAttribute('data-attachment-url');
        
        if (messageIndex >= 0 && state.messages[messageIndex]) {
          const message = state.messages[messageIndex];
          if (message.attachments) {
            const attachment = message.attachments.find(att => att.url === attachmentUrl);
            if (attachment && attachment.transcription) {
              const fullTranscription = attachment.transcription;
              console.log('[Transcript] Retrieved full transcript from state:', {
                length: fullTranscription.length,
                preview: fullTranscription.substring(0, 150),
                hasParagraphs: fullTranscription.includes('\n\n')
              });
              showTranscriptModal(fullTranscription);
              return;
            }
          }
        }
        
        // Fallback: try to get from data attribute (for backwards compatibility)
        const transcription = btn.getAttribute('data-transcription');
        if (transcription) {
          showTranscriptModal(transcription);
        } else {
          showError('Transcript not found');
        }
      });
    });

    // Add click handlers for transcribe buttons
    elements.messagesList.querySelectorAll('.audio-transcribe-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const audioUrl = btn.getAttribute('data-audio-url');
        const attachmentIndex = parseInt(btn.getAttribute('data-attachment-index'));
        if (audioUrl) {
          await transcribeAudioFile(audioUrl, attachmentIndex, btn);
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

  /**
   * Render a thumbnail/icon for an attachment in the message list
   * Used to show file type indicators when message has no text content
   */
  function renderAttachmentThumbnail(attachment, index = 0) {
    const attachmentId = `attachment-thumb-${index}`;
    
    if (attachment.type === 'image') {
      return `
        <div class="attachment-thumbnail attachment-thumbnail-image" data-attachment-id="${attachmentId}">
          <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name || 'Image')}" loading="lazy">
          <div class="attachment-thumbnail-overlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
        </div>
      `;
    } else if (attachment.type === 'audio') {
      return `
        <div class="attachment-thumbnail attachment-thumbnail-audio" data-attachment-id="${attachmentId}">
          <div class="attachment-thumbnail-icon audio-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>
          <span class="attachment-thumbnail-label">Audio</span>
        </div>
      `;
    } else if (attachment.type === 'video') {
      return `
        <div class="attachment-thumbnail attachment-thumbnail-video" data-attachment-id="${attachmentId}">
          <div class="attachment-thumbnail-icon video-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <span class="attachment-thumbnail-label">Video</span>
        </div>
      `;
    } else {
      // File attachment
      const fileExtension = attachment.name ? attachment.name.split('.').pop().toLowerCase() : 'file';
      const isTextFile = ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'csv'].includes(fileExtension);
      
      return `
        <div class="attachment-thumbnail attachment-thumbnail-file" data-attachment-id="${attachmentId}">
          <div class="attachment-thumbnail-icon file-icon ${isTextFile ? 'text-file' : ''}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
          </div>
          <span class="attachment-thumbnail-label">${escapeHtml(attachment.name || 'File')}</span>
        </div>
      `;
    }
  }

  function renderAttachment(attachment, index = 0, messages = null) {
    const attachmentId = `attachment-${index}`;
    // Get messages from state if not provided
    if (!messages) {
      messages = state.messages || [];
    }
    
    if (attachment.type === 'image') {
      return `
        <div class="attachment-item attachment-image" data-attachment-id="${attachmentId}" role="button" tabindex="0">
          <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name || 'Image')}" loading="lazy" class="attachment-thumbnail-img">
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
      const audioId = `audio-${index}-${Date.now()}`;
      
      // Find message index for this attachment
      const messageIndex = messages.findIndex(m => 
        m.attachments && m.attachments.some(a => a.url === attachment.url)
      );
      
      return `
        <div class="attachment-item attachment-audio ${isVoiceRecording ? 'voice-recording' : ''}" data-audio-id="${audioId}">
          <audio id="${audioId}" src="${escapeHtml(attachment.url)}" preload="metadata"></audio>
          <div class="audio-player">
            <div class="audio-player-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </div>
            <button type="button" class="audio-play-btn" data-audio-id="${audioId}" aria-label="Play audio">
              <svg class="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <svg class="pause-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            <div class="audio-info">
              <div class="audio-name">${escapeHtml(attachment.name || 'Audio recording')}</div>
              <div class="audio-duration" data-audio-id="${audioId}">--:--</div>
            </div>
            ${hasTranscription ? `
              <button type="button" class="audio-transcript-btn" data-message-index="${messageIndex}" data-attachment-url="${escapeHtml(attachment.url)}" aria-label="View formatted transcript" style="display: none;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>View Formatted Transcript</span>
              </button>
            ` : `
              <button type="button" class="audio-transcribe-btn" data-audio-url="${escapeHtml(attachment.url)}" data-attachment-index="${index}" aria-label="Transcribe audio">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                <span>Transcribe</span>
              </button>
            `}
          </div>
        </div>
      `;
    } else if (attachment.type === 'video') {
      return `
        <div class="attachment-item attachment-video" data-attachment-id="${attachmentId}" role="button" tabindex="0">
          <div class="attachment-video-thumbnail">
            <video src="${escapeHtml(attachment.url)}" preload="metadata" muted></video>
            <div class="attachment-video-play-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
            <div class="attachment-video-label">Video</div>
          </div>
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
      const fileExtension = attachment.name ? attachment.name.split('.').pop().toLowerCase() : 'file';
      const isTextFile = ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'csv', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(fileExtension);
      const isCodeFile = ['js', 'ts', 'html', 'css', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'json'].includes(fileExtension);
      
      return `
        <div class="attachment-item attachment-file">
          <div class="attachment-file-icon ${isTextFile ? 'text-file' : ''} ${isCodeFile ? 'code-file' : ''}">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            ${isTextFile ? '<span class="file-type-badge">TXT</span>' : ''}
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

  async function handleAttachmentType(type) {
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
      case 'video-record':
        await startVideoRecording();
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
    
    // If editing a message, handle update instead of new message
    if (state.editingMessage) {
      if (!content && state.attachments.length === 0) {
        state.editingMessage = null;
        if (editor) {
          editor.setValue('');
        } else {
          elements.messageInput.value = '';
        }
        return;
      }

      state.isSubmitting = true;
      setLoading(true);

      try {
        await updateMessageContent(state.editingMessage.id, content);
        
        // Clear editing state
        state.editingMessage = null;
        if (editor) {
          editor.setValue('');
        } else {
          elements.messageInput.value = '';
        }
        state.attachments = [];
        renderAttachments();
        
        showSuccess('Message updated successfully');
      } catch (error) {
        console.error('Error updating message:', error);
        showError('Failed to update message');
      } finally {
        state.isSubmitting = false;
        setLoading(false);
      }
      return;
    }
    
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

      // Update WITHOUT messages column to avoid errors
      // Store messages array as JSON string in content field for persistence
      const updatePayload = {
        updated_at: new Date().toISOString(),
        content: JSON.stringify(messagesWithTranscription), // Store messages array as JSON
        title: title,
        tags: tags,
        content_type: contentType,
        file_urls: fileUrls,
        external_links: externalLinks
      };
      
      console.log('[FIX] submitMessage: Updating note:', state.currentNote.id);
      
      const { data: updatedNote, error: updateError } = await state.supabase
        .from('notes')
        .update(updatePayload)
        .eq('id', state.currentNote.id)
        .select()
        .single();

      console.log('[FIX] submitMessage: Update result:', { hasData: !!updatedNote, hasError: !!updateError });

      if (updateError) {
        console.error('[FIX] submitMessage: Update error:', updateError);
        throw updateError;
      }

      // Parse messages back from JSON string and add to response
      if (updatedNote) {
        try {
          updatedNote.messages = JSON.parse(updatedNote.content || '[]');
        } catch (e) {
          // If parsing fails, use the messages we just created
          updatedNote.messages = messagesWithTranscription;
        }
        console.log('[FIX] submitMessage: Update succeeded, messages count:', updatedNote.messages.length);
      }

      // Update local state
      state.currentNote = updatedNote;
      state.messages = updatedNote.messages || [];
      
      // Update the note in the notes array without full reload
      const noteIndex = state.notes.findIndex(n => n.id === updatedNote.id);
      if (noteIndex !== -1) {
        state.notes[noteIndex] = updatedNote;
        renderNotesList();
      } else {
        // If note not in list, reload all notes
        await loadNotes();
      }
      
      // Re-render messages
      renderMessages();
      updateNoteHeader();
      
      // Scroll to bottom
      scrollToBottom();
      
      console.log('[FIX] submitMessage: Message submitted successfully');

      // Clear form (unless editing a message)
      if (!state.editingMessage) {
        if (editor) {
          editor.setValue('');
        } else {
          elements.messageInput.value = '';
        }
        state.attachments = [];
        renderAttachments();
        window.AutoTagger?.hideSuggestions();
      } else {
        // If editing, update the message instead
        const content = editor ? editor.getValue().trim() : elements.messageInput.value.trim();
        if (content) {
          await updateMessageContent(state.editingMessage.id, content);
        }
        state.editingMessage = null;
        if (editor) {
          editor.setValue('');
        } else {
          elements.messageInput.value = '';
        }
      }

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

  function showSuccess(message) {
    // Create or update a success notification
    let notification = document.getElementById('success-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'success-notification';
      notification.className = 'notification notification-success';
      document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.style.display = 'block';
    notification.style.opacity = '1';
    
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 300);
    }, 3000);
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

  // escapeHtml is now defined earlier in the file (moved to helper functions section)

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
        autoExpandTextarea();

        // Auto-create note if typing in empty state
        if (!state.currentNote && elements.messageInput.value.trim().length > 0) {
          createNewNote();
        }

        // Auto-suggest tags
        if (window.AutoTagger) {
          if (window.AutoTagger.autoSuggest) {
            window.AutoTagger.autoSuggest(elements.messageInput.value);
          } else if (window.AutoTagger.extractKeywords) {
            const tags = window.AutoTagger.extractKeywords(elements.messageInput.value);
            if (tags.length > 0) {
              window.AutoTagger.showSuggestions(tags);
            }
          }
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
        if (state.isRecording) {
          stopVoiceRecording();
        } else if (state.isRecordingVideo) {
          stopVideoRecording();
        }
      });
    }

    // Check webcam availability and show/hide video record button
    checkWebcamAvailability().then(hasWebcam => {
      const videoRecordBtn = document.getElementById('video-record-btn');
      if (videoRecordBtn) {
        videoRecordBtn.hidden = !hasWebcam;
      }
    });

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
          if (window.AutoTagger.autoSuggest) {
            window.AutoTagger.autoSuggest(editor.getValue());
          } else if (window.AutoTagger.extractKeywords) {
            const tags = window.AutoTagger.extractKeywords(editor.getValue());
            if (tags.length > 0) {
              window.AutoTagger.showSuggestions(tags);
            }
          }
        }
      });
      } else if (elements.messageInput) {
        window.AutoTagger.setupAutoSuggest(elements.messageInput);
      }
    }

    // Audio recording button (replaced preview toggle)
    if (elements.audioRecordBtn) {
      elements.audioRecordBtn.addEventListener('click', () => {
        if (state.isRecording) {
          stopVoiceRecording();
        } else {
          startVoiceRecording();
        }
      });
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
    }

    // Transcript modal close
    if (elements.transcriptModalClose) {
      elements.transcriptModalClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTranscriptModal();
      });
    }
    if (elements.transcriptModal) {
      const backdrop = elements.transcriptModal.querySelector('.transcript-modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideTranscriptModal();
        });
      }
    }

    // Global Escape key handler for modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.attachmentModal && !elements.attachmentModal.hidden) {
          hideAttachmentPreview();
        } else if (elements.transcriptModal && !elements.transcriptModal.hidden) {
          hideTranscriptModal();
        }
      }
    });

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
        // Auto-expand editor
        autoExpandEditor();
        // Trigger auto-tagger if available
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload.js:1310',message:'CodeMirror change handler',data:{hasAutoTagger:!!window.AutoTagger,autoTaggerMethods:window.AutoTagger?Object.keys(window.AutoTagger):[],hasAnalyzeText:!!(window.AutoTagger?.analyzeText),hasExtractKeywords:!!(window.AutoTagger?.extractKeywords),hasAutoSuggest:!!(window.AutoTagger?.autoSuggest)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (window.AutoTagger) {
          if (window.AutoTagger.autoSuggest) {
            window.AutoTagger.autoSuggest(editor.getValue());
          } else if (window.AutoTagger.extractKeywords) {
            const tags = window.AutoTagger.extractKeywords(editor.getValue());
            if (tags.length > 0) {
              window.AutoTagger.showSuggestions(tags);
            }
          }
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

  function showTranscriptModal(transcription) {
    if (!elements.transcriptModal || !elements.transcriptModalBody) return;

    // Ensure we have the full transcription (not truncated)
    if (!transcription || !transcription.trim()) {
      showError('No transcript available');
      return;
    }

    console.log('[DEBUG] Showing transcript, length:', transcription.length);

    // Parse transcription as markdown and render it with blog-style formatting
    let transcriptHtml = '';
    if (window.marked) {
      try {
        // Configure marked for blog-style formatting
        const markedOptions = {
          breaks: false, // Don't convert single line breaks to <br>
          gfm: true, // GitHub Flavored Markdown
          headerIds: false, // Don't add IDs to headers
          mangle: false, // Don't mangle email addresses
        };
        
        // Parse markdown
        transcriptHtml = window.marked.parse(transcription, markedOptions);
        
        // Post-process HTML for better blog formatting
        transcriptHtml = enhanceBlogFormatting(transcriptHtml);
      } catch (e) {
        console.error('Error parsing markdown:', e);
        // Fallback to plain text with paragraph formatting
        transcriptHtml = formatPlainTextAsHTML(transcription);
      }
    } else {
      // Fallback to plain text with paragraph formatting
      transcriptHtml = formatPlainTextAsHTML(transcription);
    }

    elements.transcriptModalBody.innerHTML = `
      <div class="transcript-content">
        ${transcriptHtml}
      </div>
    `;

    elements.transcriptModal.hidden = false;
    elements.transcriptModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Scroll to top of modal content
    elements.transcriptModalBody.scrollTop = 0;
  }

  /**
   * Enhance HTML with blog-style formatting
   */
  function enhanceBlogFormatting(html) {
    // Wrap content in article-like structure
    // Ensure paragraphs have proper spacing
    html = html.replace(/<p>/g, '<p class="transcript-paragraph">');
    
    // Add emphasis to first paragraph
    html = html.replace(/<p class="transcript-paragraph">([^<]+)/, '<p class="transcript-paragraph transcript-lead">$1');
    
    return html;
  }

  /**
   * Format plain text transcript as HTML paragraphs
   */
  function formatPlainTextAsHTML(text) {
    return text
      .split('\n\n')
      .map(para => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        // Clean up the text
        const cleaned = trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        return `<p class="transcript-paragraph">${escapeHtml(cleaned)}</p>`;
      })
      .filter(p => p)
      .join('');
  }

  function hideTranscriptModal() {
    if (elements.transcriptModal) {
      elements.transcriptModal.hidden = true;
      elements.transcriptModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  /**
   * Transcribe an audio file using OpenAI's Whisper model
   * Works in the background - no audio playback required
   * 
   * Uses Whisper via Hugging Face Inference API (free tier available)
   * To use: Set HUGGINGFACE_API_KEY in your Cloudflare environment variables
   * 
   * Alternative options:
   * - Replicate: Set REPLICATE_API_TOKEN
   * - OpenAI API: Set OPENAI_API_KEY
   * 
   * @param {string} audioUrl - URL of the audio file
   * @param {number} attachmentIndex - Index of the attachment in the message
   * @param {HTMLElement} button - The transcribe button element
   */
  async function transcribeAudioFile(audioUrl, attachmentIndex, button) {
    try {
      // Update button to show loading state
      const originalHTML = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
        <span>Transcribing...</span>
      `;

      // Call Cloudflare Worker function for transcription
      // This handles the transcription in the background
      const transcriptionResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioUrl: audioUrl
        })
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        throw new Error(`Transcription failed: ${errorText}`);
      }

      const result = await transcriptionResponse.json();
      
      console.log('[Transcribe] Received transcription result:', {
        transcriptLength: result.transcript?.length || 0,
        segmentsCount: result.segments?.length || 0,
        preview: result.transcript?.substring(0, 100) || 'N/A'
      });
      
      if (!result.transcript || !result.transcript.trim()) {
        throw new Error('No transcription generated - Whisper returned empty result');
      }

      // Ensure we have the complete transcript
      const fullTranscript = result.transcript.trim();
      if (fullTranscript.length < 10) {
        console.warn('[Transcribe] Warning: Very short transcript received:', fullTranscript);
      }

      // Format as markdown with blog-style paragraphs
      const markdownTranscript = formatTranscriptionAsMarkdown(fullTranscript, result.segments);
      
      console.log('[Transcribe] Formatted markdown length:', markdownTranscript.length);
      
      // Validate transcript completeness
      if (markdownTranscript.length < fullTranscript.length * 0.5) {
        console.warn('[Transcribe] Warning: Formatted transcript is significantly shorter than original. This may indicate formatting issues.');
      }

      // Find the message and update the attachment
      const messageElement = button.closest('.message');
      const messageIndex = Array.from(elements.messagesList.querySelectorAll('.message')).indexOf(messageElement);
      
      if (messageIndex >= 0 && state.messages[messageIndex]) {
        const message = state.messages[messageIndex];
        if (message.attachments && message.attachments[attachmentIndex]) {
          // Update attachment with transcription
          message.attachments[attachmentIndex].transcription = markdownTranscript;

          // Update in database
          await updateMessageWithTranscript(state.currentNote.id, messageIndex, message.attachments[attachmentIndex]);

          // Re-render messages to show transcript button
          renderMessages();

          // Show success message
          showSuccess('Audio transcribed successfully!');
        }
      }

    } catch (error) {
      console.error('Transcription error:', error);
      showError(`Failed to transcribe audio: ${error.message}. Please ensure transcription service is configured.`);
      button.innerHTML = originalHTML;
      button.disabled = false;
    }
  }

  /**
   * Format transcription as markdown
   * @param {string} transcript - Full transcript text
   * @param {Array} segments - Optional array of transcription segments with timestamps
   * @returns {string} - Formatted markdown transcript
   */
  function formatTranscriptionAsMarkdown(transcript, segments = null) {
    if (!transcript || !transcript.trim()) {
      return '';
    }

    // Clean up transcript
    let cleanedTranscript = transcript.trim();
    
    // Remove "# Audio Transcript" header if present
    cleanedTranscript = cleanedTranscript.replace(/^#\s*Audio\s+Transcript\s*\n*/i, '');
    
    // Remove excessive whitespace
    cleanedTranscript = cleanedTranscript.replace(/\s+/g, ' ');
    
    // If we have segments with timestamps, use them for better paragraph breaks
    if (segments && segments.length > 0) {
      let markdown = '';
      let currentParagraph = [];
      let lastTimestamp = segments[0]?.start || 0;
      const PARAGRAPH_PAUSE = 2000; // 2 seconds pause = new paragraph
      const SENTENCE_PAUSE = 800; // 0.8 seconds = sentence break

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const pause = (segment.start || 0) - lastTimestamp;
        const segmentText = segment.text?.trim() || '';

        if (!segmentText) continue;

        currentParagraph.push(segmentText);

        // If pause is long enough, start a new paragraph
        if (pause > PARAGRAPH_PAUSE && i < segments.length - 1) {
          if (currentParagraph.length > 0) {
            const paraText = currentParagraph.join(' ').trim();
            if (paraText) {
              markdown += formatParagraph(paraText) + '\n\n';
            }
            currentParagraph = [];
          }
        } else if (pause > SENTENCE_PAUSE && i < segments.length - 1) {
          // Add sentence break within paragraph
          const lastItem = currentParagraph.pop();
          if (lastItem) {
            currentParagraph.push(lastItem + '.');
          }
        }

        lastTimestamp = segment.start || lastTimestamp;
      }

      // Add remaining paragraph
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join(' ').trim();
        if (paraText) {
          markdown += formatParagraph(paraText);
        }
      }

      return markdown.trim();
    } else {
      // Format plain text transcript into blog-style paragraphs
      return formatPlainTranscript(cleanedTranscript);
    }
  }

  /**
   * Format a paragraph with proper sentence structure
   */
  function formatParagraph(text) {
    // Ensure proper sentence capitalization
    text = text.trim();
    if (!text) return '';
    
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);
    
    // Ensure sentence ends with punctuation
    if (!/[.!?]$/.test(text)) {
      text += '.';
    }
    
    return text;
  }

  /**
   * Format plain transcript text into blog-style paragraphs
   */
  function formatPlainTranscript(transcript) {
    let markdown = '';
    
    // Split into sentences (period, exclamation, question mark followed by space)
    const sentenceRegex = /([.!?]+\s+)/g;
    const parts = transcript.split(sentenceRegex);
    
    let sentences = [];
    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i]?.trim();
      const punctuation = parts[i + 1]?.trim() || '.';
      if (sentence) {
        sentences.push(sentence + punctuation);
      }
    }
    
    // If splitting didn't work well, try simpler approach
    if (sentences.length === 0) {
      sentences = transcript.split(/[.!?]+\s+/).filter(s => s.trim());
      sentences = sentences.map(s => {
        s = s.trim();
        if (!/[.!?]$/.test(s)) s += '.';
        return s;
      });
    }
    
    // Group sentences into paragraphs (3-5 sentences per paragraph)
    let currentParagraph = [];
    const sentencesPerParagraph = 4;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;
      
      // Capitalize first letter
      const formattedSentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      currentParagraph.push(formattedSentence);
      
      // Start new paragraph every N sentences, or at natural breaks
      const shouldBreak = 
        currentParagraph.length >= sentencesPerParagraph ||
        (i < sentences.length - 1 && shouldStartNewParagraph(sentence, sentences[i + 1]));
      
      if (shouldBreak && i < sentences.length - 1) {
        const paraText = currentParagraph.join(' ').trim();
        if (paraText) {
          markdown += paraText + '\n\n';
        }
        currentParagraph = [];
      }
    }
    
    // Add remaining paragraph
    if (currentParagraph.length > 0) {
      const paraText = currentParagraph.join(' ').trim();
      if (paraText) {
        markdown += paraText;
      }
    }
    
    return markdown.trim();
  }

  /**
   * Determine if we should start a new paragraph based on sentence content
   */
  function shouldStartNewParagraph(currentSentence, nextSentence) {
    // Look for transition words or topic changes
    const transitionWords = [
      'however', 'therefore', 'furthermore', 'moreover', 'additionally',
      'meanwhile', 'consequently', 'nevertheless', 'on the other hand',
      'in addition', 'for example', 'for instance', 'specifically',
      'in conclusion', 'to summarize', 'finally', 'next', 'then'
    ];
    
    const lowerCurrent = currentSentence.toLowerCase();
    const lowerNext = nextSentence.toLowerCase();
    
    // Check if next sentence starts with transition word
    for (const word of transitionWords) {
      if (lowerNext.startsWith(word)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Update message in database with transcription
   * @param {string} noteId - Note ID
   * @param {number} messageIndex - Index of message in messages array
   * @param {Object} attachment - Updated attachment with transcription
   */
  async function updateMessageWithTranscript(noteId, messageIndex, attachment) {
    try {
      // Load current note
      const { data: note, error: loadError } = await state.supabase
        .from('notes')
        .select('content')
        .eq('id', noteId)
        .single();

      if (loadError) throw loadError;

      // Parse messages from content
      let messages = [];
      try {
        messages = JSON.parse(note.content || '[]');
      } catch (e) {
        console.error('Failed to parse messages:', e);
        return;
      }

      // Update attachment in message - ensure full transcript is preserved
      if (messages[messageIndex] && messages[messageIndex].attachments) {
        const attachmentIndex = messages[messageIndex].attachments.findIndex(
          att => att.url === attachment.url
        );
        if (attachmentIndex >= 0) {
          // Store the complete transcription
          const fullTranscription = attachment.transcription || '';
          messages[messageIndex].attachments[attachmentIndex].transcription = fullTranscription;
          
          console.log('[Update] Stored transcript in database:', {
            length: fullTranscription.length,
            preview: fullTranscription.substring(0, 100)
          });
        }
      }

      // Update note in database
      const { error: updateError } = await state.supabase
        .from('notes')
        .update({
          content: JSON.stringify(messages),
          updated_at: new Date().toISOString()
        })
        .eq('id', noteId);

      if (updateError) throw updateError;

      // Update local state
      state.currentNote.content = JSON.stringify(messages);
      state.messages = messages;

    } catch (error) {
      console.error('Failed to update transcript:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Voice Recording
  // ==========================================================================
  
  /**
   * Check if webcam is available
   */
  async function checkWebcamAvailability() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      return videoDevices.length > 0;
    } catch (error) {
      console.error('Error checking webcam:', error);
      return false;
    }
  }

  /**
   * Start video recording with webcam
   */
  async function startVideoRecording() {
    try {
      // Check webcam availability
      const hasWebcam = await checkWebcamAvailability();
      if (!hasWebcam) {
        showError('No webcam detected. Please connect a webcam to record video.');
        return;
      }

      // Close attachment menu
      elements.attachmentMenu.hidden = true;

      // Check for browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support video recording');
        return;
      }

      // Request camera and microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: true 
      });
      state.recordingStream = stream;
      
      // Initialize live transcription state
      state.liveTranscriptionText = '';
      state.interimTranscriptionText = '';
      state.transcriptionSegments = [];
      state.lastTranscriptionTime = Date.now();
      
      // Initialize MediaRecorder for video
      const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' :
                      MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' :
                      'video/webm';
      
      state.videoRecorder = new MediaRecorder(stream, { mimeType });
      state.videoChunks = [];

      // Collect video chunks
      state.videoRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          state.videoChunks.push(event.data);
        }
      };

      // Initialize Speech Recognition for live transcription
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        state.recognition = new SpeechRecognition();
        state.recognition.continuous = true;
        state.recognition.interimResults = true;
        state.recognition.lang = 'en-US';
        
        state.recognition.onend = () => {
          if (state.isRecordingVideo && state.videoRecorder && state.videoRecorder.state !== 'inactive') {
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

          // Update text field with live transcription
          if (finalTranscript) {
            state.liveTranscriptionText += finalTranscript;
            updateLiveTranscription();
          }
          if (interimTranscript) {
            state.interimTranscriptionText = interimTranscript;
            updateLiveTranscription();
          }
        };

        state.recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            console.warn('Microphone permission denied for speech recognition');
          }
        };

        try {
          state.recognition.start();
        } catch (error) {
          console.warn('Could not start speech recognition:', error);
        }
      }

      // Start recording
      state.videoRecorder.start(1000); // Collect data every second
      state.isRecordingVideo = true;
      state.recordingStartTime = Date.now();

      // Show recording UI (reuse voice recording UI)
      if (elements.voiceRecordingContainer) {
        elements.voiceRecordingContainer.hidden = false;
      }

      // Start timer
      startRecordingTimer();

      console.log('Video recording started');
    } catch (error) {
      console.error('Error starting video recording:', error);
      showError('Failed to start video recording. Please check camera and microphone permissions.');
      stopVideoRecording();
    }
  }

  /**
   * Stop video recording
   */
  function stopVideoRecording() {
    if (!state.isRecordingVideo) return;

    state.isRecordingVideo = false;

    // Stop MediaRecorder
    if (state.videoRecorder && state.videoRecorder.state !== 'inactive') {
      state.videoRecorder.stop();
    }

    // Stop Speech Recognition
    if (state.recognition) {
      state.recognition.stop();
    }

    // Stop all tracks
    if (state.recordingStream) {
      state.recordingStream.getTracks().forEach(track => track.stop());
      state.recordingStream = null;
    }

    // Stop timer
    if (state.recordingTimer) {
      clearInterval(state.recordingTimer);
      state.recordingTimer = null;
    }

    // Finalize live transcription
    if (state.interimTranscriptionText) {
      state.liveTranscriptionText += state.interimTranscriptionText;
      state.interimTranscriptionText = '';
      updateLiveTranscription();
    }

    // Process recording
    processVideoRecording();
  }

  /**
   * Process video recording after stop
   */
  async function processVideoRecording() {
    try {
      // Wait for MediaRecorder to finish
      await new Promise((resolve) => {
        if (state.videoRecorder) {
          state.videoRecorder.onstop = resolve;
          if (state.videoRecorder.state === 'inactive') {
            resolve();
          }
        } else {
          resolve();
        }
      });

      // Create video blob
      const videoBlob = new Blob(state.videoChunks, { type: state.videoRecorder.mimeType });
      
      // Use live transcription if available
      let formattedTranscription = '';
      if (state.liveTranscriptionText.trim()) {
        formattedTranscription = state.liveTranscriptionText.trim();
      } else {
        formattedTranscription = formatTranscriptionWithPauses(state.transcriptionSegments);
      }

      // Create video file
      const videoFile = new File([videoBlob], `video-recording-${Date.now()}.webm`, { 
        type: state.videoRecorder.mimeType 
      });

      // Add to attachments
      state.attachments.push({
        file: videoFile,
        type: 'video',
        preview: null,
        transcription: formattedTranscription || null,
        isVideoRecording: true
      });

      // Hide recording UI
      if (elements.voiceRecordingContainer) {
        elements.voiceRecordingContainer.hidden = true;
      }

      // Render attachments
      renderAttachments();

      // Clear recording state
      state.videoRecorder = null;
      state.videoChunks = [];
      state.transcriptionSegments = [];
      state.liveTranscriptionText = '';
      state.interimTranscriptionText = '';

      console.log('Video recording processed');
    } catch (error) {
      console.error('Error processing video recording:', error);
      showError('Failed to process video recording');
    }
  }
  
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
      state.recordingStream = stream;
      
      // Initialize live transcription state
      state.liveTranscriptionText = '';
      state.interimTranscriptionText = '';
      state.transcriptionSegments = [];
      state.lastTranscriptionTime = Date.now();
      
      // Initialize MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                      MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' :
                      'audio/ogg';
      
      state.mediaRecorder = new MediaRecorder(stream, { mimeType });
      state.audioChunks = [];

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

          // Update text field with live transcription
          if (finalTranscript) {
            state.liveTranscriptionText += finalTranscript;
            updateLiveTranscription();
          }
          if (interimTranscript) {
            state.interimTranscriptionText = interimTranscript;
            updateLiveTranscription();
          }
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

      // Update recording button state
      if (elements.audioRecordBtn) {
        elements.audioRecordBtn.classList.add('recording');
        elements.audioRecordBtn.setAttribute('aria-label', 'Stop recording');
      }

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

    // Update recording button state
    if (elements.audioRecordBtn) {
      elements.audioRecordBtn.classList.remove('recording');
      elements.audioRecordBtn.setAttribute('aria-label', 'Record audio');
    }

    // Stop MediaRecorder
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }

    // Stop Speech Recognition
    if (state.recognition) {
      state.recognition.stop();
    }

    // Stop all tracks
    if (state.recordingStream) {
      state.recordingStream.getTracks().forEach(track => track.stop());
      state.recordingStream = null;
    }

    // Stop timer
    if (state.recordingTimer) {
      clearInterval(state.recordingTimer);
      state.recordingTimer = null;
    }

    // Finalize live transcription (remove interim text, keep final)
    if (state.interimTranscriptionText) {
      state.liveTranscriptionText += state.interimTranscriptionText;
      state.interimTranscriptionText = '';
      updateLiveTranscription();
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
      
      // Use live transcription if available, otherwise format from segments
      // This will be saved as the message content, not as attachment.transcription
      let formattedTranscription = '';
      if (state.liveTranscriptionText.trim()) {
        formattedTranscription = state.liveTranscriptionText.trim();
      } else {
        formattedTranscription = formatTranscriptionWithPauses(state.transcriptionSegments);
      }

      // Store transcription in the text field as message content
      // This way it shows up as the message text, not as a separate transcript button
      if (formattedTranscription && formattedTranscription.trim()) {
        if (editor) {
          editor.setValue(formattedTranscription);
        } else if (elements.messageInput) {
          elements.messageInput.value = formattedTranscription;
          autoExpandTextarea();
        }
      }

      // Convert to supported format if needed (Supabase only accepts: audio/mpeg, audio/mp4, audio/wav, audio/x-m4a)
      let audioFile;
      const originalMimeType = state.mediaRecorder.mimeType;
      
      console.log('[FIX] Processing audio recording, original MIME type:', originalMimeType);
      
      if (originalMimeType === 'audio/webm' || originalMimeType === 'audio/ogg') {
        // Convert webm/ogg to WAV (supported format)
        console.log('[FIX] Converting audio from', originalMimeType, 'to audio/wav');
        try {
          const wavBlob = await convertToWav(audioBlob);
          audioFile = new File([wavBlob], `voice-recording-${Date.now()}.wav`, { type: 'audio/wav' });
          console.log('[FIX] Audio conversion successful, WAV file size:', wavBlob.size, 'bytes');
        } catch (conversionError) {
          console.error('[FIX] Audio conversion failed:', conversionError);
          showError('Failed to convert audio format. Please try recording again or contact support.');
          return; // Don't add to attachments if conversion fails
        }
      } else if (['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'].includes(originalMimeType)) {
        // Already in supported format
        const fileExtension = originalMimeType.split('/')[1] || 'mp3';
        audioFile = new File([audioBlob], `voice-recording-${Date.now()}.${fileExtension}`, { type: originalMimeType });
        console.log('[FIX] Audio already in supported format:', originalMimeType);
      } else {
        // Unknown format, try to convert to WAV
        console.log('[FIX] Unknown audio format, converting to WAV:', originalMimeType);
        try {
          const wavBlob = await convertToWav(audioBlob);
          audioFile = new File([wavBlob], `voice-recording-${Date.now()}.wav`, { type: 'audio/wav' });
          console.log('[FIX] Audio conversion successful');
        } catch (conversionError) {
          console.error('[FIX] Audio conversion failed:', conversionError);
          showError('Unable to convert audio to supported format. Please try recording again.');
          return; // Don't add to attachments if conversion fails
        }
      }

      // Add to attachments (transcription is stored in message content, not here)
      // We keep transcription in attachment for reference, but don't show it as a separate button
      state.attachments.push({
        file: audioFile,
        type: 'audio',
        preview: null,
        transcription: formattedTranscription || null, // Keep for reference, but won't show "Read Transcript" button
        isVoiceRecording: true
      });

      // Hide recording UI - transcript is now in the text field as message content
      if (elements.voiceRecordingContainer) {
        elements.voiceRecordingContainer.hidden = true;
      }
      if (elements.voiceRecordingTranscriptionPreview) {
        elements.voiceRecordingTranscriptionPreview.hidden = true;
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

  /**
   * Convert audio blob to WAV format using Web Audio API
   * @param {Blob} audioBlob - Original audio blob (webm, ogg, etc.)
   * @returns {Promise<Blob>} - WAV format blob
   */
  async function convertToWav(audioBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          
          // Check if AudioContext is available
          if (!window.AudioContext && !window.webkitAudioContext) {
            throw new Error('Web Audio API not supported in this browser');
          }
          
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          
          // Decode audio data - this may fail for webm in some browsers
          let audioBuffer;
          try {
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
          } catch (decodeError) {
            console.error('[FIX] decodeAudioData failed:', decodeError);
            // Try creating a new AudioContext and retry once
            const newContext = new (window.AudioContext || window.webkitAudioContext)();
            audioBuffer = await newContext.decodeAudioData(arrayBuffer.slice(0));
          }
          
          // Convert to WAV
          const wavBuffer = audioBufferToWav(audioBuffer);
          const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
          
          // Clean up audio context
          if (audioContext.state !== 'closed') {
            await audioContext.close();
          }
          
          resolve(wavBlob);
        } catch (error) {
          console.error('[FIX] convertToWav error:', error);
          reject(new Error(`Audio conversion failed: ${error.message}`));
        }
      };
      
      reader.onerror = (error) => {
        console.error('[FIX] FileReader error:', error);
        reject(new Error('Failed to read audio file'));
      };
      
      reader.readAsArrayBuffer(audioBlob);
    });
  }

  /**
   * Convert AudioBuffer to WAV format
   * @param {AudioBuffer} audioBuffer - Audio buffer from Web Audio API
   * @returns {ArrayBuffer} - WAV file as ArrayBuffer
   */
  function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const length = audioBuffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * numChannels * bytesPerSample);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numChannels * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, length * numChannels * bytesPerSample, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  }

  /**
   * Update the text field with live transcription during recording
   */
  function updateLiveTranscription() {
    if (!state.isRecording && !state.isRecordingVideo) return;

    const fullText = (state.liveTranscriptionText + ' ' + state.interimTranscriptionText).trim();
    
    if (editor) {
      // Update CodeMirror editor
      const currentValue = editor.getValue();
      if (currentValue !== fullText) {
        editor.setValue(fullText);
        // Auto-expand editor
        autoExpandEditor();
        // Scroll to bottom
        editor.scrollIntoView({ line: editor.lineCount() - 1 });
      }
    } else if (elements.messageInput) {
      // Update textarea
      if (elements.messageInput.value !== fullText) {
        elements.messageInput.value = fullText;
        // Auto-expand textarea
        autoExpandTextarea();
        // Scroll to bottom
        elements.messageInput.scrollTop = elements.messageInput.scrollHeight;
      }
    }
  }

  /**
   * Auto-expand CodeMirror editor as content grows
   */
  function autoExpandEditor() {
    if (!editor) return;
    
    const lineCount = editor.lineCount();
    const minLines = 3;
    const maxLines = 20;
    const linesToShow = Math.min(Math.max(lineCount, minLines), maxLines);
    
    // Set editor height based on line count
    const lineHeight = editor.defaultTextHeight();
    const newHeight = linesToShow * lineHeight + 20; // Add padding
    
    const wrapper = editor.getWrapperElement();
    if (wrapper) {
      wrapper.style.height = `${newHeight}px`;
      editor.refresh();
    }
  }

  /**
   * Auto-expand textarea as content grows
   */
  function autoExpandTextarea() {
    if (!elements.messageInput) return;
    
    // Reset height to auto to get accurate scrollHeight
    elements.messageInput.style.height = 'auto';
    
    // Calculate new height (min 3 lines, max 20 lines)
    const lineHeight = parseInt(getComputedStyle(elements.messageInput).lineHeight) || 24;
    const minHeight = lineHeight * 3;
    const maxHeight = lineHeight * 20;
    const scrollHeight = elements.messageInput.scrollHeight;
    
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    elements.messageInput.style.height = `${newHeight}px`;
    elements.messageInput.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
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
