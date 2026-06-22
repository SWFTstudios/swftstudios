#!/usr/bin/env node
/**
 * Fetch Stitch screen HTML + screenshots for SWFT OS redesign project.
 * Requires STITCH_API_KEY in environment.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stitch } from '@google/stitch-sdk';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'stitch', 'screens');
const PROJECT_ID = '16133987514164461574';

const SCREENS = [
  { slug: 'home', title: 'Home — SWFT Studios', screenId: '824759e3c7c1459182a80cf50444350c' },
  { slug: 'design-system', title: 'Design System', screenId: 'asset-stub-assets_ea3b39effb734085907edfba23ab48de', isDesignSystem: true },
  { slug: 'ventures', title: 'Ventures — SWFT Studios', screenId: '64cee365a860431186a6cfa53d412eae' },
  { slug: 'services', title: 'Services — SWFT Studios', screenId: 'f9658966e6d348fa82a43a8b352a5228' },
  { slug: 'work', title: 'Work — SWFT Studios', screenId: '4eff4d952457490cba2f5a740f909ae3' },
  { slug: 'method', title: 'The SWFT Method — SWFT Studios', screenId: '4950d10f61e04c45a4de9a9642ab6def' },
  { slug: 'pricing', title: 'Pricing — SWFT Studios', screenId: 'fbc3b3de94c74d2c833d9b9564740781' },
  { slug: 'start-a-project', title: 'Start a Project — SWFT Studios', screenId: '5d7f3287fe5c4e6698560fd876bf97aa' },
  { slug: 'intelligence-hub', title: 'Intelligence Hub — SWFT Studios', screenId: 'b95277f29e61466d9df65ddc893149b9' },
  { slug: 'asymmetric-upside', title: 'Architecting for Asymmetric Upside', screenId: 'a6108a62f706478795e38393972ae428' },
];

async function curlDownload(url, dest) {
  await execFileAsync('curl', ['-fsSL', url, '-o', dest]);
}

async function fetchDesignSystem() {
  const raw = await stitch.callTool('list_design_systems', { projectId: PROJECT_ID });
  const systems = raw?.designSystems || [];
  const match = systems.find((ds) => {
    const id = ds.name?.split('/').pop() || ds.id || '';
    return id.includes('ea3b39effb734085907edfba23ab48de') || SCREENS[1].screenId.includes(id);
  });
  const ds = match || systems[0];
  const dir = path.join(OUT_DIR, 'design-system');
  await mkdir(dir, { recursive: true });
  const designMd = ds?.designSystem?.theme?.designMd;
  if (designMd) {
    await writeFile(path.join(dir, 'DESIGN.md'), designMd, 'utf8');
    console.log('saved design-system/DESIGN.md');
  } else {
    console.warn('design-system: no DESIGN.md in list_design_systems response');
  }
  const screenshotUrl = ds?.designSystem?.theme?.screenshot?.downloadUrl;
  if (screenshotUrl) {
    await curlDownload(screenshotUrl, path.join(dir, 'screen.png'));
    console.log('saved design-system/screen.png');
  }
}

async function fetchScreen({ slug, screenId, isDesignSystem }) {
  if (isDesignSystem) {
    await fetchDesignSystem();
    return;
  }
  const project = stitch.project(PROJECT_ID);
  const screen = await project.getScreen(screenId);
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();
  const dir = path.join(OUT_DIR, slug);
  await mkdir(dir, { recursive: true });

  if (htmlUrl) {
    await curlDownload(htmlUrl, path.join(dir, 'code.html'));
    console.log(`saved ${slug}/code.html`);
  } else {
    console.warn(`${slug}: no HTML download URL`);
  }

  if (imageUrl) {
    await curlDownload(imageUrl, path.join(dir, 'screen.png'));
    console.log(`saved ${slug}/screen.png`);
  } else {
    console.warn(`${slug}: no screenshot download URL`);
  }
}

async function writeManifest() {
  const manifest = {
    projectId: PROJECT_ID,
    projectTitle: 'SWFT OS: Venture Studio Redesign',
    fetchedAt: new Date().toISOString(),
    screens: SCREENS.map(({ slug, title, screenId }) => ({
      slug,
      title,
      screenId,
      codePath: slug === 'design-system' ? null : `stitch/screens/${slug}/code.html`,
      imagePath: `stitch/screens/${slug}/screen.png`,
      designMdPath: slug === 'design-system' ? 'stitch/screens/design-system/DESIGN.md' : null,
    })),
  };
  await mkdir(path.join(ROOT, 'stitch'), { recursive: true });
  await writeFile(path.join(ROOT, 'stitch', 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('saved stitch/manifest.json');
}

async function main() {
  if (!process.env.STITCH_API_KEY) {
    console.error('STITCH_API_KEY is required');
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });
  for (const entry of SCREENS) {
    try {
      await fetchScreen(entry);
    } catch (err) {
      console.error(`failed ${entry.slug}:`, err?.message || err);
    }
  }
  await writeManifest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
