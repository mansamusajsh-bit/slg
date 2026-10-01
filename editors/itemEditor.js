/**
 * editors/itemEditor.js — 아이템(items) 카탈로그 에디터 (최소 버전)
 * 보상 풀의 item entry 드롭다운이 이 목록을 쓴다. 아이템 사용/지급 로직은 이번 범위가 아니다.
 */
import { ensureEditorCss, getEngine, h } from './editorCommon.js';
import { RecordEditorBase } from './recordEditorBase.js';

class ItemEditor extends RecordEditorBase {
  constructor(root, engine) {
    super(root, engine, {
      collection: engine.COLLECTIONS.items,
      refType: 'item',
      title: '📦 아이템 카탈로그',
      banner: 'items 컬렉션. 보상 풀의 아이템 드롭다운이 이 목록을 씁니다.',
      emptyLabel: '저장된 아이템이 없습니다.'
    });
  }

  emptyRecord() { return { id: '', name: '', description: '' }; }
  normalize(x) { return this.engine.normalizeItem(x); }
  validate(x) { return this.engine.validateItem(x); }
  issueLabel() { return ''; }

  renderFields(form) {
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
