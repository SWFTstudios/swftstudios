/**
 * Settings Manager
 * 
 * Manages user preferences for tag colors and graph customization
 * Stores settings in Supabase user metadata
 */

(function() {
  'use strict';

  // ==========================================================================
  // Default Settings
  // ==========================================================================
  
  const DEFAULT_SETTINGS = {
    tagColors: {
      'design': '#BEFFF2',
      'idea': '#10b981',
      'personal': '#8b5cf6',
      'tech': '#3b82f6',
      'business': '#f59e0b',
      'tutorial': '#ef4444'
    },
    graph: {
      nodeColor: '#BEFFF2',
      linkColor: 'rgba(99, 102, 241, 0.3)',
      highlightColor: '#f59e0b',
      nodeSize: 5,
      linkWidth: 1,
      linkStyle: 'solid',
      particleWidth: 1,
      particleColor: '#BEFFF2'
    }
  };

  // ==========================================================================
  // Settings Manager
  // ==========================================================================
  
  const Settings = {
    supabase: null,
    currentUser: null,
    settings: { ...DEFAULT_SETTINGS },
    modal: null,
    
    // ==========================================================================
    // Initialize
    // ==========================================================================
    
    async init(supabase, user) {
      this.supabase = supabase;
      this.currentUser = user;
      
      // Create modal if it doesn't exist
      if (!document.getElementById('settings-modal')) {
        this.createModal();
      }
      
      this.modal = document.getElementById('settings-modal');
      
      // Load settings
      await this.loadSettings();
      
      // Setup event listeners
      this.setupEventListeners();
    },
    
    // ==========================================================================
    // Settings Operations
    // ==========================================================================
    
    async loadSettings() {
      try {
        // Try to load from Supabase user metadata
        const { data, error } = await this.supabase.auth.getUser();
        
        if (error) throw error;
        
        if (data.user && data.user.user_metadata && data.user.user_metadata.settings) {
          this.settings = {
            ...DEFAULT_SETTINGS,
            ...data.user.user_metadata.settings
          };
        }
        
        // Apply settings to UI
        this.applySettings();
        
      } catch (error) {
        console.error('Error loading settings:', error);
        // Fallback to localStorage
        this.loadFromLocalStorage();
      }
    },
    
    async saveSettings() {
      try {
        // Save to Supabase user metadata
        const { error } = await this.supabase.auth.updateUser({
          data: { settings: this.settings }
        });
        
        if (error) throw error;
        
        // Also save to localStorage as backup
        this.saveToLocalStorage();
        
        // Apply settings immediately
        this.applySettings();
        
        // Dispatch event for graph updates
        window.dispatchEvent(new CustomEvent('settings-updated', {
          detail: { settings: this.settings }
        }));
        
        return true;
      } catch (error) {
        console.error('Error saving settings:', error);
        // Fallback to localStorage
        this.saveToLocalStorage();
        return false;
      }
    },
    
    loadFromLocalStorage() {
      const stored = localStorage.getItem('swft-settings');
      if (stored) {
        try {
          this.settings = {
            ...DEFAULT_SETTINGS,
            ...JSON.parse(stored)
          };
        } catch (e) {
          console.error('Error parsing settings:', e);
        }
      }
    },
    
    saveToLocalStorage() {
      localStorage.setItem('swft-settings', JSON.stringify(this.settings));
    },
    
    resetToDefaults() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.saveSettings();
      this.populateForm();
    },
    
    // ==========================================================================
    // Tag Colors
    // ==========================================================================
    
    getTagColor(tag) {
      if (!tag) return DEFAULT_SETTINGS.tagColors.design;
      const normalizedTag = tag.toLowerCase();
      return this.settings.tagColors[normalizedTag] || DEFAULT_SETTINGS.tagColors.design;
    },
    
    setTagColor(tag, color) {
      this.settings.tagColors[tag] = color;
    },
    
    removeTagColor(tag) {
      delete this.settings.tagColors[tag];
    },
    
    // ==========================================================================
    // Apply Settings
    // ==========================================================================
    
    applySettings() {
      // Apply tag colors to page
      this.applyTagColors();
      
      // Graph settings are applied when graph is initialized
      // (handled by graph-customizer.js)
    },
    
    /**
     * Calculate relative luminance for WCAG contrast ratio
     */
    getRelativeLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(val => {
        val = val / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    },
    
    /**
     * Get contrast color (black or white) for text on colored background
     */
    getContrastColor(hexColor) {
      if (!hexColor) return '#000000';
      
      const hex = hexColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      // Calculate luminance
      const luminance = this.getRelativeLuminance(r, g, b);
      
      // Return black for light backgrounds, white for dark backgrounds
      return luminance > 0.5 ? '#000000' : '#ffffff';
    },
    
    applyTagColors() {
      const style = document.getElementById('tag-color-styles') || document.createElement('style');
      style.id = 'tag-color-styles';
      
      let css = '';
      Object.entries(this.settings.tagColors).forEach(([tag, color]) => {
        // Calculate contrast color for selected tag suggestions
        const contrastColor = this.getContrastColor(color);
        
        css += `
          .message-tag[data-tag="${tag}"],
          .blog_tag-btn[data-tag="${tag}"].is-active,
          .blog_card-tag[data-tag="${tag}"] {
            background: ${color}20;
            border-color: ${color};
            color: ${color};
          }
          
          /* Tag suggestions with custom colors - ensure proper contrast when selected */
          .tag-suggestion.selected[data-tag="${tag}"] {
            background: ${color} !important;
            color: ${contrastColor} !important;
            border-color: ${color} !important;
          }
        `;
      });
      
      style.textContent = css;
      
      if (!style.parentNode) {
        document.head.appendChild(style);
      }
    },
    
    // ==========================================================================
    // Modal Management
    // ==========================================================================
    
    createModal() {
      const modalHTML = `
        <div id="settings-modal" class="settings-modal" hidden>
          <div class="settings-modal-content">
            <div class="settings-header">
              <h2 class="settings-title">Settings</h2>
              <button type="button" class="settings-close" id="settings-close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div class="settings-body">
              <!-- Tag Management Section -->
              <div class="settings-section">
                <h3 class="settings-section-title">Tag Management</h3>
                <p class="settings-section-description">Manage auto tags and create persistent tags with custom colors</p>
                
                <!-- Create New Persistent Tag -->
                <div class="settings-group">
                  <button type="button" class="settings-button secondary" id="create-persistent-tag-btn" style="width: 100%; margin-bottom: 1rem;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.5rem;">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Create New Persistent Tag
                  </button>
                </div>
                
                <!-- Tags List -->
                <div class="settings-group">
                  <div class="tag-management-list" id="tag-management-list">
                    <p class="settings-hint">Loading tags...</p>
                  </div>
                </div>
              </div>
              
              <!-- Tag Colors Section (Legacy - for backward compatibility) -->
              <div class="settings-section" style="display: none;">
                <h3 class="settings-section-title">Tag Colors</h3>
                <p class="settings-section-description">Customize colors for your tags</p>
                
                <div class="settings-group">
                  <div class="tag-color-list" id="tag-color-list"></div>
                </div>
              </div>
              
              <!-- Graph Customization Section -->
              <div class="settings-section">
                <h3 class="settings-section-title">3D Graph Appearance</h3>
                <p class="settings-section-description">Customize the knowledge graph visualization</p>
                
                <div class="settings-group">
                  <div class="color-picker-row">
                    <span class="color-picker-label">Node Color</span>
                    <input type="color" id="graph-node-color" class="color-picker-input">
                  </div>
                  
                  <div class="color-picker-row">
                    <span class="color-picker-label">Link Color</span>
                    <input type="color" id="graph-link-color" class="color-picker-input">
                  </div>
                  
                  <div class="color-picker-row">
                    <span class="color-picker-label">Highlight Color</span>
                    <input type="color" id="graph-highlight-color" class="color-picker-input">
                  </div>
                </div>
                
                <div class="settings-group">
                  <div class="slider-control">
                    <div class="slider-label">
                      <span>Node Size</span>
                      <span class="slider-value" id="node-size-value">5</span>
                    </div>
                    <input type="range" id="node-size-slider" class="slider-input" 
                           min="1" max="20" step="1" value="5">
                  </div>
                  
                  <div class="slider-control">
                    <div class="slider-label">
                      <span>Link Width</span>
                      <span class="slider-value" id="link-width-value">1</span>
                    </div>
                    <input type="range" id="link-width-slider" class="slider-input" 
                           min="0.5" max="5" step="0.5" value="1">
                  </div>
                </div>
                
                <div class="settings-group">
                  <label class="settings-label">
                    <span>Connection Style</span>
                  </label>
                  <select id="link-style-select" class="select-control">
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div class="settings-footer">
              <button type="button" class="settings-button danger" id="reset-settings">
                Reset to Defaults
              </button>
              <div style="display: flex; gap: 0.75rem;">
                <button type="button" class="settings-button secondary" id="cancel-settings">
                  Cancel
                </button>
                <button type="button" class="settings-button primary" id="save-settings">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      
      // Add settings.css link if not present
      if (!document.querySelector('link[href="css/settings.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/settings.css';
        document.head.appendChild(link);
      }
    },
    
    showModal() {
      if (!this.modal) return;
      
      this.populateForm();
      this.modal.hidden = false;
      
      // Focus first input
      const firstInput = this.modal.querySelector('input, select');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    },
    
    hideModal() {
      if (!this.modal) return;
      this.modal.hidden = true;
    },
    
    // ==========================================================================
    // Form Management
    // ==========================================================================
    
    populateForm() {
      // Tag management (load from database)
      this.loadAndRenderTags();
      
      // Tag colors (legacy)
      this.renderTagColorList();
      
      // Graph settings
      const nodeColorInput = document.getElementById('graph-node-color');
      const linkColorInput = document.getElementById('graph-link-color');
      const highlightColorInput = document.getElementById('graph-highlight-color');
      const nodeSizeSlider = document.getElementById('node-size-slider');
      const linkWidthSlider = document.getElementById('link-width-slider');
      const linkStyleSelect = document.getElementById('link-style-select');
      
      if (nodeColorInput) nodeColorInput.value = this.settings.graph.nodeColor;
      if (linkColorInput) linkColorInput.value = this.rgbaToHex(this.settings.graph.linkColor);
      if (highlightColorInput) highlightColorInput.value = this.settings.graph.highlightColor;
      if (nodeSizeSlider) {
        nodeSizeSlider.value = this.settings.graph.nodeSize;
        document.getElementById('node-size-value').textContent = this.settings.graph.nodeSize;
      }
      if (linkWidthSlider) {
        linkWidthSlider.value = this.settings.graph.linkWidth;
        document.getElementById('link-width-value').textContent = this.settings.graph.linkWidth;
      }
      if (linkStyleSelect) linkStyleSelect.value = this.settings.graph.linkStyle;
    },
    
    renderTagColorList() {
      const listEl = document.getElementById('tag-color-list');
      if (!listEl) return;
      
      const tags = Object.keys(this.settings.tagColors);
      
      listEl.innerHTML = tags.map(tag => `
        <div class="tag-color-item">
          <span class="tag-color-name">${this.escapeHtml(tag)}</span>
          <input type="color" class="color-picker-input" 
                 data-tag="${this.escapeHtml(tag)}" 
                 value="${this.settings.tagColors[tag]}">
          <button type="button" class="tag-color-delete" data-tag="${this.escapeHtml(tag)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `).join('') + `
        <div class="tag-color-item tag-color-add">
          <input type="text" class="tag-color-add-input" placeholder="Tag name" id="new-tag-name">
          <input type="color" class="color-picker-input" id="new-tag-color" value="#BEFFF2">
          <button type="button" class="tag-color-add-btn" id="add-tag-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      `;
      
      // Attach handlers for existing tags
      listEl.querySelectorAll('.color-picker-input[data-tag]').forEach(input => {
        input.addEventListener('change', () => {
          this.settings.tagColors[input.dataset.tag] = input.value;
        });
      });
      
      listEl.querySelectorAll('.tag-color-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          delete this.settings.tagColors[btn.dataset.tag];
          this.renderTagColorList();
        });
      });

      // Add new tag handler
      const addBtn = document.getElementById('add-tag-btn');
      const nameInput = document.getElementById('new-tag-name');
      const colorInput = document.getElementById('new-tag-color');
      
      if (addBtn && nameInput && colorInput) {
        const addTag = () => {
          const tagName = nameInput.value.trim().toLowerCase();
          if (tagName && !this.settings.tagColors[tagName]) {
            this.settings.tagColors[tagName] = colorInput.value;
            nameInput.value = '';
            this.renderTagColorList();
          }
        };
        
        addBtn.addEventListener('click', addTag);
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
          }
        });
      }
    },
    
    // ==========================================================================
    // Event Listeners
    // ==========================================================================
    
    setupEventListeners() {
      // Close button
      const closeBtn = document.getElementById('settings-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hideModal());
      }
      
      // Cancel button
      const cancelBtn = document.getElementById('cancel-settings');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.hideModal());
      }
      
      // Save button
      const saveBtn = document.getElementById('save-settings');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          await this.saveFormSettings();
        });
      }
      
      // Reset button
      const resetBtn = document.getElementById('reset-settings');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (confirm('Reset all settings to defaults?')) {
            this.resetToDefaults();
          }
        });
      }
      
      // Graph color inputs
      const nodeColorInput = document.getElementById('graph-node-color');
      if (nodeColorInput) {
        nodeColorInput.addEventListener('change', () => {
          this.settings.graph.nodeColor = nodeColorInput.value;
        });
      }
      
      const linkColorInput = document.getElementById('graph-link-color');
      if (linkColorInput) {
        linkColorInput.addEventListener('change', () => {
          this.settings.graph.linkColor = this.hexToRgba(linkColorInput.value, 0.3);
        });
      }
      
      const highlightColorInput = document.getElementById('graph-highlight-color');
      if (highlightColorInput) {
        highlightColorInput.addEventListener('change', () => {
          this.settings.graph.highlightColor = highlightColorInput.value;
        });
      }
      
      // Sliders
      const nodeSizeSlider = document.getElementById('node-size-slider');
      if (nodeSizeSlider) {
        nodeSizeSlider.addEventListener('input', () => {
          this.settings.graph.nodeSize = parseInt(nodeSizeSlider.value);
          document.getElementById('node-size-value').textContent = nodeSizeSlider.value;
        });
      }
      
      const linkWidthSlider = document.getElementById('link-width-slider');
      if (linkWidthSlider) {
        linkWidthSlider.addEventListener('input', () => {
          this.settings.graph.linkWidth = parseFloat(linkWidthSlider.value);
          document.getElementById('link-width-value').textContent = linkWidthSlider.value;
        });
      }
      
      // Link style select
      const linkStyleSelect = document.getElementById('link-style-select');
      if (linkStyleSelect) {
        linkStyleSelect.addEventListener('change', () => {
          this.settings.graph.linkStyle = linkStyleSelect.value;
        });
      }
      
      // Close on backdrop click
      if (this.modal) {
        this.modal.addEventListener('click', (e) => {
          if (e.target === this.modal) {
            this.hideModal();
          }
        });
      }
      
      // ESC key to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.modal.hidden) {
          this.hideModal();
        }
      });
    },
    
    async saveFormSettings() {
      const success = await this.saveSettings();
      
      if (success) {
        this.hideModal();
      } else {
        alert('Failed to save settings. Please try again.');
      }
    },
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    hexToRgba(hex, alpha = 1) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    
    rgbaToHex(rgba) {
      // Extract RGB values from rgba string
      const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return '#BEFFF2'; // Default
      
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    },
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    // ==========================================================================
    // Tag Management (Database Integration)
    // ==========================================================================
    
    async loadAndRenderTags() {
      const listEl = document.getElementById('tag-management-list');
      if (!listEl) return;
      
      listEl.innerHTML = '<p class="settings-hint">Loading tags...</p>';
      
      try {
        // Load persistent tags from database
        const { data: persistentTags, error: tagsError } = await this.supabase
          .from('tags')
          .select('*')
          .order('name', { ascending: true });
        
        if (tagsError) throw tagsError;
        
        // Load auto tags from existing notes/ideas
        const { data: notes } = await this.supabase
          .from('notes')
          .select('content, tags')
          .eq('user_id', this.currentUser.id);
        
        const autoTags = new Set();
        if (notes) {
          notes.forEach(note => {
            // Extract tags from note tags array
            if (Array.isArray(note.tags)) {
              note.tags.forEach(tag => autoTags.add(tag));
            }
            
            // Extract tags from ideas within content
            try {
              const content = typeof note.content === 'string' ? JSON.parse(note.content) : note.content;
              if (Array.isArray(content)) {
                content.forEach(idea => {
                  if (idea.tags && Array.isArray(idea.tags)) {
                    idea.tags.forEach(tag => autoTags.add(tag));
                  }
                });
              }
            } catch (e) {
              // Content might not be JSON
            }
          });
        }
        
        // Combine and render
        const persistentTagNames = new Set((persistentTags || []).map(t => t.name));
        const allAutoTags = Array.from(autoTags).filter(t => !persistentTagNames.has(t));
        
        this.renderTagManagementList(persistentTags || [], allAutoTags);
        
      } catch (error) {
        console.error('Error loading tags:', error);
        listEl.innerHTML = '<p class="settings-hint" style="color: #ef4444;">Error loading tags. Please try again.</p>';
      }
    },
    
    renderTagManagementList(persistentTags, autoTags) {
      const listEl = document.getElementById('tag-management-list');
      if (!listEl) return;
      
      let html = '';
      
      // Persistent Tags Section
      if (persistentTags.length > 0) {
        html += '<div class="tag-section"><h4 class="tag-section-title">Persistent Tags</h4>';
        persistentTags.forEach(tag => {
          html += this.renderTagItem(tag, true);
        });
        html += '</div>';
      }
      
      // Auto Tags Section
      if (autoTags.length > 0) {
        html += '<div class="tag-section"><h4 class="tag-section-title">Auto Tags</h4>';
        autoTags.forEach(tagName => {
          html += this.renderTagItem({ name: tagName, color: '#ffffff', is_auto: true }, false);
        });
        html += '</div>';
      }
      
      if (!html) {
        html = '<p class="settings-hint">No tags found. Create your first persistent tag or add tags to your ideas.</p>';
      }
      
      listEl.innerHTML = html;
      
      // Attach event listeners
      this.attachTagManagementListeners();
    },
    
    renderTagItem(tag, isPersistent) {
      const tagName = typeof tag === 'string' ? tag : tag.name;
      const tagColor = typeof tag === 'string' ? '#ffffff' : (tag.color || '#ffffff');
      const tagId = typeof tag === 'string' ? null : tag.id;
      
      return `
        <div class="tag-management-item" data-tag-name="${this.escapeHtml(tagName)}" data-tag-id="${tagId || ''}" data-is-persistent="${isPersistent}">
          <div class="tag-item-info">
            <span class="tag-item-name">${this.escapeHtml(tagName)}</span>
            ${!isPersistent ? '<span class="tag-item-badge">Auto</span>' : ''}
          </div>
          <div class="tag-item-controls">
            <input type="color" class="tag-color-picker" value="${tagColor}" data-tag-name="${this.escapeHtml(tagName)}">
            ${!isPersistent ? `
              <button type="button" class="tag-convert-btn" data-tag-name="${this.escapeHtml(tagName)}" title="Convert to persistent tag">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </button>
            ` : `
              <button type="button" class="tag-delete-btn" data-tag-id="${tagId}" title="Delete persistent tag">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            `}
          </div>
        </div>
      `;
    },
    
    attachTagManagementListeners() {
      // Color picker changes
      document.querySelectorAll('.tag-color-picker').forEach(picker => {
        picker.addEventListener('change', async (e) => {
          const tagName = e.target.dataset.tagName;
          const color = e.target.value;
          await this.updateTagColor(tagName, color);
        });
      });
      
      // Convert auto tag to persistent
      document.querySelectorAll('.tag-convert-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tagName = e.target.closest('.tag-convert-btn').dataset.tagName;
          const colorPicker = e.target.closest('.tag-management-item').querySelector('.tag-color-picker');
          const color = colorPicker.value;
          await this.convertAutoTagToPersistent(tagName, color);
        });
      });
      
      // Delete persistent tag
      document.querySelectorAll('.tag-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tagId = e.target.closest('.tag-delete-btn').dataset.tagId;
          if (confirm('Delete this persistent tag? This will remove the color assignment but keep the tag on ideas.')) {
            await this.deletePersistentTag(tagId);
          }
        });
      });
      
      // Create new persistent tag button
      const createBtn = document.getElementById('create-persistent-tag-btn');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          this.showCreateTagDialog();
        });
      }
    },
    
    async updateTagColor(tagName, color) {
      try {
        // Check if tag exists as persistent
        const { data: existingTag } = await this.supabase
          .from('tags')
          .select('id')
          .eq('user_id', this.currentUser.id)
          .eq('name', tagName)
          .single();
        
        if (existingTag) {
          // Update existing persistent tag
          const { error } = await this.supabase
            .from('tags')
            .update({ color, updated_at: new Date().toISOString() })
            .eq('id', existingTag.id);
          
          if (error) throw error;
        } else {
          // Create new persistent tag
          const { error } = await this.supabase
            .from('tags')
            .insert({
              user_id: this.currentUser.id,
              name: tagName,
              color,
              is_auto: false
            });
          
          if (error) throw error;
        }
        
        // Reload tags
        await this.loadAndRenderTags();
        
        // Dispatch event for graph updates
        window.dispatchEvent(new CustomEvent('tag-color-updated', {
          detail: { tagName, color }
        }));
        
      } catch (error) {
        console.error('Error updating tag color:', error);
        alert('Failed to update tag color. Please try again.');
      }
    },
    
    async convertAutoTagToPersistent(tagName, color) {
      try {
        // Check if already exists
        const { data: existing } = await this.supabase
          .from('tags')
          .select('id')
          .eq('user_id', this.currentUser.id)
          .eq('name', tagName)
          .single();
        
        if (existing) {
          // Just update color
          await this.updateTagColor(tagName, color);
          return;
        }
        
        // Create persistent tag
        const { error } = await this.supabase
          .from('tags')
          .insert({
            user_id: this.currentUser.id,
            name: tagName,
            color,
            is_auto: true // Mark as converted from auto
          });
        
        if (error) throw error;
        
        // Reload tags
        await this.loadAndRenderTags();
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('tag-converted', {
          detail: { tagName, color }
        }));
        
      } catch (error) {
        console.error('Error converting tag:', error);
        alert('Failed to convert tag. Please try again.');
      }
    },
    
    async deletePersistentTag(tagId) {
      try {
        const { error } = await this.supabase
          .from('tags')
          .delete()
          .eq('id', tagId)
          .eq('user_id', this.currentUser.id);
        
        if (error) throw error;
        
        // Reload tags
        await this.loadAndRenderTags();
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('tag-deleted', {
          detail: { tagId }
        }));
        
      } catch (error) {
        console.error('Error deleting tag:', error);
        alert('Failed to delete tag. Please try again.');
      }
    },
    
    showCreateTagDialog() {
      const tagName = prompt('Enter tag name:');
      if (!tagName || !tagName.trim()) return;
      
      const normalizedName = tagName.trim().toLowerCase();
      
      // Check if already exists
      const existingItem = document.querySelector(`[data-tag-name="${normalizedName}"]`);
      if (existingItem) {
        alert('This tag already exists.');
        return;
      }
      
      // Create with default white color
      this.convertAutoTagToPersistent(normalizedName, '#ffffff');
    }
  };
  
  // Export to window
  window.Settings = Settings;
  
})();
