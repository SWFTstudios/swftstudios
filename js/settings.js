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
      'design': '#6366f1',
      'idea': '#10b981',
      'personal': '#8b5cf6',
      'tech': '#3b82f6',
      'business': '#f59e0b',
      'tutorial': '#ef4444'
    },
    graph: {
      nodeColor: '#6366f1',
      linkColor: 'rgba(99, 102, 241, 0.3)',
      highlightColor: '#f59e0b',
      nodeSize: 5,
      linkWidth: 1,
      linkStyle: 'solid',
      particleWidth: 1,
      particleColor: '#6366f1'
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
      return this.settings.tagColors[tag] || DEFAULT_SETTINGS.tagColors.design;
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
    
    applyTagColors() {
      const style = document.getElementById('tag-color-styles') || document.createElement('style');
      style.id = 'tag-color-styles';
      
      let css = '';
      Object.entries(this.settings.tagColors).forEach(([tag, color]) => {
        css += `
          .message-tag[data-tag="${tag}"],
          .blog_tag-btn[data-tag="${tag}"].is-active,
          .blog_card-tag[data-tag="${tag}"] {
            background: ${color}20;
            border-color: ${color};
            color: ${color};
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
              <!-- Tag Colors Section -->
              <div class="settings-section">
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
      // Tag colors
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
      
      if (tags.length === 0) {
        listEl.innerHTML = '<p style="color: rgba(255,255,255,0.4); text-align: center;">No custom tag colors yet</p>';
        return;
      }
      
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
      `).join('');
      
      // Attach handlers
      listEl.querySelectorAll('.color-picker-input').forEach(input => {
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
      if (!match) return '#6366f1'; // Default
      
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    },
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };
  
  // Export to window
  window.Settings = Settings;
  
})();
