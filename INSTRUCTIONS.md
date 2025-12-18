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
- `blog.html` - Blog with list/graph views (planned)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Static HTML, CSS, Vanilla JS |
| CSS Framework | Custom CSS (Webflow-exported structure) |
| Hosting | Cloudflare Pages |
| Build | None (static files) |
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
│   └── swftstudios000.js   # Main JavaScript
├── images/                 # Static images
├── videos/                 # Video files
├── fonts/                  # Inter Display font family
├── functions/              # Cloudflare Pages Functions (planned)
│   └── api/
│       └── blog-data.js    # Blog data API (planned)
├── wrangler.toml           # Cloudflare config
├── .cursorrules            # Cursor AI rules
├── INSTRUCTIONS.md         # This file
└── .gitignore
```

---

## Development Workflow

### Local Development

1. **No build step required** - open HTML files directly or use a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using Cloudflare Wrangler (for Pages Functions)
   npx wrangler pages dev .
   ```

2. **Test in browser** at `http://localhost:8000`

### Deployment

- **Auto-deploy:** Push to `main` branch triggers Cloudflare Pages build
- **Preview deploys:** PRs get preview URLs automatically
- **Production:** https://swftstudios.com (or configured domain)

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

Currently none required for static site.

**Planned for Blog feature:**
```
GITHUB_TOKEN=<personal access token for private repos>
GITHUB_REPO=<username/repo-name>
```

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

## Planned Features

### Blog with List/Graph Views
- **Status:** Planning
- **Files:** `blog.html`, `functions/api/blog-data.js`, `js/blog.js`, `css/blog.css`
- **Data source:** GitHub repo with Markdown files
- **Update trigger:** GitHub webhook to Cloudflare Pages
- **Libraries:** 3d-force-graph (via CDN)

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
