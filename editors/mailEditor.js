/**
 * editors/mailEditor.js — 운영 메일 (운영자 → 플레이어 우편 · 선물)
 *   - 받는 사람: 전체 또는 지휘관 이름 한 명
 *   - 첨부: 골드 · 리와인더 · 유물(유물 에디터의 목록) · 캐릭터(캐릭터 DB 목록)
 *   - 보낸 메일 목록 (받은 사람 수) · 회수
 * 실제 발송 · 지급은 서버가 한다 (supabase-economy.sql slg_admin_mail_* / slg_mail_claim). 이 화면은 입력만 받는다.
 */
import { ensureEditorCss, getEngine, getStore, loadCatalog, h, createStatusBar, errorText } from './editorCommon.js';

const ERRORS = {
  no_title: '제목을 입력하세요.', title_too_long: '제목은 60자까지입니다.', body_too_long: '본문은 2000자까지입니다.',
  no_player: '그 이름의 지휘관이 없습니다.', bad_days: '보관 기간이 올바르지 않습니다.', bad_gold: '골드 값이 올바르지 않습니다.',
  gold_too_much: '골드가 한 통 상한을 넘었습니다.', bad_rewinders: '리와인더 값이 올바르지 않습니다.', rewinders_too_much: '리와인더가 한 통 상한을 넘었습니다.',
  too_many_relics: '유물이 너무 많습니다.', unknown_relic: '없는 유물입니다.', too_many_characters: '캐릭터가 너무 많습니다.',
  unknown_character: '없는 캐릭터입니다.', not_found: '메일을 찾을 수 없습니다.', forbidden: '운영자 계정만 사용할 수 있습니다.'
};
const errMsg = (r) => {
  const base = ERRORS[r && r.error] || (r && r.error) || '서버 오류';
  return r && r.detail != null ? `${base} (${r.detail})` : base;
};

const blankDraft = () => ({ target: 'all', name: '', includeNew: false, title: '', body: '', gold: 0, rewinders: 0, relics: [], characters: [], days: 30 });

class MailEditor {
  constructor(root) {
    this.root = root;
    this.draft = blankDraft();
    this.catalog = { relics: [], characters: [] };
    this.sent = [];
    this.busy = false;
    this.status = createStatusBar();
    this.charQuery = '';
  }

  get se() { return window.ServerEconomy; }

  async init() {
    try {
      const catalog = await loadCatalog(await getStore(), await getEngine());
      this.catalog = { relics: catalog.relics, characters: catalog.characters };
    } catch (err) {
      this.status.set(`목록을 불러오지 못했습니다: ${errorText(err)}`, 'error');
    }
    this.render();
    await this.loadSent();
  }

  async loadSent() {
    if (!this.ready()) return;
    const r = await this.se.call('slg_admin_mail_list', { p_limit: 50 });
    if (r && r.ok) this.sent = r.mails || [];
    else this.status.set(`보낸 메일을 불러오지 못했습니다: ${errMsg(r)}`, 'error');
    this.render();
  }

  ready() { return !!(this.se && this.se.enabled && this.se.isAdmin); }

  nameOf(kind, id) {
    const list = kind === 'relic' ? this.catalog.relics : this.catalog.characters;
    const x = list.find((r) => String(r.id) === String(id));
    return (x && x.name) || id;
  }

  summary(a) {
    if (!a) return '';
    const names = a.names || {};
    const bits = [];
    if (Number(a.gold) > 0) bits.push(`💰 ${Number(a.gold).toLocaleString()}G`);
    if (Number(a.rewinders) > 0) bits.push(`⏳ ${a.rewinders}`);
    (a.relics || []).forEach((id) => bits.push(`💎 ${names[`relic:${id}`] || this.nameOf('relic', id)}`));
    (a.characters || []).forEach((id) => bits.push(`🧑‍✈️ ${names[`char:${id}`] || this.nameOf('char', id)}`));
    return bits.join(' · ') || '첨부 없음 (공지)';
  }

