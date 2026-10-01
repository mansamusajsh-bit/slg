/**
 * editors/rewardPoolEditor.js — 보상 풀(rewardPools) 에디터 + 시뮬레이션 패널
 *
 * DEV 패널의 "🎁 보상 풀" 탭을 처음 열 때 import()로 로드된다.
 * 게임 state는 읽지도 쓰지도 않는다. 편집 중인 풀은 이 모듈의 draft에만 있다.
 * 뽑기는 RewardEngine.rollRewardPool(순수 함수) + SeedEngine.createRNG(seed)로만 한다.
 */
import {
  ensureEditorCss, getEngine, getStore, loadCatalog, createSeededRng,
  h, selectEl, numberEl, clone, createStatusBar, renderValidation, errorText, confirmDiscard
} from './editorCommon.js';

const TYPE_LABELS = { gold: '💰 골드', item: '📦 아이템', relic: '💎 유물', recruit: '🧑 영입' };
const KIND_LABELS = { commander: '지휘관', gift: '선물' };
const MAX_SIM_TIMES = 100000;

class RewardPoolEditor {
  constructor(root, engine) {
    this.root = root;
    this.engine = engine;
    this.store = null;
    this.catalog = { pools: [], relics: [], items: [], characters: [] };
    this.draft = null;
    this.isNew = false;
    this.dirty = false;
    this.sim = { seed: 'SIM-0001', times: 1000, owned: [], result: null };
    this.status = createStatusBar();
  }

  get C() { return this.engine.COLLECTIONS; }

  async init() {
    this.root.innerHTML = '';
    this.root.appendChild(h('div', { class: 'slg-ed-loading', text: '⏳ 보상 풀 데이터를 불러오는 중...' }));
    try {
      this.store = await getStore();
      this.catalog = await loadCatalog(this.store, this.engine);
      this.render();
    } catch (err) {
      this.renderFatal(err);
    }
  }

  /** 다른 탭(유물/아이템)에서 데이터가 바뀌었을 수 있으므로 탭 재진입 시 목록만 다시 읽는다. draft는 유지. */
  async refreshCatalog() {
    try {
      if (!this.store) this.store = await getStore();
      this.catalog = await loadCatalog(this.store, this.engine);
      this.render();
    } catch (err) {
      this.renderFatal(err);
    }
  }

  renderFatal(err) {
    this.root.innerHTML = '';
    this.root.appendChild(h('div', { class: 'slg-ed' }, [
      h('div', { class: 'slg-ed-status', dataset: { kind: 'error' }, text: `❌ 데이터를 불러오지 못했습니다: ${errorText(err)}` }),
      h('button', { class: 'slg-ed-btn', text: '🔄 다시 시도', on: { click: () => this.init() } })
    ]));
    console.error('[RewardPoolEditor]', err);
  }

  // ------------------------------------------------------------------ 동작
  newPool() {
    if (!confirmDiscard(this.dirty)) return;
    this.draft = { id: '', name: '', rolls: 1, allowDuplicates: false, entries: [] };
    this.isNew = true;
    this.dirty = false;
    this.sim.result = null;
    this.status.set('새 보상 풀입니다. id와 이름을 정하고 항목을 추가하세요.', 'info');
    this.render();
  }

