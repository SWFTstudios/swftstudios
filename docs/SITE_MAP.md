# SWFT Studios site map and routes

Plain-English index of the public marketing site for humans, search engines, and LLM crawlers.

## Canonical indexes

| Index | Purpose |
| --- | --- |
| [`/sitemap.xml`](../sitemap.xml) | Machine sitemap for search engines |
| [`/sitemap.html`](../sitemap.html) | Structured HTML site map (sections, notes, links) |
| [`/locations/`](../locations/index.html) | Local service-area hub |

Rebuild location pages and refresh both sitemaps after editing [`data/locations.json`](../data/locations.json):

```bash
npm run build:locations
```

## Primary routes

Every public page has one job in the funnel. The site's message is the SWFT Method: **Strategic Workflows Facilitating Transformation**, five stages from first scroll to repeat customer (Get seen, Capture, Convert, Nurture, Automate & repeat).

| Route | Job |
| --- | --- |
| `/` | Homepage: the promise, the five leaks, the method, proof, the audit |
| `/services.html` | The SWFT Method: what we do at each stage and which offer covers it |
| `/website-pricing.html` | Pricing: pick the stage that's costing you the most |
| `/case-studies.html` | Work: proof (case studies) and marketing guides |
| `/visuals.html` | Visuals: photo and video work in a draggable grid; projects open full screen (`?p=slug`) with a Vimeo/MP4 player or image slideshow. Content in `data/visuals.json` |
| `/growth-audit` | Free Growth Audit: the no-brainer first step (warm lead to the inbox) |
| `/contact.html` | Project inquiry (hot lead to the inbox) |
| `/book/` | Stripe booking for each offer (hot lead / sale) |
| `/team.html` | Who we are and why SWFT works this way |
| `/locations/` | Local SEO hub |
| `/portal/onboard.html` | Client portal signup |
| `/portal/login.html` | Client portal sign-in |
| `/portal/dashboard.html` | Client project + performance dashboard |

### Retired pages (2026-10-01)

Redundant or unfinished pages were removed and 301-redirect in [`_redirects`](../_redirects) to the page that now does their job:

| Old route | Now |
| --- | --- |
| `/websites.html`, `/resources.html`, `/portfolio-review.html` | `/case-studies.html` |
| `/media.html`, `/videos.html`, `/swft-tv.html` | `/visuals.html` (since the Visuals page launched) |
| `/apps.html` | `/services.html` |
| `/tools.html` | `/services.html#automate` (the automation tools are now the Automate stage) |
| `/swft-method.html` | `/growth-audit` |
| `/pricing.html` | `/website-pricing.html` |

## Local SEO coverage

Three regions, 25 city pages:

1. **Jersey City & Hudson County**: Jersey City, Hoboken, Weehawken, Union City, Bayonne, West New York, Secaucus, North Bergen
2. **North Jersey**: Hackensack, Fort Lee, Englewood, Teaneck, Paramus, Ridgewood, Montclair, Newark, Paterson, Clifton, Morristown, Wayne
3. **New York City**: Manhattan, Brooklyn, Queens, Bronx, Staten Island

Each location page includes unique local copy, neighborhood mentions, offer links, nearby-area links, and `ProfessionalService` JSON-LD with `areaServed`.

## Data flow

Static HTML assets on Cloudflare Pages/Workers. Location and pricing pages are generated from JSON (`data/locations.json`, `data/pricing.json`) and committed as HTML so crawlers see full content without client rendering.
