/**
 * SWFT Studios Mind Map JavaScript
 * 
 * Features:
 * - List view with search and tag filtering
 * - 3D Mind Map view with lazy-loaded 3d-force-graph
 * - Modal preview for Thought Sessions
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
    fullGraphData: null, // Store all nodes including ideas
    graph: null,
    graphLoaded: false,
    graphLibraryLoaded: false,
    currentView: 'list', // 'list' or 'mind-map' (mobile only, desktop shows both)
    isDesktop: false, // Track if we're on desktop (split view)
    searchQuery: '',
    activeTag: null,
    activeAuthor: null,
    sortBy: 'date-desc',
    highlightedPostId: null,
    currentUser: null, // Track current authenticated user
    graphZoomLevel: 'session-only', // Start with sessions only - click to expand
    focusedSessionId: null, // Currently focused Thought Session for idea display
    expandedSessions: new Set(), // Track which Thought Sessions are expanded to show ideas
    hoveredNodeId: null, // Currently hovered node for highlighting
    tagColors: {}, // Cache of tag colors from database { tagName: color }
    orbitActive: true, // Camera orbit animation state
    orbitAngle: 0, // Current orbit angle
    orbitInterval: null, // Interval ID for orbit animation
    orbitSpeed: 180, // Orbit speed (0-360 scale, 0=no orbit, 360=full speed)
    currentOrbitSpeed: 180, // Current actual orbit speed (for easing)
    targetOrbitSpeed: 180, // Target orbit speed (for easing)
    orbitAnimationFrame: null, // RequestAnimationFrame ID
    orbitEasingStartTime: null, // Easing start timestamp
    orbitEasingFromSpeed: 180, // Speed when easing started
    orbitIsEasing: false, // Whether currently easing
    bloomPass: null, // Reference to bloom pass for brightness control
    threeJsWarningLogged: false, // Track if we've logged THREE.js warning
    currentMedia: null, // Currently playing audio/video element
    allMediaElements: [], // Track all audio/video elements on page
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
      highlightColor: '#BEFFF2',
      linkWidth: 0.5, // Thin lines by default
      sessionColor: '#BEFFF2',
      messageColor: '#ffffff',
      tagOverrides: {}
    },
    orbitResumeTimer: null,
    autoFitTimer: null,
    lastNodeClick: null, // Track last clicked node for double-click detection
    lastNodeClickTime: 0, // Timestamp of last node click
    orbitAutoResumeTimer: null // Timer for auto-resuming orbit after 90 seconds of inactivity when paused
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
    graphSettingsToggle: document.getElementById('graph-settings-toggle'),
    graphSettingsSave: document.getElementById('graph-settings-save'),
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
    displaySessionColor: document.getElementById('display-session-color'),
    displayMessageColor: document.getElementById('display-message-color'),
    tagOverrideName: document.getElementById('tag-override-name'),
    tagOverrideColor: document.getElementById('tag-override-color'),
    tagOverrideAdd: document.getElementById('tag-override-add'),
    legendList: document.getElementById('legend-list'),
    displayLinkWidth: document.getElementById('display-link-width'),
    orbitSpeedSlider: document.getElementById('orbit-speed-slider'),
    bloomBrightnessSlider: document.getElementById('bloom-brightness-slider'),
    graphSidebarToggle: document.getElementById('graph-sidebar-toggle'),
    graphModal: document.getElementById('graph-modal'),
    graphModalClose: document.getElementById('graph-modal-close'),
    graphModalBackdrop: document.querySelector('.blog_graph-modal-backdrop'),
    mindmapSettingsBtn: document.getElementById('mindmap-settings-btn'),
    mindmapSettingsModal: document.getElementById('mindmap-settings-modal'),
    mindmapSettingsClose: document.getElementById('mindmap-settings-close'),
    mindmapSettingsBackdrop: document.querySelector('.blog_mindmap-modal-backdrop'),
    mediaControls: document.getElementById('media-controls'),
    mediaPlayBtn: document.getElementById('media-play-btn'),
    mediaPauseBtn: document.getElementById('media-pause-btn'),
    mediaStopBtn: document.getElementById('media-stop-btn')
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
   * Load graph display colors from localStorage
   */
  function loadColorPrefs() {
    try {
      const saved = localStorage.getItem('graphColorPrefs');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.graphDisplay.sessionColor = parsed.sessionColor || state.graphDisplay.sessionColor;
        state.graphDisplay.messageColor = parsed.messageColor || state.graphDisplay.messageColor;
        state.graphDisplay.tagOverrides = parsed.tagOverrides || {};
      }
    } catch (e) {
      console.warn('Failed to load color prefs', e);
    }
  }

  /**
   * Save graph display colors to localStorage
   */
  function saveColorPrefs() {
    try {
      const payload = {
        sessionColor: state.graphDisplay.sessionColor,
        messageColor: state.graphDisplay.messageColor,
        tagOverrides: state.graphDisplay.tagOverrides
      };
      localStorage.setItem('graphColorPrefs', JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save color prefs', e);
    }
  }

  /**
   * Save all graph settings to localStorage
   */
  function saveGraphSettings() {
    try {
      const settings = {
        graphDisplay: {
          nodeColor: state.graphDisplay.nodeColor,
          linkColor: state.graphDisplay.linkColor,
          highlightColor: state.graphDisplay.highlightColor,
          linkWidth: state.graphDisplay.linkWidth,
          sessionColor: state.graphDisplay.sessionColor,
          messageColor: state.graphDisplay.messageColor,
          tagOverrides: state.graphDisplay.tagOverrides
        },
        graphForces: {
          center: state.graphForces.center,
          repel: state.graphForces.repel,
          link: state.graphForces.link,
          distance: state.graphForces.distance
        },
        orbitSpeed: state.orbitSpeed,
        bloomBrightness: state.bloomPass ? state.bloomPass.strength : 1.5
      };
      localStorage.setItem('graphSettings', JSON.stringify(settings));
      // Also save color prefs for backward compatibility
      saveColorPrefs();
    } catch (e) {
      console.warn('Failed to save graph settings', e);
    }
  }

  /**
   * Load all graph settings from localStorage
   */
  function loadGraphSettings() {
    try {
      const saved = localStorage.getItem('graphSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.graphDisplay) {
          Object.assign(state.graphDisplay, parsed.graphDisplay);
          // Update UI controls
          if (elements.displayNodeColor) elements.displayNodeColor.value = state.graphDisplay.nodeColor;
          if (elements.displayLinkColor) elements.displayLinkColor.value = state.graphDisplay.linkColor;
          if (elements.displayHighlightColor) elements.displayHighlightColor.value = state.graphDisplay.highlightColor;
          if (elements.displayLinkWidth) elements.displayLinkWidth.value = state.graphDisplay.linkWidth;
          if (elements.displaySessionColor) elements.displaySessionColor.value = state.graphDisplay.sessionColor;
          if (elements.displayMessageColor) elements.displayMessageColor.value = state.graphDisplay.messageColor;
        }
        if (parsed.graphForces) {
          Object.assign(state.graphForces, parsed.graphForces);
          // Update UI controls
          if (elements.forceCenter) elements.forceCenter.value = state.graphForces.center;
          if (elements.forceRepel) elements.forceRepel.value = state.graphForces.repel;
          if (elements.forceLink) elements.forceLink.value = state.graphForces.link;
          if (elements.forceDistance) elements.forceDistance.value = state.graphForces.distance;
        }
        if (parsed.orbitSpeed !== undefined) {
          state.orbitSpeed = parsed.orbitSpeed;
          if (elements.orbitSpeedSlider) elements.orbitSpeedSlider.value = parsed.orbitSpeed;
        } else {
          // Default to 180 (half speed) if not saved
          state.orbitSpeed = 180;
        }
        if (parsed.bloomBrightness !== undefined) {
          if (state.bloomPass) {
            state.bloomPass.strength = parsed.bloomBrightness;
          }
          if (elements.bloomBrightnessSlider) elements.bloomBrightnessSlider.value = parsed.bloomBrightness;
        }
      }
      // Also load color prefs for backward compatibility
      loadColorPrefs();
    } catch (e) {
      console.warn('Failed to load graph settings', e);
      // Fallback to color prefs only
      loadColorPrefs();
    }
  }

  /**
   * Check if sidebar is visible and log its state
   */
  function checkSidebarVisibility() {
    const sidebar = elements.graphSidebar;
    if (!sidebar) {
      console.log('[Settings Debug] Sidebar element not found');
      return false;
    }
    
    const isHidden = sidebar.hasAttribute('hidden');
    const computedStyle = window.getComputedStyle(sidebar);
    const zIndex = computedStyle.zIndex;
    const display = computedStyle.display;
    const visibility = computedStyle.visibility;
    const opacity = computedStyle.opacity;
    const rect = sidebar.getBoundingClientRect();
    
    const isVisible = !isHidden && display !== 'none' && visibility !== 'hidden' && opacity !== '0';
    
    console.log('[Settings Debug] Sidebar visibility check:', {
      isHidden: isHidden,
      display: display,
      visibility: visibility,
      opacity: opacity,
      zIndex: zIndex,
      isVisible: isVisible,
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      },
      isInViewport: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0
    });
    
    return isVisible;
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
  /**
   * Get tag color from database cache or default
   */
  function getTagColorForBlog(tag) {
    if (!tag) return '#ffffff'; // Default white
    
    const normalizedTag = tag.toLowerCase();
    
    // Check user overrides first
    if (state.graphDisplay.tagOverrides && state.graphDisplay.tagOverrides[normalizedTag]) {
      return state.graphDisplay.tagOverrides[normalizedTag];
    }
    
    // Check database cache first
    if (state.tagColors && state.tagColors[normalizedTag]) {
      return state.tagColors[normalizedTag];
    }
    
    // Fallback to Settings (legacy)
    if (window.Settings && window.Settings.settings && window.Settings.settings.tagColors) {
      return window.Settings.settings.tagColors[normalizedTag] || '#ffffff';
    }
    
    return '#ffffff'; // Default white
  }
  
  /**
   * Load tag colors from database
   */
  async function loadTagColors() {
    try {
      // Get supabase client from SWFTAuth
      const supabase = window.SWFTAuth?.supabase;
      if (!supabase) {
        console.log('[loadTagColors] Supabase not available, skipping tag color load');
        state.tagColors = {};
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        state.tagColors = {};
        return;
      }
      
      const { data: tags, error } = await supabase
        .from('tags')
        .select('name, color')
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Build color cache
      state.tagColors = {};
      if (tags) {
        tags.forEach(tag => {
          state.tagColors[tag.name.toLowerCase()] = tag.color || '#ffffff';
        });
      }
      
      console.log('[loadTagColors] Loaded', Object.keys(state.tagColors).length, 'tag colors from database');
      
      // Update graph if it exists
      if (state.graph) {
        applyGraphDisplay();
      }
      
    } catch (error) {
      console.error('[loadTagColors] Error loading tag colors:', error);
      state.tagColors = {};
    }
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
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:522',message:'fetchBlogDataFromSupabase entry',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    try {
      // Initialize Supabase client if not already available
      if (!window.SWFTAuth || !window.SWFTAuth.supabase) {
        const { createClient } = window.supabase;
        window.SWFTAuth = window.SWFTAuth || {};
        window.SWFTAuth.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
      }
      
      const supabase = window.SWFTAuth.supabase;
      
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      const isAuthenticated = !!session;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:535',message:'Auth check result',data:{isAuthenticated,hasSession:!!session,userId:session?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Fetch Thought Sessions from Supabase
      // If authenticated, show all Thought Sessions (published + drafts)
      // If not authenticated, show only published Thought Sessions
      let query = supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!isAuthenticated) {
        // For non-authenticated users, only show published Thought Sessions
        query = query.eq('status', 'published');
      } else {
        // For authenticated users, show all their Thought Sessions (published + drafts)
        // Explicitly filter by user_id to ensure we get all user's sessions
        const userId = session?.user?.id;
        if (userId) {
          query = query.eq('user_id', userId);
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:555',message:'Added user_id filter',data:{userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        }
        console.log('User authenticated, loading all Thought Sessions (published + drafts)');
      }
      
      const { data: notes, error } = await query;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:554',message:'Query result BEFORE error check',data:{notesCount:notes?.length||0,hasError:!!error,errorCode:error?.code,errorMessage:error?.message,isAuthenticated},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (error) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:556',message:'Query error thrown',data:{errorCode:error.code,errorMessage:error.message,errorDetails:error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw error;
      }
      
      console.log(`Found ${notes.length} Thought Sessions in Supabase${isAuthenticated ? ' (all statuses)' : ' (published only)'}`);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:559',message:'Notes fetched successfully',data:{notesCount:notes.length,noteIds:notes.map(n=>n.id),statuses:notes.map(n=>n.status)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Transform Supabase Thought Sessions to blog post format
      const posts = notes.map(note => {
        // Parse content - it might be a JSON string of ideas or plain text
        let content = note.content || '';
        let messages = []; // messages array contains ideas
        
        // Try to parse as JSON (messages array)
        if (content && typeof content === 'string' && content.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              messages = parsed;
              // Extract text content from messages for description/excerpt
              const textContent = messages
                .map(msg => msg.content || '')
                .filter(c => c)
                .join(' ');
              content = textContent || content;
            }
          } catch (e) {
            // Not JSON, treat as plain text
            console.log(`[fetchBlogData] Note ${note.id} content is not JSON, treating as plain text`);
          }
        }
        
        // Extract links from content (wiki-style [[links]])
        const links = extractLinks(content);
        
        return {
          id: note.id,
          slug: slugify(note.title),
          title: note.title,
          description: extractExcerpt(content, 150),
          date: note.created_at ? note.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          tags: Array.isArray(note.tags) ? note.tags : [],
          author: note.user_email ? note.user_email.split('@')[0] : 'Unknown',
          user_email: note.user_email, // Store for ownership check
          user_id: note.user_id, // Store for ownership check
          image: note.file_urls && note.file_urls.length > 0 ? note.file_urls[0] : null,
          excerpt: extractExcerpt(content, 200),
          links: links,
          content: note.content || '', // Keep original content for graph building
          messages: messages, // Store parsed messages
          metaError: false
        };
      });
      
      console.log(`[fetchBlogData] Transformed ${posts.length} notes, total messages: ${posts.reduce((sum, p) => sum + (p.messages?.length || 0), 0)}`);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'blog.js:607',message:'Posts transformed',data:{postsCount:posts.length,postIds:posts.map(p=>p.id),inputNotesCount:notes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
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
      showError('Failed to load Thought Sessions. Please try again later.');
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

  /**
   * Blend two hex colors
   */
  function blendColors(color1, color2, ratio) {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }
  
  /**
   * Get THREE.js instance from various sources
   */
  function getTHREE() {
    // Try window first (if THREE.js is loaded globally)
    if (window.THREE) return window.THREE;
    
    // Try from graph renderer (3d-force-graph bundles THREE.js)
    if (state.graph && state.graph.renderer) {
      try {
        const renderer = state.graph.renderer();
        if (renderer) {
          // THREE.js is bundled with 3d-force-graph
          // Try accessing from renderer constructor
          if (renderer.constructor && renderer.constructor.THREE) {
            return renderer.constructor.THREE;
          }
          // Try accessing from WebGLRenderer
          if (renderer.domElement && renderer.domElement.__THREE__) {
            return renderer.domElement.__THREE__;
          }
          // Try accessing from renderer's context
          if (renderer.getContext) {
            const gl = renderer.getContext();
            if (gl && gl.constructor && gl.constructor.THREE) {
              return gl.constructor.THREE;
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Try accessing from ForceGraph3D namespace
    if (window.ForceGraph3D && window.ForceGraph3D.THREE) {
      return window.ForceGraph3D.THREE;
    }
    
    // 3d-force-graph bundles THREE.js, but it's not always accessible immediately
    // The graph needs to be fully initialized first
    return null;
  }
  
  /**
   * Add bloom effect to the graph for visual appeal
   */
  function addBloomEffect() {
    if (!state.graph) return;
    
    try {
      const THREE = getTHREE();
      if (!THREE) {
        if (!state.threeJsWarningLogged) {
          console.log('[addBloomEffect] THREE.js not available, skipping bloom effect');
          state.threeJsWarningLogged = true;
        }
        return;
      }
      
      // Try to get post-processing composer
      const composer = state.graph.postProcessingComposer ? state.graph.postProcessingComposer() : null;
      if (!composer) {
        // Fallback: use tone mapping for visual enhancement
        const renderer = state.graph.renderer();
        if (renderer) {
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.2;
          console.log('[addBloomEffect] Applied tone mapping for visual enhancement');
        }
        return;
      }
      
      // Apply tone mapping to renderer
      const renderer = state.graph.renderer();
      if (renderer) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
      }
      
      // Try to add bloom pass if available
      // Note: UnrealBloomPass may not be available in 3d-force-graph bundle
      // This is a graceful fallback
      if (window.UnrealBloomPass || (THREE && THREE.UnrealBloomPass)) {
        const UnrealBloomPass = window.UnrealBloomPass || THREE.UnrealBloomPass;
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          1.5, // strength - subtle
          0.4, // radius
          0.85 // threshold
        );
        composer.addPass(bloomPass);
        console.log('[addBloomEffect] Bloom effect added successfully');
      } else {
        console.log('[addBloomEffect] UnrealBloomPass not available, using tone mapping only');
      }
      
    } catch (error) {
      console.error('[addBloomEffect] Error adding bloom effect:', error);
    }
  }
  
  /**
   * Get colorful color for a node based on tags or generate from ID
   */
  function getNodeColor(node) {
    // Vibrant color palette for colorful spheres
    const colorPalette = [
      '#FF6B6B', // Coral red
      '#4ECDC4', // Turquoise
      '#45B7D1', // Sky blue
      '#FFA07A', // Light salmon
      '#98D8C8', // Mint green
      '#F7DC6F', // Yellow
      '#BB8FCE', // Lavender
      '#85C1E2', // Light blue
      '#F8B739', // Orange
      '#52BE80', // Green
      '#E74C3C', // Red
      '#9B59B6', // Purple
      '#3498DB', // Blue
      '#1ABC9C', // Teal
      '#F39C12', // Orange
      '#E67E22', // Dark orange
      '#2ECC71', // Emerald
      '#16A085', // Dark teal
      '#27AE60', // Forest green
      '#2980B9', // Dark blue
      '#8E44AD', // Dark purple
      '#C0392B', // Dark red
      '#D35400', // Burnt orange
      '#7F8C8D', // Gray-blue
      '#34495E'  // Dark gray-blue
    ];
    
    // If node has tags, use first tag to determine color
    if (node.tags && node.tags.length > 0) {
      // Hash the tag name to get consistent color
      const tag = node.tags[0].toLowerCase();
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % colorPalette.length;
      return colorPalette[index];
    }
    
    // If no tags, use node ID to generate consistent color
    if (node.id) {
      let hash = 0;
      for (let i = 0; i < node.id.length; i++) {
        hash = node.id.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % colorPalette.length;
      return colorPalette[index];
    }
    
    // Fallback to a default vibrant color
    return '#BEFFF2'; // SWFT accent color as fallback
  }
  
  function buildGraphData(posts) {
    // Return empty graph if no posts
    if (!posts || posts.length === 0) {
      return { nodes: [], links: [] };
    }
    
    const nodes = [];
    const links = [];
    const ideaNodes = []; // Individual idea nodes (text, images, videos, audio, URLs)
    const allIdeaNodes = []; // Store all ideas for tag connections
    
    // Create note nodes
    posts.forEach(post => {
      // Parse messages from content or use pre-parsed messages
      let messages = post.messages || [];
      
      // If messages not pre-parsed, try parsing from content
      if (messages.length === 0 && post.content) {
        try {
          const parsed = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
          if (Array.isArray(parsed)) {
            messages = parsed;
          }
        } catch (e) {
          // Not JSON, skip messages
          console.log(`[buildGraphData] Note ${post.id} content is not a messages array`);
        }
      }
      
      console.log(`[buildGraphData] Note "${post.title}" has ${messages.length} messages`);
      
      // Create Thought Session node - size based on message count (like planets)
      // More messages = bigger node
      const messageCount = messages.length;
      const baseSize = 4; // Minimum size
      const sizeMultiplier = 2; // Size per message
      const sessionVal = baseSize + (messageCount * sizeMultiplier);
      
      const sessionNode = {
        id: post.id,
        name: post.title,
        tags: post.tags || [],
        val: sessionVal, // Size based on message count
        messageCount: messageCount, // Store for reference
        // Don't set color property - let nodeColor function handle it
        nodeType: 'session', // Changed from 'note' to 'session'
        slug: post.slug,
        post: post, // Store full post reference
        hasImage: false
      };
      nodes.push(sessionNode);
      
      // Create individual idea nodes for each message/idea
      // Each idea can contain: text, URLs, images, videos, audio files
      messages.forEach((msg, msgIndex) => {
        const ideaId = msg.id || `idea-${post.id}-${msgIndex}`;
        
        // Create node for text content if present
        if (msg.content && msg.content.trim()) {
          const textIdeaNode = {
            id: `idea-text-${post.id}-${ideaId}`,
            name: msg.content.trim().substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
            nodeType: 'idea',
            ideaType: 'text',
            parentSessionId: post.id,
            parentMessageId: ideaId,
            sessionId: post.id,
            messageId: ideaId,
            tags: msg.tags || [],
            val: 0.4,
            content: msg.content,
            message: msg,
            post: post,
            hasImage: false
          };
          ideaNodes.push(textIdeaNode);
          allIdeaNodes.push(textIdeaNode);
        }
        
        // Create nodes for attachments (images, videos, audio, files)
        if (msg.attachments && Array.isArray(msg.attachments)) {
          msg.attachments.forEach((att, attIndex) => {
            const attachmentId = att.id || `att-${post.id}-${ideaId}-${attIndex}`;
            const attachmentType = att.type || 'file';
            
            let ideaNode = {
              id: `idea-${attachmentType}-${post.id}-${attachmentId}`,
              name: att.name || att.filename || `${attachmentType} attachment`,
              nodeType: 'idea',
              ideaType: attachmentType, // 'image', 'video', 'audio', 'file', 'url'
              parentSessionId: post.id,
              parentMessageId: ideaId,
              sessionId: post.id,
              messageId: ideaId,
              attachmentId: attachmentId,
              tags: msg.tags || [],
              val: attachmentType === 'image' || attachmentType === 'video' ? 0.6 : 0.4,
              attachment: att,
              message: msg,
              post: post,
              hasImage: attachmentType === 'image',
              imageUrl: attachmentType === 'image' ? att.url : null
            };
            
            // Add URL if it's a URL attachment
            if (attachmentType === 'url' || att.url) {
              ideaNode.url = att.url;
            }
            
            ideaNodes.push(ideaNode);
            allIdeaNodes.push(ideaNode);
          });
        }
        
        // Create nodes for external links if present
        if (msg.externalLinks && Array.isArray(msg.externalLinks)) {
          msg.externalLinks.forEach((link, linkIndex) => {
            const linkId = `link-${post.id}-${ideaId}-${linkIndex}`;
            const linkIdeaNode = {
              id: `idea-url-${post.id}-${linkId}`,
              name: link.title || link.url || 'External Link',
              nodeType: 'idea',
              ideaType: 'url',
              parentSessionId: post.id,
              parentMessageId: ideaId,
              sessionId: post.id,
              messageId: ideaId,
              tags: msg.tags || [],
              val: 0.4,
              url: link.url,
              link: link,
              message: msg,
              post: post,
              hasImage: false
            };
            ideaNodes.push(linkIdeaNode);
            allIdeaNodes.push(linkIdeaNode);
          });
        }
      });
    });
    
    // Create node map for lookups
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    ideaNodes.forEach(idea => nodeMap.set(idea.id, idea));
    
    // Create links between ideas and their parent sessions
    const ideaLinks = [];
    ideaNodes.forEach(ideaNode => {
      if (ideaNode.parentSessionId) {
        ideaLinks.push({
          source: ideaNode.parentSessionId,
          target: ideaNode.id,
          type: 'parent' // Link from session to idea
        });
      }
    });
    
    // Create links between ideas that share tags (cross-idea connections)
    const tagMap = new Map(); // tag -> [idea nodes with that tag]
    ideaNodes.forEach(idea => {
      if (idea.tags && idea.tags.length > 0) {
        idea.tags.forEach(tag => {
          const normalizedTag = tag.toLowerCase();
          if (!tagMap.has(normalizedTag)) {
            tagMap.set(normalizedTag, []);
          }
          tagMap.get(normalizedTag).push(idea);
        });
      }
    });
    
    // Create links between ideas sharing the same tag
    tagMap.forEach((ideasWithTag, tag) => {
      if (ideasWithTag.length > 1) {
        // Link each idea to others with the same tag (limit to avoid too many links)
        for (let i = 0; i < ideasWithTag.length; i++) {
          for (let j = i + 1; j < Math.min(i + 3, ideasWithTag.length); j++) {
            // Limit to connecting each idea to max 2 others with same tag
            ideaLinks.push({
              source: ideasWithTag[i].id,
              target: ideasWithTag[j].id,
              type: 'tag', // Link based on shared tag
              tag: tag
            });
          }
        }
      }
    });
    
    // Create links between sessions that share tags
    // Build a map of sessions by their tags
    const sessionTagMap = new Map(); // tag -> [session nodes with that tag]
    nodes.forEach(session => {
      if (session.tags && session.tags.length > 0) {
        session.tags.forEach(tag => {
          const normalizedTag = tag.toLowerCase();
          if (!sessionTagMap.has(normalizedTag)) {
            sessionTagMap.set(normalizedTag, []);
          }
          sessionTagMap.get(normalizedTag).push(session);
        });
      }
    });
    
    // Create links between sessions sharing the same tag
    sessionTagMap.forEach((sessionsWithTag, tag) => {
      if (sessionsWithTag.length > 1) {
        // Link each session to others with the same tag (limit to avoid too many links)
        for (let i = 0; i < sessionsWithTag.length; i++) {
          for (let j = i + 1; j < Math.min(i + 3, sessionsWithTag.length); j++) {
            // Limit to connecting each session to max 2 others with same tag
            ideaLinks.push({
              source: sessionsWithTag[i].id,
              target: sessionsWithTag[j].id,
              type: 'tag', // Link based on shared tag
              tag: tag
            });
          }
        }
      }
    });
    
    // Return nodes with parent links
    return { 
      nodes: [...nodes, ...ideaNodes], 
      links: ideaLinks, // Links from sessions to their ideas, and between sessions/ideas with shared tags
      sessionNodes: nodes, // Renamed from noteNodes
      ideaNodes: ideaNodes
    };
  }
  
  /**
   * Fetch graph data
   */
  async function fetchGraphData() {
    // Always build graph from posts (no fallback to static file)
    // If no posts, try fetching first
    if (!state.posts || state.posts.length === 0) {
      console.log('[fetchGraphData] No posts available, fetching...');
      await fetchBlogData();
      
      if (!state.posts || state.posts.length === 0) {
        console.log('[fetchGraphData] Still no posts after fetch, returning empty graph data');
        state.graphData = { nodes: [], links: [] };
        return state.graphData;
      }
    }
    
    console.log(`[fetchGraphData] Building graph from ${state.posts.length} posts...`);
    state.graphData = buildGraphData(state.posts);
    console.log(`[fetchGraphData] Graph built: ${state.graphData.nodes.length} nodes, ${state.graphData.links.length} links`);
    
    // Hide empty state if graph has nodes (console shows nodes > 0 means we have posts)
    if (state.graphData.nodes.length > 0 && elements.emptyState) {
      elements.emptyState.hidden = true;
    }
    
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

    // Show/hide empty state - only show if there are NO posts at all in state.posts (actual loaded posts)
    // Check state.posts.length, not posts.length, because posts parameter might be filtered
    if (!state.posts || state.posts.length === 0) {
      if (elements.emptyState) {
        elements.emptyState.hidden = false;
      }
      elements.blogList.innerHTML = '';
      return;
    }

    // Hide empty state if we have posts
    if (elements.emptyState) {
      elements.emptyState.hidden = true;
    }
    
    // Show/hide clear filters button based on active filters
    updateClearFiltersButtonVisibility();

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
            <span class="blog_card-links-count" title="${post.links.length} connected Thought Sessions">
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
    // Use graph container from graph view (not modal)
    const graphContainer = document.getElementById('graph-container');
    if (state.graphLoaded || !graphContainer) {
      console.log('[initGraph] Graph already loaded or container not found', {
        graphLoaded: state.graphLoaded,
        containerFound: !!graphContainer
      });
      return;
    }
    
    // Ensure graph view is visible (should already be visible if setView('graph') was called)
    const graphView = document.getElementById('blog-graph-view');
    if (graphView && graphView.hidden) {
      console.log('[initGraph] Graph view is hidden, making visible...');
      graphView.hidden = false;
      graphView.setAttribute('aria-hidden', 'false');
      // Also update the data-view attribute
      if (elements.blogContent) {
        elements.blogContent.dataset.view = 'graph';
      }
    }

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
      // Ensure posts are loaded before building graph
      if (!state.posts || state.posts.length === 0) {
        console.log('[initGraph] No posts available, fetching...');
        await fetchBlogData();
        
        if (!state.posts || state.posts.length === 0) {
          console.warn('[initGraph] No posts found after fetch');
          showNoNotesMessage();
          return;
        }
      }
      
      // Load library
      await loadGraphLibrary();

      // Fetch graph data if not already loaded
      if (!state.graphData || state.graphData.nodes.length === 0) {
        console.log('[initGraph] Fetching graph data...');
        await fetchGraphData();
      }

      if (!state.graphData || !state.graphData.nodes || state.graphData.nodes.length === 0) {
        console.error('[initGraph] No graph data available');
        showNoNotesMessage();
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

      // Apply node limit based on device (only for session nodes, ideas handled by expansion)
      const sessionNodes = state.graphData.nodes.filter(n => n.nodeType === 'session');
      const ideaNodes = state.graphData.nodes.filter(n => n.nodeType === 'idea');
      
      let limitedSessionNodes = sessionNodes;
      if (sessionNodes.length > nodeLimit) {
        console.log(`Limiting graph to ${nodeLimit} session nodes (${sessionNodes.length} total)`);
        // Sort by val and limit
        const sorted = [...sessionNodes].sort((a, b) => (b.val || 0) - (a.val || 0));
        limitedSessionNodes = sorted.slice(0, nodeLimit);
      }
      
      // Rebuild graph data with limited sessions but all ideas (filtered by expansion state)
      const sessionIds = new Set(limitedSessionNodes.map(n => n.id));
      const filteredIdeaNodes = ideaNodes.filter(idea => sessionIds.has(idea.parentSessionId));
      
      // Filter links to only include visible nodes
      const allVisibleNodes = [...limitedSessionNodes, ...filteredIdeaNodes];
      const visibleNodeIds = new Set(allVisibleNodes.map(n => n.id));
      const filteredLinks = state.graphData.links.filter(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
      });
      
      let graphData = {
        nodes: allVisibleNodes,
        links: filteredLinks,
        sessionNodes: limitedSessionNodes,
        ideaNodes: filteredIdeaNodes
      };

      // Hide placeholder and no-notes message
      const graphPlaceholder = document.getElementById('graph-placeholder');
      if (graphPlaceholder) {
        graphPlaceholder.style.display = 'none';
      }
      hideNoNotesMessage();

      // Store full graph data (with all ideas)
      state.fullGraphData = graphData;
      
      // Start with session-only view (collapsed) - click to expand
      state.graphZoomLevel = 'session-only';
      state.expandedSessions.clear();
      
      // Filter graph data based on initial zoom level (show only sessions initially)
      const filteredGraphData = filterGraphDataByZoom(graphData);
      
      console.log('[Graph] Creating graph with', filteredGraphData.nodes.length, 'nodes and', filteredGraphData.links.length, 'links');
      console.log('[Graph] Filtered graph data:', {
        nodes: filteredGraphData.nodes.length,
        links: filteredGraphData.links.length,
        nodeTypes: filteredGraphData.nodes.map(n => n.nodeType || 'session')
      });
      console.log('[Graph] Container element:', graphContainer);
      console.log('[Graph] Container parent:', graphContainer?.parentElement);
      
      if (filteredGraphData.nodes.length === 0) {
        console.warn('[Graph] No nodes to display! Check if Thought Sessions have content/ideas.');
        // Show placeholder message
        const graphPlaceholder = document.getElementById('graph-placeholder');
        if (graphPlaceholder) {
          graphPlaceholder.style.display = 'block';
          graphPlaceholder.innerHTML = `
            <div class="blog_graph-placeholder-content">
              <p>No Mind Map data available</p>
              <p class="blog_graph-hint">Create Thought Sessions with ideas to see them in the Mind Map</p>
            </div>
          `;
        }
        return;
      }
      
      // graphContainer already declared at top of function, reuse it
      if (!graphContainer) {
        console.error('[Graph] Graph container not found!');
        return;
      }

      // Wait for container to be visible and get dimensions
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
      
      // Get explicit dimensions BEFORE creating graph
      const rect = graphContainer.getBoundingClientRect();
      const sidebar = document.getElementById('graph-sidebar');
      const sidebarWidth = sidebar ? sidebar.offsetWidth : 280;
      const containerWidth = rect.width || graphContainer.clientWidth || (window.innerWidth - sidebarWidth);
      const containerHeight = rect.height || graphContainer.clientHeight || window.innerHeight;

      console.log('[Graph] Initializing with dimensions:', containerWidth, 'x', containerHeight);
      console.log('[Graph] Container rect:', rect);
      
      if (containerWidth === 0 || containerHeight === 0) {
        console.error('[Graph] Container has invalid dimensions!', { containerWidth, containerHeight });
        console.error('[Graph] Container element:', graphContainer);
        console.error('[Graph] Container parent:', graphContainer.parentElement);
        return;
      }
      
      // Check if THREE.js is available before using nodeThreeObject
      const THREE = getTHREE();
      const useCustomNodes = !!THREE;
      
      if (!useCustomNodes) {
        console.warn('[initGraph] THREE.js not available, using default node rendering');
      }
      
      // Create color scale for auto-coloring by tags
      // Use d3 if available, otherwise use simple hash-based coloring
      let colorScale = null;
      if (typeof d3 !== 'undefined' && d3.scaleOrdinal) {
        colorScale = d3.scaleOrdinal(d3.schemeCategory20);
      }
      
      // Create graph instance with enhanced features
      const graphInstance = ForceGraph3D()(graphContainer)
        .width(containerWidth)
        .height(containerHeight)
        .cooldownTicks(80) // slightly lower to reduce CPU
        .graphData(filteredGraphData)
        .nodeVal(node => {
          // Use node.val property (set based on message count for sessions)
          // This makes sessions with more messages appear larger (like planets)
          return node.val || 4;
        })
        .nodeAutoColorBy(node => {
          // Auto-color by first tag if available
          if (node.tags && node.tags.length > 0) {
            const tag = node.tags[0].toLowerCase();
            if (colorScale) {
              return colorScale(tag);
            }
            // Fallback to getTagColorForBlog if d3 not available
            return getTagColorForBlog(node.tags[0]);
          }
          return '#ffffff'; // Default white
        })
        .linkAutoColorBy(link => {
          // Auto-color links by source node tag
          const sourceNode = typeof link.source === 'object' ? link.source : 
                            state.fullGraphData?.nodes.find(n => n.id === link.source);
          if (sourceNode && sourceNode.tags && sourceNode.tags.length > 0) {
            const tag = sourceNode.tags[0].toLowerCase();
            if (colorScale) {
              return colorScale(tag);
            }
            return getTagColorForBlog(sourceNode.tags[0]);
          }
          return '#ffffff';
        })
        .nodeLabel(node => {
          if (node.nodeType === 'session') {
            return `<div style="padding:6px 8px; max-width:240px;"><strong>${escapeHtml(node.name || '')}</strong></div>`;
          }
          const raw = (node.message && node.message.content) || node.name || '';
          const text = (raw || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          const snippet = text.length > 200 ? text.slice(0, 200) + '…' : text;
          return `
            <div style="padding:6px 8px; max-width:260px;">
              <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(node.name || 'Message')}</div>
              <div style="font-size:12px; line-height:1.4;">${escapeHtml(snippet)}</div>
            </div>
          `;
        })
        .onNodeClick((node) => {
          handleGraphNodeClick(node);
        })
        .onNodeHover(handleGraphNodeHover)
        .onBackgroundClick(() => {
          // This fires when clicking on empty space (not on nodes)
          console.log('[Orbit] Background clicked via onBackgroundClick - gradually stopping orbit');
          handleUserInteraction(); // Track user interaction for auto-resume timer
          handleCanvasBackgroundClick();
        });
      
      // Add gradient links for tagged nodes
      // Reuse THREE from earlier declaration (line 1590)
      if (THREE) {
        // Helper function to convert hex color to RGB
        function hexToRgb(hex) {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
          } : { r: 1, g: 1, b: 1 };
        }
        
        // Helper function to get node color
        function getNodeColorForLink(node) {
          if (node && node.tags && node.tags.length > 0) {
            const tag = node.tags[0].toLowerCase();
            if (colorScale) {
              return colorScale(tag);
            }
            return getTagColorForBlog(node.tags[0]);
          }
          if (node && node.nodeType === 'session') {
            return state.graphDisplay.sessionColor || '#BEFFF2';
          }
          return state.graphDisplay.messageColor || '#ffffff';
        }
        
        graphInstance.linkThreeObject(link => {
          const sourceNode = typeof link.source === 'object' ? link.source : 
                            state.fullGraphData?.nodes.find(n => n.id === link.source);
          const targetNode = typeof link.target === 'object' ? link.target : 
                            state.fullGraphData?.nodes.find(n => n.id === link.target);
          
          if (!sourceNode || !targetNode) return null;
          
          // Get colors from source and target nodes
          const sourceColor = getNodeColorForLink(sourceNode);
          const targetColor = getNodeColorForLink(targetNode);
          
          // Convert to RGB
          const sourceRgb = hexToRgb(sourceColor);
          const targetRgb = hexToRgb(targetColor);
          
          // Create geometry for the line
          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(6); // 2 vertices * 3 coordinates
          
          // Create color array for gradient (source color to target color)
          const colors = new Float32Array([
            sourceRgb.r, sourceRgb.g, sourceRgb.b, // Source color
            targetRgb.r, targetRgb.g, targetRgb.b  // Target color
          ]);
          
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          
          // Create material with vertex colors
          const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: state.graphDisplay.linkWidth || 0.5
          });
          
          const line = new THREE.Line(geometry, material);
          
          // Store link data for position updates
          line.userData.link = link;
          line.userData.sourceNode = sourceNode;
          line.userData.targetNode = targetNode;
          
          return line;
        });
        
        // Update link positions using linkPositionUpdate
        graphInstance.linkPositionUpdate((obj, { start, end }) => {
          if (obj.userData && obj.userData.link) {
            const positions = obj.geometry.attributes.position.array;
            positions[0] = start.x;
            positions[1] = start.y;
            positions[2] = start.z;
            positions[3] = end.x;
            positions[4] = end.y;
            positions[5] = end.z;
            obj.geometry.attributes.position.needsUpdate = true;
          }
        });
        
        // Add image nodes for nodes with images
        graphInstance.nodeThreeObject(node => {
          // Check if node has an image
          if (node.hasImage && node.imageUrl) {
            // Check if message only contains image (no text content)
            const isImageOnly = node.message && 
                                (!node.message.content || node.message.content.trim() === '') &&
                                node.message.attachments && 
                                node.message.attachments.length === 1 &&
                                node.message.attachments[0].type === 'image';
            
            if (isImageOnly || node.ideaType === 'image') {
              // Create sprite with image texture
              const imgTexture = new THREE.TextureLoader().load(node.imageUrl);
              imgTexture.colorSpace = THREE.SRGBColorSpace;
              const material = new THREE.SpriteMaterial({ map: imgTexture });
              const sprite = new THREE.Sprite(material);
              sprite.scale.set(12, 12);
              return sprite;
            }
          }
          // Return null to use default node rendering
            return null;
        });
      }
      
      // Store graph instance
      state.graph = graphInstance;
      
      // Apply display settings
      applyGraphDisplay();
      
      // Pause orbit only on canvas click (not on other interactions)
      const graphCanvasEl = graphContainer;
      
      // Wait for graph to initialize, then attach click handler to the actual canvas
      setTimeout(() => {
        // Find the actual canvas element created by 3d-force-graph
        const canvas = graphContainer.querySelector('canvas');
        if (canvas) {
          console.log('[Orbit] Attaching click handler to canvas element');
          canvas.addEventListener('mousedown', handleCanvasClick, true); // Use capture phase
          canvas.addEventListener('pointerdown', handleCanvasClick, true);
          canvas.addEventListener('touchstart', handleCanvasClick, true);
        } else {
          // Fallback to container
          console.log('[Orbit] Canvas not found, using container');
          graphCanvasEl.addEventListener('mousedown', handleCanvasClick, true);
          graphCanvasEl.addEventListener('pointerdown', handleCanvasClick, true);
          graphCanvasEl.addEventListener('touchstart', handleCanvasClick, true);
        }
      }, 500);
      
      // Initialize slow camera orbit animation (like stars floating)
      initCameraOrbit();
      
      // Add bloom effect for glowing star-like nodes
      if (typeof window !== 'undefined') {
        import('https://esm.sh/three/examples/jsm/postprocessing/UnrealBloomPass.js')
          .then(({ UnrealBloomPass }) => {
            if (state.graph && state.graph.postProcessingComposer) {
              const composer = state.graph.postProcessingComposer();
              if (composer) {
                const bloomPass = new UnrealBloomPass();
                bloomPass.strength = 1.5; // Initial brightness
                bloomPass.radius = 0.8;
                bloomPass.threshold = 0.3;
                composer.addPass(bloomPass);
                state.bloomPass = bloomPass; // Store reference for brightness control
                console.log('[Graph] Bloom effect added');
              }
            }
          })
          .catch(err => {
            console.warn('[Graph] Could not load bloom effect:', err);
          });
      }
      
      // Set up camera with better positioning and scene background
      if (state.graph) {
        // Set initial camera position for better view
        state.graph.cameraPosition({ x: 0, y: 0, z: 800 });
        
        // Add controls for camera movement
        const controls = state.graph.controls();
        if (controls) {
          controls.enableDamping = true;
          controls.dampingFactor = 0.1;
          controls.enableZoom = true;
          controls.enableRotate = true;
          controls.enablePan = true;
        }
        
        // Set scene background with space void gradient
        try {
          const scene = state.graph.scene();
          if (scene) {
            const sceneTHREE = THREE || getTHREE();
            if (sceneTHREE) {
              // Create radial gradient texture for space void effect
              const canvas = document.createElement('canvas');
              canvas.width = 512;
              canvas.height = 512;
              const ctx = canvas.getContext('2d');
              
              // Create radial gradient from slightly lighter center to pure black edges
              const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
              gradient.addColorStop(0, '#050505'); // Very dark center
              gradient.addColorStop(0.3, '#020202'); // Darker
              gradient.addColorStop(0.6, '#010101'); // Almost black
              gradient.addColorStop(1, '#000000'); // Pure black edges
              
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, 512, 512);
              
              const texture = new sceneTHREE.CanvasTexture(canvas);
              texture.needsUpdate = true;
              scene.background = texture;
              console.log('[Graph] Scene background set to space void gradient');
            } else {
              // Fallback: use pure black
              state.graph.backgroundColor('#000000');
              console.log('[Graph] Scene background set via backgroundColor method');
            }
          }
        } catch (e) {
          console.warn('[Graph] Could not set scene background directly:', e);
          // Fallback
          try {
            state.graph.backgroundColor('#000000');
          } catch (e2) {
            console.warn('[Graph] Could not set background color:', e2);
          }
        }
      }
      
      // Fit to canvas on window resize (no auto zoom)
      window.addEventListener('resize', debounce(() => {
        if (state.graph && (state.currentView === 'mind-map' || state.isDesktop)) {
          resizeGraphForView();
        }
      }, 200));
      
      console.log('Graph initialized with', graphData.nodes.length, 'nodes'); // Debug
      
      // Hide empty state if graph has nodes (console shows nodes > 0 means we have posts)
      if (graphData.nodes.length > 0 && elements.emptyState) {
        elements.emptyState.hidden = true;
      }

      // Apply reduced motion settings
      if (prefersReducedMotion()) {
        state.graph.cooldownTicks(0);
      }

      // Start session-only view and center camera (no auto zoom-to-fit)
      setTimeout(() => {
        if (state.graph) {
          state.graphZoomLevel = 'session-only';
          state.focusedSessionId = null;
          state.expandedSessions.clear();
          state.graph.cameraPosition({ x: 0, y: 0, z: 600 });
        }
      }, 150);

      // Set initial size for graph container
      const graphContainerEl = document.getElementById('graph-container');
      if (graphContainerEl && state.graph) {
        // Get dimensions from modal container
        const sidebar = document.getElementById('graph-sidebar');
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 280;
        
        const containerWidth = graphContainerEl.clientWidth || (window.innerWidth - sidebarWidth);
        const containerHeight = graphContainerEl.clientHeight || window.innerHeight;
        
        console.log('[Graph] Container dimensions check:', { containerWidth, containerHeight, sidebarWidth });
        console.log('[Graph] Container element rect:', graphContainerEl.getBoundingClientRect());
        console.log('[Graph] Container computed style:', {
          width: window.getComputedStyle(graphContainerEl).width,
          height: window.getComputedStyle(graphContainerEl).height
        });
        
        if (containerWidth > 0 && containerHeight > 0) {
          state.graph.width(containerWidth);
          state.graph.height(containerHeight);
          console.log('[Graph] Graph resized to:', containerWidth, 'x', containerHeight);
        } else {
          console.warn('[Graph] Container has invalid dimensions:', { containerWidth, containerHeight });
        }
      }
      
      // Zoom to fit all nodes on initial load
      setTimeout(() => {
        if (state.graph) {
          state.graph.zoomToFit(1000, 50);
        }
      }, 100);

      state.graphLoaded = true;

    } catch (error) {
      console.error('[initGraph] Failed to initialize graph:', error);
      console.error('[initGraph] Error details:', {
        message: error.message,
        stack: error.stack,
        graphContainer: !!graphContainer,
        graphViewVisible: !graphView?.hidden
      });
      
      // Only show unavailable if it's a WebGL issue, otherwise show error
      if (error.message && error.message.includes('WebGL')) {
        showGraphUnavailable();
      } else {
        // For other errors, try to show a more helpful message
        const graphPlaceholder = document.getElementById('graph-placeholder');
        if (graphPlaceholder) {
          graphPlaceholder.style.display = 'block';
          graphPlaceholder.innerHTML = `
            <div class="blog_graph-placeholder-content">
              <p>Failed to initialize graph</p>
              <p class="blog_graph-hint">Error: ${error.message}</p>
            </div>
          `;
        }
      }
    }
  }

  /**
   * Easing function for smooth transitions (ease-out)
   */
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3); // Cubic ease-out
  }

  /**
   * Easing function for smooth transitions (ease-in)
   */
  function easeIn(t) {
    return t * t * t; // Cubic ease-in
  }

  /**
   * Initialize camera orbit animation around the graph
   * 0 = no orbit, 360 = full rotation per second
   * Uses gradual easing for smooth start/stop
   */
  function initCameraOrbit() {
    if (!state.graph) return;
    
    // Cancel any existing animation frame
    if (state.orbitAnimationFrame) {
      cancelAnimationFrame(state.orbitAnimationFrame);
    }
    
    // Clear any existing interval
    if (state.orbitInterval) {
      clearInterval(state.orbitInterval);
    }
    
    // Initialize speeds
    state.currentOrbitSpeed = state.orbitSpeed;
    state.targetOrbitSpeed = state.orbitSpeed;
    
    // Get initial camera distance
    const camera = state.graph.camera();
    let distance = Math.sqrt(
      camera.position.x * camera.position.x +
      camera.position.y * camera.position.y +
      camera.position.z * camera.position.z
    ) || 800;
    
    // Easing duration
    const easingDuration = 1000; // 1 second for easing
    
    // Animation loop using requestAnimationFrame for smooth animation
    function animateOrbit(timestamp) {
      if (!state.graph) return;
      
      // Initialize timestamp if not provided
      const currentTime = timestamp || performance.now();
      
      // Update camera distance (may change due to zoom)
      const currentCamera = state.graph.camera();
      distance = Math.sqrt(
        currentCamera.position.x * currentCamera.position.x +
        currentCamera.position.y * currentCamera.position.y +
        currentCamera.position.z * currentCamera.position.z
      ) || 800;
      
      // Handle easing transitions
      if (Math.abs(state.currentOrbitSpeed - state.targetOrbitSpeed) > 0.1) {
        if (!state.orbitIsEasing) {
          state.orbitIsEasing = true;
          state.orbitEasingStartTime = currentTime;
          state.orbitEasingFromSpeed = state.currentOrbitSpeed;
          console.log('[Orbit] Starting ease transition from', state.orbitEasingFromSpeed, 'to', state.targetOrbitSpeed);
        }
        
        const elapsed = currentTime - state.orbitEasingStartTime;
        const progress = Math.min(elapsed / easingDuration, 1);
        
        if (state.targetOrbitSpeed === 0) {
          // Easing out (stopping)
          const easedProgress = easeOut(progress);
          state.currentOrbitSpeed = state.orbitEasingFromSpeed * (1 - easedProgress);
        } else if (state.orbitEasingFromSpeed === 0) {
          // Easing in (starting)
          const easedProgress = easeIn(progress);
          state.currentOrbitSpeed = state.targetOrbitSpeed * easedProgress;
        } else {
          // Transitioning between speeds
          const easedProgress = easeOut(progress);
          state.currentOrbitSpeed = state.orbitEasingFromSpeed + (state.targetOrbitSpeed - state.orbitEasingFromSpeed) * easedProgress;
        }
        
        if (progress >= 1) {
          state.currentOrbitSpeed = state.targetOrbitSpeed;
          state.orbitIsEasing = false;
          console.log('[Orbit] Ease transition complete. Current speed:', state.currentOrbitSpeed);
        }
      } else {
        state.currentOrbitSpeed = state.targetOrbitSpeed;
        state.orbitIsEasing = false;
      }
      
      // Only update camera if speed is significant
      if (state.currentOrbitSpeed > 0.1) {
        // Convert current speed (0-360) to radians per frame
        // Assuming ~60fps for requestAnimationFrame
        const degreesPerSecond = state.currentOrbitSpeed;
        const radiansPerSecond = (degreesPerSecond / 360) * (Math.PI * 2);
        const radiansPerFrame = radiansPerSecond / 60; // ~60fps
        
        // Increment angle using current speed
        state.orbitAngle += radiansPerFrame;
        
        // Calculate circular orbit position
        const x = distance * Math.sin(state.orbitAngle);
        const z = distance * Math.cos(state.orbitAngle);
        const y = currentCamera.position.y; // Keep same height
        
        // Update camera position
        state.graph.cameraPosition({ x, y, z });
      }
      
      // Continue animation loop
      state.orbitAnimationFrame = requestAnimationFrame(animateOrbit);
    }
    
    // Start animation loop
    state.orbitAnimationFrame = requestAnimationFrame(animateOrbit);
  }

  /**
   * Handle canvas background click: gradually stop orbit
   * Called from onBackgroundClick callback or direct canvas click
   */
  function handleCanvasBackgroundClick() {
    console.log('[Orbit] Canvas background clicked - gradually stopping orbit');
    console.log('[Orbit] Current speed:', state.currentOrbitSpeed, 'Target speed:', state.targetOrbitSpeed);
    
    // Track user interaction (resets auto-resume timer if orbit is paused)
    handleUserInteraction();
    
    // Set target speed to 0 for gradual stop
    state.targetOrbitSpeed = 0;
    
    // Clear any resume timer
    if (state.orbitResumeTimer) {
      clearTimeout(state.orbitResumeTimer);
      state.orbitResumeTimer = null;
    }
    
    // Schedule gradual restart after 3 seconds of being stopped
    state.orbitResumeTimer = setTimeout(() => {
      console.log('[Orbit] Gradually restarting orbit');
      console.log('[Orbit] Setting target speed to:', state.orbitSpeed);
      // Set target speed back to current orbit speed setting
      state.targetOrbitSpeed = state.orbitSpeed;
    }, 3000);
  }

  /**
   * Handle canvas click: gradually stop orbit
   * Only triggers on empty canvas space, not on nodes
   */
  function handleCanvasClick(e) {
    // Track user interaction (resets auto-resume timer if orbit is paused)
    handleUserInteraction();
    
    // Log for debugging
    console.log('[Orbit] Click detected:', {
      target: e.target,
      targetTag: e.target.tagName,
      targetId: e.target.id,
      targetClass: e.target.className,
      currentTarget: e.currentTarget
    });
    
    // Check if click is on the canvas element itself (not on nodes or other elements)
    // The 3d-force-graph library creates a canvas element, so we check for that
    const target = e.target;
    const isCanvasElement = target.tagName === 'CANVAS';
    const isContainerClick = target.id === 'graph-container' || 
                            target.classList.contains('blog_graph-container');
    
    // Stop orbit if clicking directly on canvas or container background
    // Don't stop if clicking on buttons, nodes, or other interactive elements
    if (isCanvasElement || isContainerClick) {
      handleCanvasBackgroundClick();
    } else {
      console.log('[Orbit] Click ignored - not on canvas background');
    }
  }

  /**
   * Handle any user interaction: schedule auto-fit and reset orbit auto-resume timer
   */
  function handleUserInteraction() {
    // Clear auto-fit timer
    if (state.autoFitTimer) clearTimeout(state.autoFitTimer);

    // Auto-fit only after 90s idle
    state.autoFitTimer = setTimeout(() => {
      if (state.graph) {
        state.graph.zoomToFit(800, 50);
      }
    }, 90000);
    
    // If orbit is paused, reset the auto-resume timer
    if (!state.orbitActive) {
      clearOrbitAutoResumeTimer();
      startOrbitAutoResumeTimer();
    }
  }
  
  /**
   * Toggle camera orbit animation
   */
  function toggleCameraOrbit() {
    state.orbitActive = !state.orbitActive;
    
    // Actually pause/resume by setting target speed
    if (state.orbitActive) {
      // Resume: set target speed back to current orbit speed setting
      state.targetOrbitSpeed = state.orbitSpeed;
      // Clear auto-resume timer since we're manually resuming
      if (state.orbitAutoResumeTimer) {
        clearTimeout(state.orbitAutoResumeTimer);
        state.orbitAutoResumeTimer = null;
      }
      console.log('[toggleCameraOrbit] Orbit resumed - target speed:', state.orbitSpeed);
    } else {
      // Pause: set target speed to 0
      state.targetOrbitSpeed = 0;
      // Start 90-second timer for auto-resume
      startOrbitAutoResumeTimer();
      console.log('[toggleCameraOrbit] Orbit paused - auto-resume in 90 seconds');
    }
    
    // Update button text if it exists
    const orbitBtn = document.getElementById('orbit-toggle-btn');
    if (orbitBtn) {
      orbitBtn.textContent = state.orbitActive ? 'Pause Orbit' : 'Play Orbit';
    }
    
    console.log('[toggleCameraOrbit] Orbit', state.orbitActive ? 'active' : 'paused');
  }
  
  /**
   * Start timer to auto-resume orbit after 90 seconds of inactivity when paused
   */
  function startOrbitAutoResumeTimer() {
    // Clear any existing timer
    if (state.orbitAutoResumeTimer) {
      clearTimeout(state.orbitAutoResumeTimer);
      state.orbitAutoResumeTimer = null;
    }
    
    // Only start timer if orbit is paused
    if (!state.orbitActive) {
      state.orbitAutoResumeTimer = setTimeout(() => {
        // Check if still paused (user might have manually resumed)
        if (!state.orbitActive) {
          console.log('[Orbit] Auto-resuming orbit after 90 seconds of inactivity');
          // Resume orbit
          state.orbitActive = true;
          state.targetOrbitSpeed = state.orbitSpeed;
          
          // Update button text
          const orbitBtn = document.getElementById('orbit-toggle-btn');
          if (orbitBtn) {
            orbitBtn.textContent = 'Pause Orbit';
          }
        }
        state.orbitAutoResumeTimer = null;
      }, 90000); // 90 seconds
    }
  }
  
  /**
   * Clear auto-resume timer (called on user interaction)
   */
  function clearOrbitAutoResumeTimer() {
    if (state.orbitAutoResumeTimer) {
      clearTimeout(state.orbitAutoResumeTimer);
      state.orbitAutoResumeTimer = null;
    }
  }
  
  // Set up orbit toggle button event listener
  document.addEventListener('DOMContentLoaded', () => {
    const orbitBtn = document.getElementById('orbit-toggle-btn');
    if (orbitBtn) {
      orbitBtn.addEventListener('click', toggleCameraOrbit);
    }
  });
  
  // Also set up if button is added dynamically
  if (document.getElementById('orbit-toggle-btn')) {
    document.getElementById('orbit-toggle-btn').addEventListener('click', toggleCameraOrbit);
  }

  /**
   * Filter graph data: always show sessions; show messages only for expanded sessions
   */
  function filterGraphDataByZoom(graphData) {
    if (!graphData || !graphData.nodes) {
      return { nodes: [], links: [] };
    }

    // Sessions always visible
    const sessionNodes = graphData.nodes.filter(n => n.nodeType === 'session');
    const sessionIds = new Set(sessionNodes.map(n => n.id));

    // Ideas only for expanded sessions
    const ideaNodes = graphData.nodes.filter(
      n => n.nodeType === 'idea' && n.parentSessionId && state.expandedSessions.has(n.parentSessionId)
    );
    const visibleNodes = [...sessionNodes, ...ideaNodes];
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Links: session-session always; parent/idea links only when both ends visible
    const visibleLinks = graphData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      const sourceVisible = visibleNodeIds.has(sourceId);
      const targetVisible = visibleNodeIds.has(targetId);
      return sourceVisible && targetVisible;
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }
  
  /**
   * Toggle session expansion (show/hide ideas within a session)
   */
  function toggleSessionExpansion(sessionId) {
    if (state.expandedSessions.has(sessionId)) {
      state.expandedSessions.delete(sessionId);
      console.log('[toggleSessionExpansion] Collapsed session:', sessionId);
    } else {
      state.expandedSessions.add(sessionId);
      console.log('[toggleSessionExpansion] Expanded session:', sessionId);
    }
    
    // Rebuild graph data with updated expansion state
    if (state.fullGraphData) {
      const filteredData = filterGraphDataByZoom(state.fullGraphData);
      if (state.graph) {
        state.graph.graphData(filteredData);
      }
    }
  }

  /**
   * Limit graph data to specified number of nodes
   * Only limits note nodes, preserves all message nodes
   */
  function limitGraphData(data, limit) {
    // Separate session nodes from idea nodes
    const sessionNodes = data.nodes.filter(n => n.nodeType === 'session');
    const ideaNodes = data.nodes.filter(n => n.nodeType === 'idea');
    
    // Sort session nodes by connection count (val)
    const sortedSessionNodes = [...sessionNodes].sort((a, b) => (b.val || 0) - (a.val || 0));
    const limitedSessionNodes = sortedSessionNodes.slice(0, limit);
    const sessionIds = new Set(limitedSessionNodes.map(n => n.id));

    // Keep only ideas whose parent sessions are in the limited set
    const limitedIdeaNodes = ideaNodes.filter(idea => sessionIds.has(idea.parentSessionId));

    // Filter links to only include nodes in the limited set
    const limitedLinks = data.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return (sessionIds.has(sourceId) || limitedIdeaNodes.some(idea => idea.id === sourceId)) &&
             (sessionIds.has(targetId) || limitedIdeaNodes.some(idea => idea.id === targetId));
    });

    return {
      nodes: [...limitedSessionNodes, ...limitedIdeaNodes],
      links: limitedLinks,
      sessionNodes: limitedSessionNodes,
      ideaNodes: limitedIdeaNodes
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
   * Show "no Thought Sessions" message in Mind Map view
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
    
    // Create or show "no Thought Sessions" message in Mind Map area
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
          <h3>No Thought Sessions to show</h3>
          <p>Create your first Thought Session to see it appear in the Mind Map.</p>
        </div>
      `;
      elements.graphContainer.parentElement.appendChild(noNotesMsg);
    } else if (noNotesMsg) {
      noNotesMsg.hidden = false;
    }
  }
  
  /**
   * Hide "no Thought Sessions" message
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
    
    handleUserInteraction();
    
    console.log('[handleGraphNodeClick] Node clicked:', {
      id: node.id,
      nodeType: node.nodeType,
      name: node.name
    });
    
    // Handle session node clicks - expand/collapse to show ideas
    if (node.nodeType === 'session') {
      const now = Date.now();
      const isDoubleClick = state.lastNodeClick === node.id && 
                          (now - state.lastNodeClickTime) < 300; // 300ms double-click window
      
      // Update tracking state
      state.lastNodeClick = node.id;
      state.lastNodeClickTime = now;
      
      if (isDoubleClick) {
        // Double-click: open the thought session modal (like clicking on blog_card)
        console.log('[handleGraphNodeClick] Double-click detected on session node:', node.id);
        const post = node.post || state.posts.find(p => p.id === node.id || p.slug === node.slug);
        if (post) {
          openModal(post);
        }
        // Reset tracking to prevent triple-click from triggering again
        state.lastNodeClick = null;
        state.lastNodeClickTime = 0;
      } else {
        // Single-click: expand/collapse to show ideas
        toggleSessionExpansion(node.id);
      }
      return;
    }
    
    // Handle idea node clicks - open modal or show details
    if (node.nodeType === 'idea') {
      // Find the parent post/session
      const post = node.post || state.posts.find(p => p.id === node.sessionId || p.id === node.parentSessionId);
      
      if (post && node.message) {
        // Open modal showing the specific idea/message
        openMessageModal(post, node.message);
      } else if (post) {
        // Open the session modal
        openModal(post);
      }
      return;
    }
    
    // Legacy support for 'message' nodeType (backward compatibility)
    if (node.nodeType === 'message') {
      // Treat as idea node
      const post = node.post || state.posts.find(p => p.id === node.sessionId || p.id === node.parentSessionId);
      if (post && node.message) {
        openMessageModal(post, node.message);
      } else if (post) {
        openModal(post);
      }
      return;
    }
    
    // Legacy support for 'note' nodeType (backward compatibility)
    if (node.nodeType === 'note' || !node.nodeType) {
      // Treat as session node
      toggleSessionExpansion(node.id);
      
      // Also open the session modal
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
        if (node.nodeType === 'session') return true;
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
        if (node.nodeType === 'session' && node.post) {
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
    
    // Node colors with session/message colors and tag overrides
    if (state.graph.nodeColor) {
      state.graph.nodeColor(node => {
        // Highlight on hover
        if (state.hoveredNodeId && node.id === state.hoveredNodeId) {
          return state.graphDisplay.highlightColor || '#BEFFF2';
        }
        if (node.nodeType === 'session') {
          return state.graphDisplay.sessionColor || '#BEFFF2';
        }
        if (node.tags && node.tags.length > 0) {
          return getTagColorForBlog(node.tags[0]);
        }
        return state.graphDisplay.messageColor || '#ffffff';
      });
    }
    if (state.graph.linkColor) {
      state.graph.linkColor(state.graphDisplay.linkColor || '#ffffff');
    }
    if (state.graph.linkWidth) {
      state.graph.linkWidth(state.graphDisplay.linkWidth || 0.5);
    }

    updateLegend();
    saveColorPrefs();
  }

  /**
   * Update legend UI with current colors and tags
   */
  function updateLegend() {
    if (!elements.legendList) return;
    const legendItems = [];

    legendItems.push({
      label: 'Thought Sessions',
      color: state.graphDisplay.sessionColor || '#BEFFF2'
    });
    legendItems.push({
      label: 'Messages',
      color: state.graphDisplay.messageColor || '#ffffff'
    });

    // Tag overrides
    if (state.graphDisplay.tagOverrides) {
      Object.entries(state.graphDisplay.tagOverrides).forEach(([tag, color]) => {
        legendItems.push({
          label: `Tag: ${tag}`,
          color
        });
      });
    }

    // Render
    elements.legendList.innerHTML = legendItems.map(item => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${item.color};"></span>
        <span class="legend-label">${item.label}</span>
      </div>
    `).join('');
  }

  /**
   * Add space background with stars to the graph scene
   */
  function addSpaceBackground() {
    if (!state.graph) return;
    
    try {
      const scene = state.graph.scene();
      if (!scene) {
        console.warn('[addSpaceBackground] Scene not available');
        return;
      }
      
      // Access THREE.js - 3d-force-graph bundles it, but it might not be global
      // Try to get it from the renderer or window
      let THREE = window.THREE;
      
      // If not on window, try to access through renderer
      if (!THREE && state.graph.renderer) {
        try {
          const renderer = state.graph.renderer();
          if (renderer) {
            // THREE.js classes are typically available through the renderer's constructor
            // Try accessing common THREE classes to see if they're available
            if (renderer.constructor && renderer.constructor.name === 'WebGLRenderer') {
              // THREE might be available through the constructor's parent
              THREE = window.THREE || renderer.constructor.THREE;
            }
          }
        } catch (e) {
          console.warn('[addSpaceBackground] Could not access renderer:', e);
        }
      }
      
      // If still not found, wait a bit and try again (THREE might load asynchronously)
      if (!THREE) {
        setTimeout(() => {
          THREE = window.THREE;
          if (THREE) {
            addSpaceBackground();
          } else {
            console.warn('[addSpaceBackground] THREE.js not available after delay. Space background skipped.');
          }
        }, 500);
        return;
      }
      
      const starCount = 10000;
      const starsGeometry = new THREE.BufferGeometry();
      const positions = [];
      
      // Generate random star positions in 3D space
      for (let i = 0; i < starCount; i++) {
        positions.push(
          THREE.MathUtils.randFloatSpread(2000),
          THREE.MathUtils.randFloatSpread(2000),
          THREE.MathUtils.randFloatSpread(2000)
        );
      }
      
      starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      
      // Create star material with brighter white/gray color for better visibility
      const starsMaterial = new THREE.PointsMaterial({ 
        color: 0xaaaaaa, // Brighter gray for better contrast
        size: 1.0, // Slightly larger stars
        sizeAttenuation: false
      });
      
      // Create starfield
      const starField = new THREE.Points(starsGeometry, starsMaterial);
      
      // Ensure stars render behind the graph
      starField.renderOrder = -1;
      starField.material.depthTest = false;
      
      // Set scene background to pure black (space void)
      scene.background = new THREE.Color(0x000000);
      
      // Add to scene
      scene.add(starField);
      
      console.log('[addSpaceBackground] Space background added successfully with dark background');
    } catch (error) {
      console.error('[addSpaceBackground] Error adding space background:', error);
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
    console.log('[Button Debug] resetGraph() function called');
    if (state.graph) {
      console.log('[Button Debug] Resetting graph state...');
      state.graphZoomLevel = 'session-only';
      state.focusedSessionId = null;
      state.expandedSessions.clear();
      
      // Reset to show only session nodes
      if (state.fullGraphData) {
        console.log('[Button Debug] Resetting graph data to session-only view');
        state.graph.graphData(filterGraphDataByZoom(state.fullGraphData));
      }
      
      // Reset camera only (no auto zoom)
      console.log('[Button Debug] Resetting camera position to (0, 0, 600)');
      state.graph.cameraPosition({ x: 0, y: 0, z: 600 });
      console.log('[Button Debug] ✓ Reset action completed');
    } else {
      console.warn('[Button Debug] Cannot reset: graph not initialized');
    }
  }

  /**
   * Zoom graph to fit all nodes
   */
  function zoomGraphToFit() {
    console.log('[Button Debug] zoomGraphToFit() function called');
    if (state.graph) {
      console.log('[Button Debug] Fitting graph to view...');
      // Reset zoom state
      state.graphZoomLevel = 'session-only';
      state.focusedSessionId = null;
      state.expandedSessions.clear();
      
      // Reset camera
      console.log('[Button Debug] Setting camera position to (0, 0, 800)');
      state.graph.cameraPosition({ x: 0, y: 0, z: 800 });
      
      // Reset to show only sessions
      if (state.fullGraphData) {
        console.log('[Button Debug] Resetting graph data to session-only view');
        const filteredData = filterGraphDataByZoom(state.fullGraphData);
        state.graph.graphData(filteredData);
      }
      
      // Fit to canvas with padding
      console.log('[Button Debug] Calling zoomToFit()...');
      setTimeout(() => {
        if (state.graph) {
          state.graph.zoomToFit(1000, 50); // 1000ms transition, 50px padding
          console.log('[Button Debug] ✓ Fit action completed');
        }
      }, 100);
    } else {
      console.warn('[Button Debug] Cannot fit: graph not initialized');
    }
  }

  // ==========================================================================
  // View Management
  // ==========================================================================
  
  /**
   * Detect if we're on desktop (split view) or mobile (toggle view)
   */
  function detectDesktop() {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    state.isDesktop = isDesktop;
    return isDesktop;
  }

  /**
   * Set the current view mode (list or mind-map)
   */
  async function setView(view) {
    // On desktop, always show both views (ignore toggle)
    const isDesktop = detectDesktop();
    
    // Map old 'graph' to 'mind-map'
    if (view === 'graph') {
      view = 'mind-map';
    }
    
    // Only allow list or mind-map view
    if (view !== 'list' && view !== 'mind-map') {
      view = 'list';
    }
    
    state.currentView = view;
    
    // Update data attribute
    if (elements.blogContent) {
      elements.blogContent.dataset.view = view;
    }

    // Show/hide views based on device type
    const listView = document.getElementById('blog-list-view');
    const graphView = document.getElementById('blog-graph-view');
    
    if (isDesktop) {
      // Desktop: Show both views (split view) - ignore data-view attribute
      if (listView) {
        listView.hidden = false;
        listView.setAttribute('aria-hidden', 'false');
        listView.style.display = 'block';
      }
      if (graphView) {
        graphView.hidden = false;
        graphView.setAttribute('aria-hidden', 'false');
        graphView.style.display = 'block';
      }
      
      // Initialize graph if not already loaded (for desktop split view)
      if (!state.graphLoaded) {
        console.log('[setView] Initializing mind map for desktop split view...');
        await initGraph();
      } else {
        // Resize graph to fit container
        resizeGraphForView();
      }
    } else {
      // Mobile: Toggle between views (only one visible at a time)
      if (view === 'list') {
        if (listView) {
          listView.hidden = false;
          listView.setAttribute('aria-hidden', 'false');
          listView.style.display = 'block';
        }
        if (graphView) {
          graphView.hidden = true;
          graphView.setAttribute('aria-hidden', 'true');
          graphView.style.display = 'none';
        }
      } else if (view === 'mind-map') {
        if (listView) {
          listView.hidden = true;
          listView.setAttribute('aria-hidden', 'true');
          listView.style.display = 'none';
        }
        if (graphView) {
          graphView.hidden = false;
          graphView.setAttribute('aria-hidden', 'false');
          graphView.style.display = 'block';
        }
        
        // Initialize graph if not already loaded
        if (!state.graphLoaded) {
          console.log('[setView] Initializing mind map for mobile view...');
          await initGraph();
        } else {
          // Resize graph to fit container (60vh on mobile)
          resizeGraphForView();
        }
      }
    }

    // Update button states (only visible on mobile)
    elements.viewButtons.forEach(btn => {
      const btnView = btn.dataset.view === 'graph' ? 'mind-map' : btn.dataset.view;
      const isActive = btnView === view;
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
   * Resize graph to fit current view container
   */
  function resizeGraphForView() {
    if (!state.graph) return;
    
    const graphContainer = document.getElementById('graph-container');
    if (!graphContainer) return;
    
    // Wait for container to be visible
    requestAnimationFrame(() => {
      const rect = graphContainer.getBoundingClientRect();
      const sidebar = document.getElementById('graph-sidebar');
      const sidebarWidth = sidebar ? sidebar.offsetWidth : 280;
      const containerWidth = rect.width || graphContainer.clientWidth || (window.innerWidth - sidebarWidth);
      const containerHeight = rect.height || graphContainer.clientHeight || window.innerHeight;
      
      console.log('[resizeGraphForView] Container dimensions:', { containerWidth, containerHeight, sidebarWidth });
      
      if (containerWidth > 0 && containerHeight > 0) {
        state.graph.width(containerWidth);
        state.graph.height(containerHeight);
        console.log('[resizeGraphForView] Resized to:', containerWidth, 'x', containerHeight);
        
        // Re-center and fit after resize
        setTimeout(() => {
          if (state.graph) {
            state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
            state.graph.zoomToFit(400, 50);
          }
        }, 100);
      } else {
        console.warn('[resizeGraphForView] Invalid dimensions:', { containerWidth, containerHeight });
      }
    });
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
                msgHtml += `<div class="blog-attachment-audio"><audio controls class="media-element" src="${escapeHtml(att.url)}"></audio>`;
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
                msgHtml += `<div class="blog-attachment-video"><video controls class="media-element" src="${escapeHtml(att.url)}"></video></div>`;
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
      
      // Re-track media elements after modal content is updated
      setTimeout(() => {
        const mediaElements = Array.from(document.querySelectorAll('audio.media-element, video.media-element'));
        mediaElements.forEach(media => {
          if (!state.allMediaElements.includes(media)) {
            state.allMediaElements.push(media);
            media.addEventListener('play', () => {
              state.allMediaElements.forEach(m => {
                if (m !== media && !m.paused) {
                  m.pause();
                }
              });
              state.currentMedia = media;
              // Use centralized visibility function if available
              if (typeof window.updateMediaControlsVisibility === 'function') {
                window.updateMediaControlsVisibility();
              } else if (elements.mediaControls) {
                elements.mediaControls.hidden = false;
                elements.mediaControls.style.display = 'flex';
              }
            });
            media.addEventListener('pause', () => {
              if (state.currentMedia === media) {
                state.currentMedia = null;
                // Use centralized visibility function if available
                if (typeof window.updateMediaControlsVisibility === 'function') {
                  window.updateMediaControlsVisibility();
                } else if (elements.mediaControls) {
                  elements.mediaControls.hidden = true;
                  elements.mediaControls.style.display = 'none';
                }
              }
            });
            media.addEventListener('ended', () => {
              if (state.currentMedia === media) {
                state.currentMedia = null;
                // Use centralized visibility function if available
                if (typeof window.updateMediaControlsVisibility === 'function') {
                  window.updateMediaControlsVisibility();
                } else if (elements.mediaControls) {
                  elements.mediaControls.hidden = true;
                  elements.mediaControls.style.display = 'none';
                }
              }
            });
          }
        });
      }, 100);
      
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
        elements.modalRelatedNotes.innerHTML = '<p style="color: rgba(255,255,255,0.5); font-size: 0.875rem;">No related thoughts found</p>';
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
    updateClearFiltersButtonVisibility();
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
    updateClearFiltersButtonVisibility();
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
    updateClearFiltersButtonVisibility();
  }

  /**
   * Update clear filters button visibility
   */
  function updateClearFiltersButtonVisibility() {
    const hasFilters = state.searchQuery || state.activeTag || state.activeAuthor;
    if (elements.clearFiltersBtn) {
      elements.clearFiltersBtn.style.display = hasFilters ? 'block' : 'none';
    }
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
    updateClearFiltersButtonVisibility();
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
      alert('You can only delete your own Thought Sessions.');
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
  // Mind Map Settings Modal
  // ==========================================================================
  
  /**
   * Open mind map settings modal
   */
  function openMindmapSettings() {
    if (!elements.mindmapSettingsModal) return;
    
    elements.mindmapSettingsModal.hidden = false;
    elements.mindmapSettingsModal.setAttribute('aria-hidden', 'false');
    
    // Focus the close button for accessibility
    if (elements.mindmapSettingsClose) {
      setTimeout(() => {
        elements.mindmapSettingsClose.focus();
      }, 100);
    }
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
  }
  
  /**
   * Close mind map settings modal
   */
  function closeMindmapSettings() {
    if (!elements.mindmapSettingsModal) return;
    
    elements.mindmapSettingsModal.hidden = true;
    elements.mindmapSettingsModal.setAttribute('aria-hidden', 'true');
    
    // Restore body scroll
    document.body.style.overflow = '';
    
    // Return focus to settings button
    if (elements.mindmapSettingsBtn) {
      elements.mindmapSettingsBtn.focus();
    }
  }
  
  // ==========================================================================
  // Media Controls
  // ==========================================================================
  
  /**
   * Setup media controls for audio/video playback
   */
  function setupMediaControls() {
    if (!elements.mediaControls || !elements.mediaPlayBtn || !elements.mediaPauseBtn || !elements.mediaStopBtn) return;
    
    // Ensure media controls are hidden on initialization
    elements.mediaControls.hidden = true;
    elements.mediaControls.style.display = 'none';
    state.currentMedia = null;
    
    // Track all media elements on the page
    function trackMediaElements() {
      state.allMediaElements = Array.from(document.querySelectorAll('audio.media-element, video.media-element'));
      
      // Add event listeners to all media elements
      state.allMediaElements.forEach(media => {
        media.addEventListener('play', () => {
          // Stop any other playing media
          state.allMediaElements.forEach(m => {
            if (m !== media && !m.paused) {
              m.pause();
            }
          });
          state.currentMedia = media;
          updateMediaControlsVisibility();
        });
        
        media.addEventListener('pause', () => {
          if (state.currentMedia === media) {
            state.currentMedia = null;
            updateMediaControlsVisibility();
          }
        });
        
        media.addEventListener('ended', () => {
          if (state.currentMedia === media) {
            state.currentMedia = null;
            updateMediaControlsVisibility();
          }
        });
      });
    }
    
    // Update media controls visibility
    function updateMediaControlsVisibility() {
      if (!elements.mediaControls) return;
      
      // Only show if there's currently playing media
      if (state.currentMedia && !state.currentMedia.paused) {
        elements.mediaControls.hidden = false;
        elements.mediaControls.style.display = 'flex';
      } else {
        elements.mediaControls.hidden = true;
        elements.mediaControls.style.display = 'none';
      }
    }
    
    // Make function accessible globally for modal code
    window.updateMediaControlsVisibility = updateMediaControlsVisibility;
    
    // Play button
    elements.mediaPlayBtn.addEventListener('click', () => {
      if (state.currentMedia) {
        state.currentMedia.play();
      } else {
        // Find first paused media element
        const pausedMedia = state.allMediaElements.find(m => m.paused);
        if (pausedMedia) {
          pausedMedia.play();
        }
      }
    });
    
    // Pause button
    elements.mediaPauseBtn.addEventListener('click', () => {
      if (state.currentMedia) {
        state.currentMedia.pause();
      } else {
        // Pause all playing media
        state.allMediaElements.forEach(m => {
          if (!m.paused) {
            m.pause();
          }
        });
      }
    });
    
    // Stop button
    elements.mediaStopBtn.addEventListener('click', () => {
      // Stop all media
      state.allMediaElements.forEach(m => {
        m.pause();
        m.currentTime = 0;
      });
      state.currentMedia = null;
      // Hide controls after stopping
      if (elements.mediaControls) {
        elements.mediaControls.hidden = true;
        elements.mediaControls.style.display = 'none';
      }
    });
    
    // Track media elements initially and after modal opens
    trackMediaElements();
    
    // Check for any currently playing media on page load
    setTimeout(() => {
      const playingMedia = state.allMediaElements.find(m => !m.paused);
      if (playingMedia) {
        state.currentMedia = playingMedia;
        updateMediaControlsVisibility();
      } else {
        // Ensure controls are hidden if no media is playing
        elements.mediaControls.hidden = true;
        elements.mediaControls.style.display = 'none';
      }
    }, 100);
    
    // Re-track after modal content is updated
    const originalOpenModal = window.openModal || (() => {});
    window.openModal = function(...args) {
      originalOpenModal(...args);
      setTimeout(trackMediaElements, 100);
    };
    
    // Use MutationObserver to track dynamically added media
    const observer = new MutationObserver(() => {
      trackMediaElements();
      // Check if any newly added media is playing
      setTimeout(() => {
        const playingMedia = state.allMediaElements.find(m => !m.paused);
        if (playingMedia && !state.currentMedia) {
          state.currentMedia = playingMedia;
          updateMediaControlsVisibility();
        }
      }, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
        // Initialize accordion state based on aria-expanded attribute
        const section = toggle.getAttribute('data-section');
        const content = document.getElementById(`${section}-content`);
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        const icon = toggle.querySelector('.blog_graph-section-icon');
        
        // Set initial state
        if (content) {
          content.hidden = !isExpanded;
        }
        if (icon) {
          icon.textContent = isExpanded ? '▼' : '►';
        }
        
        // Add click handler
        toggle.addEventListener('click', () => {
          const currentExpanded = toggle.getAttribute('aria-expanded') === 'true';
          const newExpanded = !currentExpanded;
          
          // Update aria-expanded
          toggle.setAttribute('aria-expanded', newExpanded);
          
          // Update content visibility (when expanding, hide=false)
          if (content) {
            content.hidden = !newExpanded;
          }
          
          // Update icon (► when collapsed, ▼ when expanded)
          if (icon) {
            icon.textContent = newExpanded ? '▼' : '►';
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
        saveGraphSettings();
      });
    }
    if (elements.forceRepel) {
      elements.forceRepel.addEventListener('input', (e) => {
        state.graphForces.repel = parseInt(e.target.value);
        applyGraphForces();
        saveGraphSettings();
      });
    }
    if (elements.forceLink) {
      elements.forceLink.addEventListener('input', (e) => {
        state.graphForces.link = parseInt(e.target.value);
        applyGraphForces();
        saveGraphSettings();
      });
    }
    if (elements.forceDistance) {
      elements.forceDistance.addEventListener('input', (e) => {
        state.graphForces.distance = parseInt(e.target.value);
        applyGraphForces();
        saveGraphSettings();
      });
    }
    
    // Graph display color/size controls
    if (elements.displayNodeColor) {
      elements.displayNodeColor.addEventListener('input', (e) => {
        state.graphDisplay.nodeColor = e.target.value;
        applyGraphDisplay();
        saveGraphSettings();
      });
    }
    if (elements.displayLinkColor) {
      elements.displayLinkColor.addEventListener('input', (e) => {
        state.graphDisplay.linkColor = e.target.value;
        applyGraphDisplay();
        saveGraphSettings();
      });
    }
    if (elements.displayHighlightColor) {
      elements.displayHighlightColor.addEventListener('input', (e) => {
        state.graphDisplay.highlightColor = e.target.value;
        applyGraphDisplay();
        saveGraphSettings();
      });
    }
    if (elements.displaySessionColor) {
      elements.displaySessionColor.addEventListener('input', (e) => {
        state.graphDisplay.sessionColor = e.target.value;
        applyGraphDisplay();
        saveGraphSettings();
      });
    }
    if (elements.displayMessageColor) {
      elements.displayMessageColor.addEventListener('input', (e) => {
        state.graphDisplay.messageColor = e.target.value;
        applyGraphDisplay();
        saveGraphSettings();
      });
    }
    if (elements.tagOverrideAdd) {
      elements.tagOverrideAdd.addEventListener('click', () => {
        const name = elements.tagOverrideName?.value?.trim();
        const color = elements.tagOverrideColor?.value || '#ffffff';
        if (!name) return;
        state.graphDisplay.tagOverrides[name.toLowerCase()] = color;
        saveGraphSettings();
        updateLegend();
        applyGraphDisplay();
        // clear name input for convenience
        if (elements.tagOverrideName) elements.tagOverrideName.value = '';
      });
    }
    if (elements.displayLinkWidth) {
      elements.displayLinkWidth.addEventListener('input', (e) => {
        state.graphDisplay.linkWidth = parseFloat(e.target.value);
        applyGraphDisplay();
        saveGraphSettings();
      });
    }
    
    // Orbit speed slider (0-360 scale)
    if (elements.orbitSpeedSlider) {
      elements.orbitSpeedSlider.addEventListener('input', (e) => {
        const newSpeed = parseInt(e.target.value);
        state.orbitSpeed = newSpeed;
        state.targetOrbitSpeed = newSpeed; // Update target for gradual transition
        console.log('[Orbit] Orbit speed set to:', state.orbitSpeed, '(0=no orbit, 360=full speed)');
        saveGraphSettings();
      });
    }
    
    // Bloom brightness slider
    if (elements.bloomBrightnessSlider) {
      elements.bloomBrightnessSlider.addEventListener('input', (e) => {
        if (state.bloomPass) {
          state.bloomPass.strength = parseFloat(e.target.value);
        }
        saveGraphSettings();
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

    // View toggle buttons (mobile only)
    elements.viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Only handle toggle on mobile
        if (!detectDesktop()) {
          let view = btn.dataset.view;
          // Map 'graph' to 'mind-map'
          if (view === 'graph') {
            view = 'mind-map';
          }
          setView(view);
        }
      });
    });
    
    // Handle window resize for responsive behavior
    window.addEventListener('resize', debounce(() => {
      const wasDesktop = state.isDesktop;
      const isDesktop = detectDesktop();
      
      if (wasDesktop !== isDesktop) {
        // Device type changed, update view
        setView(state.currentView);
      } else if (isDesktop && state.graph) {
        // Still desktop, just resize graph
        resizeGraphForView();
      }
    }, 200));

    // Mind Map Settings Modal
    if (elements.mindmapSettingsBtn) {
      elements.mindmapSettingsBtn.addEventListener('click', () => {
        openMindmapSettings();
      });
    }
    
    if (elements.mindmapSettingsClose) {
      elements.mindmapSettingsClose.addEventListener('click', () => {
        closeMindmapSettings();
      });
    }
    
    if (elements.mindmapSettingsBackdrop) {
      elements.mindmapSettingsBackdrop.addEventListener('click', () => {
        closeMindmapSettings();
      });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.mindmapSettingsModal && !elements.mindmapSettingsModal.hidden) {
        closeMindmapSettings();
      }
    });
    
    // Graph controls
    if (elements.graphResetBtn) {
      elements.graphResetBtn.addEventListener('click', () => {
        console.log('[Button Debug] Reset button clicked');
        resetGraph();
      });
    }
    if (elements.graphZoomFitBtn) {
      elements.graphZoomFitBtn.addEventListener('click', () => {
        console.log('[Button Debug] Fit button clicked');
        zoomGraphToFit();
      });
    }
    if (elements.graphSettingsToggle) {
      elements.graphSettingsToggle.addEventListener('click', () => {
        console.log('[Settings Debug] Settings button tapped');
        
        const sidebar = elements.graphSidebar;
        if (!sidebar) {
          console.error('[Settings Debug] Sidebar element not found');
          return;
        }
        
        // Check current state
        const wasHidden = sidebar.hasAttribute('hidden');
        const wasVisible = checkSidebarVisibility();
        
        console.log('[Settings Debug] Sidebar state before toggle:', {
          wasHidden: wasHidden,
          wasVisible: wasVisible
        });
        
        const layout = sidebar.closest('.blog_graph-layout');
        
        if (wasHidden) {
          // Show sidebar
          console.log('[Settings Debug] Opening settings view...');
          sidebar.removeAttribute('hidden');
          sidebar.style.display = 'flex'; // Explicitly set display
          if (layout) layout.classList.add('sidebar-visible');
          elements.graphSettingsToggle.setAttribute('aria-expanded', 'true');
          
          // Verify it's visible after opening
          setTimeout(() => {
            const isNowVisible = checkSidebarVisibility();
            console.log('[Settings Debug] Settings view opened. Is visible:', isNowVisible);
            if (isNowVisible) {
              console.log('[Settings Debug] ✓ Settings view is displaying and visible to user');
              console.log('[Settings Debug] Sidebar position:', sidebar.getBoundingClientRect());
            } else {
              console.warn('[Settings Debug] ✗ Settings view may be covered or not visible');
              console.warn('[Settings Debug] Sidebar computed style:', window.getComputedStyle(sidebar));
            }
          }, 100);
        } else {
          // Hide sidebar
          console.log('[Settings Debug] Closing settings view...');
          sidebar.setAttribute('hidden', '');
          sidebar.style.display = 'none'; // Explicitly set display
          if (layout) layout.classList.remove('sidebar-visible');
          elements.graphSettingsToggle.setAttribute('aria-expanded', 'false');
          
          // Verify it's hidden after closing
          setTimeout(() => {
            const isNowHidden = sidebar.hasAttribute('hidden');
            const isNowVisible = checkSidebarVisibility();
            console.log('[Settings Debug] Settings view closed. Is hidden:', isNowHidden, 'Is visible:', isNowVisible);
            console.log('[Settings Debug] ✓ Settings button recognizes settings view is closed');
          }, 100);
        }
      });
    }
    if (elements.graphSettingsSave) {
      elements.graphSettingsSave.addEventListener('click', () => {
        console.log('[Button Debug] Save Settings button clicked');
        
        // Save settings
        saveGraphSettings();
        console.log('[Settings Debug] Settings saved to localStorage');
        
        // Close settings view
        const sidebar = elements.graphSidebar;
        if (sidebar) {
          console.log('[Settings Debug] Closing settings view after save...');
          const layout = sidebar.closest('.blog_graph-layout');
          sidebar.setAttribute('hidden', '');
          sidebar.style.display = 'none'; // Explicitly set display
          if (layout) layout.classList.remove('sidebar-visible');
          elements.graphSettingsToggle.setAttribute('aria-expanded', 'false');
          
          // Verify it's closed
          setTimeout(() => {
            const isNowHidden = sidebar.hasAttribute('hidden');
            const isNowVisible = checkSidebarVisibility();
            console.log('[Settings Debug] Settings view closed after save. Is hidden:', isNowHidden, 'Is visible:', isNowVisible);
            console.log('[Settings Debug] ✓ Settings view is closed');
            console.log('[Settings Debug] ✓ Settings button recognizes settings view is closed');
          }, 100);
        }
      });
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
        resizeGraphForView();
      }
    }, 200));
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // Check auth state and update UI
    await checkAuthState();
    
    // Load saved color preferences and graph settings
    loadGraphSettings();
    
    // Load tag colors from database
    await loadTagColors();
    
    // Listen for tag color updates from settings
    window.addEventListener('tag-color-updated', async (e) => {
      const { tagName, color } = e.detail;
      state.tagColors[tagName.toLowerCase()] = color;
      // Update graph if it exists
      if (state.graph) {
        applyGraphDisplay();
      }
    });
    
    window.addEventListener('tag-converted', async () => {
      // Reload all tag colors when a tag is converted
      await loadTagColors();
    });
    
    window.addEventListener('tag-deleted', async () => {
      // Reload all tag colors when a tag is deleted
      await loadTagColors();
    });
    
    // Sync initial slider values with state
    if (elements.displayLinkWidth && elements.displayLinkWidth.value) {
      state.graphDisplay.linkWidth = parseFloat(elements.displayLinkWidth.value) || 0.5;
      console.log('[init] Synced linkWidth from slider:', state.graphDisplay.linkWidth);
    }
    if (elements.orbitSpeedSlider && elements.orbitSpeedSlider.value) {
      state.orbitSpeed = parseInt(elements.orbitSpeedSlider.value) || 180;
      console.log('[init] Synced orbitSpeed from slider:', state.orbitSpeed, '(0-360 scale)');
    } else {
      state.orbitSpeed = 180; // Default to half speed
    }
    if (elements.bloomBrightnessSlider && elements.bloomBrightnessSlider.value) {
      const brightness = parseFloat(elements.bloomBrightnessSlider.value) || 1.5;
      if (state.bloomPass) {
        state.bloomPass.strength = brightness;
      }
      console.log('[init] Synced bloom brightness from slider:', brightness);
    }
    if (elements.displaySessionColor) {
      elements.displaySessionColor.value = state.graphDisplay.sessionColor || '#BEFFF2';
    }
    if (elements.displayMessageColor) {
      elements.displayMessageColor.value = state.graphDisplay.messageColor || '#ffffff';
    }
    
    // Render initial legend
    updateLegend();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup media controls
    setupMediaControls();

    // Fetch and render posts
    const posts = await fetchBlogData();
    
    // Update state.posts (renderListView will check this)
    state.posts = posts || [];
    
    // Hide empty state if we have posts (renderListView will handle visibility)
    if (elements.emptyState && state.posts.length > 0) {
      elements.emptyState.hidden = true;
    }
    
    if (state.posts.length > 0) {
      renderTagFilters(state.posts);
      renderAuthorFilters(state.posts);
      renderListView(state.posts);
      
      // Build graph data from fetched posts
      if (isWebGLAvailable() && !prefersReducedMotion()) {
        await fetchGraphData(); // This will build from posts if available
        // fetchGraphData will hide empty state if nodes exist
      }
    } else {
      // No posts loaded - show empty state
      if (elements.emptyState) {
        elements.emptyState.hidden = false;
      }
    }

    // Initialize view based on device type
    detectDesktop();
    const preferredView = localStorage.getItem(CONFIG.storageKey) || 'list';
    if (state.isDesktop) {
      // Desktop: Show both views (split view)
      state.currentView = 'list';
      if (elements.blogContent) {
        elements.blogContent.dataset.view = 'list';
      }
      // Show both views explicitly
      const listView = document.getElementById('blog-list-view');
      const graphView = document.getElementById('blog-graph-view');
      if (listView) {
        listView.hidden = false;
        listView.setAttribute('aria-hidden', 'false');
        listView.style.display = 'block';
      }
      if (graphView) {
        graphView.hidden = false;
        graphView.setAttribute('aria-hidden', 'false');
        graphView.style.display = 'block';
      }
      // Initialize graph for desktop split view
      console.log('[init] Initializing mind map for desktop split view...');
      await initGraph();
    } else {
      // Mobile: Use preferred view or default to list
      await setView(preferredView === 'graph' ? 'mind-map' : preferredView);
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
