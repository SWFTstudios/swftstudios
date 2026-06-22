#!/usr/bin/env node
/**
 * Capture hero screenshots for portfolio projects and generate responsive WebP variants.
 * Usage: node scripts/capture-portfolio-thumbnails.mjs [--only=slug1,slug2]
 */
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const projects = JSON.parse(readFileSync(join(ROOT, 'data/portfolio-projects.json'), 'utf8'));
const VARIANT_WIDTHS = [500, 800, 1080, 1600, 2000, 2600, 3200];

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlySlugs = onlyArg ? onlyArg.replace('--only=', '').split(',').filter(Boolean) : null;

const forceAll = process.argv.includes('--all');

function needsCapture(p) {
  if (forceAll) return true;
  if (!existsSync(join(ROOT, p.image))) return true;
  if (!p.image.endsWith('.webp')) return false;
  const base = p.image.replace(/\.webp$/, '');
  return VARIANT_WIDTHS.some((w) => !existsSync(join(ROOT, `${base}-p-${w}.webp`)));
}

async function captureScreenshot(browser, url, outPath) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 2000));

    const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });
    const ext = outPath.split('.').pop().toLowerCase();

    if (ext === 'webp') {
      await sharp(pngBuffer).webp({ quality: 82 }).toFile(outPath);
    } else if (ext === 'jpg' || ext === 'jpeg') {
      await sharp(pngBuffer).jpeg({ quality: 85 }).toFile(outPath);
    } else if (ext === 'png') {
      await sharp(pngBuffer).png({ compressionLevel: 8 }).toFile(outPath);
    } else {
      throw new Error(`Unsupported extension: ${ext}`);
    }
  } finally {
    await page.close();
  }
}

async function generateVariants(imagePath) {
  if (!imagePath.endsWith('.webp')) return;
  const base = imagePath.replace(/\.webp$/, '');
  const input = join(ROOT, imagePath);
  for (const width of VARIANT_WIDTHS) {
    const out = join(ROOT, `${base}-p-${width}.webp`);
    await sharp(input)
      .resize({ width, withoutEnlargement: false })
      .webp({ quality: 80 })
      .toFile(out);
    console.log('  variant:', `${base}-p-${width}.webp`);
  }
}

async function main() {
  const targets = projects.filter((p) => {
    if (onlySlugs && !onlySlugs.includes(p.slug)) return false;
    return onlySlugs ? true : needsCapture(p);
  });

  if (!targets.length) {
    console.log('No projects need thumbnail capture.');
    return;
  }

  console.log(`Capturing ${targets.length} project thumbnail(s)...`);
  mkdirSync(join(ROOT, 'images'), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const p of targets) {
      const outPath = join(ROOT, p.image);
      console.log(`\n${p.name} (${p.slug})`);
      console.log('  url:', p.liveUrl);
      console.log('  ->', p.image);
      try {
        await captureScreenshot(browser, p.liveUrl, outPath);
        await generateVariants(p.image);
        console.log('  done');
      } catch (err) {
        console.error('  FAILED:', err.message);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\nFinished.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
