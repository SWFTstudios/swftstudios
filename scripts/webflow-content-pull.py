#!/usr/bin/env python3
"""Process Webflow CMS exports into local data/ JSON and images/webflow/ assets."""

from __future__ import annotations

import json
import re
import subprocess
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / ".cms-cache"
IMAGES = ROOT / "images" / "webflow"

SITE_PRIMARY = "676080bdaff718521e956a12"
SITE_CMS = "688e7554265d8089278ca76e"

INSIGHT_SLUGS = {
    "google-business-profile-local-seo-2026",
    "social-media-content-2026",
    "ai-answer-engine-optimization-2026",
    "reputation-management-2026",
    "digital-marketing-blind-spots-2026",
}

CATEGORY_MAP = {"3c5496bc20a0df88bbce4c1badf61139": "Web Design"}

SWFT_PROJECT_SLUGS = {
    "roller-reels", "snooze-lane", "built-by-me-ez", "core-home", "hamper",
    "hawthorne-global-ministries", "blurred-lines-entertainment", "flare-nj",
    "whp-digital", "scribble-and-scribe", "manna-hydration", "thyme-table",
    "tal-hydration", "kiosk", "swft-studios",
}

PAGES_2025 = {
    "siteId": SITE_PRIMARY,
    "siteName": "SWFT 2025 FINAL",
    "pages": [
        {"id": "6878cf2e81ba9e244990520a", "title": "Sign Up", "slug": "sign-up", "seo": {"title": "SWFT Studios | Sign Up", "description": "STRATEGIC WORKFLOWS FACILITATING TRANSFORMATION"}, "publishedPath": "/sign-up"},
        {"id": "6878ce5bc1263528c0d32958", "title": "Sign In", "slug": "sign-in", "seo": {"title": "SWFT Studios Playground | Sign In", "description": "STRATEGIC WORKFLOWS FACILITATING TRANSFORMATION"}, "publishedPath": "/sign-in"},
        {"id": "6878cc00e940d4d71e539c76", "title": "Start A Project", "slug": "start-a-project", "seo": {"title": "SWFT Studios | Start A Project", "description": "STRATEGIC WORKFLOWS FACILITATING TRANSFORMATION"}, "publishedPath": "/start-a-project"},
        {"id": "68753a08620e8edac584f386", "title": "Contact Us", "slug": "contact-us", "seo": {"title": "SWFT Studios | Contact Us", "description": "STRATEGIC WORKFLOWS FACILITATING TRANSFORMATION"}, "publishedPath": "/contact-us"},
        {"id": "678c85b7a95808fdf88011f3", "title": "Services", "slug": "services", "seo": {"title": "Services"}, "publishedPath": "/services"},
        {"id": "678c8531dbbed3f790e082f9", "title": "About Us", "slug": "about-us", "seo": {"title": "About Us"}, "publishedPath": "/about-us"},
        {"id": "678593093f2ef0c10c8c43d7", "title": "Resources", "slug": "resources", "seo": {"title": "Resources"}, "publishedPath": "/resources"},
        {"id": "676080bdaff718521e956aa1", "title": "Style Guide", "slug": "style-guide", "seo": {"title": "Style Guide"}, "publishedPath": "/style-guide"},
        {"id": "676080bdaff718521e956aa0", "title": "Home", "slug": "", "seo": {"title": "SWFT STUDIOS", "description": "STRATEGIC WORKFLOWS FACILITATING TRANSFORMATION"}, "publishedPath": "/"},
    ],
}

