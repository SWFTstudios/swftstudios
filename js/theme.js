/**
 * Theme Manager
 * 
 * Handles light/dark theme switching with localStorage persistence
 */

(function() {
  'use strict';

  const THEME_STORAGE_KEY = 'swft-theme-preference';
  const THEME_ATTRIBUTE = 'data-theme';

  // ==========================================================================
  // Theme Management
  // ==========================================================================
  
  const ThemeManager = {
    currentTheme: 'dark',
    
    /**
     * Initialize theme on page load
     */
    init() {
      // Get saved theme or default to dark
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
      this.setTheme(savedTheme);
      
      // Setup toggle button
      this.setupToggle();
    },
    
    /**
     * Set the theme
     */
    setTheme(theme) {
      if (theme !== 'light' && theme !== 'dark') {
        theme = 'dark';
      }
      
      this.currentTheme = theme;
      document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      
      // Update toggle button icon
      this.updateToggleIcon();
      
      // Dispatch event for other scripts
      window.dispatchEvent(new CustomEvent('theme-changed', {
        detail: { theme }
      }));
    },
    
    /**
     * Toggle between light and dark
     */
    toggle() {
      const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(newTheme);
    },
    
    /**
     * Update toggle button icon
     */
    updateToggleIcon() {
      const sunIcon = document.getElementById('theme-icon-sun');
      const moonIcon = document.getElementById('theme-icon-moon');
      
      if (sunIcon && moonIcon) {
        if (this.currentTheme === 'dark') {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'block';
        } else {
          sunIcon.style.display = 'block';
          moonIcon.style.display = 'none';
        }
      }
    },
    
    /**
     * Setup toggle button event listener
     */
    setupToggle() {
      const toggleBtn = document.getElementById('theme-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          this.toggle();
        });
      }
    }
  };
  
  // Export to window
  window.ThemeManager = ThemeManager;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
  } else {
    ThemeManager.init();
  }
  
})();
