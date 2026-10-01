/**
 * editors/recordEditorBase.js — 단순 레코드(유물/아이템) 에디터 공통 뼈대
 * 목록 조회 · 새로 만들기 · 불러오기 · 복제 · 삭제(확인창 + 참조 검사) · 저장(검증 필수)
 * 게임 state는 모른다. 하위 클래스가 collection / validate / normalize / renderFields 만 정한다.
 */
import { getStore, h, clone, createStatusBar, renderValidation, errorText, confirmDiscard } from './editorCommon.js';

export class RecordEditorBase {
  /**
   * @param {HTMLElement} root
   * @param {object} engine RewardEngine
   * @param {{ collection:string, refType:'relic'|'item', title:string, banner:string, emptyLabel:string }} opts
   */
  constructor(root, engine, opts) {
    this.root = root;
    this.engine = engine;
    this.opts = opts;
    this.store = null;
    this.records = [];
    this.pools = [];
    this.draft = null;
    this.isNew = false;
    this.dirty = false;
    this.status = createStatusBar();
  }

  // ---- 하위 클래스 구현
  emptyRecord() { throw new Error('emptyRecord 미구현'); }
  normalize(x) { return x; }
  validate(_x) { return { valid: true, errors: [], warnings: [] }; }
  renderFields(_container) {}
  listMeta(_rec) { return ''; }
  issueLabel(idx) { return idx === null || idx === undefined ? '' : `효과 #${idx + 1}: `; }

  async init() {
    this.root.innerHTML = '';
    this.root.appendChild(h('div', { class: 'slg-ed-loading', text: '⏳ 불러오는 중...' }));
    await this.reload(true);
  }

  async reload(rerender) {
    try {
      if (!this.store) this.store = await getStore();
      const [records, pools] = await Promise.all([
        this.store.list(this.opts.collection),
        this.store.list(this.engine.COLLECTIONS.rewardPools)
      ]);
      this.records = records.filter(x => x && x.id).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      this.pools = pools.filter(x => x && x.id);
      if (rerender) this.render();
    } catch (err) {
      this.root.innerHTML = '';
      this.root.appendChild(h('div', { class: 'slg-ed' }, [
        h('div', { class: 'slg-ed-status', dataset: { kind: 'error' }, text: `❌ 데이터를 불러오지 못했습니다: ${errorText(err)}` }),
        h('button', { class: 'slg-ed-btn', text: '🔄 다시 시도', on: { click: () => this.init() } })
      ]));
      console.error(`[${this.opts.collection} editor]`, err);
      throw err;
    }
  }

  newRecord() {
    if (!confirmDiscard(this.dirty)) return;
    this.draft = this.emptyRecord();
    this.isNew = true; this.dirty = false;
    this.status.set('새 항목입니다. id와 이름을 입력하세요.', 'info');
    this.render();
  }

