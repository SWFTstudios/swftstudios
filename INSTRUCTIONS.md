# SWFT Studios Website - Development Instructions

## Project Overview

**What this is:** SWFT Studios marketing website with portfolio showcase, service pages, and contact functionality. Built with static HTML/CSS/JS, hosted on Cloudflare Pages.

**Site Map:**
- `index.html` - Homepage (hero, portfolio gallery, services, about, contact form)
- `websites.html` - Website services page
- `apps.html` - Mobile apps services page (coming soon)
- `resources.html` - Resources/guides page
- `videos.html` - Video content page
- `swft-tv.html` - SWFT TV page
- `website-pricing.html` - Pricing page
- `portfolio-review.html` - Portfolio review page
- `detail_project.html` - Project detail template
- `detail_video.html` - Video detail template
- `style-guide.html` - Design system reference
- `401.html` / `404.html` - Error pages
- `blog.html` - Notes/Knowledge Graph with list and 3D graph views
- `auth.html` - Authentication page (email + GitHub OAuth)
- `upload.html` - Content upload interface (authorized users only)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Static HTML, CSS, Vanilla JS |
| CSS Framework | Custom CSS (Webflow-exported structure) |
| Hosting | Cloudflare Pages |
| Build | Node.js script (npm run build) |
| CDN | Cloudflare |
| Analytics | Google Analytics, Microsoft Clarity |
| Forms | FormSubmit.co |

---

## Project Structure

```
swftstudios_cloudflare/
├── index.html              # Homepage
├── websites.html           # Services - Websites
├── apps.html               # Services - Apps
├── resources.html          # Resources page
├── videos.html             # Videos page
├── swft-tv.html            # SWFT TV
├── website-pricing.html    # Pricing
├── portfolio-review.html   # Portfolio review
├── detail_project.html     # Project detail template
├── detail_video.html       # Video detail template
├── style-guide.html        # Design system
├── 401.html                # Auth error
├── 404.html                # Not found
├── css/
│   ├── normalize.css       # CSS reset
│   ├── components.css      # Webflow components
│   └── swftstudios000.css  # Main styles
├── js/
│   ├── swftstudios000.js   # Main JavaScript
│   └── blog.js             # Blog/Notes functionality
├── css/
│   └── blog.css            # Blog-specific styles
├── images/                 # Static images
├── videos/                 # Video files
├── fonts/                  # Inter Display font family
├── scripts/
│   └── build-blog-data.js  # Build script for blog data
├── data/                   # Generated blog data (build output)
│   ├── posts.json          # List of all posts
│   └── graph.*.json        # Graph data (versioned)
├── package.json            # Node.js dependencies
├── wrangler.toml           # Cloudflare config
├── .cursorrules            # Cursor AI rules
├── INSTRUCTIONS.md         # This file
└── .gitignore
```

---

## Development Workflow

### Local Development

1. **Install dependencies** (for blog build script):
   ```bash
   npm install
   ```

2. **Build blog data** (generates `data/posts.json` and `data/graph.*.json`):
   ```bash
   npm run build
   ```

3. **Start local server**:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using Cloudflare Wrangler (for Pages Functions)
   npx wrangler pages dev .
   ```

4. **Test in browser** at `http://localhost:8000`

### Deployment

- **Auto-deploy:** Push to `main` branch triggers Cloudflare Pages build
- **Build command:** `npm run build` (generates blog data from notes repo)
- **Preview deploys:** PRs get preview URLs automatically
- **Production:** https://swftstudios.com (or configured domain)

**Cloudflare Pages Build Settings:**
- Build command: `npm run build`
- Build output directory: `.` (static site)
- Node.js version: 18.x or later

---

## Code Conventions

### HTML
- Semantic elements (`<header>`, `<main>`, `<section>`, `<footer>`, `<nav>`)
- BEM-style class naming (inherited from Webflow export)
- Accessibility: proper heading hierarchy, alt text, ARIA when needed
- Mobile-first responsive design

### CSS
- Custom properties for colors/spacing (defined in main CSS)
- Utility classes for margins/padding (`.margin-bottom`, `.padding-vertical`, etc.)
- Component classes prefixed by feature (`.gallery_`, `.nav_`, `.button_`, etc.)

### JavaScript
- Vanilla JS preferred (no framework)
- External libraries via CDN only:
  - jQuery 3.5.1 (legacy from Webflow)
  - GSAP 3.12.4 (animations)
  - Tippy.js (tooltips)
  - Spline (3D backgrounds)
  - 3d-force-graph (lazy-loaded for blog graph view)

---

## External Services

### Forms
- **Provider:** FormSubmit.co
- **Action:** `https://formsubmit.co/hello@swftstudios.com`
- **No API key required** (email-based)

### Analytics
- **Google Analytics:** G-F2BXR858CL
- **Microsoft Clarity:** tjjws1d2xl

### 3D Background
- **Spline:** `https://prod.spline.design/lBVeuGXupxOHLCtS/scene.splinecode`