PAGES_CMS = {
    "siteId": SITE_CMS,
    "siteName": "SWFT STUDIOS 000 FINAL FOREVER",
    "note": "Primary CMS source for Projects, Videos, and Articles collections",
    "pages": [
        {"title": "Home", "slug": "", "seo": {"title": "SWFT Studios — Websites & Growth Systems for Service Businesses", "description": "We build the website and the system that makes it produce."}, "publishedPath": "/"},
        {"title": "Case Studies", "slug": "case-studies", "seo": {"title": "Case Studies | SWFT Studios"}, "publishedPath": "/case-studies"},
        {"title": "Articles", "slug": "articles-index", "seo": {"title": "Articles | SWFT Studios", "description": "Articles, case studies, and insights from SWFT Studios."}, "publishedPath": "/articles-index"},
        {"title": "Websites", "slug": "websites", "seo": {"title": "Websites"}, "publishedPath": "/websites"},
        {"title": "Pricing", "slug": "pricing", "seo": {"title": "Pricing — The SWFT Growth System | SWFT Studios"}, "publishedPath": "/pricing"},
        {"title": "Services", "slug": "services", "seo": {"title": "Services — What We Build | SWFT Studios"}, "publishedPath": "/services"},
        {"title": "Contact", "slug": "contact", "seo": {"title": "Contact SWFT Studios — Book a Free Audit"}, "publishedPath": "/contact"},
    ],
}


def load_cache(name: str) -> list:
    path = CACHE / f"{name}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def strip_html(html: str | None, max_len: int = 200) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        return text[: max_len - 1].rstrip() + "…"
    return text


def url_to_filename(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    name = urllib.parse.unquote(path.split("/")[-1])
    return re.sub(r"[^\w.\-]", "_", name) or "asset.bin"


def collect_image_urls(obj, urls: dict[str, str]) -> None:
    if isinstance(obj, dict):
        if obj.get("url") and obj.get("fileId"):
            urls[obj["fileId"]] = obj["url"]
        for v in obj.values():
            collect_image_urls(v, urls)
    elif isinstance(obj, list):
        for item in obj:
            collect_image_urls(item, urls)
    elif isinstance(obj, str):
        for m in re.finditer(r'https?://[^\s"\'<>]+', obj):
            url = m.group(0)
            if re.search(r"\.(png|jpe?g|webp|gif|svg)(\?|$)", url, re.I):
                fid = url.rstrip("/").split("/")[-2]
                urls.setdefault(fid, url)


def download_assets(urls: dict[str, str]) -> dict[str, dict]:
    IMAGES.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}
    existing_webflow = {p.name for p in IMAGES.iterdir()} if IMAGES.exists() else set()
    existing_images = {p.name for p in (ROOT / "images").iterdir() if p.is_file()}

    for file_id, url in sorted(urls.items()):
        filename = url_to_filename(url)
        local_rel = f"images/webflow/{filename}"
        local_abs = ROOT / local_rel

        if filename in existing_webflow:
            manifest[file_id] = {"id": file_id, "hostedUrl": url, "originalFileName": filename, "localPath": local_rel, "skipped": "already_exists"}
            continue
        if filename in existing_images:
            manifest[file_id] = {"id": file_id, "hostedUrl": url, "originalFileName": filename, "localPath": f"images/{filename}", "skipped": "already_exists"}
            continue

        if not local_abs.exists():
            try:
                subprocess.run(["curl", "-fsSL", url, "-o", str(local_abs)], check=True, timeout=120)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as err:
                manifest[file_id] = {"id": file_id, "hostedUrl": url, "originalFileName": filename, "localPath": None, "error": str(err)}
                continue

        manifest[file_id] = {"id": file_id, "hostedUrl": url, "originalFileName": filename, "localPath": local_rel}

    og_url = f"https://cdn.prod.website-files.com/{SITE_PRIMARY}/67acff0514af61b7afb59700_swft_opengraph.jpg"
    og_name = "swft_opengraph.jpg"
    og_path = IMAGES / og_name
    if not og_path.exists():
        try:
            subprocess.run(["curl", "-fsSL", og_url, "-o", str(og_path)], check=True, timeout=60)
        except subprocess.CalledProcessError:
            pass
    if og_path.exists():
        manifest["67acff0514af61b7afb59700"] = {
            "id": "67acff0514af61b7afb59700",
            "hostedUrl": og_url,
            "originalFileName": og_name,
            "localPath": f"images/webflow/{og_name}",
        }

    return manifest