  async loadRecord(id) {
    if (!confirmDiscard(this.dirty)) return;
    try {
      this.draft = clone(this.normalize(await this.store.load(this.opts.collection, id)));
      this.isNew = false; this.dirty = false;
      this.status.set(`📂 [${id}] 불러옴`, 'info');
    } catch (err) {
      this.status.set(`❌ 불러오기 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  duplicateRecord() {
    if (!this.draft) return;
    const input = window.prompt('복제본의 새 id를 입력하세요 (영문/숫자/_/-)', `${this.draft.id || 'copy'}_copy`);
    if (input === null) return;
    const id = input.trim();
    if (!this.engine.ID_PATTERN.test(id)) { this.status.set('❌ id는 영문/숫자/_/- 만 쓸 수 있습니다.', 'error'); return; }
    if (this.records.some(r => r.id === id)) { this.status.set(`❌ 이미 존재하는 id입니다: ${id}`, 'error'); return; }
    this.draft = { ...clone(this.draft), id, name: `${this.draft.name || ''} (복제)` };
    this.isNew = true; this.dirty = true;
    this.status.set(`📄 [${id}] 복제본을 만들었습니다. 저장해야 반영됩니다.`, 'info');
    this.render();
  }

  async deleteRecord() {
    if (!this.draft) return;
    if (this.isNew) {
      if (!confirmDiscard(true)) return;
      this.draft = null; this.isNew = false; this.dirty = false;
      this.render();
      return;
    }
    const id = this.draft.id;
    try { await this.reload(false); } catch (_) { return; }
    const refs = this.engine.findReferences(this.opts.refType, id, this.pools);
    if (refs.length) {
      this.status.set(`❌ 삭제 불가: 보상 풀이 참조 중입니다 → ${refs.map(r => `${r.poolId} #${r.entryIndex + 1}`).join(', ')}`, 'error');
      this.render();
      return;
    }
    if (!window.confirm(`[${id}]을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await this.store.remove(this.opts.collection, id);
      this.draft = null; this.isNew = false; this.dirty = false;
      await this.reload(false);
      this.status.set(`🗑️ [${id}] 삭제했습니다.`, 'success');
    } catch (err) {
      this.status.set(`❌ 삭제 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  async saveRecord() {
    if (!this.draft) return;
    const record = this.normalize(this.draft);
    const report = this.validate(record);
    this.refreshDerived();
    if (!report.valid) {
      this.status.set(`❌ 검증 오류 ${report.errors.length}건 — 저장하지 않았습니다.`, 'error');
      return;
    }
    try {
      if (this.isNew && await this.store.exists(this.opts.collection, record.id)) {
        this.status.set(`❌ 이미 존재하는 id입니다: ${record.id} (덮어쓰지 않음)`, 'error');
        return;
      }
      await this.store.save(this.opts.collection, record.id, record, x => this.validate(x));
      this.isNew = false; this.dirty = false;
      await this.reload(false);
      this.status.set(`💾 [${record.id}] 저장했습니다.`, 'success');
    } catch (err) {
      this.status.set(`❌ 저장 실패: ${errorText(err)}`, 'error');
    }
    this.render();
  }

  markDirty() { this.dirty = true; this.refreshDerived(); }

  refreshDerived() {
    if (!this.draft || !this.validationBox) return;
    const report = this.validate(this.normalize(this.draft));
    renderValidation(this.validationBox, report, (idx) => this.issueLabel(idx));
    this.root.querySelectorAll('[data-effect-index]').forEach(row => {
      const i = Number(row.dataset.effectIndex);
      row.classList.toggle('invalid', report.errors.some(e => e.entryIndex === i));
    });
  }

  render() {
    this.root.innerHTML = '';
    const wrap = h('div', { class: 'slg-ed' });
    wrap.appendChild(h('div', { class: 'slg-ed-banner' }, [h('strong', { text: this.opts.title }), h('span', { text: ` — ${this.opts.banner}` })]));
    wrap.appendChild(this.status.el);

    const listSection = h('div', { class: 'slg-ed-section' });
    listSection.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
      h('span', { class: 'slg-ed-title', text: `📚 목록 (${this.records.length})` }),
      h('button', { class: 'slg-ed-btn', text: '🔄', title: '목록 새로고침', on: { click: () => this.reload(true).catch(() => {}) } }),
      h('button', { class: 'slg-ed-btn primary', text: '➕ 새로 만들기', on: { click: () => this.newRecord() } })
    ]));
    const list = h('div', { class: 'slg-ed-list' });
    if (!this.records.length) list.appendChild(h('div', { class: 'slg-ed-muted', text: this.opts.emptyLabel }));
    for (const rec of this.records) {
      const active = this.draft && !this.isNew && this.draft.id === rec.id;
      list.appendChild(h('button', { class: `slg-ed-list-item${active ? ' active' : ''}`, on: { click: () => this.loadRecord(rec.id) } }, [
        h('span', { class: 'id', text: rec.id }),
        h('span', { class: 'name', text: rec.name || '' }),
        h('span', { class: 'meta', text: this.listMeta(rec) })
      ]));
    }
    listSection.appendChild(list);
    wrap.appendChild(listSection);

    if (this.draft) {
      const form = h('div', { class: 'slg-ed-section' });
      form.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
        h('span', { class: 'slg-ed-title', text: this.isNew ? '🆕 새 항목 (미저장)' : `✏️ ${this.draft.id}${this.dirty ? ' *' : ''}` }),
        h('button', { class: 'slg-ed-btn', text: '📄 복제', on: { click: () => this.duplicateRecord() } }),
        h('button', { class: 'slg-ed-btn danger', text: '🗑️ 삭제', on: { click: () => this.deleteRecord() } }),
        h('button', { class: 'slg-ed-btn success', text: '💾 저장', on: { click: () => this.saveRecord() } })
      ]));
      const grid = h('div', { class: 'slg-ed-grid2' });
      grid.appendChild(h('label', { class: 'slg-ed-field' }, [
        h('span', { text: 'id' + (this.isNew ? '' : ' (변경 불가 — 복제로 새 id 생성)') }),
        h('input', { class: 'slg-ed-input', value: this.draft.id || '', readOnly: !this.isNew, on: { input: (e) => { this.draft.id = e.target.value.trim(); this.markDirty(); } } })
      ]));
      grid.appendChild(h('label', { class: 'slg-ed-field' }, [
        h('span', { text: '이름' }),
        h('input', { class: 'slg-ed-input', value: this.draft.name || '', on: { input: (e) => { this.draft.name = e.target.value; this.markDirty(); } } })
      ]));
      form.appendChild(grid);
      this.renderFields(form);
      wrap.appendChild(form);
      this.validationBox = h('div', { class: 'slg-ed-section slg-ed-validation' });
      wrap.appendChild(this.validationBox);
    } else {
      this.validationBox = null;
      wrap.appendChild(h('div', { class: 'slg-ed-empty', text: '목록에서 고르거나 ➕ 새로 만들기를 누르세요.' }));
    }
    this.root.appendChild(wrap);
    this.refreshDerived();
  }
}
