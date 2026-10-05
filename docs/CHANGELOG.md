# Changelog

## 2026-10-05: Hero flow headline + crystal letter prisms

### Changed
- Homepage H1 is now **“Turn your ideas into a flow of customers who stay.”** with a short outcome sub for owners, creators, and founders (replaces “Own your blue ocean.”).
- Load-intro letter cubes render as **cut-crystal prisms** (faceted ice glass, chromatic prism sheen, carved SWFT glyphs) in [`js/swft-ocean.js`](../js/swft-ocean.js).
- Join flash is capped and localized (CSS + shader) so the four prisms meet with a soft spark instead of a full-viewport whiteout.

## 2026-10-05: Homepage Selected Work lineup

### Changed
- Homepage **Selected Work** stack (`#work`) now features Blurred Lines Entertainment, Built By Me EZ, Snooze Lane, and Hawthorne Global Ministries (replacing Brooklyn Steel, Manna Hydration, and Hamper). Each cover still uses `data-cs-transition` / `data-cs-cover` for the card→case-study morph into the matching project page.

## 2026-10-05: Full-bleed hero ocean + text scrim

### Changed
- Homepage hero ocean is **full-bleed** on desktop; a soft semi-opaque left scrim keeps the copy readable while the dark water shows through. Cube stays on the right via `data-cube-bias-x="0.25"` + CSS `left: 75%`. See [`css/home-hero-ocean.css`](../css/home-hero-ocean.css), [`js/swft-ocean.js`](../js/swft-ocean.js). Intro frame-in now settles into that full-width stage (no hard left black panel).

## 2026-10-05: Staged birdseye fly-in, then camera tilt

### Changed
- Load intro staging in [`js/hero-intro.js`](../js/hero-intro.js): cubes hold off-camera for the first **10%** of the bar, fly into the top-down frame during the rest of load, then after load spiral inward while the camera tilts—orbits shrink so spins stay framed. Impact flash + photo handoff unchanged at the end.

## 2026-10-05: Letter cubes — white metal + black obsidian glyphs

### Changed
- Load-intro letter cubes now render as **glowing white metallic** faces with chrome rim/sheen; glyphs are **black obsidian** with a cool metallic glare for contrast. Shader + atlas in [`js/swft-ocean.js`](../js/swft-ocean.js).

## 2026-10-05: Intro swirl + camera descent run together

### Changed
- Homepage load intro **flight** phase: the S/W/F/T letter cubes spiral inward (3 expo orbits) **while** the WebGL camera pans from birdseye into the hero and the scene frames into its slot. Impact flash + photo-cube handoff happen at the end of the same timeline (no separate post-swirl descent). See [`js/hero-intro.js`](../js/hero-intro.js).

## 2026-10-05: Four-letter cube load intro

### Changed
- **Homepage load intro** now opens with four glowing letter cubes (**S**, **W**, **F**, **T**) at the viewport corners over the dark sea (birdseye). They idle while the progress bar fills, then spiral toward the centre for three orbits (each ~2× faster than the last), collide with a white flash, and hand off into the existing camera descent → DOM lifestyle photo cube → hero copy. WebGL letter cubes + multi-glow live in [`js/swft-ocean.js`](../js/swft-ocean.js) (`setIntroLetters`); choreography in [`js/hero-intro.js`](../js/hero-intro.js); flash overlay in [`css/hero-intro.css`](../css/hero-intro.css). Session skip and reduced-motion skip unchanged; failsafe extended to 20s once the intro script runs. Merged cube faces still use the existing photo slideshow (no video textures).

## 2026-10-01: Visuals page is Vimeo videos only

### Changed
- The Visuals page now shows only the SWFT Vimeo films: the 13 from the Video Gallery, plus the SWFT reel and the Yanko Hernando story (15 in all). The photo projects, the website slideshow, the three MP4 files and the All / Video / Photo filter are gone, along with the slideshow lightbox.
- Add a film by adding `{"vimeo": "<id>"}` (plus `"hash"` for an unlisted video) to [`data/visuals.json`](../data/visuals.json). Its title, thumbnail, description and duration load from Vimeo's public oEmbed; set `title`, `thumb`, `description`, `client`, `category` or `year` on an entry to override. A film Vimeo won't describe still plays, with a numbered title and a plain tile.
- Each film's full-screen view now has a "Watch on Vimeo" link, and the duration shows on the tile and in the details.

### Fixed
- Closing a film opened from a direct link (`/visuals.html?p=...`) no longer steps back out of the site. The page only goes "back" over the history entry it added itself.

## 2026-10-01: Hologram city grid beside the Free Growth Audit copy

### Added
- A 3D hologram city grid to the right of "Find out where your business is leaking customers." on the homepage (below the copy on tablets and phones, where it stays visible). Glowing wireframe towers on a street grid, drawn on a canvas with its own small perspective camera (no 3D library). Every ~15s the city grows from its centre: a wave rolls outward, towers rise as it passes, and their window lights switch on behind it; then it holds while pulse rings sweep the grid, a beacon glows from the tallest tower, and it settles and starts again. The camera turns slowly; drag to turn it (with momentum). **Tap (or click) the ground** to send a pulse ring out from that spot: the towers around it light up, their windows flare, and the glow fades over a couple of seconds (up to six pulses at once). The canvas is 15% larger than its box on every side, so the glow, the rotating plate corners and the beacon are never clipped; the section clips that overflow with `overflow-x: clip`, so the page still can't scroll sideways. Pauses off-screen and in hidden tabs; under reduced motion it shows one still frame of the finished city (taps still glow, in place, without the ring travelling). See [`js/swft-city.js`](../js/swft-city.js) and [`css/swft-city.css`](../css/swft-city.css).

## 2026-10-01: Wider About statement; "Proven results" grid removed

### Changed
- Homepage About statement ("Strategic Workflows Facilitating Transformation...") is wider: its container goes from 72rem to 96rem and the line cap from 24 to 44 characters, so on a laptop it runs about the full content width in three lines instead of four or five. Phones are unchanged. See [`css/home-about.css`](../css/home-about.css).