---

## Environment Variables

**Build-time (Cloudflare Pages):**
- None required (public GitHub repo: https://github.com/SWFTstudios/notes.git)
- Build script clones notes repo during build process
- Generated JSON files are committed to the site repo

---

## Adding New Pages

1. Copy an existing page as template (e.g., `websites.html`)
2. Update `<title>` and meta tags
3. Update page content
4. Add navigation link to all pages (update nav in each HTML file)
5. Test responsive behavior

---

## Common Tasks

### Update Navigation
Navigation is duplicated in each HTML file. When adding/removing links:
1. Update `index.html` nav section
2. Replicate changes to all other HTML files

### Add Portfolio Item
Edit `index.html`, find `.gallery_list`, add new `.gallery_item` block following existing pattern.

### Update Contact Form
Form is in `index.html` under `#wf-form-Contact-Form`. Validation is handled by browser and FormSubmit.

---

## Blog / Notes Feature

### Overview
Interactive knowledge graph page (`blog.html`) displaying notes from https://github.com/SWFTstudios/notes.git with:
- **List View**: Card-based layout with search and tag filtering
- **Graph View**: 3D force-directed graph showing connections between notes
- **Dual View**: Both views side-by-side on desktop

### Architecture
1. **Build Process**: `scripts/build-blog-data.js` clones notes repo, parses markdown files, generates JSON
2. **Data Files**: `data/posts.json` (list data) and `data/graph.*.json` (graph data with versioning)
3. **Frontend**: `js/blog.js` fetches JSON, renders list/graph views, handles interactions
4. **Styling**: `css/blog.css` provides responsive layout and accessibility features

### Content Source
- **Repo**: https://github.com/SWFTstudios/notes.git (public)
- **Structure**: Markdown files in `notes/` folder with YAML frontmatter
- **Links**: `[[wiki-style]]` links create connections in graph
- **Tags**: Shared tags create automatic connections

### Updating Content
1. Edit markdown files in the notes repo
2. Commit and push to `main` branch
3. Cloudflare Pages auto-rebuilds (runs `npm run build`)
4. New content appears on site automatically

### Features
- Search by title, description, or tags
- Filter by tags
- Click nodes in graph to view note details
- Modal preview for quick note viewing
- Responsive: list-only on mobile, graph available on desktop
- Accessibility: keyboard navigation, screen reader support, reduced motion support

## Upload System (Authorized Users Only)

### Overview
Secure content upload interface for authorized collaborators to submit notes directly to the knowledge graph.

### Authentication
- **Method**: Supabase Auth (Email magic link + GitHub OAuth)
- **Authorized Users**: 
  - elombe@swftstudios.com
  - elombekisala@gmail.com
  - stephen@swftstudios.com
  - stephen.iezzi@gmail.com

### Supported Content Types
1. **Text** - Markdown or plain text notes
2. **Audio** - MP3, M4A, WAV files (max 50MB)
3. **Images** - JPG, PNG, WEBP, GIF (max 10MB)
4. **Links** - URLs to external content (tweets, articles, etc.)

### Workflow
1. Visit `auth.html` → Sign in with email or GitHub
2. If authorized → redirected to `upload.html`
3. Submit content (text, files, links)
4. Files uploaded to Supabase Storage
5. Markdown generated and committed to notes repo via GitHub API
6. Cloudflare Pages auto-rebuilds
7. New note appears in blog after ~1-2 minutes

### Setup Required
See `UPLOAD_SETUP.md` for detailed configuration instructions:
- Supabase database and storage setup
- GitHub personal access token creation
- Cloudflare environment variable configuration

### Architecture
- **Frontend**: `auth.html`, `upload.html` with Supabase client
- **Storage**: Supabase Storage (3 buckets: audio, images, files)
- **Database**: Supabase PostgreSQL (notes table)
- **Processing**: Cloudflare Pages Function (`functions/api/submit-note.js`)
- **Destination**: GitHub notes repo → triggers site rebuild

---

## Troubleshooting

### CORS Issues
If fetching external data, ensure:
- API endpoint has proper CORS headers
- Use Cloudflare Pages Functions as proxy if needed

### Form Not Submitting
- Check FormSubmit email verification
- Ensure no JavaScript errors in console
- Verify form action URL

### 3D Background Not Loading
- Check Spline URL validity
- Verify no content blockers
- Check console for errors

### Blog Data Not Loading
- Ensure `npm run build` completed successfully
- Check that `data/posts.json` and `data/graph.*.json` exist
- Verify notes repo is accessible (public)
- Check browser console for fetch errors
- If graph view doesn't load, check WebGL support in browser

---

## Security Notes

- No secrets in source code
- API keys in Cloudflare environment variables only
- Form submissions sanitized by FormSubmit
- No user authentication (static marketing site)

---

## Contact

- **Email:** hello@swftstudios.com
- **Instagram:** @swft_studios
