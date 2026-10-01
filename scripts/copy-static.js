import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'dist');

const STATIC_FILES = [
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
  'supabase-bridge.js',
  'supabase-config.js',
  'rewardEngine.js',
];

// 폴더 단위로 복사 (DEV 에디터 모듈은 import()로 지연 로드)
const STATIC_DIRS = ['editors'];

export function copyStaticFiles() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  for (const file of STATIC_FILES) {
    const src = join(ROOT, file);
    if (!existsSync(src)) {
      continue;
    }
    copyFileSync(src, join(OUT_DIR, file));
  }
  for (const dir of STATIC_DIRS) {
    const src = join(ROOT, dir);
    if (existsSync(src)) cpSync(src, join(OUT_DIR, dir), { recursive: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('copy-static.js')) {
  copyStaticFiles();
  console.log(`✅ Static game files copied to dist/`);
}
