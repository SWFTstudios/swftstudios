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
    graph: null,
    graphLoaded: false,
    graphLibraryLoaded: false,
    currentView: 'list',
    searchQuery: '',
    activeTag: null,
    activeAuthor: null,
    sortBy: 'date-desc',
    highlightedPostId: null,
    currentUser: null // Track current authenticated user
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
    editCloseBtn: document.getElementById('edit-note-close')
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
  function buildGraphData(posts) {
    // Return empty graph if no posts
    if (!posts || posts.length === 0) {
      return { nodes: [], links: [] };
    }
    
    const nodes = posts.map(post => ({
      id: post.id,
      name: post.title,
      tags: post.tags || [],
      val: post.links ? post.links.length + 1 : 1,
      color: post.tags && post.tags.length > 0 ? '#6366f1' : '#888'
    }));
    
    const links = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    posts.forEach(post => {
      if (post.links && post.links.length > 0) {
        post.links.forEach(linkId => {
          // Check if linked post exists
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
    
    return { nodes, links };
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
    if (state.graphLoaded || !elements.graphContainer) return;

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
        await fetchGraphData();
      }

      if (!state.graphData) {
        showGraphUnavailable();
        return;
      }

      // Check if there are any nodes to display
      if (!state.graphData.nodes || state.graphData.nodes.length === 0) {
        showNoNotesMessage();
        return;
      }

      // Apply node limit based on device
      const nodeLimit = isMobile() 
        ? CONFIG.graphNodeLimit.mobile 
        : CONFIG.graphNodeLimit.desktop;

      let graphData = state.graphData;
      if (graphData.nodes.length > nodeLimit) {
        console.log(`Limiting graph to ${nodeLimit} nodes (${graphData.nodes.length} total)`);
        graphData = limitGraphData(graphData, nodeLimit);
      }

      // Hide placeholder and no-notes message
      if (elements.graphPlaceholder) {
        elements.graphPlaceholder.style.display = 'none';
      }
      hideNoNotesMessage();

      // Create graph
      state.graph = ForceGraph3D()(elements.graphContainer)
        .graphData(graphData)
        .nodeLabel(node => `
          <div style="background: rgba(0,0,0,0.8); padding: 8px 12px; border-radius: 4px; font-size: 14px;">
            <strong>${escapeHtml(node.name)}</strong>
            ${node.tags && node.tags.length > 0 ? `<br><span style="color: #888; font-size: 12px;">${node.tags.join(', ')}</span>` : ''}
          </div>
        `)
        .nodeColor(node => node.status === 'missing' ? '#666' : (node.color || '#6366f1'))
        .nodeVal(node => node.val || 1)
        .nodeOpacity(0.9)
        .linkColor(() => 'rgba(255, 255, 255, 0.2)')
        .linkOpacity(0.6)
        .linkWidth(link => link.type === 'manual' ? 1.5 : 0.5)
        .backgroundColor('rgba(0, 0, 0, 0)')
        .onNodeClick(handleGraphNodeClick)
        .onNodeHover(handleGraphNodeHover);

      // Apply reduced motion settings
      if (prefersReducedMotion()) {
        state.graph.cooldownTicks(0);
      }

      // Center the graph
      setTimeout(() => {
        if (state.graph) {
          // Center camera on the graph
          state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
          // Zoom to fit all nodes
          state.graph.zoomToFit(400, 0);
        }
      }, 100);

      // Stop simulation after settling
      setTimeout(() => {
        if (state.graph) {
          state.graph.cooldownTicks(0);
          // Re-center after simulation settles
          state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
          state.graph.zoomToFit(400, 0);
        }
      }, 30000);

      state.graphLoaded = true;

      // Apply graph customization settings if available
      if (window.GraphCustomizer && window.Settings) {
        window.GraphCustomizer.init(state.graph, window.Settings.settings);
      }

    } catch (error) {
      console.error('Failed to initialize graph:', error);
      showGraphUnavailable();
    }
  }

  /**
   * Limit graph data to specified number of nodes
   */
  function limitGraphData(data, limit) {
    // Sort nodes by connection count (val)
    const sortedNodes = [...data.nodes].sort((a, b) => (b.val || 0) - (a.val || 0));
    const limitedNodes = sortedNodes.slice(0, limit);
    const nodeIds = new Set(limitedNodes.map(n => n.id));

    // Filter links to only include nodes in the limited set
    const limitedLinks = data.links.filter(link => 
      nodeIds.has(link.source.id || link.source) && 
      nodeIds.has(link.target.id || link.target)
    );

    return {
      ...data,
      nodes: limitedNodes,
      links: limitedLinks
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
    if (!node) return;

    // Find the post
    const post = state.posts.find(p => p.id === node.id || p.slug === node.slug);
    
    if (post) {
      // Always show modal when clicking graph node
      openModal(post);
      
      // If in "both" view, also highlight and scroll to list item
      if (state.currentView === 'both') {
        highlightPost(post.id);
        scrollToPost(post.id);
      }
    } else if (node.status === 'missing') {
      // Handle missing node (referenced but not existing)
      console.log('Missing note:', node.name);
    }
  }

  /**
   * Handle graph node hover
   */
  function handleGraphNodeHover(node) {
    document.body.style.cursor = node ? 'pointer' : 'default';
  }

  /**
   * Reset graph view
   */
  function resetGraph() {
    if (state.graph) {
      state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
      state.graph.zoomToFit(400, 0);
    }
  }

  /**
   * Zoom graph to fit all nodes
   */
  function zoomGraphToFit() {
    if (state.graph) {
      state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
      state.graph.zoomToFit(400, 0);
    }
  }

  // ==========================================================================
  // View Management
  // ==========================================================================
  
  /**
   * Set the current view mode
   */
  function setView(view) {
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

    // Initialize graph if switching to graph or both view
    if ((view === 'graph' || view === 'both')) {
      // Check if there are posts before initializing graph
      if (!state.posts || state.posts.length === 0) {
        showNoNotesMessage();
      } else if (!state.graphLoaded) {
        initGraph();
      } else {
        // Graph already loaded, make sure no-notes message is hidden
        hideNoNotesMessage();
      }
    } {
      initGraph();
    }

    // Resize graph when showing
    if (state.graph && (view === 'graph' || view === 'both')) {
      setTimeout(() => {
        state.graph.width(elements.graphContainer.clientWidth);
        state.graph.height(elements.graphContainer.clientHeight);
        // Re-center after resize
        state.graph.cameraPosition({ x: 0, y: 0, z: 500 });
        state.graph.zoomToFit(400, 0);
      }, 100);
    }

    // Save preference
    try {
      localStorage.setItem(CONFIG.storageKey, view);
    } catch (e) {
      // localStorage not available
    }
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
      if (window.marked) {
        try {
          contentHtml = window.marked.parse(post.content || '');
        } catch (e) {
          console.error('Markdown parsing error:', e);
          contentHtml = escapeHtml(post.content || '');
        }
      } else {
        // Fallback: plain text with line breaks
        contentHtml = escapeHtml(post.content || '')
          .replace(/\n/g, '<br>');
      }
      elements.modalContent.innerHTML = contentHtml || '<p style="color: rgba(255,255,255,0.5);">No content</p>';
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
        setView(btn.dataset.view);
      });
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
    if (elements.modal) {
      const modalContent = elements.modal.querySelector('.blog_modal-content');
      if (modalContent) {
        modalContent.addEventListener('click', (e) => {
          // Don't stop propagation if clicking on close button
          if (!e.target.closest('.blog_modal-close')) {
            e.stopPropagation();
          }
        });
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

    // Window resize
    window.addEventListener('resize', debounce(() => {
      if (state.graph && (state.currentView === 'graph' || state.currentView === 'both')) {
        state.graph.width(elements.graphContainer.clientWidth);
        state.graph.height(elements.graphContainer.clientHeight);
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

    // Load view preference
    const preferredView = loadViewPreference();

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