  async send() {
    const d = this.draft;
    if (this.busy) return;
    if (!d.title.trim()) { this.status.set('제목을 입력하세요.', 'error'); return; }
    if (d.target === 'one' && !d.name.trim()) { this.status.set('받을 지휘관 이름을 입력하세요.', 'error'); return; }
    const gold = Math.floor(Number(d.gold) || 0), rewinders = Math.floor(Number(d.rewinders) || 0);
    if (gold < 0 || rewinders < 0) { this.status.set('골드 · 리와인더는 0 이상이어야 합니다.', 'error'); return; }
    const attach = { gold, rewinders, relics: d.relics.slice(), characters: d.characters.slice() };
    const who = d.target === 'all' ? `전체 플레이어${d.includeNew ? ' (이후 가입자 포함)' : ''}` : `"${d.name.trim()}"`;
    if (!window.confirm(`${who}에게 보냅니다.\n\n제목: ${d.title}\n첨부: ${this.summary(attach)}\n보관: ${d.days}일\n\n보낸 뒤에는 고칠 수 없고 회수만 할 수 있습니다.`)) return;
    this.busy = true; this.render();
    const r = await this.se.call('slg_admin_mail_send', {
      p_target: d.target === 'all' ? 'all' : d.name.trim(), p_title: d.title, p_body: d.body,
      p_attach: attach, p_days: Math.floor(Number(d.days) || 30), p_include_new: d.target === 'all' && d.includeNew
    });
    this.busy = false;
    if (r && r.ok) {
      this.status.set(`✅ 보냈습니다 — ${r.targetName ? `${r.targetName}에게` : `플레이어 ${r.recipients}명에게`} (메일 #${r.id})`, 'ok');
      this.draft = blankDraft();
      await this.loadSent();
    } else {
      this.status.set(`❌ 보내지 못했습니다: ${errMsg(r)}`, 'error');
      this.render();
    }
  }

  async revoke(m) {
    if (!window.confirm(`"${m.title}" 메일을 회수합니다.\n아직 받지 않은 사람은 더 이상 받을 수 없습니다. (이미 받은 ${m.claimed}명의 보상은 그대로)`)) return;
    const r = await this.se.call('slg_admin_mail_revoke', { p_id: m.id });
    if (r && r.ok) { this.status.set(`메일 #${m.id}을(를) 회수했습니다.`, 'ok'); await this.loadSent(); }
    else this.status.set(`회수 실패: ${errMsg(r)}`, 'error');
  }

  // ------------------------------------------------------------ 화면
  render() {
    const root = this.root;
    root.innerHTML = '';
    const wrap = h('div', { class: 'slg-ed slg-ed-mail' });
    wrap.appendChild(h('div', { class: 'slg-ed-banner' }, [
      h('strong', { text: '📮 운영 메일' }), h('br'),
      '플레이어 우편함으로 공지와 선물(골드 · 리와인더 · 유물 · 캐릭터)을 보냅니다. 플레이어가 우편함에서 "받기"를 누르면 서버가 지급합니다. ',
      '골드와 유물은 회귀하면 사라지므로, 받는 시점은 플레이어가 고릅니다.'
    ]));
    wrap.appendChild(this.status.el);
    if (!this.ready()) {
      const why = !this.se || !this.se.enabled ? '서버 경제에 연결되어 있지 않습니다. 로그인한 뒤 다시 열어 주세요.' : '운영자 계정(slg_admin_emails)만 메일을 보낼 수 있습니다.';
      wrap.appendChild(h('div', { class: 'slg-ed-section' }, [h('div', { class: 'slg-ed-muted', text: `⚠️ ${why}` }),
        h('button', { class: 'slg-ed-btn', text: '다시 확인', on: { click: () => this.init() } })]));
      root.appendChild(wrap);
      return;
    }
    wrap.appendChild(this.composeEl());
    wrap.appendChild(this.sentEl());
    root.appendChild(wrap);
  }

