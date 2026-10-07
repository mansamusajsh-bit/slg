// index.html이 불러오는 로컬 스크립트·스타일이 Vercel 배포(dist/)에 모두 복사되는지 확인한다.
// 빠지면 로컬에서는 되고 실제 게임에서만 조용히 안 되는 일이 생긴다 (예: nationRuleBriefs.js).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const build = fs.readFileSync(path.join(root, 'scripts/vercel-static-build.mjs'), 'utf8');
const listed = new Set([...build.matchAll(/'([^']+)'/g)].map((m) => m[1]));
const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('/src/') && !u.startsWith('./src/'));
const missing = refs.filter((u) => {
  const top = u.replace(/^\.?\//, '').split('/')[0];
  return !listed.has(top) && fs.existsSync(path.join(root, top));
});
if (missing.length) {
  console.error('FAIL 배포 목록(scripts/vercel-static-build.mjs)에 빠진 파일:', missing.join(', '));
  process.exit(1);
}
console.log(`OK 배포 파일 목록: index.html이 참조하는 ${refs.length}개 모두 포함`);
