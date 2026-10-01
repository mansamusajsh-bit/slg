/**
 * editors/itemEditor.js — 아이템(items) 카탈로그 에디터 (최소 버전)
 * 보상 풀의 item entry 드롭다운이 이 목록을 쓴다. 아이템 사용/지급 로직은 이번 범위가 아니다.
 */
import { ensureEditorCss, getEngine, h, selectEl } from './editorCommon.js';
import { RecordEditorBase } from './recordEditorBase.js';

class ItemEditor extends RecordEditorBase {
  constructor(root, engine) {
    super(root, engine, {
      collection: engine.COLLECTIONS.items,
      refType: 'item',
      title: '📦 아이템 카탈로그',
      banner: 'items 컬렉션. 보상 풀의 아이템 드롭다운이 이 목록을 씁니다.',
      emptyLabel: '저장된 아이템이 없습니다.',
      imageFolder: 'item_icons',
      icon: '📦'
    });
  }

  emptyRecord() { return { id: '', name: '', description: '', category: 'consumable', rarity: 'common' }; }
  listMeta(it) { return [this.engine.ITEM_CATEGORIES[it.category], it.rarity].filter(Boolean).join(' · '); }
  normalize(x) { return this.engine.normalizeItem(x); }
  validate(x) { return this.engine.validateItem(x); }
  issueLabel() { return ''; }

  renderFields(form) {
    const E = this.engine;
    form.appendChild(h('div', { class: 'slg-ed-grid2' }, [
      h('label', { class: 'slg-ed-field' }, [
        h('span', { text: '분류' }),
        selectEl(Object.entries(E.ITEM_CATEGORIES).map(([value, label]) => ({ value, label: `${label} (${value})` })), this.draft.category,
          (v) => { if (v) this.draft.category = v; else delete this.draft.category; this.markDirty(); }, { placeholder: '— 없음 —' })
      ]),
      h('label', { class: 'slg-ed-field' }, [
        h('span', { text: '희귀도' }),
        selectEl(E.RARITIES, this.draft.rarity, (v) => { if (v) this.draft.rarity = v; else delete this.draft.rarity; this.markDirty(); }, { placeholder: '— 없음 —' })
      ])
    ]));
    form.appendChild(h('label', { class: 'slg-ed-field' }, [
      h('span', { text: '설명' }),
      h('textarea', {
        class: 'slg-ed-input', rows: '2', value: this.draft.description || '',
        on: { input: (e) => { this.draft.description = e.target.value; this.markDirty(); } }
      })
    ]));
  }
}

export async function mount(root) {
  ensureEditorCss();
  if (root.__itemEditor) { await root.__itemEditor.reload(true).catch(() => {}); return root.__itemEditor; }
  const editor = new ItemEditor(root, await getEngine());
  root.__itemEditor = editor;
  await editor.init().catch(() => {});
  return editor;
}