def local_path_for_image(field: dict | None, manifest: dict[str, dict]) -> str | None:
    if not field or not field.get("fileId"):
        return None
    entry = manifest.get(field["fileId"])
    if entry and entry.get("localPath"):
        return entry["localPath"]
    if field.get("url"):
        return f"images/webflow/{url_to_filename(field['url'])}"
    return None


def merge_projects(cms_projects: list, manifest: dict[str, dict]) -> list:
    with open(DATA / "projects.json") as f:
        canonical = json.load(f)
    by_slug = {p["id"]: p for p in canonical}

    swft_cms = [
        item for item in cms_projects
        if item.get("fieldData", {}).get("slug") in SWFT_PROJECT_SLUGS
        or item.get("fieldData", {}).get("design-team") == "SWFT Studios"
    ]

    for item in swft_cms:
        fd = item["fieldData"]
        slug = fd["slug"]
        thumb = local_path_for_image(fd.get("thumbnail"), manifest)
        live = fd.get("project-url")
        desc = fd.get("description") or strip_html(fd.get("body"))

        if slug in by_slug:
            entry = by_slug[slug]
            if thumb:
                entry["thumb"] = thumb
            if live:
                entry["liveUrl"] = live
            if desc:
                entry["problem"] = desc
        else:
            by_slug[slug] = {
                "id": slug,
                "name": fd.get("name", slug),
                "category": CATEGORY_MAP.get(fd.get("category"), "Web Design"),
                "thumb": thumb or f"images/project-thumbnails/{slug}.svg",
                "liveUrl": live,
                "href": f"case-study/{slug}.html" if (ROOT / "case-study" / f"{slug}.html").exists() else f"work.html#{slug}",
                "problem": desc or "Client project from Webflow CMS.",
                "system": strip_html(fd.get("body"), 120) or "Custom Webflow build.",
                "impact": "Stronger digital presence and conversion path.",
                "featured": (fd.get("sorting-order") or 99) <= 5,
            }

    result = list(by_slug.values())
    result.sort(key=lambda p: (not p.get("featured", False), p.get("name", "")))
    return result


def merge_case_studies(cms_articles: list, manifest: dict[str, dict]) -> list:
    with open(DATA / "case-studies-index.json") as f:
        canonical = json.load(f)
    by_slug = {a["slug"]: a for a in canonical}

    for item in cms_articles:
        fd = item["fieldData"]
        slug = fd["slug"]
        if slug in INSIGHT_SLUGS:
            continue
        img = local_path_for_image(fd.get("image"), manifest)
        details = strip_html(fd.get("details"), 180)
        entry = {
            "type": "article",
            "name": fd.get("name", slug),
            "slug": slug,
            "href": f"case-study/{slug}.html",
            "image": img or "images/swft-thumbnail.webp",
            "details": details,
            "branding": bool(fd.get("branding")),
            "website": bool(fd.get("website")),
            "film": bool(fd.get("film")),
        }
        if slug in by_slug:
            by_slug[slug].update({k: v for k, v in entry.items() if v})
        else:
            by_slug[slug] = entry

    return list(by_slug.values())


