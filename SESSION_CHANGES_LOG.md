# Session Changes Log - UI Improvements & Bug Fixes

## Overview
This session focused on improving accessibility, fixing layout issues, and making interactive controls functional. All changes follow WCAG 2.1 guidelines and modern web development best practices.

---

## 1. Tag Suggestion Contrast Fix

### Problem
Selected tag suggestions didn't have proper text contrast against their background colors, especially with custom tag colors.

### Solution
Implemented WCAG 2.1 compliant contrast calculation using relative luminance formulas.

### Implementation Details

#### Files Modified:
- `js/upload.js` - Enhanced contrast calculation functions
- `js/auto-tagger.js` - Added contrast calculation and dynamic color application
- `js/settings.js` - Added contrast calculation for CSS generation
- `css/upload.css` - Updated selected tag styles

#### Key Functions Added:

**1. Relative Luminance Calculation** (`js/upload.js`, `js/auto-tagger.js`)
```javascript
function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
```
**Purpose**: Calculates perceived brightness according to WCAG 2.1 standards.

**2. Contrast Ratio Calculation** (`js/upload.js`)
```javascript
function getContrastRatio(color1, color2) {
  const lum1 = getRelativeLuminance(r1, g1, b1);
  const lum2 = getRelativeLuminance(r2, g2, b2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}
```
**Purpose**: Calculates contrast ratio between two colors (1-21 scale).

**3. Contrast Color Selection** (`js/upload.js`, `js/auto-tagger.js`)
```javascript
function getContrastColor(hexColor) {
  const luminance = getRelativeLuminance(r, g, b);
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
```
**Purpose**: Returns black or white text color based on background brightness.

#### How to Implement from Scratch:

1. **Parse hex color to RGB**:
   ```javascript
   const hex = hexColor.replace('#', '');
   const r = parseInt(hex.substring(0, 2), 16);
   const g = parseInt(hex.substring(2, 4), 16);
   const b = parseInt(hex.substring(4, 6), 16);
   ```

2. **Calculate relative luminance** using the formula above

3. **Choose text color**: If luminance > 0.5, use black; otherwise use white

4. **Apply dynamically**: Update button styles when selection state changes

#### CSS Changes:
- Changed `.tag-suggestion.selected` text color from `var(--theme-text-primary)` (white) to `var(--theme-bg-primary)` (dark) for SWFT blue background
- Added dynamic inline styles for custom tag colors via JavaScript

---

## 2. Desktop Split View Layout Fix

### Problem
Mind map and list view weren't displaying side-by-side on desktop. Canvas element was being moved outside its container.

### Solution
Fixed CSS grid layout and removed JavaScript code that incorrectly moved the canvas element.

### Implementation Details

#### Files Modified:
- `css/blog.css` - Updated desktop media query for split view
- `js/blog.js` - Removed canvas movement code

#### Key CSS Changes:

**Desktop Split View** (`css/blog.css` lines 455-491)
```css
@media (min-width: 1024px) {
  .blog_content {
    grid-template-columns: 1fr 1fr;  /* 50/50 split */
    display: grid;
    gap: 2rem;
  }
  
  /* Force both views visible */
  .blog_content .blog_list-view,
  .blog_content .blog_graph-view {
    display: block !important;
    visibility: visible !important;
  }
  
  /* Override hidden attribute */
  .blog_content .blog_list-view[hidden],
  .blog_content .blog_graph-view[hidden] {
    display: block !important;
    visibility: visible !important;
  }
  
  /* Equal height views */
  .blog_content .blog_list-view,
  .blog_content .blog_graph-view {
    min-height: 77svh;
  }
}
```

**Graph Container Containment** (`css/blog.css`)
```css
.blog_graph-container {
  overflow: hidden;  /* Changed from overflow-x: hidden */
  position: relative; /* Ensures canvas positioning is relative */
}

/* Desktop: Ensure canvas stays within container */
@media (min-width: 1024px) {
  .blog_graph-container canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
  }
}
```

#### JavaScript Fix:
**Removed** (`js/blog.js` lines 2194-2205):
```javascript
// REMOVED: This was moving canvas outside container
setTimeout(() => {
  const canvas = graphContainer.querySelector('canvas');
  const paddingSectionLarge = document.querySelector('.padding-section-large');
  const blogContent = document.querySelector('.blog_content');
  if (canvas && paddingSectionLarge && blogContent) {
    paddingSectionLarge.insertBefore(canvas, blogContent);
  }
}, 600);
```

#### How to Implement from Scratch:

1. **Use CSS Grid for side-by-side layout**:
   ```css
   .container {
     display: grid;
     grid-template-columns: 1fr 1fr;
     gap: 2rem;
   }
   ```

2. **Force visibility with `!important`** to override hidden attributes

3. **Use `svh` units** for viewport height (accounts for mobile browser UI)

4. **Ensure containment**: Use `overflow: hidden` and `position: relative` on parent containers

---

## 3. Graph Force Controls Functionality

