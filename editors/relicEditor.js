/**
 * editors/relicEditor.js — 유물(relics) 에디터 (최소 버전)
 * id, name, kind(commander/gift), rarity, effects[{ scope, stat, value }]
 *   - gift: scope는 self로 고정 (받은 유닛 본인 효과, 유닛당 1개)
 *   - commander: army / battle / run 중 선택 (지휘관 착용, 슬롯 제한은 전투/런 로직에서 처리 — 이번 범위 아님)
 * 효과 적용 로직은 없다. 데이터만 편집한다.
 */
import { ensureEditorCss, getEngine, h, selectEl, numberEl } from './editorCommon.js';
import { RecordEditorBase } from './recordEditorBase.js';

const KIND_LABELS = { commander: '👑 지휘관 (commander)', gift: '🎁 선물 (gift)' };
const SCOPE_LABELS = { self: '본인 (self)', army: '군 전체 (army)', battle: '전투 규칙 (battle)', run: '런 전체 (run)' };

class RelicEditor extends RecordEditorBase {
  constructor(root, engine) {
    super(root, engine, {
      collection: engine.COLLECTIONS.relics,
      refType: 'relic',
      title: '💎 유물 에디터',
      banner: 'relics 컬렉션. 효과 적용 로직은 아직 없고 데이터만 저장합니다.',
      emptyLabel: '저장된 유물이 없습니다.',
      imageFolder: 'relic_icons',
      icon: '💎'
    });
  }

  emptyRecord() {
    return { id: '', name: '', kind: 'gift', rarity: 'common', description: '', effects: [{ scope: 'self', stat: 'atk', value: 1 }] };
  }
  normalize(x) { return this.engine.normalizeRelic(x); }
  validate(x) { return this.engine.validateRelic(x); }
  listMeta(r) { return `${r.kind === 'commander' ? '👑' : '🎁'} ${r.rarity || ''} · 효과 ${(r.effects || []).length}`; }

  /** kind가 바뀌면 scope를 새 kind에 맞춘다 (gift → self 고정, commander → self였다면 army) */
  setKind(kind) {
    const d = this.draft;
    d.kind = kind;
    const scopes = this.engine.RELIC_SCOPES[kind] || [];
    d.effects = (d.effects || []).map(fx => ({ ...fx, scope: scopes.includes(fx.scope) ? fx.scope : scopes[0] }));
    this.markDirty();
    this.render();
  }

  renderFields(form) {
    const d = this.draft;
    const E = this.engine;
    const grid = h('div', { class: 'slg-ed-grid2' });
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: '종류 (kind)' }),
      selectEl(E.RELIC_KINDS.map(k => ({ value: k, label: KIND_LABELS[k] })), d.kind, (v) => this.setKind(v))
    ]));
    grid.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: '희귀도 (rarity)' }),
      selectEl(E.RELIC_RARITIES, d.rarity, (v) => { d.rarity = v; this.markDirty(); })
    ]));
    form.appendChild(grid);
    form.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: '설명' }),
      h('textarea', { class: 'slg-ed-input', rows: '2', value: d.description || '', on: { input: (e) => { d.description = e.target.value; this.markDirty(); } } })
    ]));
    form.appendChild(h('div', { class: 'slg-ed-muted', text: d.kind === 'gift'
      ? '선물 유물: 유닛에게 1개 선물, 받은 유닛 본인에게만 적용 → scope는 self 고정'
      : '지휘관 유물: 지휘관이 착용, 군 전체/전투 규칙/런 전체에 적용 (슬롯 제한 있음)' }));

    const scopes = E.RELIC_SCOPES[d.kind] || [];
    (d.effects || []).forEach((fx, i) => {
      const row = h('div', { class: 'slg-ed-entry-row slg-ed-entry', dataset: { effectIndex: String(i) } });
      row.appendChild(h('span', { class: 'slg-ed-idx', text: `#${i + 1}` }));
      const scopeSel = selectEl(scopes.map(s => ({ value: s, label: SCOPE_LABELS[s] || s })), fx.scope, (v) => { fx.scope = v; this.markDirty(); });
      if (d.kind === 'gift') scopeSel.disabled = true;
      row.appendChild(scopeSel);
      row.appendChild(selectEl(E.RELIC_STATS.map(k => ({ value: k, label: E.RELIC_STAT_LABELS[k] })), fx.stat, (v) => { fx.stat = v; this.markDirty(); }));
      row.appendChild(numberEl(fx.value, (v) => { fx.value = v; this.markDirty(); }, { step: 'any' }));
      row.appendChild(h('button', { class: 'slg-ed-btn danger small', text: '✕', on: { click: () => { d.effects.splice(i, 1); this.markDirty(); this.render(); } } }));
      form.appendChild(row);
    });
    form.appendChild(h('button', {
      class: 'slg-ed-btn', text: '+ 효과 추가',
      on: { click: () => { d.effects = d.effects || []; d.effects.push({ scope: scopes[0], stat: 'atk', value: 1 }); this.markDirty(); this.render(); } }
    }));
  }
}

export async function mount(root) {
  ensureEditorCss();
  if (root.__relicEditor) { await root.__relicEditor.reload(true).catch(() => {}); return root.__relicEditor; }
  const editor = new RelicEditor(root, await getEngine());
  root.__relicEditor = editor;
  await editor.init().catch(() => {});
  return editor;
}
