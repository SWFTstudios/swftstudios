/**
 * SWFT Notes Upload Interface
 * 
 * Handles multi-format content uploads (text, audio, images, links)
 * Uploads files to Supabase Storage
 * Generates markdown and commits to notes repo
 */

(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================
  
  const CONFIG = {
    apiEndpoint: '/api/submit-note',
    maxFileSizes: {
      image: 10 * 1024 * 1024, // 10MB
      audio: 50 * 1024 * 1024  // 50MB
    },
    allowedTypes: {
      image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']
    }
  };

  // ==========================================================================
  // State
  // ==========================================================================
  
  let state = {
    supabase: window.SWFTAuth?.supabase,
    currentUser: null,
    contentType: 'text',
    uploadedFiles: [],
    isDraft: true
  };

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  
  const elements = {
    form: document.getElementById('upload-form'),
    titleInput: document.getElementById('note-title'),
    contentInput: document.getElementById('note-content'),
    tagsInput: document.getElementById('note-tags'),
    contentTypeInput: document.getElementById('content-type'),
    contentTypeBtns: document.querySelectorAll('.content-type-btn'),
    contentGroups: document.querySelectorAll('.content-group'),
    audioFile: document.getElementById('audio-file'),
    imageFile: document.getElementById('image-file'),
    externalLink: document.getElementById('external-link'),
    audioPreview: document.getElementById('audio-preview'),
    imagePreview: document.getElementById('image-preview'),
    submitBtn: document.getElementById('submit-btn'),
    previewBtn: document.getElementById('preview-btn'),
    previewContent: document.getElementById('preview-content'),
    previewSection: document.querySelector('.preview-section'),
    previewClose: document.getElementById('preview-close'),
    uploadSuccess: document.getElementById('upload-success'),
    uploadError: document.getElementById('upload-error'),
    uploadErrorMessage: document.getElementById('upload-error-message'),
    signOutBtn: document.getElementById('sign-out-btn')
  };

  // ==========================================================================
  // Authentication Check
  // ==========================================================================
  
  /**
   * Verify user is authenticated and authorized
   */
  async function checkAuth() {
    if (!state.supabase) {
      console.error('Supabase not initialized');
      window.location.href = '/auth.html';
      return;
    }

    try {
      const { data: { session }, error } = await state.supabase.auth.getSession();

      if (error) throw error;

      if (!session || !session.user) {
        console.log('No session found, redirecting to auth');
        window.location.href = '/auth.html';
        return;
      }

      state.currentUser = session.user;

      // Check if user is authorized
      const authorized = window.SWFTAuth?.isAuthorizedUser(session.user.email);
      
      if (!authorized) {
        console.log('User not authorized, redirecting to blog');
        window.location.href = '/blog.html';
        return;
      }

      console.log('User authorized:', session.user.email);

    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/auth.html';
    }
  }

  // ==========================================================================
  // Content Type Management
  // ==========================================================================
  
  /**
   * Switch content type
   */
  function setContentType(type) {
    state.contentType = type;
    
    // Update hidden input
    if (elements.contentTypeInput) {
      elements.contentTypeInput.value = type;
    }

    // Update button states
    elements.contentTypeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Show/hide content groups
    elements.contentGroups.forEach(group => {
      group.hidden = group.dataset.content !== type;
    });

    // Update preview
    updatePreview();
  }

  // ==========================================================================
  // File Upload Handling
  // ==========================================================================
  
  /**
   * Upload file to Supabase Storage
   */
  async function uploadFileToSupabase(file, bucket) {
    if (!state.supabase || !state.currentUser) {
      throw new Error('Not authenticated');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${state.currentUser.id}/${Date.now()}.${fileExt}`;

    try {
      const { data, error } = await state.supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = state.supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return urlData.publicUrl;

    } catch (error) {
      console.error('File upload failed:', error);
      throw new Error(`Failed to upload ${file.name}: ${error.message}`);
    }
  }

  /**
   * Handle image file selection
   */
  async function handleImageUpload(file) {
    // Validate
    if (!CONFIG.allowedTypes.image.includes(file.type)) {
      throw new Error('Invalid image type. Please upload JPG, PNG, WEBP, or GIF');
    }

    if (file.size > CONFIG.maxFileSizes.image) {
      throw new Error('Image too large. Maximum size is 10MB');
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      elements.imagePreview.innerHTML = `
        <img src="${e.target.result}" alt="Preview">
        <div>
          <p><strong>${file.name}</strong></p>
          <p>${(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      `;
      elements.imagePreview.hidden = false;
    };
    reader.readAsDataURL(file);

    return file;
  }

  /**
   * Handle audio file selection
   */
  async function handleAudioUpload(file) {
    // Validate
    if (!CONFIG.allowedTypes.audio.includes(file.type)) {
      throw new Error('Invalid audio type. Please upload MP3, M4A, or WAV');
    }

    if (file.size > CONFIG.maxFileSizes.audio) {
      throw new Error('Audio too large. Maximum size is 50MB');
    }

    // Show preview
    const url = URL.createObjectURL(file);
    elements.audioPreview.innerHTML = `
      <div>
        <p><strong>${file.name}</strong></p>
        <p>${(file.size / 1024 / 1024).toFixed(2)} MB</p>
        <audio controls src="${url}"></audio>
      </div>
    `;
    elements.audioPreview.hidden = false;

    return file;
  }

  // ==========================================================================
  // Markdown Generation
  // ==========================================================================
  
  /**
   * Generate markdown content from form data
   */
  function generateMarkdown(formData) {
    const { title, content, tags, contentType, fileUrl, externalLink } = formData;
    
    // Generate frontmatter
    const frontmatter = {
      title: title || 'Untitled Note',
      date: new Date().toISOString().split('T')[0],
      tags: tags || [],
      author: state.currentUser.email,
      content_type: contentType
    };

    // Add content-specific metadata
    if (contentType === 'audio' && fileUrl) {
      frontmatter.audio_url = fileUrl;
    }
    if (contentType === 'image' && fileUrl) {
      frontmatter.image = fileUrl;
    }
    if (contentType === 'link' && externalLink) {
      frontmatter.link_url = externalLink;
    }

    // Build markdown
    let markdown = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        markdown += `${key}: [${value.map(v => `"${v}"`).join(', ')}]\n`;
      } else {
        markdown += `${key}: "${value}"\n`;
      }
    }
    markdown += '---\n\n';

    // Add content based on type
    if (contentType === 'text' && content) {
      markdown += content;
    } else if (contentType === 'audio' && fileUrl) {
      markdown += content || 'Voice note\n\n';
      markdown += `<audio controls>\n  <source src="${fileUrl}" type="audio/mpeg">\n</audio>\n`;
    } else if (contentType === 'image' && fileUrl) {
      markdown += content || 'Image note\n\n';
      markdown += `![${title || 'Image'}](${fileUrl})\n`;
    } else if (contentType === 'link' && externalLink) {
      markdown += content || '';
      markdown += `\n\n[View original](${externalLink})\n`;
    }

    return markdown;
  }

  // ==========================================================================
  // Form Submission
  // ==========================================================================
  
  /**
   * Submit note to server
   */
  async function submitNote(e) {
    if (e) e.preventDefault();

    try {
      setLoading(true);
      hideMessages();

      // Get form data
      const title = elements.titleInput.value.trim();
      const content = elements.contentInput.value.trim();
      const tagsStr = elements.tagsInput.value.trim();
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
      const contentType = state.contentType;

      // Validate
      if (!title && !content) {
        throw new Error('Please provide at least a title or content');
      }

      // Handle file uploads
      let fileUrl = null;
      
      if (contentType === 'image' && elements.imageFile.files[0]) {
        const file = elements.imageFile.files[0];
        await handleImageUpload(file);
        showInfo('Uploading image...');
        fileUrl = await uploadFileToSupabase(file, 'notes-images');
      } else if (contentType === 'audio' && elements.audioFile.files[0]) {
        const file = elements.audioFile.files[0];
        await handleAudioUpload(file);
        showInfo('Uploading audio...');
        fileUrl = await uploadFileToSupabase(file, 'notes-audio');
      }

      // Get external link
      const externalLink = elements.externalLink?.value.trim() || null;

      // Generate markdown
      const markdown = generateMarkdown({
        title,
        content,
        tags,
        contentType,
        fileUrl,
        externalLink
      });

      // Submit to server
      showInfo('Publishing note...');
      
      const response = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await state.supabase.auth.getSession()).data.session.access_token}`
        },
        body: JSON.stringify({
          title: title || 'Untitled Note',
          content,
          markdown,
          tags,
          contentType,
          fileUrl,
          externalLink,
          userEmail: state.currentUser.email
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to publish note');
      }

      const result = await response.json();
      
      // Show success
      showSuccess('Note published successfully!');
      
      // Reset form
      setTimeout(() => {
        elements.form.reset();
        state.uploadedFiles = [];
        elements.imagePreview.hidden = true;
        elements.audioPreview.hidden = true;
        updatePreview();
      }, 2000);

    } catch (error) {
      console.error('Submit failed:', error);
      showError(error.message || 'Failed to publish note. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================================
  // Preview
  // ==========================================================================
  
  /**
   * Update live preview
   */
  function updatePreview() {
    if (!elements.previewContent) return;

    const title = elements.titleInput.value.trim() || 'Untitled Note';
    const content = elements.contentInput.value.trim();
    const tagsStr = elements.tagsInput.value.trim();
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    const externalLink = elements.externalLink?.value.trim();

    if (!content && !externalLink && state.uploadedFiles.length === 0) {
      elements.previewContent.innerHTML = '<p class="preview-empty">Fill out the form to see a preview</p>';
      return;
    }

    let html = `<h2>${escapeHtml(title)}</h2>`;
    
    // Tags
    if (tags.length > 0) {
      html += '<div class="preview-meta">';
      tags.forEach(tag => {
        html += `<span class="preview-tag">${escapeHtml(tag)}</span>`;
      });
      html += '</div>';
    }

    // Content based on type
    if (state.contentType === 'text' && content) {
      html += `<div class="preview-text">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
    } else if (state.contentType === 'image' && elements.imageFile.files[0]) {
      const file = elements.imageFile.files[0];
      const url = URL.createObjectURL(file);
      html += `<img src="${url}" alt="${escapeHtml(title)}">`;
      if (content) html += `<p>${escapeHtml(content)}</p>`;
    } else if (state.contentType === 'audio' && elements.audioFile.files[0]) {
      const file = elements.audioFile.files[0];
      const url = URL.createObjectURL(file);
      if (content) html += `<p>${escapeHtml(content)}</p>`;
      html += `<audio controls src="${url}"></audio>`;
    } else if (state.contentType === 'link' && externalLink) {
      if (content) html += `<p>${escapeHtml(content)}</p>`;
      html += `<p><a href="${escapeHtml(externalLink)}" target="_blank" rel="noopener">${escapeHtml(externalLink)}</a></p>`;
    }

    elements.previewContent.innerHTML = html;
  }

  // ==========================================================================
  // UI Helpers
  // ==========================================================================
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Set loading state
   */
  function setLoading(loading) {
    elements.submitBtn.disabled = loading;
    elements.submitBtn.classList.toggle('loading', loading);
    elements.previewBtn.disabled = loading;
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    hideMessages();
    elements.uploadSuccess.hidden = false;
    // Auto-hide after 5 seconds
    setTimeout(() => {
      elements.uploadSuccess.hidden = true;
    }, 5000);
  }

  /**
   * Show error message
   */
  function showError(message) {
    hideMessages();
    elements.uploadErrorMessage.textContent = message;
    elements.uploadError.hidden = false;
  }

  /**
   * Show info (temporary loading message)
   */
  function showInfo(message) {
    // You could create a toast notification here
    console.log(message);
  }

  /**
   * Hide all messages
   */
  function hideMessages() {
    elements.uploadSuccess.hidden = true;
    elements.uploadError.hidden = true;
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  
  function setupEventListeners() {
    // Content type buttons
    elements.contentTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setContentType(btn.dataset.type);
      });
    });

    // File inputs
    if (elements.imageFile) {
      elements.imageFile.addEventListener('change', async (e) => {
        if (e.target.files[0]) {
          try {
            await handleImageUpload(e.target.files[0]);
            updatePreview();
          } catch (error) {
            showError(error.message);
          }
        }
      });
    }

    if (elements.audioFile) {
      elements.audioFile.addEventListener('change', async (e) => {
        if (e.target.files[0]) {
          try {
            await handleAudioUpload(e.target.files[0]);
            updatePreview();
          } catch (error) {
            showError(error.message);
          }
        }
      });
    }

    // Form inputs - update preview on change
    ['titleInput', 'contentInput', 'tagsInput', 'externalLink'].forEach(key => {
      if (elements[key]) {
        elements[key].addEventListener('input', updatePreview);
      }
    });

    // Form submission
    if (elements.form) {
      elements.form.addEventListener('submit', submitNote);
    }

    // Preview button (mobile)
    if (elements.previewBtn) {
      elements.previewBtn.addEventListener('click', () => {
        elements.previewSection.classList.toggle('show-mobile');
      });
    }

    // Preview close button (mobile)
    if (elements.previewClose) {
      elements.previewClose.addEventListener('click', () => {
        elements.previewSection.classList.remove('show-mobile');
      });
    }

    // Sign out button
    if (elements.signOutBtn && state.supabase) {
      elements.signOutBtn.addEventListener('click', async () => {
        try {
          await state.supabase.auth.signOut();
          window.location.href = '/blog.html';
        } catch (error) {
          console.error('Sign out failed:', error);
        }
      });
    }

    // Drag and drop for file inputs
    setupDragAndDrop();
  }

  /**
   * Setup drag and drop for file uploads
   */
  function setupDragAndDrop() {
    const dropZones = [
      { element: document.getElementById('audio-upload-area'), input: elements.audioFile },
      { element: document.getElementById('image-upload-area'), input: elements.imageFile }
    ];

    dropZones.forEach(({ element, input }) => {
      if (!element || !input) return;

      element.addEventListener('dragover', (e) => {
        e.preventDefault();
        element.classList.add('drag-over');
      });

      element.addEventListener('dragleave', () => {
        element.classList.remove('drag-over');
      });

      element.addEventListener('drop', (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');

        if (e.dataTransfer.files.length > 0) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // Check authentication first
    await checkAuth();

    // Setup event listeners
    setupEventListeners();

    // Set initial content type
    setContentType('text');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
