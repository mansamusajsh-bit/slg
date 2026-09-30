import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const dist = join(root, 'dist');

const files = [
  'index.html',
  'style.css',
  'civ4-editor.css',
  'seedEngine.js',
  'mapSchema.js',
  'runEngine.js',
  'config.js',
  'skillEngine.js',
  'skillEditor.js',
  'skill-system.css',
  'ui.js',
  'game.js',
  'civ4-editor.js',
  'supabase-bridge.js', 'supabase-config.js',
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of files) {
  const src = join(root, file);
  if (existsSync(src)) {
    cpSync(src, join(dist, file), { recursive: true });
  }
}

// Keep the generated/reference engine files available for the in-game code viewer
// and any future static references.
const publicDir = join(root, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, join(dist, 'public'), { recursive: true });
}

console.log(`Vercel static build complete: ${readdirSync(dist).length} top-level items copied to dist/`);
