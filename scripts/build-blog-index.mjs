#!/usr/bin/env node
/**
 * Writes data/blog-posts.json from blog/*.html (<title>, meta description,
 * article:published_time / dateModified if present). The admin dashboard reads it.
 * Run: npm run build:blog-index
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "blog");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const pick = (html, re) => (html.match(re)?.[1] ?? "").trim();

const posts = readdirSync(dir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => {
    const html = readFileSync(join(dir, f), "utf8");
    const slug = f.replace(/\.html$/, "");
    const title = decode(pick(html, /<title>([^<]*)<\/title>/i)).replace(/\s*\|\s*SWFT Studios\s*$/i, "");
    const description = decode(pick(html, /<meta\s+content="([^"]*)"\s+name="description"/i) || pick(html, /<meta\s+name="description"\s+content="([^"]*)"/i));
    const published = pick(html, /"datePublished"\s*:\s*"([^"]+)"/) || pick(html, /property="article:published_time"\s+content="([^"]+)"/);
    // Webflow exports carry "Last Published: <date>"; fall back to file mtime.
    const lp = pick(html, /Last Published:\s*([^>]*?)\s*(?:\(|-->)/);
    const lpDate = lp && !isNaN(new Date(lp)) ? new Date(lp).toISOString().slice(0, 10) : null;
    return { slug, title, description, url: `/blog/${f}`, published: published || null, updated: lpDate || statSync(join(dir, f)).mtime.toISOString().slice(0, 10) };
  })
  .sort((a, b) => (b.published || b.updated).localeCompare(a.published || a.updated));

writeFileSync(join(root, "data", "blog-posts.json"), JSON.stringify(posts, null, 2) + "\n");
console.log(`Wrote data/blog-posts.json (${posts.length} posts)`);
