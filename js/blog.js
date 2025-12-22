/**
 * SWFT Studios Blog / Notes JavaScript
 * 
 * Features:
 * - List view with search and tag filtering
 * - 3D Graph view with lazy-loaded 3d-force-graph
 * - Modal preview for notes
 * - Responsive view toggling
 * - Accessibility: keyboard navigation, reduced motion
 * - LocalStorage for view preference persistence
 */

(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================
  
  const CONFIG = {
    dataUrl: '/data/posts.json', // Fallback to static file
    graphUrl: '/data/graph.latest.json',
    graphLibraryUrl: 'https://cdn.jsdelivr.net/npm/3d-force-graph@1/dist/3d-force-graph.min.js',
    storageKey: 'swft-blog-view',
    debounceDelay: 300,
    graphNodeLimit: {
      desktop: 500,
      mobile: 150
    },
    supabaseUrl: 'https://mnrteunavnzrglbozpfc.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucnRldW5hdm56cmdsYm96cGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTM5NjUsImV4cCI6MjA4MTY2OTk2NX0.7XORw2dbCDG64i2HfiAaTt70ZJTg89BVO7DAPeSCsU8'
  };

  // ==========================================================================
  // State
  // ==========================================================================
  
  let state = {
    posts: [],
    graphData: null,
    fullGraphData: null, // Store all nodes including messages
    graph: null,
    graphLoaded: false,
    graphLibraryLoaded: false,
    currentView: 'list',
    searchQuery: '',
    activeTag: null,
    activeAuthor: null,
    sortBy: 'date-desc',
    highlightedPostId: null,
    currentUser: null, // Track current authenticated user
    graphZoomLevel: 'far', // 'far', 'medium', 'close'
    focusedNoteId: null, // Currently focused note for message display
    hoveredNodeId: null, // Currently hovered node for highlighting
    graphFilters: {
      tags: true,
      attachments: false,
      existingFilesOnly: false,
      orphans: true
    },
    graphForces: {
      center: 70,
      repel: 30,
      link: 60,
      distance: 40
    },
    graphDisplay: {
      nodeColor: '#ffffff',
      linkColor: '#ffffff',
      highlightColor: '#5DADE2',
      nodeSize: 8, // Increased from 5 for better visibility
      linkWidth: 1,
      linkStyle: 'solid'
    }
  };

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  
  const elements = {
    blogList: document.getElementById('blog-list'),
    blogContent: document.querySelector('.blog_content'),
    searchInput: document.getElementById('blog-search'),
    sortSelect: document.getElementById('blog-sort-by'),
    tagFilters: document.getElementById('tag-filters'),
    authorFilters: document.getElementById('author-filters'),
    viewButtons: document.querySelectorAll('.blog_view-btn'),
    graphContainer: document.getElementById('graph-container'),
    graphPlaceholder: document.getElementById('graph-placeholder'),
    graphToggleBtn: document.getElementById('graph-toggle-btn'),
    graphResetBtn: document.getElementById('graph-reset'),
    graphZoomFitBtn: document.getElementById('graph-zoom-fit'),
    graphUnavailable: document.getElementById('graph-unavailable'),
    emptyState: document.getElementById('blog-empty'),
    clearFiltersBtn: document.getElementById('clear-filters'),
    modal: document.getElementById('note-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalDate: document.getElementById('modal-date'),
    modalTags: document.getElementById('modal-tags'),
    modalContent: document.getElementById('modal-content'),
    modalRelatedNotes: document.getElementById('modal-related-notes'),
    modalClose: document.querySelector('.blog_modal-close'),
    modalBackdrop: document.querySelector('.blog_modal-backdrop'),
    collaboratorAccess: document.getElementById('blog-collaborator-access'),
    collaboratorSigninBtn: document.getElementById('blog-collaborator-signin'),
    authActions: document.getElementById('blog-auth-actions'),
    signOutBtn: document.getElementById('blog-sign-out'),
    editModal: document.getElementById('edit-note-modal'),
    editForm: document.getElementById('edit-note-form'),
    editTitle: document.getElementById('edit-note-title'),
    editContent: document.getElementById('edit-note-content'),
    editTags: document.getElementById('edit-note-tags'),
    editSaveBtn: document.getElementById('edit-note-save'),
    editCancelBtn: document.getElementById('edit-note-cancel'),
    editCloseBtn: document.getElementById('edit-note-close'),
    graphSidebar: document.getElementById('graph-sidebar'),
    graphSectionToggles: document.querySelectorAll('.blog_graph-section-toggle'),
    filterTags: document.getElementById('filter-tags'),
    filterAttachments: document.getElementById('filter-attachments'),
    filterExistingFiles: document.getElementById('filter-existing-files'),
    filterOrphans: document.getElementById('filter-orphans'),
    forceCenter: document.getElementById('force-center'),
    forceRepel: document.getElementById('force-repel'),
    forceLink: document.getElementById('force-link'),
    forceDistance: document.getElementById('force-distance'),
    displayNodeColor: document.getElementById('display-node-color'),
    displayLinkColor: document.getElementById('display-link-color'),
    displayHighlightColor: document.getElementById('display-highlight-color'),
    displayNodeSize: document.getElementById('display-node-size'),
    displayLinkWidth: document.getElementById('display-link-width'),
    displayLinkStyle: document.getElementById('display-link-style'),
    graphModal: document.getElementById('graph-modal'),
    graphModalClose: document.getElementById('graph-modal-close'),
    graphModalBackdrop: document.querySelector('.blog_graph-modal-backdrop')
  };

  // ==========================================================================
  // Utility Functions
  // ==========================================================================
  
  /**
   * Debounce function execution
   */
  function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Format date for display
   */
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Check if user prefers reduced motion
   */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Check if WebGL is available
   */
  function isWebGLAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if device is mobile
   */
  function isMobile() {
    return window.innerWidth < 768;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get tag color from settings
   */
  function getTagColorForBlog(tag) {
    if (window.Settings && window.Settings.settings && window.Settings.settings.tagColors) {
      const normalizedTag = tag.toLowerCase();
      return window.Settings.settings.tagColors[normalizedTag] || '#6366f1';
    }
    return '#6366f1'; // Default color
  }

  /**
   * Get contrast color (black or white) for text on colored background
   */
  function getContrastColorForBlog(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /**
   * Format plain text as HTML paragraphs
   */
  function formatPlainTextAsHTML(text) {
    return text
      .split('\n\n')
      .map(para => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        const cleaned = trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        return `<p>${escapeHtml(cleaned)}</p>`;
      })
      .filter(p => p)
      .join('');
  }

  /**
   * Open modal showing a specific message
   */
  function openMessageModal(post, message) {
    if (!elements.modal) return;
    
    // Create a temporary post object with just this message
    const messagePost = {
      ...post,
      content: JSON.stringify([message]), // Single message array
      title: `${post.title} - Message`
    };
    
    openModal(messagePost);
  }

  /**
   * Show transcript modal with PDF-like reader interface
   */
  function showTranscriptModal(transcription) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('blog-transcript-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'blog-transcript-modal';
      modal.className = 'blog-transcript-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.hidden = true;
      modal.innerHTML = `
        <div class="blog-transcript-modal-backdrop"></div>
        <div class="blog-transcript-modal-container">
          <!-- PDF-like Toolbar -->
          <div class="blog-transcript-toolbar">
            <div class="blog-transcript-toolbar-left">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.7;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span class="blog-transcript-title">Audio Transcript</span>
            </div>
            <div class="blog-transcript-toolbar-right">
              <button type="button" class="blog-transcript-close-btn" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- PDF-like Document Area -->
          <div class="blog-transcript-document-container">
            <div class="blog-transcript-document" id="blog-transcript-content">
              <!-- Transcript content will be inserted here -->
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Close handler function
      const closeModal = () => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      };
      
      // Close on backdrop click
      const backdrop = modal.querySelector('.blog-transcript-modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          e.stopPropagation();
          closeModal();
        });
      }
      
      // Close on close button click
      const closeBtn = modal.querySelector('.blog-transcript-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeModal();
        });
      }
      
      // Prevent clicks on container from closing modal
      const container = modal.querySelector('.blog-transcript-modal-container');
      if (container) {
        container.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    }

    // Format and display transcript
    const contentEl = document.getElementById('blog-transcript-content');
    if (contentEl) {
      // Clean up transcription - remove headers
      let cleanedTranscription = transcription.replace(/^#\s*Audio\s+Transcript\s*\n*/i, '').trim();
      
      let formattedHtml = '';
      if (window.marked) {
        try {
          formattedHtml = window.marked.parse(cleanedTranscription, { 
            breaks: false, // Don't convert single line breaks
            gfm: true 
          });
        } catch (e) {
          formattedHtml = formatPlainTextAsHTML(cleanedTranscription);
        }
      } else {
        formattedHtml = formatPlainTextAsHTML(cleanedTranscription);
      }
      
      contentEl.innerHTML = formattedHtml;
      
      // Scroll to top
      contentEl.scrollTop = 0;
    }

    // Show modal
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    
    // Focus management
    const closeBtn = modal.querySelector('.blog-transcript-close-btn');
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 100);
    }
    
    // ESC key handler - attach to modal so it's scoped
    const escHandler = (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        e.preventDefault();
        e.stopPropagation();
        modal.hidden = true;
        document.body.style.overflow = '';
      }
    };
    
    // Remove any existing handler first
    modal.removeEventListener('keydown', escHandler);
    modal.addEventListener('keydown', escHandler);
    
    // Also add to document for broader coverage
    document.addEventListener('keydown', escHandler);
    
    // Clean up when modal is hidden
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
          if (modal.hidden) {
            document.removeEventListener('keydown', escHandler);
            observer.disconnect();
          }
        }
      });
    });
    observer.observe(modal, { attributes: true });
  }

  // ==========================================================================
  // Data Fetching
  // ==========================================================================
  
  /**
   * Extract excerpt from markdown content
   */
  function extractExcerpt(content, length = 200) {
    const plainText = content
      .replace(/\[\[([^\]]+)\]\]/g, '$1') // Remove wiki links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
      .replace(/[#*_~`]/g, '') // Remove formatting chars
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
    
    if (plainText.length <= length) return plainText;
    return plainText.substring(0, length).trim() + '...';
  }
  
  /**
   * Extract [[wiki-style]] links from content
   */
  function extractLinks(content) {
    const linkPattern = /\[\[([^\]]+)\]\]/g;
    const links = [];
    let match;
    
    while ((match = linkPattern.exec(content)) !== null) {
      links.push(slugify(match[1]));
    }
    
    return [...new Set(links)]; // Return unique links only
  }
  
  /**
   * Slugify a string
   */
  function slugify(text) {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }
  
  /**
   * Fetch blog posts data from Supabase
   */
  async function fetchBlogDataFromSupabase() {
    try {
      // Initialize Supabase client if not already available
      if (!window.SWFTAuth || !window.SWFTAuth.supabase) {
        const { createClient } = window.supabase;
        window.SWFTAuth = window.SWFTAuth || {};
        window.SWFTAuth.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
      }
      
      const supabase = window.SWFTAuth.supabase;
      
      // Fetch published notes from Supabase
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      console.log(`Found ${notes.length} published notes in Supabase`);
      
      // Transform Supabase notes to blog post format
      const posts = notes.map(note => {
        // Extract links from content (wiki-style [[links]])
        const links = extractLinks(note.content || '');
        
        return {
          id: note.id,
          slug: slugify(note.title),
          title: note.title,
          description: extractExcerpt(note.content || '', 150),
          date: note.created_at ? note.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          tags: Array.isArray(note.tags) ? note.tags : [],
          author: note.user_email ? note.user_email.split('@')[0] : 'Unknown',
          user_email: note.user_email, // Store for ownership check
          user_id: note.user_id, // Store for ownership check
          image: note.file_urls && note.file_urls.length > 0 ? note.file_urls[0] : null,
          excerpt: extractExcerpt(note.content || '', 200),
          links: links,
          content: note.content || '',
          metaError: false
        };
      });
      
      return posts;
    } catch (error) {
      console.error('Failed to fetch from Supabase:', error);
      throw error;
    }
  }
  
  /**
   * Fetch blog posts data
   */
  async function fetchBlogData() {
    // Try Supabase first
    try {
      console.log('Fetching notes from Supabase...');
      state.posts = await fetchBlogDataFromSupabase();
      console.log(`Loaded ${state.posts.length} notes from Supabase`);
      return state.posts;
    } catch (error) {
      console.warn('Supabase fetch failed, falling back to static file:', error);
      // Fall through to static file
    }
    
    // Fallback to static file
    try {
      const response = await fetch(CONFIG.dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.posts = await response.json();
      console.log(`Loaded ${state.posts.length} notes from static file`);
      return state.posts;
    } catch (error) {
      console.error('Failed to fetch blog data:', error);
      showError('Failed to load notes. Please try again later.');
      return [];
    }
  }

  /**
   * Build graph data from posts
   */
  /**
   * Get message preview text for node label
   */
  function getMessagePreview(message) {
    if (message.content && message.content.trim()) {
      // Remove markdown headers and get first 50 chars
      const cleaned = message.content.replace(/^#+\s*/gm, '').trim();
      return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned;
    }
    if (message.attachments && message.attachments.length > 0) {
      const audioCount = message.attachments.filter(a => a.type === 'audio').length;
      const videoCount = message.attachments.filter(a => a.type === 'video').length;
      const imageCount = message.attachments.filter(a => a.type === 'image').length;
      if (audioCount > 0) return `Audio Message (${audioCount})`;
      if (videoCount > 0) return `Video Message (${videoCount})`;
      if (imageCount > 0) return `Image Message (${imageCount})`;
      return 'File Attachment';
    }
    return 'Empty Message';
  }

  /**
   * Get color for message node based on tags
   */
  function getMessageColor(message) {
    if (message.tags && message.tags.length > 0) {
      const tagColor = getTagColorForBlog(message.tags[0]);
      // Lighten the color for messages
      return lightenColor(tagColor, 30);
    }
    return '#aaaaaa'; // Default gray for messages
  }

  /**
   * Lighten a hex color by a percentage
   */
  function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function buildGraphData(posts) {
    // Return empty graph if no posts
    if (!posts || posts.length === 0) {
      return { nodes: [], links: [] };
    }
    
    const nodes = [];
    const links = [];
    const messageNodes = [];
    const allMessageNodes = []; // Store all messages for tag connections
    
    // Create note nodes
    posts.forEach(post => {
      // Parse messages from content
      let messages = [];
      try {
        const parsed = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
        if (Array.isArray(parsed)) {
          messages = parsed;
        }
      } catch (e) {
        // Not JSON, skip messages
      }
      
      // Create note node
      const noteNode = {
        id: post.id,
        name: post.title,
        tags: post.tags || [],
        val: post.links ? post.links.length + 1 : 1,
        // Don't set color property - let nodeColor function handle it
        nodeType: 'note',
        slug: post.slug,
        post: post // Store full post reference
      };
      nodes.push(noteNode);
      
      // Create message nodes
      messages.forEach(msg => {
        const messageNode = {
          id: `message-${post.id}-${msg.id}`,
          name: getMessagePreview(msg),
          nodeType: 'message',
          parentNoteId: post.id,
          messageId: msg.id,
          noteId: post.id,
          tags: msg.tags || [],
          val: 0.5, // Smaller than note nodes
          // Don't set color property - let nodeColor function handle it
          message: msg, // Store full message reference
          post: post // Store parent post reference
        };
        messageNodes.push(messageNode);
        allMessageNodes.push(messageNode);
        
        // Link message to parent note
        links.push({
          source: post.id,
          target: messageNode.id,
          type: 'parent',
          weight: 1
        });
      });
    });
    
    // Create node map for lookups
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    messageNodes.forEach(m => nodeMap.set(m.id, m));
    
    // Create manual links between notes (existing functionality)
    posts.forEach(post => {
      if (post.links && post.links.length > 0) {
        post.links.forEach(linkId => {
          if (nodeMap.has(linkId)) {
            links.push({
              source: post.id,
              target: linkId,
              type: 'manual'
            });
          }
        });
      }
    });
    
    // Create tag-based connections between notes (existing functionality)
    const postArray = Array.from(posts);
    for (let i = 0; i < postArray.length; i++) {
      for (let j = i + 1; j < postArray.length; j++) {
        const postA = postArray[i];
        const postB = postArray[j];
        const sharedTags = (postA.tags || []).filter(tag => (postB.tags || []).includes(tag));
        
        if (sharedTags.length > 0) {
          links.push({
            source: postA.id,
            target: postB.id,
            type: 'tag',
            weight: sharedTags.length,
            tags: sharedTags
          });
        }
      }
    }
    
    // Create tag-based connections between messages
    for (let i = 0; i < allMessageNodes.length; i++) {
      for (let j = i + 1; j < allMessageNodes.length; j++) {
        const msgA = allMessageNodes[i];
        const msgB = allMessageNodes[j];
        const sharedTags = (msgA.tags || []).filter(tag => (msgB.tags || []).includes(tag));
        
        if (sharedTags.length > 0) {
          links.push({
            source: msgA.id,
            target: msgB.id,
            type: 'tag',
            weight: sharedTags.length,
            tags: sharedTags
          });
        }
      }
    }
    
    // Create tag-based connections between messages and notes
    allMessageNodes.forEach(msgNode => {
      nodes.forEach(noteNode => {
        if (noteNode.nodeType === 'note' && noteNode.id !== msgNode.parentNoteId) {
          const sharedTags = (msgNode.tags || []).filter(tag => (noteNode.tags || []).includes(tag));
          if (sharedTags.length > 0) {
            links.push({
              source: msgNode.id,
              target: noteNode.id,
              type: 'tag',
              weight: sharedTags.length,
              tags: sharedTags
            });
          }
        }
      });
    });
    
    // Return nodes and links (messages will be filtered by zoom level)
    return { 
      nodes: [...nodes, ...messageNodes], 
      links: links,
      noteNodes: nodes,
      messageNodes: messageNodes
    };
  }
  
  /**
   * Fetch graph data
   */
  async function fetchGraphData() {
    // Always build graph from posts (no fallback to static file)
    // If no posts, return empty graph data
    if (!state.posts || state.posts.length === 0) {
      console.log('No posts available, returning empty graph data');
      state.graphData = { nodes: [], links: [] };
      return state.graphData;
    }
    
    console.log('Building graph from fetched posts...');
    state.graphData = buildGraphData(state.posts);
    return state.graphData;
  }

  // ==========================================================================
  // List View Rendering
  // ==========================================================================
  
  /**
   * Render the list view with posts
   */
  function renderListView(posts) {
    if (!elements.blogList) return;

    // Filter and sort posts
    let filteredPosts = filterPosts(posts);
    filteredPosts = sortPosts(filteredPosts);

    // Show/hide empty state
    if (filteredPosts.length === 0) {
      elements.emptyState.hidden = false;
      elements.blogList.innerHTML = '';
      return;
    }

    elements.emptyState.hidden = true;

    // Render posts
    elements.blogList.innerHTML = filteredPosts.map(post => `
      <article 
        class="blog_card ${state.highlightedPostId === post.id ? 'is-highlighted' : ''}" 
        data-post-id="${escapeHtml(post.id)}"
        tabindex="0"
        role="button"
        aria-label="View ${escapeHtml(post.title)}"
      >
        <div class="blog_card-header">
          <h2 class="blog_card-title">${escapeHtml(post.title)}</h2>
          <span class="blog_card-date">${formatDate(post.date)}</span>
        </div>
        <p class="blog_card-excerpt">${escapeHtml(post.excerpt)}</p>
        <div class="blog_card-footer">
          ${post.tags.map(tag => `<span class="blog_card-tag">${escapeHtml(tag)}</span>`).join('')}
          ${post.links.length > 0 ? `
            <span class="blog_card-links-count" title="${post.links.length} connected notes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              ${post.links.length}
            </span>
          ` : ''}
          ${isNoteOwner(post) ? `
            <div class="blog_card-actions">
              <button class="blog_edit-btn" data-note-id="${escapeHtml(post.id)}" aria-label="Edit note" title="Edit note">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="blog_delete-btn" data-note-id="${escapeHtml(post.id)}" aria-label="Delete note" title="Delete note">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          ` : ''}
        </div>
      </article>
    `).join('');

    // Add click handlers to cards (but not on action buttons)
    elements.blogList.querySelectorAll('.blog_card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger card click if clicking on action buttons
        if (e.target.closest('.blog_card-actions')) {
          return;
        }
        handlePostClick(card.dataset.postId);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePostClick(card.dataset.postId);
        }
      });
    });
    
    // Add click handlers for edit/delete buttons
    elements.blogList.querySelectorAll('.blog_edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(btn.dataset.noteId);
      });
    });
    
    elements.blogList.querySelectorAll('.blog_delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDelete(btn.dataset.noteId);
      });
    });
  }

  /**
   * Filter posts based on search query, active tag, and active author
   */
  function filterPosts(posts) {
    return posts.filter(post => {
      // Search filter
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        const matchesTitle = post.title.toLowerCase().includes(query);
        const matchesDescription = post.description.toLowerCase().includes(query);
        const matchesTags = post.tags.some(tag => tag.toLowerCase().includes(query));
        const matchesAuthor = post.author && post.author.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription && !matchesTags && !matchesAuthor) return false;
      }

      // Tag filter
      if (state.activeTag) {
        if (!post.tags.includes(state.activeTag)) return false;
      }

      // Author filter
      if (state.activeAuthor) {
        if (!post.author || post.author !== state.activeAuthor) return false;
      }

      return true;
    });
  }

  /**
   * Sort posts based on selected sort option
   */
  function sortPosts(posts) {
    const [field, direction] = state.sortBy.split('-');
    
    return [...posts].sort((a, b) => {
      let aVal, bVal;
      
      switch (field) {
        case 'date':
          aVal = new Date(a.date);
          bVal = new Date(b.date);
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'author':
          aVal = (a.author || '').toLowerCase();
          bVal = (b.author || '').toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (direction === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
  }

  /**
   * Render tag filter buttons
   */
  function renderTagFilters(posts) {
    if (!elements.tagFilters) return;

    // Get unique tags with counts
    const tagCounts = {};
    posts.forEach(post => {
      post.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Sort by count, then alphabetically
    const sortedTags = Object.keys(tagCounts).sort((a, b) => {
      if (tagCounts[b] !== tagCounts[a]) return tagCounts[b] - tagCounts[a];
      return a.localeCompare(b);
    });

    elements.tagFilters.innerHTML = sortedTags.map(tag => `
      <button 
        type="button" 
        class="blog_tag-btn ${state.activeTag === tag ? 'is-active' : ''}" 
        data-tag="${escapeHtml(tag)}"
        aria-pressed="${state.activeTag === tag}"
      >
        ${escapeHtml(tag)} (${tagCounts[tag]})
      </button>
    `).join('');

    // Add click handlers
    elements.tagFilters.querySelectorAll('.blog_tag-btn').forEach(btn => {
      btn.addEventListener('click', () => handleTagClick(btn.dataset.tag));
    });
  }

  /**
   * Render author filter buttons
   */
  function renderAuthorFilters(posts) {
    if (!elements.authorFilters) return;

    // Get unique authors with counts
    const authorCounts = {};
    posts.forEach(post => {
      if (post.author) {
        authorCounts[post.author] = (authorCounts[post.author] || 0) + 1;
      }
    });

    // Sort alphabetically by email
    const sortedAuthors = Object.keys(authorCounts).sort();

    if (sortedAuthors.length === 0) {
      elements.authorFilters.innerHTML = '<p class="blog_filter-empty">No authors found</p>';
      return;
    }

    elements.authorFilters.innerHTML = `
      <div class="blog_filter-section-title">Filter by Author</div>
      <div class="blog_author-buttons">
        ${sortedAuthors.map(author => `
          <button 
            type="button" 
            class="blog_author-btn ${state.activeAuthor === author ? 'is-active' : ''}" 
            data-author="${escapeHtml(author)}"
            aria-pressed="${state.activeAuthor === author}"
          >
            ${escapeHtml(author)} (${authorCounts[author]})
          </button>
        `).join('')}
      </div>
    `;

    // Add click handlers
    elements.authorFilters.querySelectorAll('.blog_author-btn').forEach(btn => {
      btn.addEventListener('click', () => handleAuthorClick(btn.dataset.author));
    });
  }

  // ==========================================================================
  // Graph View
  // ==========================================================================
  
  /**
   * Lazy-load the 3d-force-graph library
   */
  function loadGraphLibrary() {
    return new Promise((resolve, reject) => {
      if (state.graphLibraryLoaded) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = CONFIG.graphLibraryUrl;
      script.async = true;
      
      script.onload = () => {
        state.graphLibraryLoaded = true;
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load graph library'));
      };
      
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize the 3D graph
   */
  async function initGraph() {
    // Use graph container from modal (not the hidden one)
    const graphContainer = document.getElementById('graph-container');
    if (state.graphLoaded || !graphContainer) return;

    // Check WebGL availability
    if (!isWebGLAvailable()) {
      showGraphUnavailable();
      return;
    }

    // Check reduced motion preference
    if (prefersReducedMotion()) {
      console.log('Reduced motion preferred, using static view');
    }

    try {
      // Load library
      await loadGraphLibrary();

      // Fetch graph data if not already loaded
      if (!state.graphData) {
        console.log('[Graph] Fetching graph data...');
        await fetchGraphData();
      }

      if (!state.graphData) {
        console.error('[Graph] No graph data available');
        showGraphUnavailable();
        return;
      }
      
      console.log('[Graph] Graph data loaded:', {
        nodes: state.graphData.nodes?.length || 0,
        links: state.graphData.links?.length || 0
      });

      // Check if there are any nodes to display
      if (!state.graphData.nodes || state.graphData.nodes.length === 0) {
        showNoNotesMessage();
        return;
      }

      // Apply node limit based on device
      const nodeLimit = isMobile() 
        ? CONFIG.graphNodeLimit.mobile 
        : CONFIG.graphNodeLimit.desktop;

      // Apply node limit based on device (only for note nodes, messages handled by zoom)
      const noteNodes = state.graphData.nodes.filter(n => n.nodeType === 'note' || !n.nodeType);
      const messageNodes = state.graphData.nodes.filter(n => n.nodeType === 'message');
      
      let limitedNoteNodes = noteNodes;
      if (noteNodes.length > nodeLimit) {
        console.log(`Limiting graph to ${nodeLimit} note nodes (${noteNodes.length} total)`);
        // Sort by val and limit
        const sorted = [...noteNodes].sort((a, b) => (b.val || 0) - (a.val || 0));
        limitedNoteNodes = sorted.slice(0, nodeLimit);
      }
      
      // Rebuild graph data with limited notes but all messages
      const noteIds = new Set(limitedNoteNodes.map(n => n.id));
      const filteredMessageNodes = messageNodes.filter(m => noteIds.has(m.parentNoteId));
      
      // Filter links to only include visible nodes
      const allVisibleNodes = [...limitedNoteNodes, ...filteredMessageNodes];
      const visibleNodeIds = new Set(allVisibleNodes.map(n => n.id));
      const filteredLinks = state.graphData.links.filter(l => 
        visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target)
      );
      
      let graphData = {
        nodes: allVisibleNodes,
        links: filteredLinks,
        noteNodes: limitedNoteNodes,
        messageNodes: filteredMessageNodes
      };

      // Hide placeholder and no-notes message
      const graphPlaceholder = document.getElementById('graph-placeholder');
      if (graphPlaceholder) {
        graphPlaceholder.style.display = 'none';
      }
      hideNoNotesMessage();

      // Store full graph data (with all messages)
      state.fullGraphData = graphData;
      
      // Filter graph data based on initial zoom level (show only notes initially)
      const filteredGraphData = filterGraphDataByZoom(graphData, 'far', null);
      
      // Create graph (use container from modal)
      const graphContainer = document.getElementById('graph-container');
      if (!graphContainer) return;
      
      state.graph = ForceGraph3D()(graphContainer)
        .graphData(filteredGraphData)
        .nodeLabel(node => {
          if (node.nodeType === 'message') {
            return `
              <div style="background: rgba(0,0,0,0.8); padding: 6px 10px; border-radius: 4px; font-size: 12px; max-width: 200px;">
                <strong style="color: ${node.color || '#aaa'};">${escapeHtml(node.name)}</strong>
                ${node.tags && node.tags.length > 0 ? `<br><span style="color: #888; font-size: 11px;">${node.tags.slice(0, 3).join(', ')}</span>` : ''}
              </div>
            `;
          }
          return `
            <div style="background: rgba(0,0,0,0.8); padding: 8px 12px; border-radius: 4px; font-size: 14px;">
              <strong>${escapeHtml(node.name)}</strong>
              ${node.tags && node.tags.length > 0 ? `<br><span style="color: #888; font-size: 12px;">${node.tags.join(', ')}</span>` : ''}
            </div>
          `;
        })
        .nodeColor(node => {
          // Always return white by default - don't rely on state during init
          if (node.status === 'missing') {
            return '#666';
          }
          
          // If a node is hovered, highlight it and connected nodes in accent color
          if (state.hoveredNodeId && state.fullGraphData && state.fullGraphData.links) {
            const isHovered = node.id === state.hoveredNodeId;
            
            // Check if node is connected to hovered node
            let isConnected = false;
            for (const link of state.fullGraphData.links) {
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              const targetId = typeof link.target === 'object' ? link.target.id : link.target;
              
              if ((sourceId === state.hoveredNodeId && targetId === node.id) ||
                  (targetId === state.hoveredNodeId && sourceId === node.id)) {
                isConnected = true;
                break;
              }
            }
            
            if (isHovered || isConnected) {
              return state.graphDisplay.highlightColor || '#5DADE2'; // SWFT accent color for hovered/connected nodes
            }
          }
          
          // Hardcode white as default - ensure nodes are always visible
          return '#ffffff';
        })
        .nodeVal(node => {
          if (node.nodeType === 'message') {
            return 1.5; // Increased from 0.5 for better visibility
          }
          return Math.max(node.val || 3, 3); // Minimum size 3, increased from 1
        })
        .nodeOpacity(node => {
          if (node.nodeType === 'message') {
            return 0.7; // Slightly transparent messages
          }
          return 0.9;
        })
        .linkColor(link => {
          // Default to white for all links
          const linkColorHex = state.graphDisplay.linkColor || '#ffffff';
          const r = parseInt(linkColorHex.slice(1, 3), 16);
          const g = parseInt(linkColorHex.slice(3, 5), 16);
          const b = parseInt(linkColorHex.slice(5, 7), 16);
          const defaultColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
          
          // If a node is hovered, highlight connected links in accent color
          if (state.hoveredNodeId && state.fullGraphData && state.fullGraphData.links) {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const isConnected = sourceId === state.hoveredNodeId || targetId === state.hoveredNodeId;
            
            if (isConnected) {
              const highlightHex = state.graphDisplay.highlightColor || '#5DADE2';
              const hr = parseInt(highlightHex.slice(1, 3), 16);
              const hg = parseInt(highlightHex.slice(3, 5), 16);
              const hb = parseInt(highlightHex.slice(5, 7), 16);
              return `rgba(${hr}, ${hg}, ${hb}, 0.8)`; // SWFT accent color with higher opacity
            }
          }
          
          // Default white for all links
          return defaultColor;
        })
        .linkOpacity(link => {
          if (link.type === 'parent') {
            return 0.4;
          }
          return 0.6;
        })
        .linkWidth(link => {
          if (link.type === 'manual') return 1.5;
          if (link.type === 'parent') return 0.8;
          if (link.type === 'tag') return 0.5;
          return 0.5;
        })
        .backgroundColor('rgba(0, 0, 0, 0)')
        .onNodeClick((node) => {
          console.log('Graph onNodeClick triggered for node:', node); // Debug
          handleGraphNodeClick(node);
        })
        .onNodeHover(handleGraphNodeHover);
      
      // Handle camera controls for zoom detection
      // Listen for zoom/pan events
      if (state.graph) {
        // Track camera changes via periodic check
        let lastUpdate = Date.now();
        const updateGraphOnZoom = () => {
          if (Date.now() - lastUpdate > 300) { // Throttle updates
            checkZoomAndUpdate();
            lastUpdate = Date.now();
          }
        };
        
        // Check zoom on any graph interaction
        const checkZoomAndUpdate = () => {
          if (!state.graph || !state.fullGraphData) return;
          
          try {
            const camera = state.graph.camera();
            const currentZ = camera.position.z;
            
            let newZoomLevel = 'far';
            let newFocusedNote = state.focusedNoteId;
            
            if (currentZ < 200) {
              newZoomLevel = 'close';
            } else if (currentZ < 350) {
              newZoomLevel = 'medium';
              // Keep current focused note or find closest
              if (!newFocusedNote && state.fullGraphData.noteNodes && state.fullGraphData.noteNodes.length > 0) {
                newFocusedNote = state.fullGraphData.noteNodes[0].id;
              }
            } else {
              newZoomLevel = 'far';
              newFocusedNote = null; // Clear focus when zoomed out
            }
            
            if (newZoomLevel !== state.graphZoomLevel || newFocusedNote !== state.focusedNoteId) {
              state.graphZoomLevel = newZoomLevel;
              state.focusedNoteId = newFocusedNote;
              const filteredData = filterGraphDataByZoom(state.fullGraphData, newZoomLevel, newFocusedNote);
              state.graph.graphData(filteredData);
            }
          } catch (e) {
            // Ignore errors
          }
        };
        
        // Check periodically
        setInterval(checkZoomAndUpdate, 500);
      }
      
      console.log('Graph initialized with', graphData.nodes.length, 'nodes'); // Debug

      // Apply reduced motion settings
      if (prefersReducedMotion()) {
        state.graph.cooldownTicks(0);
      }

      // Center the graph and ensure all nodes are visible
      setTimeout(() => {
        if (state.graph) {
          // Reset zoom state
          state.graphZoomLevel = 'far';
          state.focusedNoteId = null;
          
          // Center camera on the graph
          state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
          // Zoom to fit all nodes - use longer delay to ensure graph is rendered
          setTimeout(() => {
            if (state.graph) {
              state.graph.zoomToFit(400, 0);
            }
          }, 200);
        }
      }, 100);

      // Ensure all nodes are visible after graph renders
      setTimeout(() => {
        if (state.graph) {
          // Force zoom to fit all nodes
          state.graph.zoomToFit(400, 0);
        }
      }, 500);

      // Stop simulation after settling
      setTimeout(() => {
        if (state.graph) {
          state.graph.cooldownTicks(0);
          // Re-center after simulation settles and ensure all nodes visible
          state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
          state.graph.zoomToFit(400, 0);
        }
      }, 30000);

      // Set initial size for graph container
      const graphContainerEl = document.getElementById('graph-container');
      if (graphContainerEl && state.graph) {
        // Get dimensions from modal container
        const sidebar = document.getElementById('graph-sidebar');
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 280;
        
        const containerWidth = graphContainerEl.clientWidth || (window.innerWidth - sidebarWidth);
        const containerHeight = graphContainerEl.clientHeight || window.innerHeight;
        
        console.log('[Graph] Container dimensions:', { containerWidth, containerHeight, sidebarWidth });
        
        if (containerWidth > 0 && containerHeight > 0) {
          state.graph.width(containerWidth);
          state.graph.height(containerHeight);
          console.log('[Graph] Graph initialized with size:', containerWidth, 'x', containerHeight);
        } else {
          console.warn('[Graph] Container has invalid dimensions:', { containerWidth, containerHeight });
        }
      }
      
      // Apply initial display settings BEFORE marking as loaded
      applyGraphDisplay();
      
      // Small delay to ensure colors are applied before graph settles
      setTimeout(() => {
        if (state.graph) {
          applyGraphDisplay();
          // Resize to fit modal if modal is open
          if (elements.graphModal && !elements.graphModal.hidden) {
            resizeGraphForModal();
          }
          // Ensure graph is visible and centered
          state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
          state.graph.zoomToFit(400, 0);
        }
      }, 200);

      state.graphLoaded = true;

    } catch (error) {
      console.error('Failed to initialize graph:', error);
      showGraphUnavailable();
    }
  }

  /**
   * Filter graph data based on zoom level
   */
  function filterGraphDataByZoom(graphData, zoomLevel, focusedNoteId) {
    if (!graphData || !graphData.nodes) {
      return { nodes: [], links: [] };
    }
    
    let visibleNodes = [];
    let visibleLinks = [];
    
    if (zoomLevel === 'far') {
      // Show only note nodes
      visibleNodes = graphData.nodes.filter(n => n.nodeType === 'note' || !n.nodeType);
      visibleLinks = graphData.links.filter(l => {
        const sourceNode = graphData.nodes.find(n => n.id === l.source);
        const targetNode = graphData.nodes.find(n => n.id === l.target);
        return (sourceNode?.nodeType === 'note' || !sourceNode?.nodeType) && 
               (targetNode?.nodeType === 'note' || !targetNode?.nodeType);
      });
    } else if (zoomLevel === 'medium') {
      // Show notes + messages for focused note
      visibleNodes = graphData.nodes.filter(n => 
        n.nodeType === 'note' || !n.nodeType || 
        (n.nodeType === 'message' && n.parentNoteId === focusedNoteId)
      );
      visibleLinks = graphData.links.filter(l => {
        const sourceNode = graphData.nodes.find(n => n.id === l.source);
        const targetNode = graphData.nodes.find(n => n.id === l.target);
        return visibleNodes.includes(sourceNode) && visibleNodes.includes(targetNode);
      });
    } else if (zoomLevel === 'close') {
      // Show all nodes
      visibleNodes = graphData.nodes;
      visibleLinks = graphData.links;
    }
    
    return { nodes: visibleNodes, links: visibleLinks };
  }

  /**
   * Limit graph data to specified number of nodes
   * Only limits note nodes, preserves all message nodes
   */
  function limitGraphData(data, limit) {
    // Separate note nodes from message nodes
    const noteNodes = data.nodes.filter(n => n.nodeType === 'note' || !n.nodeType);
    const messageNodes = data.nodes.filter(n => n.nodeType === 'message');
    
    // Sort note nodes by connection count (val)
    const sortedNoteNodes = [...noteNodes].sort((a, b) => (b.val || 0) - (a.val || 0));
    const limitedNoteNodes = sortedNoteNodes.slice(0, limit);
    const noteIds = new Set(limitedNoteNodes.map(n => n.id));

    // Keep only messages whose parent notes are in the limited set
    const limitedMessageNodes = messageNodes.filter(m => noteIds.has(m.parentNoteId));

    // Filter links to only include nodes in the limited set
    const limitedLinks = data.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return (noteIds.has(sourceId) || limitedMessageNodes.some(m => m.id === sourceId)) &&
             (noteIds.has(targetId) || limitedMessageNodes.some(m => m.id === targetId));
    });

    return {
      nodes: [...limitedNoteNodes, ...limitedMessageNodes],
      links: limitedLinks,
      noteNodes: limitedNoteNodes,
      messageNodes: limitedMessageNodes
    };
  }

  /**
   * Show graph unavailable message
   */
  function showGraphUnavailable() {
    if (elements.graphUnavailable) {
      elements.graphUnavailable.hidden = false;
    }
    if (elements.graphToggleBtn) {
      elements.graphToggleBtn.disabled = true;
      elements.graphToggleBtn.title = 'Graph view is not available on this device';
    }
  }
  
  /**
   * Show "no notes" message in graph view
   */
  function showNoNotesMessage() {
    // Hide graph container
    if (elements.graphContainer) {
      elements.graphContainer.style.display = 'none';
    }
    
    // Show empty state if available
    if (elements.emptyState) {
      elements.emptyState.hidden = false;
    }
    
    // Create or show "no notes" message in graph area
    let noNotesMsg = document.getElementById('graph-no-notes');
    if (!noNotesMsg && elements.graphContainer) {
      noNotesMsg = document.createElement('div');
      noNotesMsg.id = 'graph-no-notes';
      noNotesMsg.className = 'blog_no-notes-message';
      noNotesMsg.innerHTML = `
        <div class="blog_no-notes-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <h3>No notes to show</h3>
          <p>Create your first note to see it appear in the graph view.</p>
        </div>
      `;
      elements.graphContainer.parentElement.appendChild(noNotesMsg);
    } else if (noNotesMsg) {
      noNotesMsg.hidden = false;
    }
  }
  
  /**
   * Hide "no notes" message
   */
  function hideNoNotesMessage() {
    const noNotesMsg = document.getElementById('graph-no-notes');
    if (noNotesMsg) {
      noNotesMsg.hidden = true;
    }
    if (elements.graphContainer) {
      elements.graphContainer.style.display = 'block';
    }
  }

  /**
   * Handle graph node click
   */
  function handleGraphNodeClick(node) {
    if (!node) {
      console.warn('handleGraphNodeClick: node is null or undefined');
      return;
    }

    console.log('Graph node clicked:', node); // Debug

    // Handle message node click
    if (node.nodeType === 'message') {
      if (node.post && node.message) {
        // Open modal showing the specific message
        openMessageModal(node.post, node.message);
      }
      return;
    }

    // Handle note node click - zoom in to show messages
    if (node.nodeType === 'note' || !node.nodeType) {
      // Set focused note and zoom in
      state.focusedNoteId = node.id;
      state.graphZoomLevel = 'medium';
      
      // Update graph to show messages for this note
      if (state.fullGraphData) {
        const filteredData = filterGraphDataByZoom(state.fullGraphData, 'medium', node.id);
        state.graph.graphData(filteredData);
        
        // Zoom camera closer to the node
        if (state.graph) {
          // Get node position and zoom to it
          setTimeout(() => {
            try {
              state.graph.zoomToFit(200, 100, (n) => n.id === node.id || (n.parentNoteId === node.id));
            } catch (e) {
              console.warn('Error zooming to node:', e);
            }
          }, 100);
        }
      }
      
      // Also open the note modal
      const post = node.post || state.posts.find(p => {
        const matchesId = p.id === node.id;
        const matchesSlug = p.slug === node.slug;
        return matchesId || matchesSlug;
      });

      if (post) {
        openModal(post);
      }
      
      // If in "both" view, also highlight and scroll to list item
      if (state.currentView === 'both' && post) {
        highlightPost(post.id);
        scrollToPost(post.id);
      }
    }
  }

  /**
   * Handle graph node hover
   */
  function handleGraphNodeHover(node) {
    document.body.style.cursor = node ? 'pointer' : 'default';
    
    // Update hovered node state to trigger highlighting
    const previousHoveredId = state.hoveredNodeId;
    state.hoveredNodeId = node ? node.id : null;
    
    // Trigger re-render if hover state changed
    if (previousHoveredId !== state.hoveredNodeId && state.graph) {
      // Force graph to re-render by updating node colors
      state.graph.nodeColor(state.graph.nodeColor());
      state.graph.linkColor(state.graph.linkColor());
    }
  }

  /**
   * Apply graph filters to show/hide nodes
   */
  function applyGraphFilters() {
    if (!state.graph || !state.fullGraphData) return;
    
    // Filter nodes based on active filters
    let filteredNodes = [...state.fullGraphData.nodes];
    let filteredLinks = [...state.fullGraphData.links];
    
    // Filter by tags
    if (!state.graphFilters.tags) {
      // Hide nodes that only have tag-based connections
      const tagLinkIds = new Set();
      state.fullGraphData.links.forEach(link => {
        if (link.type === 'tag') {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          tagLinkIds.add(sourceId);
          tagLinkIds.add(targetId);
        }
      });
      // Keep nodes that have non-tag connections or are note nodes
      filteredNodes = filteredNodes.filter(node => {
        if (node.nodeType === 'note') return true;
        const hasNonTagLinks = filteredLinks.some(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return (sourceId === node.id || targetId === node.id) && link.type !== 'tag';
        });
        return hasNonTagLinks;
      });
      filteredLinks = filteredLinks.filter(link => link.type !== 'tag');
    }
    
    // Filter orphans
    if (!state.graphFilters.orphans) {
      const connectedNodeIds = new Set();
      filteredLinks.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
      });
      filteredNodes = filteredNodes.filter(node => connectedNodeIds.has(node.id));
    }
    
    // Filter by attachments
    if (state.graphFilters.attachments) {
      filteredNodes = filteredNodes.filter(node => {
        if (node.nodeType === 'message' && node.message) {
          return node.message.attachments && node.message.attachments.length > 0;
        }
        if (node.nodeType === 'note' && node.post) {
          // Check if note has any messages with attachments
          try {
            const content = typeof node.post.content === 'string' ? JSON.parse(node.post.content) : node.post.content;
            if (Array.isArray(content)) {
              return content.some(msg => msg.attachments && msg.attachments.length > 0);
            }
          } catch (e) {}
        }
        return false;
      });
    }
    
    // Update graph with filtered data
    const filteredData = {
      nodes: filteredNodes,
      links: filteredLinks.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return filteredNodes.some(n => n.id === sourceId) && filteredNodes.some(n => n.id === targetId);
      })
    };
    
    state.graph.graphData(filteredData);
  }

  /**
   * Apply graph display settings (colors, sizes, styles)
   */
  function applyGraphDisplay() {
    if (!state.graph) return;
    
    // Always update node color function to use current display settings
    state.graph.nodeColor(node => {
      // Default to white for all nodes (balls/spheres)
      if (node.status === 'missing') {
        return '#666';
      }
      
      // If a node is hovered, highlight it and connected nodes
      if (state.hoveredNodeId && state.fullGraphData && state.fullGraphData.links) {
        const isHovered = node.id === state.hoveredNodeId;
        let isConnected = false;
        for (const link of state.fullGraphData.links) {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          if ((sourceId === state.hoveredNodeId && targetId === node.id) ||
              (targetId === state.hoveredNodeId && sourceId === node.id)) {
            isConnected = true;
            break;
          }
        }
        if (isHovered || isConnected) {
          return state.graphDisplay.highlightColor || '#5DADE2';
        }
      }
      
      // Use the display node color setting
      return state.graphDisplay.nodeColor || '#ffffff';
    });
    
    // Always update link color function to use current display settings
    const linkColorHex = state.graphDisplay.linkColor || '#ffffff';
    const r = parseInt(linkColorHex.slice(1, 3), 16);
    const g = parseInt(linkColorHex.slice(3, 5), 16);
    const b = parseInt(linkColorHex.slice(5, 7), 16);
    const defaultLinkColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
    
    state.graph.linkColor(link => {
      // If a node is hovered, highlight connected links
      if (state.hoveredNodeId && state.fullGraphData && state.fullGraphData.links) {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        if (sourceId === state.hoveredNodeId || targetId === state.hoveredNodeId) {
          const highlightHex = state.graphDisplay.highlightColor || '#5DADE2';
          const hr = parseInt(highlightHex.slice(1, 3), 16);
          const hg = parseInt(highlightHex.slice(3, 5), 16);
          const hb = parseInt(highlightHex.slice(5, 7), 16);
          return `rgba(${hr}, ${hg}, ${hb}, 0.8)`;
        }
      }
      return defaultLinkColor;
    });
    
    // Apply node size
    if (state.graphDisplay.nodeSize) {
      state.graph.nodeVal(node => {
        if (node.nodeType === 'message') {
          return state.graphDisplay.nodeSize * 0.5;
        }
        return state.graphDisplay.nodeSize;
      });
    }
    
    // Apply link width
    if (state.graphDisplay.linkWidth !== undefined) {
      state.graph.linkWidth(() => state.graphDisplay.linkWidth);
    }
    
    // Apply link style
    if (state.graphDisplay.linkStyle) {
      if (state.graphDisplay.linkStyle === 'dashed') {
        state.graph.linkDirectionalParticles(2);
        state.graph.linkDirectionalParticleWidth(1);
      } else if (state.graphDisplay.linkStyle === 'dotted') {
        state.graph.linkDirectionalParticles(4);
        state.graph.linkDirectionalParticleWidth(0.5);
      } else {
        state.graph.linkDirectionalParticles(0);
      }
    }
    
    // Force graph to re-render
    if (state.graph.cooldownTicks) {
      state.graph.cooldownTicks(100);
    }
  }

  /**
   * Apply graph force settings
   * Note: 3d-force-graph uses d3-force internally, but we need d3 to be available
   * For now, we'll use the graph's built-in cooldownTicks to restart simulation
   */
  function applyGraphForces() {
    if (!state.graph) return;
    
    // Convert slider values (0-100) to force graph parameters
    const centerForce = state.graphForces.center / 100;
    const repelForce = state.graphForces.repel / 100;
    const linkForce = state.graphForces.link / 100;
    const linkDistance = 20 + (state.graphForces.distance / 100) * 80; // 20-100 range
    
    // Apply forces using d3Force if available
    // 3d-force-graph bundles d3-force, but we need to access it correctly
    try {
      if (typeof state.graph.d3Force === 'function') {
        // Try to use d3 if available globally or from the graph
        let d3 = window.d3;
        
        // If d3 is not available, we'll need to load it or use alternative approach
        if (!d3) {
          // For now, restart the simulation to apply any changes
          if (state.graph.cooldownTicks) {
            state.graph.cooldownTicks(100);
          }
          console.log('Graph forces updated (d3 not available, using defaults)');
          return;
        }
        
        // Center force
        if (centerForce > 0 && d3.forceCenter) {
          state.graph.d3Force('center', d3.forceCenter().strength(centerForce * 0.1));
        } else {
          state.graph.d3Force('center', null);
        }
        
        // Charge (repel) force
        if (repelForce > 0 && d3.forceManyBody) {
          state.graph.d3Force('charge', d3.forceManyBody().strength(-repelForce * 300));
        } else {
          state.graph.d3Force('charge', null);
        }
        
        // Link force
        if (linkForce > 0 && d3.forceLink) {
          state.graph.d3Force('link', d3.forceLink()
            .id(d => d.id)
            .distance(linkDistance)
            .strength(linkForce));
        } else {
          state.graph.d3Force('link', null);
        }
        
        // Restart simulation
        if (state.graph.cooldownTicks) {
          state.graph.cooldownTicks(100);
        }
      } else {
        // Fallback: restart simulation to apply changes
        if (state.graph.cooldownTicks) {
          state.graph.cooldownTicks(100);
        }
      }
    } catch (e) {
      console.warn('Could not apply graph forces:', e);
      // Fallback: restart simulation
      if (state.graph.cooldownTicks) {
        state.graph.cooldownTicks(100);
      }
    }
  }

  /**
   * Reset graph view
   */
  function resetGraph() {
    if (state.graph) {
      state.graphZoomLevel = 'far';
      state.focusedNoteId = null;
      
      // Reset to show only note nodes
      if (state.fullGraphData) {
        const filteredData = filterGraphDataByZoom(state.fullGraphData, 'far', null);
        state.graph.graphData(filteredData);
      }
      
      state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
      state.graph.zoomToFit(400, 0);
    }
  }

  /**
   * Zoom graph to fit all nodes
   */
  function zoomGraphToFit() {
    if (state.graph) {
      // Reset zoom state
      state.graphZoomLevel = 'far';
      state.focusedNoteId = null;
      
      // Reset camera
      state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
      state.graph.zoomToFit(400, 0);
      
      // Reset to show only notes
      if (state.fullGraphData) {
        const filteredData = filterGraphDataByZoom(state.fullGraphData, 'far', null);
        state.graph.graphData(filteredData);
      }
    }
  }

  // ==========================================================================
  // View Management
  // ==========================================================================
  
  /**
   * Set the current view mode (list only now, graph is modal)
   */
  function setView(view) {
    // Only allow list view now
    if (view !== 'list') {
      view = 'list';
    }
    
    state.currentView = view;
    
    // Update data attribute
    if (elements.blogContent) {
      elements.blogContent.dataset.view = view;
    }

    // Update button states
    elements.viewButtons.forEach(btn => {
      const isActive = btn.dataset.view === view;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive);
    });

    // Save preference
    try {
      localStorage.setItem(CONFIG.storageKey, view);
    } catch (e) {
      // localStorage not available
    }
  }

  /**
   * Open graph modal
   */
  function openGraphModal() {
    if (!elements.graphModal) return;
    
    // Show modal
    elements.graphModal.hidden = false;
    document.body.style.overflow = 'hidden';
    
    // Initialize graph if not already loaded
    if (!state.graphLoaded) {
      initGraph();
    } else {
      // Resize graph to fit modal
      resizeGraphForModal();
    }
  }

  /**
   * Close graph modal
   */
  function closeGraphModal() {
    if (!elements.graphModal) return;
    
    // Hide modal
    elements.graphModal.hidden = true;
    document.body.style.overflow = '';
  }

  /**
   * Resize graph to fit modal container
   */
  function resizeGraphForModal() {
    if (!state.graph) return;
    
    const graphContainer = document.getElementById('graph-container');
    if (!graphContainer) return;
    
    setTimeout(() => {
      if (state.graph && graphContainer) {
        const containerWidth = graphContainer.clientWidth;
        const containerHeight = graphContainer.clientHeight;
        
        if (containerWidth > 0 && containerHeight > 0) {
          state.graph.width(containerWidth);
          state.graph.height(containerHeight);
          
          // Re-center and fit
          state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
          state.graph.zoomToFit(400, 0);
        }
      }
    }, 100);
  }

  /**
   * Load saved view preference
   */
  function loadViewPreference() {
    try {
      const saved = localStorage.getItem(CONFIG.storageKey);
      if (saved && ['list', 'graph', 'both'].includes(saved)) {
        // On mobile, default to list even if another view was saved
        if (isMobile() && saved !== 'list') {
          return 'list';
        }
        return saved;
      }
    } catch (e) {
      // localStorage not available
    }
    return 'list';
  }

  // ==========================================================================
  // Post Interactions
  // ==========================================================================
  
  /**
   * Handle post card click
   */
  function handlePostClick(postId) {
    const post = state.posts.find(p => p.id === postId);
    if (post) {
      openModal(post);
    }
  }

  /**
   * Highlight a post in the list
   */
  function highlightPost(postId) {
    // Remove previous highlight
    const prevHighlighted = elements.blogList.querySelector('.is-highlighted');
    if (prevHighlighted) {
      prevHighlighted.classList.remove('is-highlighted');
    }

    // Add new highlight
    const card = elements.blogList.querySelector(`[data-post-id="${postId}"]`);
    if (card) {
      card.classList.add('is-highlighted');
      state.highlightedPostId = postId;
    }
  }

  /**
   * Scroll to a post in the list
   */
  function scrollToPost(postId) {
    const card = elements.blogList.querySelector(`[data-post-id="${postId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ==========================================================================
  // Modal
  // ==========================================================================
  
  /**
   * Find related notes based on tags, links, and content similarity
   */
  function findRelatedNotes(currentPost, limit = 5) {
    if (!currentPost) return [];
    
    const related = [];
    const currentPostId = currentPost.id;
    const currentTags = new Set(currentPost.tags || []);
    const currentKeywords = extractKeywords(currentPost.content || '');
    
    state.posts.forEach(post => {
      if (post.id === currentPostId) return; // Skip self
      
      let score = 0;
      
      // Score by shared tags
      const postTags = new Set(post.tags || []);
      const sharedTags = [...currentTags].filter(tag => postTags.has(tag));
      score += sharedTags.length * 3;
      
      // Score by direct links
      if (currentPost.links && currentPost.links.includes(post.id)) {
        score += 5;
      }
      if (post.links && post.links.includes(currentPostId)) {
        score += 5;
      }
      
      // Score by keyword overlap
      const postKeywords = extractKeywords(post.content || '');
      const sharedKeywords = currentKeywords.filter(kw => 
        postKeywords.some(pk => pk.toLowerCase() === kw.toLowerCase())
      );
      score += sharedKeywords.length;
      
      // Score by title/content similarity
      const titleSimilarity = calculateSimilarity(
        currentPost.title.toLowerCase(),
        post.title.toLowerCase()
      );
      score += titleSimilarity * 2;
      
      if (score > 0) {
        related.push({ post, score, sharedTags, sharedKeywords });
      }
    });
    
    // Sort by score and return top results
    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.post);
  }
  
  /**
   * Extract keywords from content (simple implementation)
   */
  function extractKeywords(content) {
    if (!content) return [];
    
    // Remove markdown syntax, get words
    const text = content
      .replace(/[#*`\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    
    // Common stop words to filter
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    
    // Extract words (3+ characters, not stop words)
    const words = text.split(/\s+/)
      .filter(word => word.length >= 3 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index); // Unique
    
    // Return top 10 keywords
    return words.slice(0, 10);
  }
  
  /**
   * Calculate simple similarity between two strings
   */
  function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    // Simple word overlap
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;
    
    return union > 0 ? intersection / union : 0;
  }
  
  /**
   * Highlight keywords in text
   */
  function highlightKeywords(text, keywords) {
    if (!text || !keywords || keywords.length === 0) return escapeHtml(text);
    
    let highlighted = escapeHtml(text);
    const keywordPatterns = keywords
      .filter(kw => kw && kw.length >= 3)
      .map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    
    if (keywordPatterns) {
      const regex = new RegExp(`(${keywordPatterns})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="blog_keyword-highlight">$1</mark>');
    }
    
    return highlighted;
  }

  /**
   * Open the modal with post details
   */
  function openModal(post) {
    if (!elements.modal) return;

    // Populate modal
    elements.modalTitle.textContent = post.title;
    elements.modalDate.textContent = formatDate(post.date);

    // Tags
    elements.modalTags.innerHTML = post.tags.map(tag => 
      `<span class="blog_modal-tag">${escapeHtml(tag)}</span>`
    ).join('');

    // Full content with markdown support (if marked.js is available)
    if (elements.modalContent) {
      let contentHtml = '';
      
      // Check if content is a JSON array of messages
      let messages = [];
      try {
        const parsed = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
        if (Array.isArray(parsed)) {
          messages = parsed;
        } else {
          // Single content string
          messages = [{ content: post.content, attachments: [], tags: [] }];
        }
      } catch (e) {
        // Not JSON, treat as plain content
        if (post.content) {
          messages = [{ content: post.content, attachments: [], tags: [] }];
        }
      }

      if (messages.length > 0) {
        // Render messages
        contentHtml = messages.map((msg, index) => {
          const msgDate = msg.created_at ? formatDate(msg.created_at) : '';
          let msgHtml = `<div class="blog-message" data-message-id="${msg.id || index}">`;
          
          // Message header
          msgHtml += `<div class="blog-message-header">`;
          if (msgDate) {
            msgHtml += `<span class="blog-message-date">${msgDate}</span>`;
          }
          msgHtml += `</div>`;
          
          // Message content (this is where the transcript appears - as the message text)
          if (msg.content) {
            let content = '';
            if (window.marked) {
              try {
                // Remove "# Audio Transcript" header if present
                let cleanedContent = msg.content.replace(/^#\s*Audio\s+Transcript\s*\n*/i, '').trim();
                content = window.marked.parse(cleanedContent, { breaks: true, gfm: true });
              } catch (e) {
                content = escapeHtml(msg.content).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
                content = `<p>${content}</p>`;
              }
            } else {
              content = escapeHtml(msg.content).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
              content = `<p>${content}</p>`;
            }
            msgHtml += `<div class="blog-message-content">${content}</div>`;
          }
          
          // Attachments
          if (msg.attachments && msg.attachments.length > 0) {
            msgHtml += `<div class="blog-message-attachments">`;
            msg.attachments.forEach(att => {
              if (att.type === 'image' && att.url) {
                msgHtml += `<div class="blog-attachment-image"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name || 'Image')}" loading="lazy"></div>`;
              } else if (att.type === 'audio' && att.url) {
                msgHtml += `<div class="blog-attachment-audio"><audio controls src="${escapeHtml(att.url)}"></audio>`;
                // Don't show transcription inline - it's already in the message content
                // Only show a button to view formatted transcript in a modal if user wants
                // Check if transcription exists and is different from message content
                const hasSeparateTranscript = att.transcription && att.transcription.trim() && 
                  msg.content && msg.content.trim() && 
                  att.transcription.trim() !== msg.content.trim();
                if (hasSeparateTranscript) {
                  msgHtml += `<button type="button" class="blog-view-transcript-btn" data-transcription="${escapeHtml(att.transcription)}" aria-label="View formatted transcript">View Formatted Transcript</button>`;
                }
                msgHtml += `</div>`;
              } else if (att.type === 'video' && att.url) {
                msgHtml += `<div class="blog-attachment-video"><video controls src="${escapeHtml(att.url)}"></video></div>`;
              } else if (att.url) {
                msgHtml += `<div class="blog-attachment-file"><a href="${escapeHtml(att.url)}" target="_blank">${escapeHtml(att.name || 'File')}</a></div>`;
              }
            });
            msgHtml += `</div>`;
          }
          
          // Tags
          if (msg.tags && msg.tags.length > 0) {
            msgHtml += `<div class="blog-message-tags">`;
            msg.tags.forEach(tag => {
              const tagColor = getTagColorForBlog(tag);
              msgHtml += `<span class="blog-message-tag" style="background-color: ${tagColor}; color: ${getContrastColorForBlog(tagColor)}">${escapeHtml(tag)}</span>`;
            });
            msgHtml += `</div>`;
          }
          
          msgHtml += `</div>`;
          return msgHtml;
        }).join('');
      } else {
        contentHtml = '<p style="color: rgba(255,255,255,0.5);">No content</p>';
      }
      
      elements.modalContent.innerHTML = contentHtml;
      
      // Add event listeners for transcript buttons
      elements.modalContent.querySelectorAll('.blog-view-transcript-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const transcription = btn.getAttribute('data-transcription');
          if (transcription) {
            showTranscriptModal(transcription);
          }
        });
      });
    }

    // Find and display related notes
    const relatedNotes = findRelatedNotes(post, 5);
    if (elements.modalRelatedNotes) {
      if (relatedNotes.length > 0) {
        const currentKeywords = extractKeywords(post.content || '');
        elements.modalRelatedNotes.innerHTML = relatedNotes.map(relatedPost => {
          const excerpt = extractExcerpt(relatedPost.content || '', 100);
          const highlightedExcerpt = highlightKeywords(excerpt, currentKeywords);
          const highlightedTitle = highlightKeywords(relatedPost.title, currentKeywords);
          
          return `
            <div class="blog_related-note-tile" data-post-id="${escapeHtml(relatedPost.id)}" role="button" tabindex="0">
              <h5 class="blog_related-note-title">${highlightedTitle}</h5>
              <p class="blog_related-note-excerpt">${highlightedExcerpt}</p>
              ${relatedPost.tags && relatedPost.tags.length > 0 ? `
                <div class="blog_related-note-tags">
                  ${relatedPost.tags.slice(0, 3).map(tag => 
                    `<span class="blog_related-note-tag">${escapeHtml(tag)}</span>`
                  ).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
        
        // Add click handlers to related note tiles
        elements.modalRelatedNotes.querySelectorAll('.blog_related-note-tile').forEach(tile => {
          tile.addEventListener('click', () => {
            const relatedPost = state.posts.find(p => p.id === tile.dataset.postId);
            if (relatedPost) {
              openModal(relatedPost);
            }
          });
          tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const relatedPost = state.posts.find(p => p.id === tile.dataset.postId);
              if (relatedPost) {
                openModal(relatedPost);
              }
            }
          });
        });
      } else {
        elements.modalRelatedNotes.innerHTML = '<p style="color: rgba(255,255,255,0.5); font-size: 0.875rem;">No related notes found</p>';
      }
    }

    // Show modal
    elements.modal.hidden = false;
    elements.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus management
    if (elements.modalClose) {
      elements.modalClose.focus();
    }

    // Trap focus in modal (remove old listener first to avoid duplicates)
    elements.modal.removeEventListener('keydown', trapFocus);
    elements.modal.addEventListener('keydown', trapFocus);
  }

  /**
   * Close the modal
   */
  function closeModal() {
    if (!elements.modal) {
      console.warn('Modal element not found');
      return;
    }

    console.log('Closing modal'); // Debug
    
    elements.modal.hidden = true;
    elements.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (elements.modal) {
      elements.modal.removeEventListener('keydown', trapFocus);
    }
  }

  /**
   * Trap focus within modal
   */
  function trapFocus(e) {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusableElements = elements.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }

  // ==========================================================================
  // Search & Filter
  // ==========================================================================
  
  /**
   * Handle search input
   */
  const handleSearch = debounce((query) => {
    state.searchQuery = query;
    renderListView(state.posts);
  }, CONFIG.debounceDelay);

  /**
   * Handle tag filter click
   */
  function handleTagClick(tag) {
    // Toggle tag
    state.activeTag = state.activeTag === tag ? null : tag;
    
    // Update button states
    elements.tagFilters.querySelectorAll('.blog_tag-btn').forEach(btn => {
      const isActive = btn.dataset.tag === state.activeTag;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive);
    });

    // Re-render list
    renderListView(state.posts);
  }

  /**
   * Handle author filter click
   */
  function handleAuthorClick(author) {
    // Toggle author
    state.activeAuthor = state.activeAuthor === author ? null : author;
    
    // Update button states
    elements.authorFilters.querySelectorAll('.blog_author-btn').forEach(btn => {
      const isActive = btn.dataset.author === state.activeAuthor;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive);
    });

    // Re-render list
    renderListView(state.posts);
  }

  /**
   * Clear all filters
   */
  function clearFilters() {
    state.searchQuery = '';
    state.activeTag = null;
    state.activeAuthor = null;
    
    if (elements.searchInput) {
      elements.searchInput.value = '';
    }
    
    renderTagFilters(state.posts);
    renderAuthorFilters(state.posts);
    renderListView(state.posts);
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================
  
  /**
   * Show error message
   */
  function showError(message) {
    if (elements.blogList) {
      elements.blogList.innerHTML = `
        <div class="blog_loading">
          <p style="color: #ff6b6b;">${escapeHtml(message)}</p>
          <button type="button" class="blog_empty-reset" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================
  
  /**
   * Check auth state and update UI
   */
  async function checkAuthState() {
    if (!window.SWFTAuth || !window.SWFTAuth.supabase) {
      // Show subtle collaborator button if auth not available
      if (elements.collaboratorAccess) elements.collaboratorAccess.style.display = 'block';
      if (elements.authActions) elements.authActions.style.display = 'none';
      return;
    }
    
    try {
      const { data: { session }, error } = await window.SWFTAuth.supabase.auth.getSession();
      
      if (error) throw error;
      
      if (session && session.user) {
        // User is signed in - show auth actions, hide collaborator button
        state.currentUser = session.user;
        if (elements.collaboratorAccess) elements.collaboratorAccess.style.display = 'none';
        if (elements.authActions) elements.authActions.style.display = 'flex';
      } else {
        // Not signed in - show subtle collaborator button
        state.currentUser = null;
        if (elements.collaboratorAccess) elements.collaboratorAccess.style.display = 'block';
        if (elements.authActions) elements.authActions.style.display = 'none';
      }
    } catch (error) {
      console.error('Auth check error:', error);
      state.currentUser = null;
      // Show subtle collaborator button on error
      if (elements.collaboratorAccess) elements.collaboratorAccess.style.display = 'block';
      if (elements.authActions) elements.authActions.style.display = 'none';
    }
  }
  
  /**
   * Check if current user owns the note
   */
  function isNoteOwner(post) {
    if (!state.currentUser) return false;
    // Check by user_id (preferred) or user_email (fallback)
    return (post.user_id && post.user_id === state.currentUser.id) ||
           (post.user_email && post.user_email === state.currentUser.email);
  }
  
  /**
   * Handle sign out
   */
  async function handleSignOut() {
    if (!window.SWFTAuth || !window.SWFTAuth.supabase) return;
    
    try {
      await window.SWFTAuth.supabase.auth.signOut();
      state.currentUser = null;
      // Update UI
      await checkAuthState();
      // Re-render list to hide edit/delete buttons
      renderListView(state.posts);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  }
  
  /**
   * Open edit modal for a note
   */
  function openEditModal(noteId) {
    if (!state.currentUser || !window.SWFTAuth || !window.SWFTAuth.supabase) {
      console.warn('User not authenticated');
      return;
    }
    
    const post = state.posts.find(p => p.id === noteId);
    if (!post) {
      console.error('Note not found:', noteId);
      return;
    }
    
    if (!isNoteOwner(post)) {
      console.warn('User does not own this note');
      return;
    }
    
    // Populate edit form
    if (elements.editTitle) elements.editTitle.value = post.title;
    if (elements.editContent) elements.editContent.value = post.content;
    if (elements.editTags) elements.editTags.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
    
    // Store note ID for save
    if (elements.editForm) elements.editForm.dataset.noteId = noteId;
    
    // Show modal
    if (elements.editModal) {
      elements.editModal.hidden = false;
      elements.editModal.setAttribute('aria-hidden', 'false');
    }
  }
  
  /**
   * Close edit modal
   */
  function closeEditModal() {
    if (elements.editModal) {
      elements.editModal.hidden = true;
      elements.editModal.setAttribute('aria-hidden', 'true');
    }
    if (elements.editForm) {
      elements.editForm.dataset.noteId = '';
      elements.editForm.reset();
    }
  }
  
  /**
   * Update a note in Supabase
   */
  async function updateNote(noteId, updates) {
    if (!window.SWFTAuth || !window.SWFTAuth.supabase || !state.currentUser) {
      throw new Error('Not authenticated');
    }
    
    const supabase = window.SWFTAuth.supabase;
    
    // Parse tags from comma-separated string
    const tags = updates.tags 
      ? updates.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];
    
    const updateData = {
      title: updates.title,
      content: updates.content,
      tags: tags,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('notes')
      .update(updateData)
      .eq('id', noteId)
      .eq('user_id', state.currentUser.id) // Ensure user owns the note
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
  }
  
  /**
   * Delete a note from Supabase
   */
  async function deleteNote(noteId) {
    if (!window.SWFTAuth || !window.SWFTAuth.supabase || !state.currentUser) {
      throw new Error('Not authenticated');
    }
    
    const supabase = window.SWFTAuth.supabase;
    
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', state.currentUser.id); // Ensure user owns the note
    
    if (error) throw error;
  }
  
  /**
   * Confirm and delete a note
   */
  async function confirmDelete(noteId) {
    const post = state.posts.find(p => p.id === noteId);
    if (!post) return;
    
    if (!isNoteOwner(post)) {
      alert('You can only delete your own notes.');
      return;
    }
    
    const confirmed = confirm(`Are you sure you want to delete "${post.title}"? This action cannot be undone.`);
    if (!confirmed) return;
    
    try {
      await deleteNote(noteId);
      
      // Remove from state
      state.posts = state.posts.filter(p => p.id !== noteId);
      
      // Refresh UI
      renderListView(state.posts);
      renderTagFilters(state.posts);
      renderAuthorFilters(state.posts);
      
      // Rebuild graph if loaded
      if (state.graphLoaded && state.graph) {
        // Rebuild graph data
        state.graphData = buildGraphData(state.posts);
        // Update graph with new data
        state.graph.graphData(state.graphData);
        // Re-center the graph after update
        setTimeout(() => {
          if (state.graph) {
            state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
            state.graph.zoomToFit(400, 0);
          }
        }, 100);
      }
      
      console.log('Note deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete note. Please try again.');
    }
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  
  function setupEventListeners() {
    // Collaborator sign-in button (subtle)
    if (elements.collaboratorSigninBtn) {
      elements.collaboratorSigninBtn.addEventListener('click', () => {
        window.location.href = '/auth.html';
      });
    }
    
    // Graph sidebar section toggles
    if (elements.graphSectionToggles) {
      elements.graphSectionToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
          const section = toggle.getAttribute('data-section');
          const content = document.getElementById(`${section}-content`);
          const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
          
          toggle.setAttribute('aria-expanded', !isExpanded);
          if (content) {
            content.hidden = isExpanded;
          }
        });
      });
    }
    
    // Graph filter toggles
    if (elements.filterTags) {
      elements.filterTags.addEventListener('change', (e) => {
        state.graphFilters.tags = e.target.checked;
        applyGraphFilters();
      });
    }
    if (elements.filterAttachments) {
      elements.filterAttachments.addEventListener('change', (e) => {
        state.graphFilters.attachments = e.target.checked;
        applyGraphFilters();
      });
    }
    if (elements.filterExistingFiles) {
      elements.filterExistingFiles.addEventListener('change', (e) => {
        state.graphFilters.existingFilesOnly = e.target.checked;
        applyGraphFilters();
      });
    }
    if (elements.filterOrphans) {
      elements.filterOrphans.addEventListener('change', (e) => {
        state.graphFilters.orphans = e.target.checked;
        applyGraphFilters();
      });
    }
    
    // Graph force sliders
    if (elements.forceCenter) {
      elements.forceCenter.addEventListener('input', (e) => {
        state.graphForces.center = parseInt(e.target.value);
        applyGraphForces();
      });
    }
    if (elements.forceRepel) {
      elements.forceRepel.addEventListener('input', (e) => {
        state.graphForces.repel = parseInt(e.target.value);
        applyGraphForces();
      });
    }
    if (elements.forceLink) {
      elements.forceLink.addEventListener('input', (e) => {
        state.graphForces.link = parseInt(e.target.value);
        applyGraphForces();
      });
    }
    if (elements.forceDistance) {
      elements.forceDistance.addEventListener('input', (e) => {
        state.graphForces.distance = parseInt(e.target.value);
        applyGraphForces();
      });
    }
    
    // Graph display color/size controls
    if (elements.displayNodeColor) {
      elements.displayNodeColor.addEventListener('input', (e) => {
        state.graphDisplay.nodeColor = e.target.value;
        applyGraphDisplay();
      });
    }
    if (elements.displayLinkColor) {
      elements.displayLinkColor.addEventListener('input', (e) => {
        state.graphDisplay.linkColor = e.target.value;
        applyGraphDisplay();
      });
    }
    if (elements.displayHighlightColor) {
      elements.displayHighlightColor.addEventListener('input', (e) => {
        state.graphDisplay.highlightColor = e.target.value;
        applyGraphDisplay();
      });
    }
    if (elements.displayNodeSize) {
      elements.displayNodeSize.addEventListener('input', (e) => {
        state.graphDisplay.nodeSize = parseInt(e.target.value);
        applyGraphDisplay();
      });
    }
    if (elements.displayLinkWidth) {
      elements.displayLinkWidth.addEventListener('input', (e) => {
        state.graphDisplay.linkWidth = parseFloat(e.target.value);
        applyGraphDisplay();
      });
    }
    if (elements.displayLinkStyle) {
      elements.displayLinkStyle.addEventListener('change', (e) => {
        state.graphDisplay.linkStyle = e.target.value;
        applyGraphDisplay();
      });
    }
    
    // Sign out button
    if (elements.signOutBtn) {
      elements.signOutBtn.addEventListener('click', handleSignOut);
    }
    
    // Listen for auth state changes
    if (window.SWFTAuth && window.SWFTAuth.supabase) {
      window.SWFTAuth.supabase.auth.onAuthStateChange(() => {
        checkAuthState();
        // Re-render list to show/hide edit/delete buttons
        renderListView(state.posts);
      });
    }
    
    // Edit form submission
    if (elements.editForm) {
      elements.editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const noteId = elements.editForm.dataset.noteId;
        if (!noteId) return;
        
        const title = elements.editTitle?.value.trim();
        const content = elements.editContent?.value.trim();
        const tags = elements.editTags?.value.trim();
        
        if (!title) {
          alert('Title is required');
          return;
        }
        
        try {
          const updatedNote = await updateNote(noteId, { title, content, tags });
          
          // Update the note in state.posts
          const postIndex = state.posts.findIndex(p => p.id === noteId);
          if (postIndex !== -1) {
            // Re-fetch to get updated data
            state.posts = await fetchBlogDataFromSupabase();
            
            // Refresh UI
            renderListView(state.posts);
            renderTagFilters(state.posts);
            renderAuthorFilters(state.posts);
            
            // Rebuild graph if loaded
            if (state.graphLoaded && state.graph) {
              // Rebuild graph data
              state.graphData = buildGraphData(state.posts);
              // Update graph with new data
              state.graph.graphData(state.graphData);
              // Re-center the graph after update
              setTimeout(() => {
                if (state.graph) {
                  state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
                  state.graph.zoomToFit(400, 0);
                }
              }, 100);
            }
          }
          
          closeEditModal();
          console.log('Note updated successfully');
        } catch (error) {
          console.error('Update error:', error);
          alert('Failed to update note. Please try again.');
        }
      });
    }
    
    // Edit modal close buttons
    if (elements.editCloseBtn) {
      elements.editCloseBtn.addEventListener('click', closeEditModal);
    }
    if (elements.editCancelBtn) {
      elements.editCancelBtn.addEventListener('click', closeEditModal);
    }
    if (elements.editModal) {
      const backdrop = elements.editModal.querySelector('.blog_modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', closeEditModal);
      }
    }
    
    // Close edit modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.editModal && !elements.editModal.hidden) {
        closeEditModal();
      }
    });
    
    // Search input
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        handleSearch(e.target.value);
      });
    }

    // Sort select
    if (elements.sortSelect) {
      elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderListView(state.posts);
      });
    }

    // View toggle buttons
    elements.viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'graph') {
          // Open graph modal instead of switching views
          openGraphModal();
        } else {
          // List view - just switch views
          setView(view);
        }
      });
    });
    
    // Graph modal close handlers
    if (elements.graphModalClose) {
      elements.graphModalClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeGraphModal();
      });
    }
    
    if (elements.graphModalBackdrop) {
      elements.graphModalBackdrop.addEventListener('click', () => {
        closeGraphModal();
      });
    }
    
    // ESC key to close graph modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.graphModal && !elements.graphModal.hidden) {
        closeGraphModal();
      }
    });

    // Graph controls
    if (elements.graphResetBtn) {
      elements.graphResetBtn.addEventListener('click', resetGraph);
    }
    if (elements.graphZoomFitBtn) {
      elements.graphZoomFitBtn.addEventListener('click', zoomGraphToFit);
    }

    // Modal close button - use event delegation on document for reliability
    // This ensures it works even if the button is dynamically added/removed
    document.addEventListener('click', (e) => {
      // Close button click - check if clicking on button or any child element (like SVG)
      const closeButton = e.target.closest('.blog_modal-close');
      if (closeButton && elements.modal && !elements.modal.hidden) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Close button clicked'); // Debug
        closeModal();
        return;
      }
      
      // Backdrop click - check if click is on backdrop or modal container (not content)
      if (!elements.modal.hidden && elements.modal && elements.modal.contains(e.target)) {
        const clickedBackdrop = e.target.classList.contains('blog_modal-backdrop');
        const clickedModalContainer = e.target === elements.modal;
        
        if (clickedBackdrop || clickedModalContainer) {
          e.preventDefault();
          e.stopPropagation();
          console.log('Backdrop clicked'); // Debug
          closeModal();
          return;
        }
      }
    }, true); // Use capture phase to catch events earlier
    
    // Prevent clicks on modal content from closing the modal
    // But allow close button clicks to propagate
    if (elements.modal) {
      const modalContent = elements.modal.querySelector('.blog_modal-content');
      if (modalContent) {
        modalContent.addEventListener('click', (e) => {
          // Only stop propagation if NOT clicking on close button
          const isCloseButton = e.target.closest('.blog_modal-close');
          if (!isCloseButton) {
            e.stopPropagation();
          }
        }, false); // Use bubble phase so close button handler in capture phase runs first
      }
    }

    // Clear filters
    if (elements.clearFiltersBtn) {
      elements.clearFiltersBtn.addEventListener('click', clearFilters);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Close modal on Escape
      if (e.key === 'Escape' && !elements.modal.hidden) {
        closeModal();
      }
    });

    // Window resize - resize graph if modal is open
    window.addEventListener('resize', debounce(() => {
      if (state.graph && elements.graphModal && !elements.graphModal.hidden) {
        resizeGraphForModal();
      }
    }, 200));
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // Check auth state and update UI
    await checkAuthState();
    
    // Setup event listeners
    setupEventListeners();

    // Load view preference (default to list, graph is now modal)
    const preferredView = 'list'; // Always default to list view

    // Fetch and render posts
    const posts = await fetchBlogData();
    
    // If no posts, show empty state
    if (posts.length === 0) {
      if (elements.emptyState) {
        elements.emptyState.hidden = false;
      }
      // If switching to graph view, show no notes message
      if (preferredView === 'graph' || preferredView === 'both') {
        showNoNotesMessage();
      }
    } else {
      if (elements.emptyState) {
        elements.emptyState.hidden = true;
      }
    }
    
    if (posts.length > 0) {
      renderTagFilters(posts);
      renderAuthorFilters(posts);
      renderListView(posts);
      
      // Build graph data from fetched posts
      if (isWebGLAvailable() && !prefersReducedMotion()) {
        await fetchGraphData(); // This will build from posts if available
      }
    }

    // Set initial view
    setView(preferredView);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
