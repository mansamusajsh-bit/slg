// ============================================================
// mailbox.js — 우편함 (운영자 메일: 골드 · 리와인더 · 유물 · 캐릭터 선물)
// 사용법: <script src="mailbox.js"></script> (serverEconomy.js 다음)
//
// 메일과 보상의 원본은 서버다 (supabase-economy.sql 의 slg_mail_*).
//  * 받기를 누르면 서버가 골드 · 리와인더 · 유물을 바로 지급한다 → 동기화로 화면 값이 맞춰진다.
//  * 캐릭터는 서버 우편(slg_inbox 'unit_gift')으로 온다 → 여기서 용병 명부에 넣는다 (넣고 저장할 때까지 다시 온다).
//  * 서버 경제가 꺼져 있으면(오프라인 · 로그인 전) 우편함은 열리지만 "서버 연결 필요"만 보여 준다.
// ============================================================

(function (global) {
  'use strict';

  const getState = () => (typeof state !== 'undefined' ? state : null);
  const SE = () => global.ServerEconomy;
  const toast = (msg, type) => global.UI && global.UI.showToast && global.UI.showToast(msg, type);
  const log = (msg, type = 'system') => { if (typeof addLog === 'function') addLog(msg, type); };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ERRORS = {
    already_claimed: '이미 받은 우편입니다.', expired: '보관 기간이 지난 우편입니다.', revoked: '운영자가 회수한 우편입니다.',
    not_found: '우편을 찾을 수 없습니다.', unclaimed: '첨부를 먼저 받아야 지울 수 있습니다.'
  };
  const errText = (r) => ERRORS[r && r.error] || (r && r.error) || '서버 오류';

  let mails = [];
  let badge = { unread: 0, unclaimed: 0 };
  let openId = null;
  let busy = false;
  let loading = false;
  let loadError = '';

  // ------------------------------------------------------------ 첨부 표시
  function attachParts(a) {
    if (!a) return [];
    const names = a.names || {};
    const parts = [];
    if (Number(a.gold) > 0) parts.push({ icon: '💰', text: `${Number(a.gold).toLocaleString()}G` });
    if (Number(a.rewinders) > 0) parts.push({ icon: '⏳', text: `리와인더 ${a.rewinders}개` });
    (a.relics || []).forEach((id) => parts.push({ icon: '💎', text: names[`relic:${id}`] || id }));
    (a.characters || []).forEach((id) => parts.push({ icon: '🧑‍✈️', text: names[`char:${id}`] || id }));
    return parts;
  }
  const attachSummary = (a) => attachParts(a).map((p) => `${p.icon} ${p.text}`).join(' · ');

  function resultText(r) {
    if (!r) return '';
    const bits = [];
    if (Number(r.gold) > 0) bits.push(`+${Number(r.gold).toLocaleString()}G`);
    if (Number(r.rewinders) > 0) bits.push(`리와인더 +${r.rewinders}`);
    if ((r.relics || []).length) bits.push(`유물 ${r.relics.length}개`);
    if ((r.characters || []).length) bits.push(`캐릭터 ${r.characters.length}명(용병 명부)`);
    return bits.join(', ');
  }

  function fmtDate(ms) {
    const d = new Date(Number(ms));
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function leftText(ms) {
    const now = SE() && SE().serverNow ? SE().serverNow() : Date.now();
    const left = Number(ms) - now;
    if (left <= 0) return '만료';
    const days = Math.floor(left / 86400000);
    if (days >= 1) return `${days}일 남음`;
    return `${Math.max(1, Math.floor(left / 3600000))}시간 남음`;
  }

  // ------------------------------------------------------------ 배지
  function setBadge(b) {
    if (b && typeof b === 'object') badge = { unread: Number(b.unread) || 0, unclaimed: Number(b.unclaimed) || 0 };
    const n = Math.max(badge.unread, badge.unclaimed);
    document.querySelectorAll('[data-mail-badge]').forEach((el) => {
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = n <= 0;
    });
    const handle = document.getElementById('strat-merc-handle');
    if (handle) handle.classList.toggle('has-mail', n > 0);
  }

  // ------------------------------------------------------------ 캐릭터 선물 → 용병 명부
  function deliverGift(payload, inboxId) {
    const s = getState();
    if (!s || !payload || !payload.characterId) return false;
    if (!Array.isArray(s.characterCollection)) s.characterCollection = [];
    const instanceId = `mail_${inboxId}`;
    if (s.characterCollection.some((c) => c && c.instanceId === instanceId)) return true;   // 이미 넣었다 (ack 만 늦었다)
    s.characterCollection.push({ instanceId, characterId: String(payload.characterId), source: 'mail', acquiredAt: new Date().toISOString() });
    const pool = typeof getStoredCustomCharacters === 'function' ? getStoredCustomCharacters() : [];
    const rec = (pool || []).find((c) => c && String(c.id) === String(payload.characterId));
    const name = (rec && rec.name) || payload.characterId;
    log(`📬 [우편] ${name}이(가) 용병 명부에 들어왔습니다.${payload.title ? ` (${payload.title})` : ''} 용병 명부에서 출전 명단에 편입하세요.`, 'success');
    return true;
  }

  // ------------------------------------------------------------ 서버
  async function refresh() {
    const se = SE();
    if (!se || !se.enabled) { mails = []; loadError = ''; render(); return; }
    loading = true; render();
    const r = await se.call('slg_mail_list', {});
    loading = false;
    if (r && r.ok) { mails = Array.isArray(r.mails) ? r.mails : []; loadError = ''; setBadge(r.badge); }
    else loadError = r && r.network ? '서버에 연결하지 못했습니다.' : errText(r);
    render();
  }

  async function markRead(m) {
    if (!m || m.readAt) return;
    m.readAt = Date.now();
    const r = await SE().call('slg_mail_read', { p_id: m.id });
    if (r && r.ok) setBadge({ unread: Math.max(0, badge.unread - 1), unclaimed: badge.unclaimed });
  }

  async function claim(id) {
    if (busy) return;
    busy = true; render();
    const r = await SE().call('slg_mail_claim', { p_id: id == null ? null : id });
    busy = false;
    if (r && r.ok) {
      const results = id == null ? (r.claimed || []).map((c) => c.result) : [r.result];
      const merged = results.reduce((acc, x) => ({
        gold: acc.gold + (Number(x && x.gold) || 0), rewinders: acc.rewinders + (Number(x && x.rewinders) || 0),
        relics: acc.relics.concat((x && x.relics) || []), characters: acc.characters.concat((x && x.characters) || []),
        relicsFailed: acc.relicsFailed.concat((x && x.relicsFailed) || [])
      }), { gold: 0, rewinders: 0, relics: [], characters: [], relicsFailed: [] });
      const txt = resultText(merged);
      if (txt) { toast(`📬 우편 수령: ${txt}`, 'success'); log(`📬 [우편 수령] ${txt}`, 'gold'); }
      else toast('받을 우편이 없습니다.', 'info');
      if (merged.relicsFailed.length) toast(`⚠️ 유물 ${merged.relicsFailed.length}개는 받지 못했습니다 (이번 회차 유물 상한 또는 이미 가진 지휘관 유물).`, 'warning');
      setBadge(r.badge);
      await SE().sync('now');   // 리와인더 · 유물 · 캐릭터(우편) · 골드를 화면에 맞춘다
      await refresh();
    } else {
      toast(`⚠️ ${errText(r)}`, 'warning');
      await refresh();
    }
  }

  async function remove(id) {
    if (busy) return;
    busy = true;
    const r = await SE().call('slg_mail_delete', { p_id: id });
    busy = false;
    if (r && r.ok) { openId = null; setBadge(r.badge); await refresh(); }
    else toast(`⚠️ ${errText(r)}`, 'warning');
  }

  // ------------------------------------------------------------ 화면
  function ensureModal() {
    let modal = document.getElementById('modal-mailbox');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'pool-overlay mailbox-overlay';
    modal.id = 'modal-mailbox';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="pool-window mailbox-window" role="dialog" aria-label="우편함">
        <header class="pool-header">
          <div>
            <div class="gacha-title">MAILBOX</div>
            <div class="pool-title">📬 우편함</div>
            <div class="gacha-subtitle" id="mailbox-summary"></div>
          </div>
          <button type="button" class="gacha-back-btn" data-mail-close>닫기 ✕</button>
        </header>
        <div class="mailbox-body" id="mailbox-body"></div>
      </div>`;
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t === modal || (t instanceof Element && t.closest('[data-mail-close]'))) { close(); return; }
      if (!(t instanceof Element)) return;
      const item = t.closest('[data-mail-open]');
      if (item) { openId = Number(item.dataset.mailOpen); markRead(mails.find((m) => m.id === openId)); render(); return; }
      if (t.closest('[data-mail-back]')) { openId = null; render(); return; }
      const c = t.closest('[data-mail-claim]');
      if (c) { claim(c.dataset.mailClaim === 'all' ? null : Number(c.dataset.mailClaim)); return; }
      const d = t.closest('[data-mail-delete]');
      if (d) remove(Number(d.dataset.mailDelete));
    });
    document.body.appendChild(modal);
    return modal;
  }

  function render() {
    const modal = document.getElementById('modal-mailbox');
    if (!modal || modal.style.display === 'none') return;
    const body = document.getElementById('mailbox-body');
    const sum = document.getElementById('mailbox-summary');
    const se = SE();
    if (!se || !se.enabled) {
      if (sum) sum.textContent = '';
      body.innerHTML = '<div class="gacha-empty">우편은 로그인해서 서버에 연결된 뒤에 받을 수 있습니다.</div>';
      return;
    }
    if (sum) sum.textContent = `받을 우편 ${badge.unclaimed}통 · 안 읽음 ${badge.unread}통`;
    const m = openId != null ? mails.find((x) => x.id === openId) : null;
    if (m) { body.innerHTML = detailHtml(m); return; }
    if (loading && !mails.length) { body.innerHTML = '<div class="gacha-empty">우편을 불러오는 중...</div>'; return; }
    if (loadError) { body.innerHTML = `<div class="gacha-empty">⚠️ ${esc(loadError)}</div>`; return; }
    if (!mails.length) { body.innerHTML = '<div class="gacha-empty">우편함이 비어 있습니다.</div>'; return; }
    const claimable = mails.filter((x) => x.hasAttach && !x.claimedAt).length;
    body.innerHTML = `
      <div class="mailbox-toolbar">
        <button type="button" class="mailbox-btn primary" data-mail-claim="all" ${claimable && !busy ? '' : 'disabled'}>📥 모두 받기${claimable ? ` (${claimable})` : ''}</button>
      </div>
      <ul class="mailbox-list">${mails.map(listItemHtml).join('')}</ul>`;
  }

  function listItemHtml(m) {
    const kind = m.claimedAt ? "claimed" : (m.hasAttach ? "gift" : "note");
    const tag = m.claimedAt ? '<span class="mailbox-tag done">받음</span>' : (m.hasAttach ? '<span class="mailbox-tag gift">선물</span>' : '');
    return `
      <li>
        <button type="button" class="mailbox-item is-${kind}${m.readAt ? '' : ' is-unread'}" data-mail-open="${m.id}">
          <span class="mailbox-item-icon">${m.claimedAt ? '📭' : (m.hasAttach ? '🎁' : '✉️')}</span>
          <span class="mailbox-item-main">
            <span class="mailbox-item-title">${m.readAt ? '' : '<i class="mailbox-dot"></i>'}${esc(m.title)}${m.personal ? ' <span class="mailbox-tag me">개인</span>' : ''}</span>
            <span class="mailbox-item-sub">${esc(attachSummary(m.attach) || '공지')}</span>
          </span>
          <span class="mailbox-item-side">${tag}<span class="mailbox-item-time">${esc(m.claimedAt ? fmtDate(m.createdAt) : leftText(m.expiresAt))}</span></span>
        </button>
      </li>`;
  }

  function detailHtml(m) {
    const parts = attachParts(m.attach);
    const claimed = !!m.claimedAt;
    const attachHtml = parts.length ? `
      <div class="mailbox-attach">
        <div class="mailbox-attach-title">첨부 ${claimed ? '— 받음' : ''}</div>
        <div class="mailbox-attach-grid">${parts.map((p) => `<span class="mailbox-chip${claimed ? ' done' : ''}">${p.icon} ${esc(p.text)}</span>`).join('')}</div>
        ${claimed && m.result && (m.result.relicsFailed || []).length ? `<div class="mailbox-note">⚠️ 유물 ${m.result.relicsFailed.length}개는 받지 못했습니다 (이번 회차 유물 상한 또는 이미 가진 지휘관 유물).</div>` : ''}
        ${!claimed && ((m.attach && Number(m.attach.gold) > 0) || (m.attach && (m.attach.relics || []).length)) ? '<div class="mailbox-note">골드와 유물은 회귀하면 사라집니다. 필요할 때 받으세요.</div>' : ''}
      </div>` : '';
    return `
      <div class="mailbox-detail">
        <button type="button" class="mailbox-btn" data-mail-back>← 목록</button>
        <h3 class="mailbox-detail-title">${esc(m.title)}</h3>
        <div class="mailbox-detail-meta">운영자 · ${esc(fmtDate(m.createdAt))} · ${esc(leftText(m.expiresAt))}</div>
        <div class="mailbox-detail-body">${esc(m.body || '').replace(/\n/g, '<br>') || '<span class="mailbox-muted">(내용 없음)</span>'}</div>
        ${attachHtml}
        <div class="mailbox-actions">
          ${parts.length && !claimed ? `<button type="button" class="mailbox-btn primary" data-mail-claim="${m.id}" ${busy ? 'disabled' : ''}>${busy ? '받는 중...' : '📥 받기'}</button>` : ''}
          ${!parts.length || claimed ? `<button type="button" class="mailbox-btn danger" data-mail-delete="${m.id}">🗑 지우기</button>` : ''}
        </div>
      </div>`;
  }

  function open() {
    const modal = ensureModal();
    modal.style.display = 'flex';
    openId = null;
    render();
    refresh();
  }
  function close() {
    const modal = document.getElementById('modal-mailbox');
    if (modal) modal.style.display = 'none';
    openId = null;
  }

  // ------------------------------------------------------------ 연결
  function hook() {
    const se = SE();
    if (!se) return false;
    se.onGift = deliverGift;
    se.onSnapshot((snap) => { if (snap && snap.mail) setBadge(snap.mail); });
    if (se.snapshot && se.snapshot.mail) setBadge(se.snapshot.mail);
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook, { once: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  global.Mailbox = { open, close, refresh, setBadge, deliverGift, get mails() { return mails; } };
  global.openMailbox = open;
})(typeof window !== 'undefined' ? window : globalThis);
