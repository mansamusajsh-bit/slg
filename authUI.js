// ============================================================
// authUI.js — 로그인 창 (이메일/비밀번호 · Google · 오프라인)
// 사용법: <script src="authUI.js"></script> (supabase-bridge.js 가 'slg-auth-required' 이벤트를 던지면 뜬다)
//
// - 서버 경제(골드·지분·대출·경매)는 로그인한 계정에 묶인다. 오프라인으로 시작하면 클라우드 저장도 서버 경제도 없이 이 탭 안에서만 돈다.
// - Google 로그인은 supabase-config.js 에 google: true 를 켠 경우에만 보인다 (대시보드에서 Google 공급자도 켜야 한다).
// ============================================================

(function (global) {
  'use strict';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bridge = () => global.SupabaseBridge;

  const MESSAGES = [
    [/invalid login credentials/i, '이메일 또는 비밀번호가 맞지 않습니다.'],
    [/email not confirmed/i, '이메일 확인이 아직 안 됐습니다. 받은 편지함의 확인 메일을 눌러 주세요.'],
    [/user already registered|already been registered/i, '이미 가입된 이메일입니다. 로그인해 주세요.'],
    [/password should be at least|weak password/i, '비밀번호가 너무 짧거나 약합니다. (8자 이상)'],
    [/unable to validate email|invalid email|email address .* is invalid/i, '이메일 형식이 올바르지 않습니다.'],
    [/rate limit|too many/i, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
    [/provider is not enabled|unsupported provider/i, '이 로그인 방식은 아직 켜져 있지 않습니다.'],
    [/failed to fetch|network/i, '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.']
  ];
  const friendly = (e) => {
    const m = String((e && e.message) || e || '');
    const hit = MESSAGES.find(([re]) => re.test(m));
    return hit ? hit[1] : m || '알 수 없는 오류';
  };

  let mode = 'in';   // 'in' | 'up'
  let busy = false;

  function close() { document.getElementById('modal-auth')?.remove(); }

  function render(msg, kind) {
    const root = document.getElementById('modal-auth');
    if (!root) return;
    const card = root.querySelector('.auth-card');
    const google = !!(global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.google);
    card.innerHTML = `
      <div class="rbd-icon">🔐</div>
      <h2 class="rbd-title" style="color:#7dd3fc;">${mode === 'in' ? '로그인' : '계정 만들기'}</h2>
      <p class="rbd-text">골드·국가 지분·대출·경매는 서버가 계정별로 관리합니다.<br/>같은 계정으로 어느 기기에서든 이어서 할 수 있습니다.</p>
      <div class="auth-tabs">
        <button type="button" class="auth-tab ${mode === 'in' ? 'is-on' : ''}" data-auth-mode="in">로그인</button>
        <button type="button" class="auth-tab ${mode === 'up' ? 'is-on' : ''}" data-auth-mode="up">가입</button>
      </div>
      <form class="auth-form" autocomplete="on">
        <input type="email" id="auth-email" class="auth-input" placeholder="이메일" autocomplete="email" required ${busy ? 'disabled' : ''}>
        <input type="password" id="auth-pw" class="auth-input" placeholder="비밀번호 (8자 이상)" minlength="8" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" required ${busy ? 'disabled' : ''}>
        <button type="submit" class="rbd-btn" id="auth-submit" ${busy ? 'disabled' : ''}>${busy ? '처리 중…' : (mode === 'in' ? '로그인' : '가입하기')}</button>
      </form>
      ${google ? `<button type="button" class="rbd-btn auth-alt" id="auth-google" ${busy ? 'disabled' : ''}>Google 로 계속</button>` : ''}
      <div class="auth-msg ${kind || ''}" role="status">${esc(msg || '')}</div>
      <button type="button" class="auth-offline" id="auth-offline" ${busy ? 'disabled' : ''}>오프라인으로 시작 (저장 · 서버 경제 없음)</button>`;
    card.querySelectorAll('[data-auth-mode]').forEach((b) => { b.onclick = () => { mode = b.dataset.authMode; render(); }; });
    card.querySelector('.auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = card.querySelector('#auth-email').value.trim();
      const pw = card.querySelector('#auth-pw').value;
      busy = true; render('');
      try {
        if (mode === 'in') { await bridge().signInEmail(email, pw); close(); }
        else {
          const r = await bridge().signUpEmail(email, pw);
          if (r && r.needsConfirm) { busy = false; mode = 'in'; render('확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.', 'ok'); return; }
          close();
        }
      } catch (err) {
        busy = false; render(friendly(err), 'err');
        const emailEl = document.getElementById('auth-email');
        if (emailEl) emailEl.value = email;
        return;
      }
      busy = false;
    };
    const g = card.querySelector('#auth-google');
    if (g) g.onclick = async () => { try { await bridge().signInGoogle(); } catch (err) { render(friendly(err), 'err'); } };
    card.querySelector('#auth-offline').onclick = () => { close(); bridge().continueOffline(); };
  }

  function show() {
    if (document.getElementById('modal-auth')) return;
    const overlay = document.createElement('div');
    overlay.id = 'modal-auth';
    overlay.className = 'rbd-overlay';
    overlay.style.zIndex = '100010';
    overlay.innerHTML = '<div class="rbd-card auth-card" role="dialog" aria-label="로그인"></div>';
    document.body.appendChild(overlay);
    mode = 'in'; busy = false;
    render();
  }

  window.addEventListener('slg-auth-required', show);
  global.AuthUI = { show, close };
})(typeof window !== 'undefined' ? window : globalThis);
