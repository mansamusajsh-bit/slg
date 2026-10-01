/**
 * editors/editorCommon.js — DEV 데이터 에디터 공용 도구 (보상 풀 / 유물 / 아이템)
 *
 * 규칙
 *   - 게임 state를 import하거나 참조하지 않는다. 각 에디터는 자기 임시 편집 상태(draft)만 가진다.
 *   - DB 접근은 window.SlgStore(supabase-bridge.js의 공용 저장 계층)만 사용한다.
 *   - 순수 로직은 rewardEngine.js(window.RewardEngine), 난수는 seedEngine.js(window.SeedEngine)를 쓴다.
 *   - 이 파일과 에디터 모듈은 DEV 패널에서 해당 탭을 열 때 import()로만 로드된다.
 */

const CSS_HREF = new URL('./editors.css', import.meta.url).href;

export function ensureEditorCss() {
  if (document.querySelector(`link[data-slg-editor-css]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.dataset.slgEditorCss = '1';
  document.head.appendChild(link);
}

/** rewardEngine.js를 지연 로드한다. (게임 초기 로딩에는 포함되지 않음) */
export async function getEngine() {
  if (!window.RewardEngine) await import(new URL('../rewardEngine.js', import.meta.url).href);
  if (!window.RewardEngine) throw new Error('rewardEngine.js를 불러오지 못했습니다.');
  return window.RewardEngine;
}

/** supabase-bridge.js(type=module)가 늦게 로드될 수 있으므로 잠깐 기다린다. 없으면 에러. */
export async function getStore(timeoutMs = 5000) {
  const started = Date.now();
  while (!window.SlgStore) {
    if (Date.now() - started > timeoutMs) throw new Error('저장 계층(SlgStore)을 찾을 수 없습니다. supabase-bridge.js 로드를 확인하세요.');
    await new Promise(r => setTimeout(r, 100));
  }
  if (!window.SlgStore.isReady) throw new Error('Supabase 설정이 없습니다. supabase-config.js에 URL과 anon key를 입력하세요.');
  return window.SlgStore;
}

export function createSeededRng(seed) {
  if (!window.SeedEngine || typeof window.SeedEngine.createRNG !== 'function') {
    throw new Error('SeedEngine(seedEngine.js)이 없습니다. 시드 RNG 없이는 시뮬레이션하지 않습니다.');
  }
  return window.SeedEngine.createRNG(String(seed));
}

/** 보상 풀 에디터가 드롭다운/검증에 쓰는 실제 데이터 목록. 하나라도 실패하면 throw (빈 목록으로 대체하지 않음). */
export async function loadCatalog(store, engine) {
  const C = engine.COLLECTIONS;
  const [pools, relics, items, characters] = await Promise.all([
    store.list(C.rewardPools), store.list(C.relics), store.list(C.items), store.list(C.characters)
  ]);
  const byName = (a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id));
  return {
    pools: pools.filter(x => x && x.id).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    relics: relics.filter(x => x && x.id).sort(byName),
    items: items.filter(x => x && x.id).sort(byName),
    characters: characters.filter(x => x && x.id).map(c => ({ id: String(c.id), name: c.name || String(c.id) })).sort(byName)
  };
}

/** 간단한 DOM 빌더. attrs: { class, text, on:{event:fn}, dataset:{}, ...그 외 속성/프로퍼티 } */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') Object.entries(v).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'readOnly') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** <select> 생성. 현재 값이 옵션에 없으면 "(없음)" 옵션으로 보여 줘서 검증 오류가 눈에 띄게 한다. */
export function selectEl(options, value, onChange, { placeholder, className = 'slg-ed-input' } = {}) {
  const sel = h('select', { class: className, on: { change: (e) => onChange(e.target.value) } });
  if (placeholder !== undefined) sel.appendChild(h('option', { value: '', text: placeholder }));
  let found = false;
  for (const opt of options) {
    const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    if (String(o.value) === String(value ?? '')) found = true;
    sel.appendChild(h('option', { value: o.value, text: o.label }));
  }
  if (value !== undefined && value !== null && value !== '' && !found) {
    sel.appendChild(h('option', { value, text: `⚠️ (없음) ${value}` }));
  }
  sel.value = value ?? '';
  return sel;
}

/** 숫자 입력. 비우거나 숫자가 아니면 NaN을 넘겨 검증에서 걸리게 한다 (0 등으로 몰래 바꾸지 않음). */
export function numberEl(value, onInput, attrs = {}) {
  return h('input', {
    type: 'number', class: 'slg-ed-input slg-ed-num', value: Number.isFinite(value) ? String(value) : '',
    ...attrs,
    on: { input: (e) => onInput(e.target.value === '' ? NaN : Number(e.target.value)) }
  });
}

export function clone(x) { return JSON.parse(JSON.stringify(x)); }

/** 에디터 상단 상태 표시줄 */
export function createStatusBar() {
  const el = h('div', { class: 'slg-ed-status' });
  return {
    el,
    set(message, kind = 'info') {
      el.textContent = message || '';
      el.dataset.kind = kind;
      el.style.display = message ? 'block' : 'none';
    }
  };
}

/** 검증 결과 목록 렌더링. labelOf(entryIndex) → "항목 #2" 같은 접두어 */
export function renderValidation(container, report, labelOf) {
  container.innerHTML = '';
  if (!report) return;
  const { errors = [], warnings = [] } = report;
  if (!errors.length && !warnings.length) {
    container.appendChild(h('div', { class: 'slg-ed-ok', text: '✅ 검증 통과 — 저장할 수 있습니다.' }));
    return;
  }
  const list = h('ul', { class: 'slg-ed-issues' });
  for (const e of errors) list.appendChild(h('li', { class: 'err', text: `❌ ${labelOf(e.entryIndex)}${e.message}` }));
  for (const w of warnings) list.appendChild(h('li', { class: 'warn', text: `⚠️ ${labelOf(w.entryIndex)}${w.message}` }));
  container.appendChild(list);
}

export function errorText(err) {
  return (err && (err.message || err.error_description)) || String(err);
}

/**
 * 목록 + 편집 폼 레이아웃의 공통 툴바/목록. 각 에디터가 콜백만 넘긴다.
 * 변경 사항이 있을 때 다른 레코드로 이동하면 확인창을 띄운다.
 */
export function confirmDiscard(dirty) {
  return !dirty || window.confirm('저장하지 않은 변경 사항이 있습니다. 버리고 계속할까요?');
}