  composeEl() {
    const d = this.draft;
    const sec = h('div', { class: 'slg-ed-section' });
    sec.appendChild(h('div', { class: 'slg-ed-toolbar' }, [h('span', { class: 'slg-ed-title', text: '✉️ 새 메일' })]));

    // 받는 사람
    const radio = (val, label) => h('label', { class: 'slg-ed-check' }, [
      h('input', { type: 'radio', name: 'mail-target', value: val, checked: d.target === val, on: { change: () => { d.target = val; this.render(); } } }), label]);
    const targetRow = h('div', { class: 'slg-ed-field' }, [h('span', { text: '받는 사람' }),
      h('div', { class: 'slg-ed-chips' }, [radio('all', '전체 플레이어'), radio('one', '한 명 (지휘관 이름)')])]);
    sec.appendChild(targetRow);
    if (d.target === 'one') {
      sec.appendChild(h('input', { class: 'slg-ed-input', placeholder: '지휘관 이름 (대소문자 · 공백 무시)', value: d.name, on: { input: (e) => { d.name = e.target.value; } } }));
    } else {
      sec.appendChild(h('label', { class: 'slg-ed-check' }, [
        h('input', { type: 'checkbox', checked: d.includeNew, on: { change: (e) => { d.includeNew = e.target.checked; } } }),
        '보관 기간 동안 새로 가입하는 플레이어도 받기 (환영 선물 등)']));
    }

    // 내용
    sec.appendChild(h('label', { class: 'slg-ed-field' }, [h('span', { text: '제목 (60자)' }),
      h('input', { class: 'slg-ed-input', maxlength: '60', value: d.title, placeholder: '예: 점검 보상', on: { input: (e) => { d.title = e.target.value; } } })]));
    sec.appendChild(h('label', { class: 'slg-ed-field' }, [h('span', { text: '본문 (2000자)' }),
      h('textarea', { class: 'slg-ed-input', rows: '4', maxlength: '2000', placeholder: '플레이어에게 보일 내용', on: { input: (e) => { d.body = e.target.value; } } }, [d.body])]));

    // 재화
    const num = (label, key, max) => h('label', { class: 'slg-ed-field' }, [h('span', { text: label }),
      h('input', { type: 'number', min: '0', max: String(max), class: 'slg-ed-input slg-ed-num', value: String(d[key]), on: { input: (e) => { d[key] = e.target.value === '' ? 0 : Number(e.target.value); } } })]);
    sec.appendChild(h('div', { class: 'slg-ed-grid2' }, [num('💰 골드', 'gold', 1000000), num('⏳ 리와인더', 'rewinders', 20)]));

    // 유물 · 캐릭터
    sec.appendChild(this.pickerEl('💎 유물', 'relics', this.catalog.relics.map((r) => ({ value: r.id, label: `${r.name || r.id} · ${r.kind || ''} ${r.rarity || ''}` })), 10));
    const q = this.charQuery.trim().toLowerCase();
    const chars = this.catalog.characters.filter((c) => !q || String(c.name).toLowerCase().includes(q) || String(c.id).toLowerCase().includes(q));
    sec.appendChild(this.pickerEl('🧑‍✈️ 캐릭터 (용병 명부로 들어감)', 'characters', chars.map((c) => ({ value: c.id, label: c.name })), 10, true));

    sec.appendChild(h('label', { class: 'slg-ed-field' }, [h('span', { text: '보관 기간 (일)' }),
      h('input', { type: 'number', min: '1', max: '365', class: 'slg-ed-input slg-ed-num', value: String(d.days), on: { input: (e) => { d.days = Number(e.target.value) || 30; } } })]));

    sec.appendChild(h('div', { class: 'slg-ed-toolbar' }, [
      h('span', { class: 'slg-ed-muted', text: `첨부: ${this.summary({ gold: d.gold, rewinders: d.rewinders, relics: d.relics, characters: d.characters })}` }),
      h('button', { class: 'slg-ed-btn', text: '초기화', on: { click: () => { this.draft = blankDraft(); this.render(); } } }),
      h('button', { class: 'slg-ed-btn primary', text: this.busy ? '보내는 중...' : '📮 보내기', disabled: this.busy, on: { click: () => this.send() } })
    ]));
    return sec;
  }