def build_blog_posts(cms_articles: list, manifest: dict[str, dict]) -> list:
    posts = []
    for item in cms_articles:
        fd = item["fieldData"]
        slug = fd["slug"]
        img = local_path_for_image(fd.get("image"), manifest)
        posts.append({
            "id": item["id"],
            "slug": slug,
            "name": fd.get("name"),
            "href": f"case-study/{slug}.html",
            "image": img,
            "excerpt": strip_html(fd.get("details"), 220),
            "publishedAt": item.get("lastPublished") or item.get("createdOn"),
            "tags": {
                "branding": bool(fd.get("branding")),
                "website": bool(fd.get("website")),
                "film": bool(fd.get("film")),
                "automation": bool(fd.get("automation")),
            },
            "isInsight": slug in INSIGHT_SLUGS,
        })
    posts.sort(key=lambda p: p.get("publishedAt") or "", reverse=True)
    return posts


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)

    projects = load_cache("projects")
    videos = load_cache("videos")
    articles = load_cache("articles")

    if not articles:
        agent_articles = Path.home() / ".cursor/projects/Users-elombe-kisala-CURSOR-PROJECT-BUILDS-swftstudios/agent-tools/0c1941b8-bbf5-48b3-9edd-5b31ec901185.txt"
        if agent_articles.exists():
            articles = json.loads(agent_articles.read_text())["result"]["items"]
            (CACHE / "articles.json").write_text(json.dumps(articles, indent=2) + "\n")

    webflow_pages = {
        "pulledAt": "2026-06-14",
        "sites": [PAGES_2025, PAGES_CMS],
        "collections": [
            {"id": "688e7554265d8089278ca797", "slug": "project", "displayName": "Projects", "siteId": SITE_CMS},
            {"id": "688e7554265d8089278ca7ac", "slug": "video", "displayName": "Videos", "siteId": SITE_CMS},
            {"id": "69f521cf3246ec07037d9d43", "slug": "articles", "displayName": "Articles", "siteId": SITE_CMS},
        ],
        "notes": [
            f"Site {SITE_PRIMARY} (SWFT 2025 FINAL) has no CMS collections; marketing pages only.",
            f"CMS content pulled from site {SITE_CMS} (SWFT STUDIOS 000 FINAL FOREVER).",
        ],
    }
    (DATA / "webflow-pages.json").write_text(json.dumps(webflow_pages, indent=2) + "\n")

    (DATA / "projects-webflow.json").write_text(json.dumps({
        "collectionId": "688e7554265d8089278ca797",
        "siteId": SITE_CMS,
        "items": projects,
    }, indent=2) + "\n")

    (DATA / "videos-webflow.json").write_text(json.dumps({
        "collectionId": "688e7554265d8089278ca7ac",
        "siteId": SITE_CMS,
        "items": videos,
    }, indent=2) + "\n")

    (DATA / "blog-posts-raw.json").write_text(json.dumps({
        "collectionId": "69f521cf3246ec07037d9d43",
        "siteId": SITE_CMS,
        "items": articles,
    }, indent=2) + "\n")

    (DATA / "case-studies-webflow.json").write_text(json.dumps({
        "collectionId": "69f521cf3246ec07037d9d43",
        "siteId": SITE_CMS,
        "filter": "articles excluding insight-only posts",
        "items": [i for i in articles if i.get("fieldData", {}).get("slug") not in INSIGHT_SLUGS],
    }, indent=2) + "\n")

    urls: dict[str, str] = {}
    for bucket in (projects, videos, articles):
        collect_image_urls(bucket, urls)
    manifest = download_assets(urls)
    (DATA / "webflow-assets.json").write_text(json.dumps({
        "siteIds": [SITE_PRIMARY, SITE_CMS],
        "pulledAt": "2026-06-14",
        "assetCount": len(manifest),
        "assets": manifest,
    }, indent=2) + "\n")

    (DATA / "projects.json").write_text(json.dumps(merge_projects(projects, manifest), indent=2) + "\n")
    (DATA / "case-studies-index.json").write_text(json.dumps(merge_case_studies(articles, manifest), indent=2) + "\n")
    (DATA / "blog-posts.json").write_text(json.dumps(build_blog_posts(articles, manifest), indent=2) + "\n")

    print(f"projects={len(projects)} videos={len(videos)} articles={len(articles)} assets={len(manifest)}")


if __name__ == "__main__":
    main()