  async loadPool(id) {
    if (!confirmDiscard(this.dirty)) return;
    try {
      const raw = await this.store.load(this.C.rewardPools, id);
      this.draft = clone(this.engine.normalizeRewardPool(raw));
      this.isNew = false;
      this.dirty = false;
      this.sim.result = null;
      this.status.set(`📂 [${id}] 불러옴`, 'info');
    } catch (err) {
      this.status.set(`❌ 불러오기 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  duplicatePool() {
    if (!this.draft) return;
    const suggested = `${this.draft.id || 'pool'}-copy`;
    const newId = window.prompt('복제본의 새 id를 입력하세요 (영문/숫자/_/-)', suggested);
    if (newId === null) return;
    const id = newId.trim();
    const idErr = this.engine.validateRewardPool({ id, name: 'x', rolls: 1, allowDuplicates: false, entries: [] }, {})
      .errors.find(e => e.field === 'id');
    if (idErr) { this.status.set(`❌ ${idErr.message}`, 'error'); return; }
    if (this.catalog.pools.some(p => p.id === id)) { this.status.set(`❌ 이미 존재하는 풀 id입니다: ${id}`, 'error'); return; }
    this.draft = { ...clone(this.draft), id, name: `${this.draft.name || ''} (복제)` };
    this.isNew = true;
    this.dirty = true;
    this.sim.result = null;
    this.status.set(`📄 [${id}] 복제본을 만들었습니다. 저장해야 반영됩니다.`, 'info');
    this.render();
  }

  async deletePool() {
    if (!this.draft) return;
    if (this.isNew) {
      if (!confirmDiscard(true)) return;
      this.draft = null; this.dirty = false; this.isNew = false;
      this.status.set('저장하지 않은 새 풀을 버렸습니다.', 'info');
      this.render();
      return;
    }
    const id = this.draft.id;
    const refs = this.engine.findReferences('pool', id, this.catalog.pools.filter(p => p.id !== id));
    if (refs.length) {
      this.status.set(`❌ 삭제 불가: 다른 풀이 참조 중입니다 → ${refs.map(r => `${r.poolId} #${r.entryIndex + 1}`).join(', ')}`, 'error');
      return;
    }
    if (!window.confirm(`보상 풀 [${id}]을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await this.store.remove(this.C.rewardPools, id);
      this.draft = null; this.dirty = false; this.isNew = false;
      this.catalog = await loadCatalog(this.store, this.engine);
      this.status.set(`🗑️ [${id}] 삭제했습니다.`, 'success');
    } catch (err) {
      this.status.set(`❌ 삭제 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  validateDraft() {
    if (!this.draft) return null;
    return this.engine.validateRewardPool(this.engine.normalizeRewardPool(this.draft), this.catalog);
  }

  async savePool() {
    if (!this.draft) return;
    const pool = this.engine.normalizeRewardPool(this.draft);
    const report = this.validateDraft();
    this.refreshDerived();
    if (!report.valid) {
      this.status.set(`❌ 검증 오류 ${report.errors.length}건 — 저장하지 않았습니다. 아래 목록을 확인하세요.`, 'error');
      return;
    }
    try {
      if (this.isNew && await this.store.exists(this.C.rewardPools, pool.id)) {
        this.status.set(`❌ 이미 존재하는 풀 id입니다: ${pool.id} (덮어쓰지 않음)`, 'error');
        return;
      }
      // 저장 직전 최신 목록으로 다시 검증 (다른 사람이 참조 대상을 지웠을 수 있음)
      this.catalog = await loadCatalog(this.store, this.engine);
      await this.store.save(this.C.rewardPools, pool.id, pool, p => this.engine.validateRewardPool(p, this.catalog));
      this.catalog = await loadCatalog(this.store, this.engine);
      this.isNew = false;
      this.dirty = false;
      this.status.set(`💾 [${pool.id}] 저장했습니다.`, 'success');
    } catch (err) {
      this.status.set(`❌ 저장 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  /** 기본 보상 데이터(editors/seedData.js) 가져오기. 이미 있는 id는 건너뛰고, 전부 검증된 경우에만 저장한다. */
  async importSeed() {
    try {
      this.status.set('⏳ 기본 데이터를 확인하는 중...', 'info');
      const [seed, importer] = await Promise.all([import('./seedData.js'), import('./seedImporter.js')]);
      const plan = await importer.planSeedImport(this.store, this.engine, seed);
      const { add, skipped, problems } = plan;
      if (problems.length) {
        this.status.set(`❌ 기본 데이터가 기존 데이터와 맞지 않아 가져오지 않았습니다 (${problems.length}건). 예: ${problems[0]}`, 'error');
        console.error('[기본 데이터 가져오기] 검증 실패', problems);
        return;
      }
      const total = add.items.length + add.relics.length + add.pools.length;
      if (total === 0) { this.status.set('ℹ️ 기본 데이터가 이미 모두 들어 있습니다.', 'info'); return; }
      const msg = `기본 데이터를 추가합니다.\n\n아이템 ${add.items.length}개 (이미 있음 ${skipped.items})\n유물 ${add.relics.length}개 (이미 있음 ${skipped.relics})\n보상 풀 ${add.pools.length}개 (이미 있음 ${skipped.pools})\n\n이미 있는 id는 덮어쓰지 않습니다. 계속할까요?`;
      if (!window.confirm(msg)) { this.status.set('가져오기를 취소했습니다.', 'info'); return; }
      const done = await importer.runSeedImport(this.store, this.engine, plan, (m) => this.status.set(`⏳ ${m}`, 'info'));
      this.catalog = await loadCatalog(this.store, this.engine);
      this.status.set(`📥 기본 데이터 추가 완료: 아이템 ${done.items} · 유물 ${done.relics} · 보상 풀 ${done.pools}`, 'success');
    } catch (err) {
      this.status.set(`❌ 가져오기 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  markDirty() { this.dirty = true; this.sim.result = null; this.refreshDerived(); }

  addEntry(type = 'gold') {
    this.draft.entries.push(this.defaultEntry(type, 10));
    this.markDirty();
    this.render();
  }

  defaultEntry(type, weight) {
    if (type === 'gold') return { type, min: 10, max: 50, weight };
    if (type === 'relic') return { type, kind: 'gift', id: '', weight };
    return { type, id: '', weight };
  }

  // ------------------------------------------------------------------ 렌더링
  render() {
    this.root.innerHTML = '';
    const wrap = h('div', { class: 'slg-ed' });
    wrap.appendChild(h('div', { class: 'slg-ed-banner' }, [
      h('strong', { text: '🎁 보상 풀 에디터' }),
      h('span', { text: ' — rewardPools 컬렉션. 저장 전 검증을 통과해야 합니다.' })
    ]));
    wrap.appendChild(this.status.el);
    wrap.appendChild(this.renderList());
    if (this.draft) {
      wrap.appendChild(this.renderForm());
      wrap.appendChild(this.renderEntries());
      this.validationBox = h('div', { class: 'slg-ed-section slg-ed-validation' });
      wrap.appendChild(this.validationBox);
      wrap.appendChild(this.renderSimulation());
    } else {
      wrap.appendChild(h('div', { class: 'slg-ed-empty', text: '목록에서 풀을 고르거나 ➕ 새로 만들기를 누르세요.' }));
    }
    this.root.appendChild(wrap);
    this.refreshDerived();
  }

  renderList() {
    const section = h('div', { class: 'slg-ed-section' });
    section.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
      h('span', { class: 'slg-ed-title', text: `📚 풀 목록 (${this.catalog.pools.length})` }),
      h('button', { class: 'slg-ed-btn', text: '🔄', title: '목록 새로고침', on: { click: () => this.refreshCatalog() } }),
      h('button', { class: 'slg-ed-btn', text: '📥 기본 데이터 가져오기', title: '유물 100 · 아이템 100 · 보상 풀 기본 세트 (이미 있는 id는 건너뜀)', on: { click: () => this.importSeed() } }),
      h('button', { class: 'slg-ed-btn primary', text: '➕ 새로 만들기', on: { click: () => this.newPool() } })
    ]));
    const list = h('div', { class: 'slg-ed-list' });
    if (!this.catalog.pools.length) list.appendChild(h('div', { class: 'slg-ed-muted', text: '저장된 보상 풀이 없습니다.' }));
    for (const p of this.catalog.pools) {
      const active = this.draft && !this.isNew && this.draft.id === p.id;
      list.appendChild(h('button', {
        class: `slg-ed-list-item${active ? ' active' : ''}`,
        on: { click: () => this.loadPool(p.id) }
      }, [
        h('span', { class: 'id', text: p.id }),
        h('span', { class: 'name', text: p.name || '' }),
        h('span', { class: 'meta', text: `${p.rolls ?? '?'}회 · ${(p.entries || []).length}항목` })
      ]));
    }
    section.appendChild(list);
    return section;
  }

  renderForm() {
    const d = this.draft;
    const section = h('div', { class: 'slg-ed-section' });
    section.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
      h('span', { class: 'slg-ed-title', text: this.isNew ? '🆕 새 풀 (미저장)' : `✏️ ${d.id}${this.dirty ? ' *' : ''}` }),
      h('button', { class: 'slg-ed-btn', text: '📄 복제', disabled: this.isNew && !d.id, on: { click: () => this.duplicatePool() } }),
      h('button', { class: 'slg-ed-btn danger', text: '🗑️ 삭제', on: { click: () => this.deletePool() } }),
      h('button', { class: 'slg-ed-btn success', text: '💾 저장', on: { click: () => this.savePool() } })
    ]));
    const grid = h('div', { class: 'slg-ed-grid2' });
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: 'id' + (this.isNew ? '' : ' (변경 불가 — 복제로 새 id 생성)') }),
      h('input', {
        class: 'slg-ed-input', value: d.id || '', readOnly: !this.isNew, placeholder: '예: A-battle-normal',
        on: { input: (e) => { d.id = e.target.value.trim(); this.markDirty(); } }
      })
    ]));
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: '이름' }),
      h('input', {
        class: 'slg-ed-input', value: d.name || '', placeholder: '예: A지역 일반 전투',
        on: { input: (e) => { d.name = e.target.value; this.markDirty(); } }
      })
    ]));
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: 'rolls (뽑는 횟수)' }),
      numberEl(d.rolls, (v) => { d.rolls = v; this.markDirty(); }, { min: '1', step: '1' })
    ]));
    grid.appendChild(h('label', { class: 'slg-ed-field slg-ed-check' }, [
      h('input', { type: 'checkbox', checked: d.allowDuplicates === true, on: { change: (e) => { d.allowDuplicates = e.target.checked; this.markDirty(); } } }),
      h('span', { text: '한 번의 뽑기 안에서 중복 허용 (allowDuplicates)' })
    ]));
    section.appendChild(grid);
    return section;
  }

  renderEntries() {
    const d = this.draft;
    const section = h('div', { class: 'slg-ed-section' });
    section.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
      h('span', { class: 'slg-ed-title', text: `🎲 항목 (entries) ${d.entries.length}개` }),
      h('span', { class: 'slg-ed-muted', 'data-role': 'weight-total' })
    ]));
    d.entries.forEach((entry, i) => section.appendChild(this.renderEntry(entry, i)));
    const addBar = h('div', { class: 'slg-ed-toolbar' });
    for (const t of this.engine.ENTRY_TYPES) {
      addBar.appendChild(h('button', { class: 'slg-ed-btn', text: `+ ${TYPE_LABELS[t]}`, on: { click: () => this.addEntry(t) } }));
    }
    section.appendChild(addBar);
    return section;
  }

  /** 하위 풀 후보: 자기 자신 제외 + 모든 항목이 부모 entry와 같은 type(relic이면 kind)인 풀 */
  compatiblePools(entry) {
    return this.catalog.pools.filter(p => p.id !== this.draft.id
      && Array.isArray(p.entries) && p.entries.length > 0
      && p.entries.every(se => se && se.type === entry.type && (entry.type !== 'relic' || se.kind === entry.kind)));
  }

  targetOptions(entry) {
    if (entry.type === 'item') return this.catalog.items.map(x => ({ value: x.id, label: `${x.name} (${x.id})` }));
    if (entry.type === 'recruit') return this.catalog.characters.map(x => ({ value: x.id, label: `${x.name} (${x.id})` }));
    if (entry.type === 'relic') {
      return this.catalog.relics.filter(r => r.kind === entry.kind)
        .map(r => ({ value: r.id, label: `${r.name} [${r.rarity}] (${r.id})` }));
    }
    return [];
  }

  renderEntry(entry, i) {
    const row = h('div', { class: 'slg-ed-entry', dataset: { entryIndex: String(i) } });
    const top = h('div', { class: 'slg-ed-entry-row' });
    top.appendChild(h('span', { class: 'slg-ed-idx', text: `#${i + 1}` }));
    top.appendChild(selectEl(this.engine.ENTRY_TYPES.map(t => ({ value: t, label: TYPE_LABELS[t] })), entry.type, (v) => {
      this.draft.entries[i] = this.defaultEntry(v, entry.weight);
      this.markDirty(); this.render();
    }));

    if (entry.type === 'relic') {
      top.appendChild(selectEl(this.engine.RELIC_KINDS.map(k => ({ value: k, label: `${KIND_LABELS[k]} (${k})` })), entry.kind, (v) => {
        entry.kind = v;
        if ('pool' in entry) entry.pool = ''; else entry.id = '';
        this.markDirty(); this.render();
      }));
    }

    if (entry.type === 'gold') {
      top.appendChild(h('span', { class: 'slg-ed-muted', text: 'min' }));
      top.appendChild(numberEl(entry.min, (v) => { entry.min = v; this.markDirty(); }, { min: '0', step: '1' }));
      top.appendChild(h('span', { class: 'slg-ed-muted', text: 'max' }));
      top.appendChild(numberEl(entry.max, (v) => { entry.max = v; this.markDirty(); }, { min: '0', step: '1' }));
    } else {
      const isPool = 'pool' in entry;
      top.appendChild(selectEl([{ value: 'id', label: '특정 대상' }, { value: 'pool', label: '하위 풀에서 뽑기' }], isPool ? 'pool' : 'id', (v) => {
        if (v === 'pool') { delete entry.id; entry.pool = ''; } else { delete entry.pool; entry.id = ''; }
        this.markDirty(); this.render();
      }));
      if (isPool) {
        top.appendChild(selectEl(this.compatiblePools(entry).map(p => ({ value: p.id, label: `${p.name || p.id} (${p.id})` })),
          entry.pool, (v) => { entry.pool = v; this.markDirty(); }, { placeholder: '— 하위 풀 선택 —' }));
      } else {
        top.appendChild(selectEl(this.targetOptions(entry), entry.id, (v) => { entry.id = v; this.markDirty(); },
          { placeholder: entry.type === 'relic' ? `— ${KIND_LABELS[entry.kind] || ''} 유물 선택 —` : '— 선택 —' }));
      }
    }

    top.appendChild(h('span', { class: 'slg-ed-muted', text: 'weight' }));
    top.appendChild(numberEl(entry.weight, (v) => { entry.weight = v; this.markDirty(); }, { min: '0', step: 'any' }));
    top.appendChild(h('span', { class: 'slg-ed-prob', dataset: { role: 'prob' } }));
    top.appendChild(h('button', {
      class: 'slg-ed-btn danger small', text: '✕', title: '항목 삭제',
      on: { click: () => { this.draft.entries.splice(i, 1); this.markDirty(); this.render(); } }
    }));
    row.appendChild(top);
    row.appendChild(h('div', { class: 'slg-ed-entry-errors', dataset: { role: 'errors' } }));
    return row;
  }

  /** 입력할 때마다: 확률 %, 항목별 오류, 검증 목록만 갱신 (포커스 유지를 위해 전체 재렌더링하지 않음) */
  refreshDerived() {
    if (!this.draft) return;
    const probs = this.engine.entryProbabilities(this.draft.entries);
    const total = this.draft.entries.reduce((s, e) => s + (Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 0), 0);
    const totalEl = this.root.querySelector('[data-role="weight-total"]');
    if (totalEl) totalEl.textContent = `weight 합계 ${+total.toFixed(4)}`;
    const report = this.validateDraft();
    this.root.querySelectorAll('.slg-ed-entry').forEach(row => {
      const i = Number(row.dataset.entryIndex);
      const probEl = row.querySelector('[data-role="prob"]');
      if (probEl) probEl.textContent = `${probs[i].toFixed(1)}%`;
      const errs = report.errors.filter(e => e.entryIndex === i);
      row.classList.toggle('invalid', errs.length > 0);
      const box = row.querySelector('[data-role="errors"]');
      if (box) box.textContent = errs.map(e => `❌ ${e.message}`).join('  ');
    });
    if (this.validationBox) {
      renderValidation(this.validationBox, report, (idx) => (idx === null || idx === undefined ? '' : `항목 #${idx + 1}: `));
    }
  }

  renderSimulation() {
    const section = h('div', { class: 'slg-ed-section' });
    section.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
      h('span', { class: 'slg-ed-title', text: '🧪 시뮬레이션 (편집 중인 내용 기준, 저장 불필요)' })
    ]));
    const grid = h('div', { class: 'slg-ed-grid2' });
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: '시드' }),
      h('input', { class: 'slg-ed-input', value: this.sim.seed, on: { input: (e) => { this.sim.seed = e.target.value; } } })
    ]));
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: `뽑기 실행 횟수 N (최대 ${MAX_SIM_TIMES})` }),
      numberEl(this.sim.times, (v) => { this.sim.times = v; }, { min: '1', max: String(MAX_SIM_TIMES), step: '1' })
    ]));
    section.appendChild(grid);

    const commanderRelics = this.catalog.relics.filter(r => r.kind === 'commander');
    if (commanderRelics.length) {
      const owned = h('div', { class: 'slg-ed-chips' }, [h('span', { class: 'slg-ed-muted', text: '보유 중인 지휘관 유물(제외 필터 테스트):' })]);
      for (const r of commanderRelics) {
        owned.appendChild(h('label', { class: 'slg-ed-chip' }, [
          h('input', {
            type: 'checkbox', checked: this.sim.owned.includes(r.id),
            on: { change: (e) => { this.sim.owned = e.target.checked ? [...this.sim.owned, r.id] : this.sim.owned.filter(x => x !== r.id); } }
          }),
          h('span', { text: r.name })
        ]));
      }
      section.appendChild(owned);
    }
    section.appendChild(h('button', { class: 'slg-ed-btn primary', text: '▶ 시뮬레이션 실행', on: { click: () => this.runSimulation() } }));
    this.simBox = h('div', { class: 'slg-ed-sim-result' });
    section.appendChild(this.simBox);
    this.renderSimResult();
    return section;
  }

  runSimulation() {
    const report = this.validateDraft();
    if (!report.valid) {
      this.sim.result = { error: `검증 오류 ${report.errors.length}건을 먼저 고치세요.` };
      this.renderSimResult();
      return;
    }
    const times = this.sim.times;
    if (!Number.isInteger(times) || times < 1 || times > MAX_SIM_TIMES) {
      this.sim.result = { error: `N은 1~${MAX_SIM_TIMES} 사이 정수여야 합니다.` };
      this.renderSimResult();
      return;
    }
    if (!String(this.sim.seed || '').trim()) {
      this.sim.result = { error: '시드를 입력하세요.' };
      this.renderSimResult();
      return;
    }
    try {
      const pool = this.engine.normalizeRewardPool(this.draft);
      const pools = new Map(this.catalog.pools.map(p => [p.id, p]));
      pools.set(pool.id, pool);
      const rng = createSeededRng(this.sim.seed);
      const res = this.engine.simulateRewardPool(pool, rng, times, { pools, ownedCommanderRelicIds: this.sim.owned });
      this.sim.result = { ...res, seed: this.sim.seed, rolls: pool.rolls };
    } catch (err) {
      this.sim.result = { error: errorText(err) };
    }
    this.renderSimResult();
  }

  rewardLabel(row) {
    const find = (list, id) => list.find(x => x.id === id);
    if (row.type === 'gold') {
      const avg = row.count ? (row.goldTotal / row.count).toFixed(1) : '0';
      return `💰 골드 (평균 ${avg}, ${row.goldMin}~${row.goldMax})`;
    }
    if (row.type === 'item') return `📦 ${find(this.catalog.items, row.id)?.name || row.id} (${row.id})`;
    if (row.type === 'recruit') return `🧑 ${find(this.catalog.characters, row.id)?.name || row.id} (${row.id})`;
    if (row.type === 'relic') return `💎 [${KIND_LABELS[row.kind] || row.kind}] ${find(this.catalog.relics, row.id)?.name || row.id} (${row.id})`;
    return row.key;
  }

  renderSimResult() {
    if (!this.simBox) return;
    this.simBox.innerHTML = '';
    const r = this.sim.result;
    if (!r) return;
    if (r.error) { this.simBox.appendChild(h('div', { class: 'slg-ed-status', dataset: { kind: 'error' }, text: `❌ ${r.error}` })); return; }
    this.simBox.appendChild(h('div', { class: 'slg-ed-muted', text:
      `시드 "${r.seed}" · ${r.times}회 실행 · 보상 ${r.totalRewards}개 (1회당 ${r.rolls}개 뽑기)${r.emptyRolls ? ` · 후보 소진으로 빈 뽑기 ${r.emptyRolls}회` : ''}` }));
    const table = h('table', { class: 'slg-ed-table' }, [
      h('thead', {}, h('tr', {}, [h('th', { text: '항목' }), h('th', { text: '횟수' }), h('th', { text: '실행당' }), h('th', { text: '전체 비율' })]))
    ]);
    const body = h('tbody');
    for (const row of r.rows) {
      body.appendChild(h('tr', {}, [
        h('td', { text: this.rewardLabel(row) }),
        h('td', { text: String(row.count) }),
        h('td', { text: `${(row.perRun * 100).toFixed(1)}%` }),
        h('td', { text: `${(row.share * 100).toFixed(1)}%` })
      ]));
    }
    table.appendChild(body);
    this.simBox.appendChild(table);
  }
}

/**
 * DEV 패널에서 호출하는 진입점. 같은 root에 다시 들어오면 목록만 새로 읽는다 (편집 중인 draft 유지).
 * @param {HTMLElement} root
 */
export async function mount(root) {
  ensureEditorCss();
  if (root.__rewardPoolEditor) { await root.__rewardPoolEditor.refreshCatalog(); return root.__rewardPoolEditor; }
  const engine = await getEngine();
  const editor = new RewardPoolEditor(root, engine);
  root.__rewardPoolEditor = editor;
  await editor.init();
  return editor;
}