  pickerEl(label, key, options, max, searchable = false) {
    const d = this.draft;
    const box = h('div', { class: 'slg-ed-field' }, [h('span', { text: `${label} — 최대 ${max}개` })]);
    const row = h('div', { class: 'slg-ed-chips' });
    if (searchable) {
      row.appendChild(h('input', { class: 'slg-ed-input', placeholder: '이름 검색', value: this.charQuery,
        on: { input: (e) => { this.charQuery = e.target.value; this.render(); const el = this.root.querySelector('[data-char-search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } },
        dataset: { charSearch: '1' } }));
    }
    const sel = h('select', { class: 'slg-ed-input' }, [h('option', { value: '', text: options.length ? '— 선택해서 추가 —' : '(목록 없음)' })]);
    options.forEach((o) => sel.appendChild(h('option', { value: o.value, text: o.label })));
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      if (d[key].length >= max) { this.status.set(`${label}은(는) 최대 ${max}개까지입니다.`, 'error'); return; }
      d[key].push(sel.value);
      this.render();
    });
    row.appendChild(sel);
    box.appendChild(row);
    if (d[key].length) {
      const chips = h('div', { class: 'slg-ed-chips' });
      d[key].forEach((id, i) => chips.appendChild(h('span', { class: 'slg-ed-chip' }, [
        this.nameOf(key === 'relics' ? 'relic' : 'char', id), ' ',
        h('button', { class: 'slg-ed-btn small', text: '✕', title: '빼기', on: { click: () => { d[key].splice(i, 1); this.render(); } } })])));
      box.appendChild(chips);
    }
    return box;
  }

  sentEl() {
    const sec = h('div', { class: 'slg-ed-section' });
    sec.appendChild(h('div', { class: 'slg-ed-toolbar' }, [h('span', { class: 'slg-ed-title', text: '📤 보낸 메일' }),
      h('button', { class: 'slg-ed-btn', text: '새로고침', on: { click: () => this.loadSent() } })]));
    if (!this.sent.length) { sec.appendChild(h('div', { class: 'slg-ed-muted', text: '아직 보낸 메일이 없습니다.' })); return sec; }
    const now = Date.now();
    this.sent.forEach((m) => {
      const life = m.revokedAt ? '회수됨' : (m.expiresAt <= now ? '만료' : `${Math.ceil((m.expiresAt - now) / 86400000)}일 남음`);
      const date = new Date(m.createdAt);
      sec.appendChild(h('div', { class: 'slg-ed-list-item slg-ed-mail-row' }, [
        h('div', {}, [
          h('strong', { text: `#${m.id} ${m.title}` }),
          h('div', { class: 'slg-ed-muted', text: `${m.targetName ? `→ ${m.targetName}` : `→ 전체${m.includeNew ? ' (+신규)' : ''}`} · ${date.getMonth() + 1}/${date.getDate()} · ${life} · 받음 ${m.claimed}명 · 읽음 ${m.read}명` }),
          h('div', { class: 'slg-ed-muted', text: this.summary(m.attach) })
        ]),
        m.revokedAt ? null : h('button', { class: 'slg-ed-btn danger small', text: '회수', on: { click: () => this.revoke(m) } })
      ]));
    });
    return sec;
  }
}

export async function mount(root) {
  ensureEditorCss();
  if (root.__mailEditor) { await root.__mailEditor.init().catch(() => {}); return root.__mailEditor; }
  const editor = new MailEditor(root);
  root.__mailEditor = editor;
  await editor.init().catch((err) => { root.textContent = `❌ ${errorText(err)}`; });
  return editor;
}