### Problem
Force controls (Center force, Repel force, Link force, Link distance) were connected to event listeners but didn't actually affect the graph because d3.js wasn't available.

### Solution
Implemented dynamic loading of d3.js library and properly applied force settings using d3-force API.

### Implementation Details

#### Files Modified:
- `js/blog.js` - Added d3 loading function and enhanced `applyGraphForces()`

#### Key Functions Added:

**1. Dynamic d3.js Loading** (`js/blog.js` lines 3026-3068)
```javascript
async function loadD3() {
  if (window.d3 && window.d3.forceCenter) {
    return window.d3;
  }
  
  // Prevent multiple simultaneous loads
  if (window._d3Loading) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.d3 && window.d3.forceCenter) {
          clearInterval(checkInterval);
          resolve(window.d3);
        }
      }, 100);
    });
  }
  
  window._d3Loading = true;
  
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://d3js.org/d3.v7.min.js';
    script.onload = () => {
      window._d3Loading = false;
      if (window.d3 && window.d3.forceCenter) {
        resolve(window.d3);
      }
    };
    script.onerror = () => {
      window._d3Loading = false;
      resolve(null);
    };
    document.head.appendChild(script);
  });
}
```

**2. Enhanced Force Application** (`js/blog.js` lines 3070-3140)
```javascript
async function applyGraphForces() {
  if (!state.graph) return;
  
  // Convert slider values (0-100) to force parameters
  const centerForce = state.graphForces.center / 100;
  const repelForce = state.graphForces.repel / 100;
  const linkForce = state.graphForces.link / 100;
  const linkDistance = 20 + (state.graphForces.distance / 100) * 80;
  
  // Load d3 if needed
  let d3 = window.d3;
  if (!d3 || !d3.forceCenter) {
    d3 = await loadD3();
  }
  
  if (d3 && d3.forceCenter) {
    // Apply forces using graph's d3Force method
    state.graph.d3Force('center', d3.forceCenter().strength(centerForce * 0.1));
    state.graph.d3Force('charge', d3.forceManyBody().strength(-repelForce * 300));
    state.graph.d3Force('link', d3.forceLink()
      .id(d => d.id)
      .distance(linkDistance)
      .strength(linkForce));
    
    // Restart simulation
    state.graph.cooldownTicks(100);
  }
}
```

#### How to Implement from Scratch:

1. **Check for library availability** before using it

2. **Load library dynamically** if not available:
   ```javascript
   const script = document.createElement('script');
   script.src = 'https://cdn.example.com/library.js';
   script.onload = () => { /* use library */ };
   document.head.appendChild(script);
   ```

3. **Prevent duplicate loads** with a loading flag

4. **Use async/await** for cleaner code when loading dependencies

5. **Apply settings** using the library's API methods

---

## 4. Mind Map Minimum Height Update

### Problem
Mind map had fixed `600px` minimum height, which didn't scale well across different screen sizes.

### Solution
Changed to viewport-relative units (`77svh`) for better responsiveness.

### Implementation Details

#### Files Modified:
- `css/blog.css` - Updated min-height values

#### Changes:
```css
/* Before */
.blog_graph-view {
  min-height: 600px;
}

/* After */
.blog_graph-view {
  min-height: 77svh;  /* 77% of viewport height */
}
```

#### How to Implement from Scratch:

1. **Use viewport units** instead of fixed pixels:
   - `vh` = viewport height (1vh = 1% of viewport height)
   - `svh` = small viewport height (accounts for mobile browser UI)
   - `dvh` = dynamic viewport height (adjusts as browser UI shows/hides)

2. **Choose appropriate percentage**: 77svh = 77% of viewport height

3. **Apply consistently** across related elements

---

## Key Learnings

### 1. WCAG Contrast Calculation
- Always use relative luminance formula, not simple brightness
- Threshold of 0.5 for choosing black vs white text
- Test with actual color combinations

### 2. CSS Grid for Split Views
- Use `grid-template-columns: 1fr 1fr` for equal splits
- Override `hidden` attribute with `!important` when needed
- Use `svh` units for responsive heights

### 3. Dynamic Library Loading
- Check availability before loading
- Prevent duplicate loads with flags
- Use Promises for async loading
- Handle errors gracefully

### 4. Viewport Units
- `vh` = standard viewport height
- `svh` = small viewport height (mobile-friendly)
- `dvh` = dynamic viewport height (adjusts)
- Use percentages (e.g., `77svh`) for responsive design

---

## Testing Checklist

- [x] Tag suggestions show proper contrast when selected
- [x] Custom tag colors apply with correct text contrast
- [x] Desktop shows list and graph side-by-side
- [x] Canvas stays within graph container
- [x] Force controls actually affect graph layout
- [x] Mind map has minimum height of 77svh
- [x] Layout works on different screen sizes

---

## References

- WCAG 2.1 Contrast Guidelines: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- CSS Viewport Units: https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-relative_lengths
- d3-force Documentation: https://github.com/d3/d3-force
- 3d-force-graph Documentation: https://github.com/vasturiano/3d-force-graph

