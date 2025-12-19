/**
 * Auto Tagger
 * 
 * Automatic tag suggestion using keyword extraction
 * Extracts common words and phrases from content
 */

(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================
  
  const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
    'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how', 'can',
    'could', 'would', 'should', 'may', 'might', 'must', 'shall', 'will',
    'am', 'been', 'being', 'been', 'were', 'we', 'you', 'your', 'i', 'me',
    'my', 'mine', 'our', 'ours', 'their', 'theirs', 'him', 'her', 'his',
    'hers', 'them', 'there', 'here', 'then', 'than', 'these', 'those',
    'some', 'any', 'many', 'much', 'more', 'most', 'such', 'no', 'not',
    'only', 'own', 'same', 'so', 'very', 'just', 'too', 'also', 'both',
    'each', 'few', 'all', 'any', 'both', 'every', 'no', 'some', 'such'
  ]);

  const AutoTagger = {
    selectedTags: new Set(),
    suggestedTags: [],
    
    // ==========================================================================
    // Tag Extraction
    // ==========================================================================
    
    /**
     * Extract keywords from text content
     * Returns array of suggested tags
     */
    extractKeywords(text) {
      if (!text || text.trim().length === 0) {
        return [];
      }
      
      // Tokenize and clean
      const words = this.tokenize(text);
      
      // Count word frequency
      const wordFreq = this.countFrequency(words);
      
      // Extract phrases (2-3 words)
      const phrases = this.extractPhrases(text);
      const phraseFreq = this.countFrequency(phrases);
      
      // Combine and sort by frequency
      const allTags = [
        ...Object.entries(wordFreq),
        ...Object.entries(phraseFreq)
      ]
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, 10); // Top 10 suggestions
      
      return this.deduplicate(allTags);
    },
    
    /**
     * Tokenize text into words
     */
    tokenize(text) {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => 
          word.length > 2 && // At least 3 characters
          !STOP_WORDS.has(word) && // Not a stop word
          !/^\d+$/.test(word) // Not just numbers
        );
    },
    
    /**
     * Extract 2-3 word phrases
     */
    extractPhrases(text) {
      const words = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0);
      
      const phrases = [];
      
      // Extract 2-word phrases
      for (let i = 0; i < words.length - 1; i++) {
        if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
          phrases.push(`${words[i]} ${words[i + 1]}`);
        }
      }
      
      // Extract 3-word phrases
      for (let i = 0; i < words.length - 2; i++) {
        if (!STOP_WORDS.has(words[i]) && 
            !STOP_WORDS.has(words[i + 1]) && 
            !STOP_WORDS.has(words[i + 2])) {
          phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
        }
      }
      
      return phrases;
    },
    
    /**
     * Count frequency of items
     */
    countFrequency(items) {
      const freq = {};
      items.forEach(item => {
        freq[item] = (freq[item] || 0) + 1;
      });
      return freq;
    },
    
    /**
     * Remove duplicates and similar tags
     */
    deduplicate(tags) {
      const unique = new Set();
      const result = [];
      
      for (const tag of tags) {
        const normalized = tag.trim().toLowerCase();
        if (!unique.has(normalized) && normalized.length > 0) {
          unique.add(normalized);
          result.push(tag);
        }
      }
      
      return result;
    },
    
    // ==========================================================================
    // UI Management
    // ==========================================================================
    
    /**
     * Show tag suggestions in UI
     */
    showSuggestions(tags) {
      this.suggestedTags = tags;
      this.selectedTags.clear();
      
      const container = document.getElementById('tag-suggestions');
      const listEl = document.getElementById('tag-suggestions-list');
      
      if (!container || !listEl) return;
      
      if (tags.length === 0) {
        container.hidden = true;
        return;
      }
      
      listEl.innerHTML = tags.map(tag => `
        <button 
          type="button" 
          class="tag-suggestion" 
          data-tag="${this.escapeHtml(tag)}"
        >
          ${this.escapeHtml(tag)}
        </button>
      `).join('');
      
      container.hidden = false;
      
      // Attach click handlers
      this.attachSuggestionListeners();
    },
    
    /**
     * Hide tag suggestions
     */
    hideSuggestions() {
      const container = document.getElementById('tag-suggestions');
      if (container) {
        container.hidden = true;
      }
      this.selectedTags.clear();
      this.suggestedTags = [];
    },
    
    /**
     * Get selected tags
     */
    getSelectedTags() {
      return Array.from(this.selectedTags);
    },
    
    /**
     * Toggle tag selection
     */
    toggleTag(tag) {
      if (this.selectedTags.has(tag)) {
        this.selectedTags.delete(tag);
      } else {
        this.selectedTags.add(tag);
      }
      
      // Update UI
      this.updateTagButtons();
    },
    
    /**
     * Update tag button states
     */
    updateTagButtons() {
      const buttons = document.querySelectorAll('.tag-suggestion');
      buttons.forEach(btn => {
        const tag = btn.dataset.tag;
        if (this.selectedTags.has(tag)) {
          btn.classList.add('selected');
        } else {
          btn.classList.remove('selected');
        }
      });
    },
    
    // ==========================================================================
    // Event Handlers
    // ==========================================================================
    
    attachSuggestionListeners() {
      const buttons = document.querySelectorAll('.tag-suggestion');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.toggleTag(btn.dataset.tag);
        });
      });
      
      // Close button
      const closeBtn = document.getElementById('close-tag-suggestions');
      if (closeBtn) {
        closeBtn.onclick = () => this.hideSuggestions();
      }
    },
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    /**
     * Auto-suggest tags from text input
     * Debounced to avoid excessive processing
     */
    autoSuggest: null, // Will be set to debounced function
    
    setupAutoSuggest(inputElement, delay = 1000) {
      // Debounce function
      let timeoutId;
      this.autoSuggest = (text) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const tags = this.extractKeywords(text);
          this.showSuggestions(tags);
        }, delay);
      };
      
      if (inputElement) {
        inputElement.addEventListener('input', () => {
          const text = inputElement.value;
          if (text.length > 20) { // Only suggest after 20 characters
            this.autoSuggest(text);
          } else {
            this.hideSuggestions();
          }
        });
      }
    }
  };
  
  // Export to window
  window.AutoTagger = AutoTagger;
  
})();