### Removed
- The "Our Work / Proven results" three-column card grid (and its "View All Work" button) from the homepage. The stacked "Selected Work" section above it stays, and still links to all work. Its styles are gone too.

## 2026-10-01: Forms also log to Google Sheets, with an email fallback

### Added
- Every form (contact, Free Growth Audit, booking / quote, website build) now saves to **Airtable and a Google Sheet** in parallel, then emails hello@swftstudios.com as before. The Sheet gets one tab per form with the same columns as Airtable; either copy counts as saved.
- If the Resend email to hello@ fails (or `RESEND_API_KEY` is missing), the Google Sheets script emails hello@ instead, so a lead is never silent.
- Runs through a small Google Apps Script web app ([`scripts/google-sheets-leads.gs`](../scripts/google-sheets-leads.gs)); no Google API keys. Turns on when `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_SECRET` are set in Cloudflare; until then nothing changes. Setup: [`GOOGLE_SHEETS_LEADS.md`](GOOGLE_SHEETS_LEADS.md).
- Team emails now say where the lead was saved ("Saved to: Airtable + Google Sheet") instead of "Stored in Airtable".
- 8 new tests (`npm run test:forms`): the handlers and the Apps Script.

## 2026-10-01: Sticky SWFT Method intro; holographic letter cube

### Changed
- Homepage "The SWFT Method": the left column (heading, intro, cube) stays pinned under the nav while the five stage cards scroll past, and lets go before the content-engine bar (tablet and up; phones keep the stacked layout). The intro and cards now share a `.process-row` so the sticky column stops at the end of the cards.
- The SWFT letter cube is now a glowing digital hologram: light-tube white edges with blue bloom, dark glass faces with a pixel grid and a sweeping scan line, neon white letters, a brief RGB-split glitch every few seconds, a stronger halo and a light pool beneath. Far-side faces show as glowing wireframe only, so letters stay crisp. Animations stop under reduced motion.

## 2026-10-01: Visuals page

### Added
- **Visuals** ([`/visuals.html`](../visuals.html)), now in the nav after Work: an endless, draggable grid of photo and video projects (drag with momentum, trackpad/wheel, arrow keys or Tab), with All / Video / Photo filters.
- Clicking a project uses **GSAP Flip** to grow its thumbnail into a full-screen project view (title, client, category, year, description, prev/next). Each project has its own link (`/visuals.html?p=slug`); Back closes it.
- Video projects show **Play video**, which opens a lightbox playing the Vimeo video (unlisted links supported) or an MP4. Photo projects show **Play slideshow**, which opens an image slideshow lightbox (auto-advance with progress bar, pause, arrows, swipe, thumbnails, keyboard).
- Content lives in [`data/visuals.json`](../data/visuals.json); add a project by adding an entry (see its `_readme`). Seeded with the SWFT reel and Yanko Hernando story (Vimeo), three SWFT MP4s, a Web Design Highlights slideshow and each case-study project.
- See [`css/visuals.css`](../css/visuals.css) and [`js/visuals.js`](../js/visuals.js).

### Changed
- `/videos`, `/media` and `/swft-tv` now redirect to `/visuals.html` instead of `/case-studies.html`.

## 2026-10-01: SWFT letter cube in "The SWFT Method"

### Added
- A small glowing white 3D cube under the "From first scroll to repeat customer." text on the homepage, with **S, W, F, T** on its four sides in Michroma (self-hosted, OFL), the closest web font to the business card's wide, squared logo lettering, thickened to match its weight. It spins slowly on its own; drag it to turn it (with momentum), or focus it and use the left/right arrow keys to step a face at a time. Pauses when off-screen; no auto-spin under reduced motion. See [`css/swft-letter-cube.css`](../css/swft-letter-cube.css) and [`js/swft-letter-cube.js`](../js/swft-letter-cube.js).

## 2026-10-01: Curved nav bar

### Changed
- The nav bar's bottom edge now curves like the top of the homepage work carousel: the same 120%-wide elliptical arc, dipping a subtle ~14px lower in the middle than at the sides (8px on phones). Frosted background and hairline follow the curve. The bar is pinned to 62px (`--sn-height`) again, so it no longer overlaps the space reserved for it. See [`css/swft-nav.css`](../css/swft-nav.css).

## 2026-10-01: One menu at every width

### Changed
- Desktop now uses the same nav as mobile: the brand on the left, and on the right the **Get Your Free Growth Audit** button next to a menu button that opens the glass slide-over menu. The row of desktop links is gone. On phones (560px and below) the bar shows just the brand and menu button; the audit button stays inside the menu. See [`js/swft-nav.js`](../js/swft-nav.js) and [`css/swft-nav.css`](../css/swft-nav.css).

## 2026-10-01: New type system (Inter Tight + Space Mono, after Astrox Studio)

