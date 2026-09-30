// scripts/copy-static.js
//
// 이 프로젝트의 "진짜" 게임은 index.html + game.js 등 순수 HTML/CSS/JS로 되어 있고,
// src/ 아래의 React(Vite) 코드는 더 이상 쓰이지 않는 예전 버전입니다.
//
// Vercel이 package.json을 보고 자동으로 "Vite 프로젝트"로 인식해서
// `vite build`를 돌리면 src/main.tsx 쪽(안 쓰는 React 데모)이 빌드되어
// 실제 게임이 아닌 엉뚱한 화면이 배포될 위험이 있습니다.
//
// 그래서 build 스크립트를 vite build 대신 이걸로 교체해서,
// 실제로 index.html이 참조하는 정적 파일들만 dist/ 로 그대로 복사합니다.
// (번들링/변환 없음 → 원본 그대로 배포되어 동작이 100% 동일함)

import { existsSync, mkdirSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'dist');

// index.html이 실제로 <link>/<script>로 참조하는 파일들
const STATIC_FILES = [
  'index.html',
  'style.css',
  'civ4-editor.css',
  'config.js',
  'ui.js',
  'dbManager.js',
  'game.js',
  'civ4-editor.js',
  'firebase-bridge.js',
];

function main() {
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const missing = [];
  for (const file of STATIC_FILES) {
    const src = join(ROOT, file);
    if (!existsSync(src)) {
      missing.push(file);
      continue;
    }
    copyFileSync(src, join(OUT_DIR, file));
  }

  if (missing.length > 0) {
    console.error('❌ 다음 파일을 찾을 수 없습니다 (index.html에서 참조하는 파일인지 확인하세요):');
    for (const f of missing) console.error('  - ' + f);
    process.exit(1);
  }

  console.log(`✅ ${STATIC_FILES.length}개 파일을 dist/ 로 복사했습니다. (배포 대상: 순수 정적 게임, React 데모 아님)`);
}

main();
