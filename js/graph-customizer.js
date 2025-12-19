/**
 * Graph Customizer
 * 
 * Applies user settings to 3D force graph visualization
 * Handles dynamic color, size, and style customization
 */

(function() {
  'use strict';

  // ==========================================================================
  // Graph Customizer
  // ==========================================================================
  
  const GraphCustomizer = {
    graph: null,
    settings: null,
    highlightedNodes: new Set(),
    highlightedLinks: new Set(),
    
    // ==========================================================================
    // Initialize
    // ==========================================================================
    
    init(graph, settings) {
      this.graph = graph;
      this.settings = settings;
      
      this.applySettings();
      this.setupEventListeners();
    },
    
    // ==========================================================================
    // Apply Settings
    // ==========================================================================
    
    applySettings() {
      if (!this.graph || !this.settings) return;
      
      const graphSettings = this.settings.graph;
      
      // Node appearance
      this.graph
        .nodeColor(() => graphSettings.nodeColor)
        .nodeVal(graphSettings.nodeSize)
        .nodeOpacity(0.9);
      
      // Link appearance
      this.graph
        .linkColor(() => graphSettings.linkColor)
        .linkWidth(graphSettings.linkWidth)
        .linkOpacity(0.6);
      
      // Link style (particles for animation)
      if (graphSettings.linkStyle === 'dashed') {
        this.graph.linkDirectionalParticles(2);
        this.graph.linkDirectionalParticleWidth(graphSettings.particleWidth || 1);
      } else if (graphSettings.linkStyle === 'dotted') {
        this.graph.linkDirectionalParticles(4);
        this.graph.linkDirectionalParticleWidth(graphSettings.particleWidth || 0.5);
      } else {
        this.graph.linkDirectionalParticles(0);
      }
      
      // Highlight colors
      this.graph
        .linkDirectionalParticleColor(() => graphSettings.highlightColor);
    },
    
    // ==========================================================================
    // Node Highlighting
    // ==========================================================================
    
    highlightConnectedNodes(node) {
      if (!this.graph) return;
      
      this.highlightedNodes.clear();
      this.highlightedLinks.clear();
      
      if (!node) {
        this.updateHighlight();
        return;
      }
      
      // Add clicked node
      this.highlightedNodes.add(node);
      
      // Get graph data
      const graphData = this.graph.graphData();
      
      // Find connected nodes and links
      graphData.links.forEach(link => {
        if (link.source.id === node.id || link.target.id === node.id) {
          this.highlightedLinks.add(link);
          this.highlightedNodes.add(link.source);
          this.highlightedNodes.add(link.target);
        }
      });
      
      this.updateHighlight();
    },
    
    updateHighlight() {
      if (!this.graph || !this.settings) return;
      
      const graphSettings = this.settings.graph;
      
      this.graph
        .nodeColor(node => {
          if (this.highlightedNodes.size === 0) {
            return graphSettings.nodeColor;
          }
          return this.highlightedNodes.has(node) 
            ? graphSettings.highlightColor 
            : this.dimColor(graphSettings.nodeColor);
        })
        .linkColor(link => {
          if (this.highlightedLinks.size === 0) {
            return graphSettings.linkColor;
          }
          return this.highlightedLinks.has(link)
            ? graphSettings.highlightColor
            : this.dimColor(graphSettings.linkColor);
        })
        .linkWidth(link => {
          if (this.highlightedLinks.size === 0) {
            return graphSettings.linkWidth;
          }
          return this.highlightedLinks.has(link)
            ? graphSettings.linkWidth * 2
            : graphSettings.linkWidth;
        });
    },
    
    clearHighlight() {
      this.highlightedNodes.clear();
      this.highlightedLinks.clear();
      this.updateHighlight();
    },
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    dimColor(color) {
      // Dim color by reducing opacity
      if (color.startsWith('rgba')) {
        return color.replace(/[\d.]+\)$/g, '0.2)');
      } else if (color.startsWith('rgb')) {
        return color.replace('rgb', 'rgba').replace(')', ', 0.2)');
      } else if (color.startsWith('#')) {
        // Convert hex to rgba
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 0.2)`;
      }
      return color;
    },
    
    // ==========================================================================
    // Event Listeners
    // ==========================================================================
    
    setupEventListeners() {
      // Listen for settings updates
      window.addEventListener('settings-updated', (e) => {
        this.settings = e.detail.settings;
        this.applySettings();
      });
      
      // Listen for node clicks
      if (this.graph) {
        this.graph.onNodeClick(node => {
          this.highlightConnectedNodes(node);
        });
        
        // Click on background to clear highlight
        this.graph.onBackgroundClick(() => {
          this.clearHighlight();
        });
      }
    }
  };
  
  // Export to window
  window.GraphCustomizer = GraphCustomizer;
  
})();
