#!/usr/bin/env node
/**
 * Build Blog Data Script
 * 
 * Fetches markdown files from the notes repository and generates:
 * - data/posts.json - List of all posts with metadata
 * - data/graph.<commitSHA>.json - Graph data for 3d-force-graph visualization
 * 
 * Run: npm run build
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Will be loaded after npm install
let matter, marked;

try {
  matter = require('gray-matter');
  marked = require('marked');
} catch (e) {
  console.error('Dependencies not installed. Run: npm install');
  process.exit(1);
}

// Configuration
const CONFIG = {
  notesRepo: 'https://github.com/SWFTstudios/notes.git',
  notesDir: 'notes',
  tempDir: '.notes-temp',
  outputDir: 'data',
  excerptLength: 200,
  tagColors: {
    'default': '#BEFFF2',
    'tech': '#3b82f6',
    'design': '#ec4899',
    'business': '#10b981',
    'personal': '#f59e0b',
    'project': '#8b5cf6',
    'idea': '#06b6d4',
    'tutorial': '#84cc16'
  }
};

/**
 * Slugify a string for use as an ID
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
 * Extract first N characters as excerpt from markdown content
 */
function extractExcerpt(content, length = CONFIG.excerptLength) {
  // Remove markdown syntax for cleaner excerpt
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
 * Get color for a tag
 */
function getColorByTag(tag) {
  if (!tag) return CONFIG.tagColors.default;
  const lowerTag = tag.toLowerCase();
  return CONFIG.tagColors[lowerTag] || CONFIG.tagColors.default;
}

/**
 * Clone or pull the notes repository
 */
function fetchNotesRepo() {
  const tempPath = path.join(process.cwd(), CONFIG.tempDir);
  
  try {
    if (fs.existsSync(tempPath)) {
      console.log('Updating existing notes repo...');
      execSync(`cd "${tempPath}" && git pull`, { stdio: 'pipe' });
    } else {
      console.log('Cloning notes repo...');
      execSync(`git clone --depth 1 "${CONFIG.notesRepo}" "${tempPath}"`, { stdio: 'pipe' });
    }
    return tempPath;
  } catch (error) {
    console.warn(`Warning: Could not fetch notes repo: ${error.message}`);
    console.log('Creating sample notes for development...');
    return createSampleNotes(tempPath);
  }
}

/**
 * Create sample notes for development/testing
 */
function createSampleNotes(tempPath) {
  const notesPath = path.join(tempPath, CONFIG.notesDir);
  fs.mkdirSync(notesPath, { recursive: true });
  
  const sampleNotes = [
    {
      filename: 'welcome.md',
      content: `---
title: "Welcome to SWFT Notes"
description: "An introduction to the SWFT Studios knowledge graph"
date: "2025-01-15"
tags: ["intro", "personal"]
---

Welcome to the SWFT Notes knowledge graph! This is where ideas, projects, and learnings come together.

Check out [[web-development]] for tech insights or [[design-thinking]] for creative processes.

This system is inspired by tools like Obsidian, allowing interconnected thinking and visual exploration of ideas.
`
    },
    {
      filename: 'web-development.md',
      content: `---
title: "Web Development"
description: "Notes on modern web development practices"
date: "2025-01-14"
tags: ["tech", "tutorial"]
---

# Web Development Notes

Modern web development involves:

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, APIs
- **Infrastructure**: Cloudflare, Vercel

See also: [[javascript-tips]] and [[design-thinking]] for a holistic approach.
`
    },
    {
      filename: 'design-thinking.md',
      content: `---
title: "Design Thinking"
description: "Human-centered design approaches"
date: "2025-01-13"
tags: ["design", "business"]
---

# Design Thinking

A methodology for creative problem-solving:

1. **Empathize** - Understand the user
2. **Define** - Frame the problem
3. **Ideate** - Generate solutions
4. **Prototype** - Build to learn
5. **Test** - Validate assumptions

Related: [[welcome]] for context on how this connects to SWFT's approach.
`
    },
    {
      filename: 'javascript-tips.md',
      content: `---
title: "JavaScript Tips"
description: "Useful JavaScript patterns and tricks"
date: "2025-01-12"
tags: ["tech", "tutorial"]
---

# JavaScript Tips

## Async/Await

\`\`\`javascript
async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}
\`\`\`

## Destructuring

\`\`\`javascript
const { name, age } = user;
\`\`\`

Part of [[web-development]] fundamentals.
`
    },
    {
      filename: 'project-ideas.md',
      content: `---
title: "Project Ideas"
description: "Future project concepts and brainstorms"
date: "2025-01-11"
tags: ["idea", "project"]
---

# Project Ideas

## Knowledge Graph Blog
A blog system with interactive graph visualization. See [[welcome]] for the current implementation.

## AI Assistant
Building on [[web-development]] skills to create helpful tools.

## Design System
Applying [[design-thinking]] to create consistent UI components.
`
    }
  ];
  
  sampleNotes.forEach(note => {
    fs.writeFileSync(path.join(notesPath, note.filename), note.content);
  });
  
  console.log(`Created ${sampleNotes.length} sample notes for development`);
  return tempPath;
}

/**
 * Parse a single markdown file
 */
function parseNote(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { data, content: body } = matter(content);
  const filename = path.basename(filePath, '.md');
  
  // Build note object with validation and fallbacks
  const note = {
    id: data.title ? slugify(data.title) : filename,
    slug: filename,
    title: data.title || filename.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: data.description || extractExcerpt(body, 150),
    date: data.date || new Date().toISOString().split('T')[0],
    tags: Array.isArray(data.tags) ? data.tags : [],
    author: data.author || null, // Extract author from frontmatter
    image: data.image || null,
    excerpt: extractExcerpt(body, CONFIG.excerptLength),
    links: extractLinks(body),
    content: body,
    metaError: !data.title // Flag if frontmatter was missing/invalid
  };
  
  return note;
}

/**
 * Calculate connection count for a note
 */
function calculateConnectionCount(note, allNotes) {
  let count = note.links.length;
  
  // Count incoming links
  allNotes.forEach(other => {
    if (other.id !== note.id && other.links.includes(note.id)) {
      count++;
    }
  });
  
  // Count shared tags
  allNotes.forEach(other => {
    if (other.id !== note.id) {
      const sharedTags = note.tags.filter(tag => other.tags.includes(tag));
      count += sharedTags.length;
    }
  });
  
  return Math.max(1, count); // Minimum value of 1
}

/**
 * Build graph data structure for 3d-force-graph
 */
function buildGraph(notes) {
  const nodeMap = new Map();
  const links = [];
  
  // Create nodes from notes
  notes.forEach(note => {
    nodeMap.set(note.id, {
      id: note.id,
      name: note.title,
      val: calculateConnectionCount(note, notes),
      color: getColorByTag(note.tags[0]),
      tags: note.tags,
      status: note.metaError ? 'error' : 'published',
      slug: note.slug
    });
  });
  
  // Create links
  notes.forEach(note => {
    // Manual links from [[wiki-links]]
    note.links.forEach(targetId => {
      if (nodeMap.has(targetId)) {
        links.push({
          source: note.id,
          target: targetId,
          type: 'manual',
          weight: 2
        });
      } else {
        // Create placeholder node for missing link (Obsidian-like behavior)
        nodeMap.set(targetId, {
          id: targetId,
          name: targetId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          val: 1,
          color: '#666666',
          tags: [],
          status: 'missing',
          slug: targetId
        });
        links.push({
          source: note.id,
          target: targetId,
          type: 'manual',
          weight: 1
        });
      }
    });
  });
  
  // Tag-based connections (notes sharing tags)
  const noteArray = Array.from(notes);
  for (let i = 0; i < noteArray.length; i++) {
    for (let j = i + 1; j < noteArray.length; j++) {
      const noteA = noteArray[i];
      const noteB = noteArray[j];
      const sharedTags = noteA.tags.filter(tag => noteB.tags.includes(tag));
      
      if (sharedTags.length > 0) {
        links.push({
          source: noteA.id,
          target: noteB.id,
          type: 'tag',
          weight: sharedTags.length,
          tags: sharedTags
        });
      }
    }
  }
  
  // Get commit SHA for versioning
  const commitSHA = process.env.CF_PAGES_COMMIT_SHA || 
                    process.env.GITHUB_SHA || 
                    'dev';
  
  return {
    version: commitSHA.substring(0, 7),
    generatedAt: new Date().toISOString(),
    nodes: Array.from(nodeMap.values()),
    links: links
  };
}

/**
 * Main build function
 */
async function main() {
  console.log('=== SWFT Blog Data Builder ===\n');
  
  // Ensure output directory exists
  const outputPath = path.join(process.cwd(), CONFIG.outputDir);
  fs.mkdirSync(outputPath, { recursive: true });
  
  // Fetch notes repository
  const repoPath = fetchNotesRepo();
  const notesPath = path.join(repoPath, CONFIG.notesDir);
  
  // Check if notes directory exists, create sample if not
  if (!fs.existsSync(notesPath) || fs.readdirSync(notesPath).filter(f => f.endsWith('.md')).length === 0) {
    console.log('Notes directory empty or not found, creating sample notes...');
    createSampleNotes(repoPath);
  }
  
  // Find all markdown files
  const files = fs.readdirSync(notesPath)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(notesPath, file));
  
  if (files.length === 0) {
    console.warn('Warning: No markdown files found in notes directory');
  }
  
  console.log(`Found ${files.length} markdown files\n`);
  
  // Parse all notes
  const notes = [];
  const errors = [];
  
  files.forEach(file => {
    try {
      const note = parseNote(file);
      notes.push(note);
      
      if (note.metaError) {
        errors.push(`Warning: ${path.basename(file)} missing title in frontmatter`);
      }
      
      console.log(`  ✓ ${note.title} (${note.tags.join(', ') || 'no tags'})`);
    } catch (error) {
      errors.push(`Error parsing ${path.basename(file)}: ${error.message}`);
      console.error(`  ✗ ${path.basename(file)}: ${error.message}`);
    }
  });
  
  // Sort notes by date (newest first)
  notes.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Build graph data
  const graphData = buildGraph(notes);
  
  // Prepare posts data (without full content for smaller payload)
  const postsData = notes.map(note => ({
    id: note.id,
    slug: note.slug,
    title: note.title,
    description: note.description,
    date: note.date,
    tags: note.tags,
    author: note.author, // Include author in output
    image: note.image,
    excerpt: note.excerpt,
    links: note.links,
    metaError: note.metaError
  }));
  
  // Write output files
  const postsFile = path.join(outputPath, 'posts.json');
  const graphFile = path.join(outputPath, `graph.${graphData.version}.json`);
  const latestGraphFile = path.join(outputPath, 'graph.latest.json');
  
  fs.writeFileSync(postsFile, JSON.stringify(postsData, null, 2));
  fs.writeFileSync(graphFile, JSON.stringify(graphData, null, 2));
  fs.writeFileSync(latestGraphFile, JSON.stringify(graphData, null, 2));
  
  // Summary
  console.log('\n=== Build Summary ===');
  console.log(`Posts: ${notes.length}`);
  console.log(`Nodes: ${graphData.nodes.length}`);
  console.log(`Links: ${graphData.links.length}`);
  console.log(`Version: ${graphData.version}`);
  
  if (errors.length > 0) {
    console.log(`\nWarnings/Errors: ${errors.length}`);
    errors.forEach(err => console.log(`  - ${err}`));
  }
  
  console.log(`\nOutput files:`);
  console.log(`  - ${postsFile}`);
  console.log(`  - ${graphFile}`);
  console.log(`  - ${latestGraphFile}`);
  
  console.log('\n✓ Build complete!');
}

// Run the build
main().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
