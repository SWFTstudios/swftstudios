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

| Route | Role |
| --- | --- |
| `/` | Homepage |
| `/growth-audit` | Free Growth Audit lead flow |
| `/services.html` | Offer ladder |
| `/website-pricing.html` | Pricing |
| `/websites.html` | Portfolio |
| `/case-studies.html` | Case studies hub |
| `/team.html` | Team |
| `/contact.html` | Project inquiry |
| `/locations/` | Local SEO hub |
| `/book/` | Stripe booking hub |
| `/portal/onboard.html` | Client portal signup |
| `/portal/login.html` | Client portal sign-in |
| `/portal/dashboard.html` | Client project + performance dashboard |

## Local SEO coverage

Three regions, 25 city pages:

1. **Jersey City & Hudson County**: Jersey City, Hoboken, Weehawken, Union City, Bayonne, West New York, Secaucus, North Bergen
2. **North Jersey**: Hackensack, Fort Lee, Englewood, Teaneck, Paramus, Ridgewood, Montclair, Newark, Paterson, Clifton, Morristown, Wayne
3. **New York City**: Manhattan, Brooklyn, Queens, Bronx, Staten Island

Each location page includes unique local copy, neighborhood mentions, offer links, nearby-area links, and `ProfessionalService` JSON-LD with `areaServed`.

## Data flow

Static HTML assets on Cloudflare Pages/Workers. Location and pricing pages are generated from JSON (`data/locations.json`, `data/pricing.json`) and committed as HTML so crawlers see full content without client rendering.