### Changed
- Site typography now follows the [Astrox Studio](https://astrox-studio.webflow.io/utility-pages/style-guide) style guide: **Inter Tight** for headings, display lines and body text, **Space Mono** for labels and eyebrows. Headings drop the forced uppercase for sentence case at weight 500 with tight negative tracking; labels (section eyebrows, step numbers, category tags) are uppercase Space Mono. The type scale follows the Astrox sizes by role, fluid down to phones: page heroes 100px, section titles 70px, card titles 44px, h4/h5/h6 34/28/24px, closing CTA display 210px, body 18px, small 16px, labels 12-14px. Paragraphs drop the old -0.019em tracking (Inter Tight is already tight) and every heading is weight 500. See [`css/swft-fonts.css`](../css/swft-fonts.css) and the new `--swft-font-mono` token in [`css/swft-tokens.css`](../css/swft-tokens.css).

### Removed
- Chakra Petch and Inter Display font files; both are replaced by self-hosted Inter Tight and Space Mono in `fonts/`.
## 2026-10-01: Video gallery page

### Added
- **`/video-gallery.html`**: a double slider of SWFT films. A large 16:9 stage (active video centred, neighbours peeking, plays inline in a Vimeo player on click) is synced with a thumbnail rail below and a caption that slides vertically with it; arrows, a `03 / 13` counter, a progress line, keyboard arrows and swipe. Videos are listed by Vimeo id (plus the private-link hash for unlisted ones) at the top of [`js/video-gallery.js`](../js/video-gallery.js); titles and thumbnails load from Vimeo's public oEmbed, so renaming a video on Vimeo updates the page. Styles in [`css/video-gallery.css`](../css/video-gallery.css). Not in the main nav yet; linked from the sitemaps.

## 2026-10-01: Homepage load intro (birdseye descent) + scroll-in text animation

### Added
- **Load intro** (first visit per session, motion allowed, no `#hash`): a birdseye shot straight down over the dark sea with a small spinning cube of white light in the centre, "the spark of ideas in a dark sea", and a SWFT STUDIOS loading bar tracking real progress (fonts, the cube's first photos, the ocean's first frame, window load; 1.6s-7s). Then a 3.6s cinematic descent: the WebGL camera falls in an arc around the cube, tilting up to the horizon until it lands on the hero camera, while the full-screen shot frames into its hero slot. The ocean draws the cube itself during the move; on landing the white cube hands over to the DOM photo cube, which cools from white into its photos, and the hero copy animates in. See [`js/hero-intro.js`](../js/hero-intro.js), [`css/hero-intro.css`](../css/hero-intro.css) and `introCamera()` in [`js/swft-ocean.js`](../js/swft-ocean.js). A 12s failsafe always reveals the page.
- **Scroll-in text animation** site-wide ([`js/text-reveal.js`](../js/text-reveal.js), loaded by `swft-nav.js`): headings rise in word by word from a mask, paragraphs, list items and labels fade up, staggered as they enter view. Skips the nav, hero copy, About scroll highlight, Webflow interactions, tabs, cards and forms; off under reduced motion; loads GSAP from cdnjs if the page doesn't already.

### Changed
- The ocean's wave detail and haze now go by distance across the water rather than ray length (no visible change in the hero; keeps the water crisp from above).

## 2026-10-01: Site-wide message: the SWFT Method; one page per purpose

### Changed
- The whole site now tells one story: **SWFT = Strategic Workflows Facilitating Transformation**. We run digital marketing from every side, in five stages: **Get seen → Capture → Convert → Nurture → Automate & repeat**, powered by a content engine that makes creative proven before it's posted.
- **Home:** Creative Services now sits right after the five problem tabs (pain, then the offer), ahead of "Who's this for", testimonials and work. New hero line, About statement, the five problem tabs now map to the five stages, "The SWFT Method" replaces the generic 4-step process, the audit CTA and FAQ (plus FAQ schema) explain the method and add "What does SWFT stand for?".
- **Services → The SWFT Method:** each stage with its goal, what we do (the automation tools from the old Tools page live under Automate) and the offers that cover it; the content engine (Learn, Create, Feed back); and a "Where to start" ladder from the free audit up.
- **Pricing:** "Pick the stage that's costing you the most." Every tier is tagged with the stages it covers; a new FAQ answers which package to start with. Prices and scope are unchanged.
- **Free Growth Audit:** reviews all five stages; new optional question "Where are you losing the most customers?" that lands in the team email and the Airtable "Biggest Challenge" field; the submit button reads "Send my audit request" and the call step is clearly optional.
- **Contact, Team, Work, Book, thank-you and location pages** reworded around the method; nav is now Home, Services, Work, Pricing, Locations, Team, Contact.

### Removed
- Redundant or unfinished pages: `websites`, `resources`, `media`, `videos`, `swft-tv`, `portfolio-review`, `apps`, `tools`, `swft-method`, the `pricing.html` stub and two empty Webflow component files, plus assets only they used (`work-filter`, `hero-vimeo-loader`). Each has a 301 redirect; see [`SITE_MAP.md`](SITE_MAP.md#retired-pages-2026-10-01).

## 2026-10-01: Fix clipped text in the "Who's this for" cards on phones

### Fixed
- Opening an industry card on a phone cut off the end of its text. The card had a fixed height and the text a fixed cap, and the new, longer copy plus an oversized paragraph size no longer fit. An opened card now grows to fit its text, the paragraph is set to 15px, and the photo behind an open card is darkened so the words stay readable.

## 2026-10-01: "The Problem" becomes auto-playing pain-point tabs; "Who's this for" rewritten

### Changed
- `#homepage-problems` is now an auto-playing tab section, "Great at the work. Invisible online.", with five pain points: Hard to find, Unclear, Weak visuals, No inquiries, Inconsistent. Each tab shows the problem, what it costs and how SWFT fixes it.
  - Advances every 7 seconds with a progress bar on the active tab. Holds while a mouse is over it, while keyboard focus is inside and while it's off screen; a Pause/Play button stops it (WCAG 2.2.2). Reduced motion starts it paused.
  - ARIA tabs with arrow keys, Home and End. Numbered list on desktop, sideways-scrolling chips on phones. Without JS all five are shown stacked.
  - See [`css/home-pain-tabs.css`](../css/home-pain-tabs.css) and [`js/home-pain-tabs.js`](../js/home-pain-tabs.js).
- `#homepage-audience` copy now speaks to what customers want: "For owners who want a full calendar, not just a nice website", a new intro, and each industry card opens with the outcome that customer is after.

## 2026-10-01: Homepage services rebuilt after the ARAISE services section

### Changed
- The homepage "Creative Services" section (`#services`) now follows the ARAISE layout (araise.webflow.io/#services): a big "Creative Services" title with the subtitle opposite, a list of four services on the left, and a sticky featured project on the right.
  - Services: **Brand Identity** (TAL Hydration), **Photo/Video** (Roller Reels), **Web Development** (Thyme & Table), **Marketing** (social content).
  - The service nearest the middle of the screen lights up white, opens its description and draws its rule; its project crossfades in on the right. Hover or keyboard focus activates a service straight away.
  - On desktop a round accent arrow trails the pointer over the list.
  - Below 992px it's one column and each open service shows its project inline.
  - Without JS every service is open. Reduced motion turns the animation off.
- The old price-led service rows are gone from the homepage; a "See packages & pricing" button links to the pricing page. See [`css/home-services.css`](../css/home-services.css) and [`js/home-services.js`](../js/home-services.js).

## 2026-10-01: Glowing glass cube that ripples the sea

### Changed
- The homepage cube drops the Rubik's sticker grid for clear glowing glass (`swft-cube--glow`): sharp square corners, crisp photos behind a faint sheen, bright ice-blue edges and a stronger glow that lights the water around and under it.
- The cube floats lower (`data-hover-gap="0.11"`). As it spins and bobs, its corners touch the wave crests and send ripple rings across the surface (no droplets). It rises (buoyancy) instead of sinking when dragged to a steep angle. See [`js/swft-ocean.js`](../js/swft-ocean.js) and [`docs/SWFT_CUBE.md`](SWFT_CUBE.md).

## 2026-09-30: Cache busting for CSS and JS

### Fixed
- Returning visitors could keep seeing the old fonts and colors after a deploy, because stylesheet URLs never changed and most type rules load through `@import`. Every local CSS/JS link and every `@import` now carries a `?v=` version, and a new [`_headers`](../_headers) file makes `/css/*` and `/js/*` revalidate on each visit. Bump the version (search for `v=20260930b`) when shipping style changes. The book and location page generators use the same version.

## 2026-09-30: swft2027 type across the site + colorblind-safe accent

### Changed
- Every heading on the site now uses the swft2027 display face, **Chakra Petch** (700, uppercase), self-hosted in `fonts/`. Body and UI text stay Inter Display. See [`css/swft-fonts.css`](../css/swft-fonts.css).
- New type scale in [`css/swft-tokens.css`](../css/swft-tokens.css): display, h1–h6 and an uppercase label size. Page heroes, section titles, card titles, label headings and the closing CTA each map to one size, replacing the one-off sizes on individual pages.
- The accent changes from mint `#7fffe5` to Okabe-Ito sky blue `#56b4e9`. The mint was almost as light as white, so for colorblind visitors accent text looked like body text. The blue stays distinct under every type of color vision and is 9:1 on black.
- Error text changes from pink-red to Okabe-Ito orange `#e69f00`, so errors and successes differ in hue for everyone. Status messages also get ✓ / ⚠ marks and invalid fields get a dashed border, so color is never the only signal.
- The homepage now loads its own copy of Chakra Petch instead of Google Fonts.

## 2026-09-30: Homepage hero — ocean cube replaces the background video

### Changed
- The homepage hero's Vimeo background video is replaced by the glowing work cube over the WebGL ocean. It fills the right half of the first screen on desktop. On tablet and mobile it sits above the copy, up to 56svh tall and trimmed on short screens so the copy stays above the fold. See [`css/home-hero-ocean.css`](../css/home-hero-ocean.css) and [`docs/SWFT_CUBE.md`](SWFT_CUBE.md#homepage-hero).
- New hero copy:
  - Eyebrow: "Brand · Website · Content"
  - H1: "Own your blue ocean."
  - Subhead: "Websites and content that lift your brand out of the crowd and into open water."
  - The "Named offers with clear scope…" line is removed from the hero.
- The hero intro now waits for the ocean's first frame (`swftocean:ready`, 1.5s fallback) instead of the Vimeo player.
- The cube sits just above the water (`data-hover-gap`). Waves are centred on the water line, so the reflection starts right under the cube.

- The homepage About section (`#About`) is rebuilt after the swft2027 staging design (branch `swft-araise-2027`). See [`css/home-about.css`](../css/home-about.css) and [`js/swft-about.js`](../js/swft-about.js).
  - Layout: a `-> [ ABOUT US ] / SWFT` meta row, then a huge uppercase Chakra Petch statement.
  - Copy: "SWFT Studios creates high-converting marketing content and brand-true digital experiences for Bergen, Hudson, and NYC."
  - Reveal: the statement starts dim, and its words light up one at a time on scroll. It uses the same window as the staging ScrollTrigger (`top 75%` → `bottom 35%`), with no library dependency.
  - Carousel: a full-bleed work carousel (Hamper, Brooklyn Steel, Manna Hydration, Thyme & Table, Snooze Lane). Black elliptical bars cut it into a curved window, with sizes taken from the staging site head. Each card links to its case study, and a "View all work" link sits below it.
  - Carousel motion: `js/swft-about.js` loops it continuously at 70px/s (50px/s on phones).
    - Touch: the first tap on a card holds the loop for 3s and shows "→ View project", and a second tap during the hold opens the case study. When the hold ends, the loop eases back up to speed from where it stopped.
    - Mouse and keyboard: a click or Enter opens the case study directly, and keyboard focus holds the loop while it's on a card.
    - Hovering no longer pauses it, and vertical swipes over it still scroll the page.
    - Swipeable: drag it with a mouse or finger, or swipe sideways on a trackpad. On release it keeps the fling's speed (capped at 4,000px/s) and direction, either way, then glides back to its default speed over a few seconds (1.1s time constant). A drag never opens or holds a card, and vertical swipes still scroll the page.
- The hero's work marquee and its "View All" button are removed. The About carousel replaces them.
- New **Selected Work** section (`#work`), which replaces the "About us" slider (`#Projects`). It's ported from the swft2027 / ARAISE design: `-> [ OUR WORK ]` label, "Selected Work" with the second word outlined, and a lead line. Below that, four full-width project covers (Brooklyn Steel, Manna Hydration, Snooze Lane, Hamper) stack as you scroll, each sticking under the nav. Each cover links to its case study. On desktop a "View Work" circle follows the cursor over the covers, and the heading fades as the covers pass over it. There's a "View all work" button at the end. See [`css/home-work-services.css`](../css/home-work-services.css) and [`js/home-work-stack.js`](../js/home-work-stack.js), which is plain JS with no GSAP.
- New **Creative Services** section (`#services`), which replaces the "Investment: Pricing that matches the work" section (`#homepage-pricing`). It shows `-> [ OUR SERVICES ]`, "Creative Services", and four linked service rows: GBP Content Refresh $400, Website Only $800, Website + Content $2,000, and Growth Retainers. Alternate rows are outlined, and each row has a cyan ↗ arrow.
- **Full-screen case-study cover.** On the 14 project case studies, the cover image (`.cs-cover`) now fills the first screen under the nav, edge to edge on phones too. It's anchored to the top so site headers stay in view, with a soft fade at the bottom. The "Scroll Down" cue sits on the image, and the scrolling name band follows below. This is CSS only, in `css/case-study.css`, so regenerated pages get it too. Article pages have no cover and are unchanged.
- **Card → case-study transition.** Clicking a Selected Work cover or an About carousel card morphs its image into the case study's full-width cover (`.cs-cover`). See [`css/swft-page-transition.css`](../css/swft-page-transition.css) and [`js/swft-page-transition.js`](../js/swft-page-transition.js), which load on the homepage and on the 14 project case studies.
  - Chrome, Edge and Safari 18.2+ use cross-document View Transitions (`@view-transition`). The clicked image is named `cs-hero`, matching the cover. Pressing Back morphs the cover back into its card.
  - Other browsers (Firefox) use a FLIP fallback in plain JS. The card image expands to full screen, the page navigates, and the case study starts on that image before settling it into the cover slot.
  - Case-study covers are prefetched as the cards come near the viewport, and on hover, tap or focus. Covers load with `fetchpriority="high"`.
  - Reduced motion, modifier-clicks and the carousel's first tap (which holds the loop) navigate normally.
- Both sections use a black background, white text and a cyan (`--green`) accent. The homepage no longer loads `js/pricing-render.js` or `js/homepage-pricing.js`, but `website-pricing.html` still uses both.
  - It replaces the old animated statement, whose Jersey City / Manhattan / North Jersey links left the homepage body. The nav still links to Locations.
  - Reduced motion: every word is lit, and the carousel is a static strip that can be scrolled sideways.

### Removed (homepage only)
- The Vimeo intro loader overlay, `js/hero-vimeo-loader.js`, `css/hero-vimeo-loader.css` and the Vimeo player API script.
- The hidden legacy "cube night watch" background videos.

---

## 2026-09-30: Interactive 3D image cube

### Added
- [`css/swft-cube.css`](../css/swft-cube.css) + [`js/swft-cube.js`](../js/swft-cube.js): a reusable six-face 3D cube with a slideshow on each face. Drag or swipe to rotate (it snaps to a face, and a flick moves at least one face). Tap the front face to change slides or tap a side face to bring it forward. Hover tilts the cube, and the arrow keys and Enter/Space also work. Honors reduced motion. Docs: [`docs/SWFT_CUBE.md`](SWFT_CUBE.md).
- Idle spin (`data-spin`): the cube spins slowly and continuously. Any interaction stops or coasts it to a stop, and after 3s idle it eases back to level and the spin ramps back up.
- Ocean stage ([`css/swft-ocean.css`](../css/swft-ocean.css) + [`js/swft-ocean.js`](../js/swft-ocean.js)): the cube glows with ice-blue edges and hovers over a real-time WebGL black sea. Its reflection streaks across the ripples, with bloom, glints and low mist. The water is animated in 3D: a rolling swell under choppy ripples, with crests that glow where the cube's light passes through. The cube bobs gently, and the scene steps down resolution on slow devices.
- [`cube.html`](../cube.html): a `noindex` demo page built from existing portfolio images. It isn't linked from the nav.

---

## 2026-08-20: PostHog on marketing site

### Added
- PostHog JS SDK (project `486061`) loads via [`js/swft-analytics.js`](../js/swft-analytics.js) — `$pageview`, pageleave, and custom SWFT events (`pricing_view`, `book_tier_submit`, etc.).
- Analytics script added on apps, media, websites, resources, team, case-studies, and portal pages that were missing it.

---

## 2026-08-20: Book via Payment Links (no Stripe secret key)

### Changed
- `/api/book-tier` prefers durable Stripe **Payment Links** (email prefilled) so booking works without `STRIPE_SECRET_KEY`.
- Removed the 503 “checkout unavailable” path when the secret key is missing.
- Checkout Sessions remain an optional fallback only if a Payment Link URL is missing.

---

## 2026-08-20: Portal secrets + Pages D1 binding

### Added
- [`wrangler.pages.jsonc`](../wrangler.pages.jsonc) for Pages deploys (D1 `DB` + Stripe price vars) without conflicting Worker `ASSETS`.
- `npm run deploy:pages` script.
- Stripe live webhook endpoint for portal provisioning (`checkout.session.completed`, subscription updated/deleted).

### Changed
- Pages production/preview: D1 `DB` bound to `swft-portal`; portal secrets `STRIPE_WEBHOOK_SECRET`, `PORTAL_ADMIN_SECRET`, `SESSION_SECRET` set.
- [`docs/CLIENT_PORTAL.md`](CLIENT_PORTAL.md) documents what is wired vs still required (`STRIPE_SECRET_KEY`, `POSTHOG_PERSONAL_API_KEY`).

---

## 2026-08-20: Client portal, Stripe catalog, PostHog dashboards

### Added
- Live Stripe Products, Prices, and Payment Links for all six offer-ladder tiers ([`data/stripe-catalog.json`](../data/stripe-catalog.json)).
- Cloudflare D1 database `swft-portal` with users, sessions, projects, invite_tokens ([`migrations/0001_portal.sql`](../migrations/0001_portal.sql)).
- Portal pages: [`/portal/onboard.html`](../portal/onboard.html), [`/portal/login.html`](../portal/login.html), [`/portal/dashboard.html`](../portal/dashboard.html).
- APIs: `/api/portal/*`, `/api/stripe-webhook`, `/api/admin/projects` (Pages Functions + Worker mirror).
- PostHog host-scoped metrics on the dashboard (staff assigns `site_host`).
- Product docs: [`docs/CLIENT_PORTAL.md`](CLIENT_PORTAL.md).

### Changed
- `/api/book-tier` Checkout uses reusable Stripe Price IDs instead of ad-hoc `price_data`.
- Thank-you page links to portal onboarding.
- Portal paths protected from Webflow overwrite ([`instructions.md`](../instructions.md), [`docs/WEBFLOW_WORKFLOW.md`](WEBFLOW_WORKFLOW.md)).

### Env
- Secrets: `STRIPE_WEBHOOK_SECRET`, `PORTAL_ADMIN_SECRET`, `POSTHOG_PERSONAL_API_KEY` (plus existing `STRIPE_SECRET_KEY`, `RESEND_API_KEY`).
- Binding: D1 `DB` → `swft-portal`.
- Stripe webhook URL: `https://www.swftstudios.com/api/stripe-webhook`.

### Failure cases
- Missing Price ID / Stripe key: book-tier 503/502; no phantom checkout.
- Invalid webhook signature or D1 down: 400/500; Stripe retries.
- PostHog missing or no events: dashboard loads with explicit pending/empty copy.

---

## 2026-08-20: Airtable hub-and-spoke CRM

### Added
- Hub tables in **SWFT Website Leads**: Companies, People, Pipeline (Kanban by Stage), plus form tables Growth Audits, Contact Inquiries, Paid Bookings, Website Build Requests.
- [`functions/_lib/airtable-crm.js`](../functions/_lib/airtable-crm.js) — person/company upsert + form + Pipeline writes.
- [`scripts/airtable-crm-setup.mjs`](../scripts/airtable-crm-setup.mjs) — print IDs + migrate archive Discovery Calls.
- [`docs/AIRTABLE_CRM.md`](AIRTABLE_CRM.md) — schema, env vars, day-to-day Kanban usage, token scopes.
- Contact and Instant Website forms now send `sourcePage` + UTM fields.

### Changed
- Form handlers route by form type (no longer dump contact + Stripe into Discovery Calls).
- Discovery Calls renamed to **Archive — Discovery Calls**; 24 rows migrated into the CRM.
- Growth Audit no longer falls back to Discovery Calls (Growth Audits table id is baked in).
- Worker mirror in [`src/worker.ts`](../src/worker.ts) uses the same CRM defaults.

### Env
- Secret: `AIRTABLE_TOKEN` needs **data.records:read** and **data.records:write** on Pages.
- Optional overrides: `AIRTABLE_TABLE_PEOPLE`, `AIRTABLE_TABLE_COMPANIES`, `AIRTABLE_TABLE_PIPELINE`, `AIRTABLE_TABLE_GROWTH_AUDIT`, `AIRTABLE_TABLE_CONTACT`, `AIRTABLE_TABLE_BOOKINGS`, `AIRTABLE_TABLE`.

### Failure cases
- Missing token: forms still succeed; `stored: false`.
- Read scope missing: upserts fail; form-only write attempted when possible.
- Re-migrate: Pipeline Notes include archive record ids for skip detection.

---

## 2026-08-20: Resend on live Worker forms

### Added
- Resend team notify + visitor confirmation on Worker routes `POST /api/contact`, `/api/growth-audit`, and `/api/book-tier` in [`src/worker.ts`](../src/worker.ts).
- Full `POST /api/book-tier` on the Worker (Airtable → Resend → Stripe Checkout), matching [`functions/api/book-tier.js`](../functions/api/book-tier.js).
- [`.dev.vars.example`](../.dev.vars.example) and `.dev.vars` gitignore entries for local secrets.

### Changed
- [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) documents Pages `swftstudios-website` as production; secret name is exactly `RESEND_API_KEY` (already set there).

### Env
- Secret: `RESEND_API_KEY` on Pages `swftstudios-website` (required for email; already provisioned).
- Optional vars: `RESEND_FROM`, `NOTIFY_EMAIL`.
- Domain `swftstudios.com` already verified in Resend.

### Failure cases
- Missing `RESEND_API_KEY`: form still succeeds; `emailed: false`.
- Resend 403/network errors: logged; Airtable write still attempted; visitor sees success.
- Missing `STRIPE_SECRET_KEY` on book-tier: `503`; lead may still be stored.

---

## 2026-08-20: Punch-list leftovers (19, 22, 24)

### Changed
- Straight apostrophes in public HTML copy are now `&rsquo;` (script, style, and form `value` attributes left alone so JS and stored payloads stay valid).
- GBP booking URL is `/book/gbp-content-refresh.html`. Stripe plan id stays `gbp-refresh`. Old `/book/gbp-refresh.html` 301s via the Worker, `_redirects` (`301!`), and a stub page.
- Contact hero no longer repeats the Growth Audit prompt. One “Not ready to start?” line remains under the form.

### Notes
- Punch-list items 19, 22, and 24. Branch: `fix/punch-list-leftovers`.
- Rebuild book pages with `npm run build:book` so the generator keeps writing the new filename and the redirect stub.

### Failure cases
- Bookmarks to `/book/gbp-refresh.html` should 301. If a static host ignores `_redirects` and the Worker, the HTML stub still meta-refreshes.
- `npm run build:book` overwrites `book/*.html`. The generator writes `gbp-refresh.html` as a redirect, not a checkout page.
- Radio `value="It's all on my Instagram"` on `swft-method.html` is unchanged so Airtable still receives the original string.

---

## 2026-08-20: Punch-list phases 3 and 4 (SEO and copy)

### SEO (items 10 to 13)
- Added unique meta descriptions (about 140 to 160 characters) to 14 client case studies, plus `media.html`, `videos.html`, and `swft-tv.html`.
- Rewrote titles on Websites, Apps, Media, SWFT TV, Resources, Video Resources, and Contact to the house pattern `Topic | SWFT Studios` (about 50 characters). Replaced leftover Dann Petty template titles, descriptions, and OG images on Websites, Apps, and Resources.
- Shortened generated location-page descriptions in [`scripts/build-location-pages.mjs`](../scripts/build-location-pages.mjs) (rebuild with `npm run build:locations`). Longest is now 146 characters (Staten Island).
- Homepage testimonials heading is now a single `h2` (“What clients had to say”). The hero `h1` is the only H1.
- Filled empty `alt` on work thumbnails, posters, and logos on Home, Videos, Apps, Media, Resources, SWFT TV, and Websites. Hidden hero stills and decorative arrows stay `alt=""`.

### Copy (items 14 to 26)
- Yanko testimonial: consistent curly quotes, “one-stop shop,” one period, question mark.
- Homepage problem heading no longer repeats the intro line. Pricing trust line no longer repeats the H1.
- Services card label is `02-03 / Website + Content` (one card, combined offer).
- Homepage section titles use sentence case. Audience copy is device-neutral (“Browse” / “Select a card”).
- “And more” instead of “And More..”. “long-term” hyphenated. Team CTA is “View our work.”
- GBP button and book hub copy say **GBP Content Refresh**. Booking copy uses `1- to 5-page` and `2- to 4-hour` (`npm run build:book`).
- Contact: “Get in touch,” one “Not ready to start?” line, budget options aligned to live tiers (`$400 to $600`, `$800 to $1,500`, `$2,000 to $2,800`, `$3,000+`, “Not sure yet”).
- Case-study possessives (`brand’s`, `kids’`) use `&rsquo;` so they do not mix with script quotes.

### Notes
- Punch-list items 10 to 26. Branch: `feat/site-punch-list-p3p4`.
- A Webflow import of `index.html`, `websites.html`, `apps.html`, `media.html`, `resources.html`, `videos.html`, or `swft-tv.html` will overwrite titles, metas, alts, and homepage copy. Re-apply after import.
- Rebuild generated pages after editing sources: `npm run build:book` and `npm run build:locations`.

### Failure cases
- If `build:locations` is skipped after a generator edit, city pages keep the longer descriptions Google would truncate.
- Contact budget is a free-text field on the worker (`Budget: str(body.budget, 200)`). New option labels only affect the dropdown; old submissions are unchanged.
- Decorative `alt=""` on arrows is intentional. Work images without a mapped filename still need a manual alt if new galleries are added.

---

## 2026-08-20: Homepage hero overflow

### Fixed
- At a 400px viewport the homepage was ~6px wider than the screen. The scaled Vimeo hero iframe is now clipped on `.hero-vimeo` (`contain: paint`) and `.background_image-wrappe`.

### Notes
- Punch-list item 09. Lives in `css/hero-vimeo-loader.css` so a Webflow import of `index.html` does not drop the rule if that stylesheet stays linked. Branch: `fix/homepage-overflow`.

---

## 2026-08-20: Shared site footer

### Added
- `js/swft-nav.js` now injects one footer (email, Instagram, Our Work, Locations, site map, Growth Audit) on every page that already loads the shared nav, including Home, Services, and Pricing.

### Changed
- Existing `footer.ps-footer` and `footer.footer_component` blocks are hidden when the shared footer is present so crawlers and visitors see one set of links.

### Notes
- Punch-list item 07. Branch: `feat/shared-footer`.

---

## 2026-08-20: Shell nav gutter and box model

### Fixed
- Shared nav used `width: 100%` plus 40px padding without `border-box`, so the Growth Audit CTA clipped by a constant 40px on shell pages.
- Nav inset was 40px while page-shell body used 20px. Both now use `--swft-gutter` (24px).

### Notes
- Punch-list items 05 and 06. Branch: `fix/shell-nav-layout`.

---

## 2026-08-20: Growth Audit skip CTA

### Fixed
- Removed the “Done: go to confirmation” link that jumped to `/growth-audit/thank-you` without submitting a lead.
- `.ps-page .button { display: inline-block }` overrode `[hidden]`, so Back stayed visible on step 1. `.ps-page [hidden]` now wins. Back is also `disabled` on steps 1 and 5.

### Notes
- Punch-list item 02. Branch: `fix/growth-audit-skip`.

---

## 2026-08-20: Nested page assets load from site root

### Fixed
- Booking pages under `/book/`, case studies under `/case-study/`, and `/growth-audit/thank-you` requested CSS/JS/images with `./` or `../`, so browsers resolved `/book/css/…` and `/case-study/css/…` (404). Assets now use root-absolute `/css/`, `/js/`, `/images/`.
- Case study pages used a leftover Webflow nav (`footer.navbar`) with 404 links and `mailto:elombe@` while the visible text said `hello@`. That block is removed; `#swft-nav` is the nav. Footer CTA text matches `hello@swftstudios.com`.
- [`scripts/build-book-pages.mjs`](../scripts/build-book-pages.mjs) now emits root-absolute asset paths so `npm run build:book` cannot restore the bug.

### Notes
- Punch-list items 01, 03, 04, and 08. Branch: `fix/nested-page-assets` off `feat/site-punch-list`.

---

## 2026-08-10: Copy dash cleanup, local SEO pages, structured site map

### Changed
- Removed em dashes and en dashes from public website copy across HTML pages, pricing/portfolio data, booking pages, and user-facing email/API strings. Price ranges now read as `$400 to $600`. Clause breaks use commas or periods instead of AI-style dashes.

### Added
- Local SEO hub at [`/locations/`](../locations/index.html) covering Jersey City & Hudson County, North Jersey, and New York City.
- 25 area landing pages under `/locations/<slug>.html` (unique local copy + schema.org `ProfessionalService` markup), generated from [`data/locations.json`](../data/locations.json) via `npm run build:locations`.
- Human and LLM readable structured site map at [`/sitemap.html`](../sitemap.html).
- [`css/locations-page.css`](../css/locations-page.css) and generator [`scripts/build-location-pages.mjs`](../scripts/build-location-pages.mjs).
- Nav link to Locations; contact and Growth Audit link into the locations hub.

### SEO
- Expanded homepage and Growth Audit `areaServed` schema to include each served city.
- Updated [`sitemap.xml`](../sitemap.xml) with `/sitemap.html`, `/locations/`, and every area page.

---

## 2026-08-10 — Stripe booking pages per pricing tier

### Added
- Dedicated Stripe Checkout booking pages for every offer-ladder tier under `/book/` (GBP Refresh, Website Only, Website + Content half/full, Content Retainer, Full Growth Partner).
- `POST /api/book-tier` Pages Function: Airtable (Discovery Calls) + Resend notify + Stripe Checkout (`price_data`; payment or subscription).
- Shared catalog [`functions/_lib/stripe-tiers.js`](../functions/_lib/stripe-tiers.js) (server-authoritative amounts).
- Generator: `npm run build:book` → [`scripts/build-book-pages.mjs`](../scripts/build-book-pages.mjs).
- Thank-you page at `/book/thank-you.html`.

### Changed
- [`data/pricing.json`](../data/pricing.json) tiers now include `bookUrl` + `stripe` start amounts.
- Pricing card CTAs link to `/book/<tier>.html` instead of Growth Audit preselect.

### Docs
- Updated [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for the tier booking flow.

---

## 2026-08-10 — Pricing → Growth Audit preselect + multi-step onboarding

### Changed
- Growth Audit (`growth-audit.html`) is now a Launch Kit–style **5-step** form with a progress bar: contact → website/social → desired service → details/photos → Cal.com booking.
- Removed overlapping qualification questions (category / challenge / budget / timeline) so service intent is asked once.
- Pricing tier CTAs append `?plan=<tier-id>` so the desired-service dropdown arrives pre-selected (still editable).

### Added
- Desired service dropdown aligned to [`data/pricing.json`](../data/pricing.json) package IDs.
- Photo share-link field (Drive/Dropbox/iCloud) — no file-upload backend.
- API + worker accept `desiredService`, `lastName`, `photoLinks`, and website-or-social presence.

### Docs
- Updated [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for the multi-step flow and Airtable fields.

---

## 2026-08-09 — Homepage audience carousel + Investment tabs

### Changed
- Replaced homepage **Offers** and **Ongoing** pricing cards with a **Who’s this for** horizontal swipe section (`#homepage-audience`) covering service businesses, e-commerce, restaurants, B2B, creators, and health/wellness.
- Industry cards keep LLM-readable blurbs in the HTML; **Learn more** expands the blurb in-card; a second tap collapses back to headline + background image.
- Homepage **Investment** (and `website-pricing.html`) now mounts one-time + ongoing tiers in a legible tab toggle via [`js/pricing-render.js`](../js/pricing-render.js).
- Rewrote customer-facing third-person “SWFT Studios / SWFT helps / SWFT builds” copy to first-person “we” on the homepage, case studies, portfolio data, contact, growth audit, and team pages (brand name kept in titles/schema).

### Added
- [`js/homepage-audience.js`](../js/homepage-audience.js) — expand/collapse behavior for audience cards.

---

## 2026-08-07 — Resend lead emails + Growth Audit Pages Function

### Added
- [`functions/_lib/resend.js`](../functions/_lib/resend.js) — shared Resend send helper
- Growth Audit + contact Forms send team notify to `hello@swftstudios.com` and visitor confirmation via Resend (`RESEND_API_KEY`)
- [`functions/api/growth-audit.js`](../functions/api/growth-audit.js) — Pages Function for `POST /api/growth-audit` (was missing; caused form 405)

### Fixed
- Growth Audit form on production returned “Unable to send right now” because `POST /api/growth-audit` had no Cloudflare Pages Function

### Docs
- Updated [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for Pages Functions + Resend

---

## 2026-08-06 — Offer ladder & pricing overhaul (v2)

### Changed
- Replaced the old Service Pro / Growth / E-Commerce / Content Starter pricing model with a content-capture-scoped offer ladder (Tiers 0–5) in [`data/pricing.json`](../data/pricing.json).
- Homepage hero primary CTA is now **See Pricing** (`#homepage-pricing`). Services section is the one-time offer ladder; Ongoing section covers retainers; Investment mounts the same JSON.
- [`website-pricing.html`](../website-pricing.html), [`services.html`](../services.html), [`js/pricing-render.js`](../js/pricing-render.js), and related CSS updated to the new schema (no monthly/one-time billing toggle).
- Portfolio labels on [`websites.html`](../websites.html), homepage Proven Results, and case-study pages now distinguish **E-Commerce (Shopify)**, **Custom Website Build**, and **Content & Production**.
- Roller Reels and Blurred Lines Entertainment moved out of the website gallery into a **Content & Production** section on `websites.html`.
- Core Home (`corehome.com`) removed from public galleries, marquees, Proven Results, and the case-studies hub index pending operator confirmation that the live flagship site was SWFT-built.

### Added
- Homepage FAQ items: website cost, GBP Content Refresh, contracts, turnaround speed (plus matching FAQ schema).
- Pricing FAQ in `data/pricing.json` aligned to the new ladder.

### Security / trust
- Public copy now pairs every price with concrete scope (content capture vs client-supplied assets) to reduce under/over-selling from cold ad traffic.

---

## 2026-08-06 — Vimeo hero + intro loader

### Changed
- Replaced the Spline 3D hero background with a muted autoplay/loop Vimeo embed (`1216244886` — “NYC View”) on:
  - `index.html`, `websites.html`, `apps.html`, `media.html`, `resources.html`, `swft-tv.html`, `videos.html`
- Added a site intro loader (SWFT wordmark + progress bar + %) that stays up until the Vimeo player is ready, so visitors never see the Vimeo buffering UI.

### Added
- [`css/hero-vimeo-loader.css`](../css/hero-vimeo-loader.css) — cover iframe styles + loader UI
- [`js/hero-vimeo-loader.js`](../js/hero-vimeo-loader.js) — Vimeo Player API gating, soft timeout, connection/reduced-motion fallbacks
- [`images/hero-nyc-view-still.jpg`](../images/hero-nyc-view-still.jpg) — local still from the Vimeo thumbnail for offline / slow / reduced-motion paths

### Removed
- Unused Webflow `page-loader_component` markup and GSAP fake-progress preloader script on `index.html` (was wrapped in `.hide` / `display: none`)

### Fallback behavior
- Offline, Save-Data, `2g` / `slow-2g`, or `prefers-reduced-motion`: skip iframe, show still, dismiss loader quickly
- Soft timeout (~8s): show still and reveal the page
