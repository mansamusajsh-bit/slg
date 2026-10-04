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
  'campaignRegions.js',
  'config.js',
  'skillEngine.js',
  'skillEditor.js',
  'dialogueLines.js',
  'skill-system.css',
  'ui.js',
  'game.js',
  'shareEngine.js',
  'fedEngine.js',
  'nationShares.js',
  'fedSystem.js',
  'campaignMap.js',
  'civ4-editor.js',
  'assets', // 작전지도 배경 일러스트 등 이미지
  'audio', // 사망회귀 연출 (Web Audio 합성, 외부 음원 없음)
  'supabase-bridge.js', 'supabase-config.js',
  // DEV 데이터 에디터: rewardEngine.js(순수 로직)와 editors/ 폴더는 에디터 탭을 열 때 import()로만 로드된다.
  'rewardEngine.js',
  'editors',
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
