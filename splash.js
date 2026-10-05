/* 진입 스플래시: 접속할 때마다 게임 이름이 애니메이션으로 뜬다.
   게임 이름을 정하면 아래 SPLASH_CONFIG만 바꾸면 된다. 화면을 터치하면 바로 건너뛴다. */
(function () {
  const SPLASH_CONFIG = {
    title: '회귀전선',          // TODO: 확정 전 임시 이름
    subtitle: 'RETURN  BY  DEATH',
    tagline: '죽음 끝에서, 다시 지휘봉을 잡다',
    holdMs: 2900,               // 연출이 끝난 뒤 사라지기까지 총 시간
  };

  const css = `
  #game-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(ellipse at 50% 40%,#12304f 0%,#0a1628 60%,#050b14 100%);color:#fff;overflow:hidden;
    transition:opacity .7s ease,visibility .7s;cursor:pointer;user-select:none}
  #game-splash.out{opacity:0;visibility:hidden;pointer-events:none}
  #game-splash .sp-glow{position:absolute;width:140vmin;height:140vmin;left:50%;top:42%;transform:translate(-50%,-50%) scale(.4);
    background:radial-gradient(circle,rgba(56,189,248,.35),transparent 60%);opacity:0;animation:spGlow 2.2s .1s ease-out forwards}
  #game-splash .sp-title{position:relative;display:flex;gap:.04em;font-size:clamp(44px,15vw,76px);font-weight:900;letter-spacing:.06em;
    text-shadow:0 0 24px rgba(56,189,248,.65),0 4px 0 rgba(0,0,0,.35)}
  #game-splash .sp-title span{display:inline-block;opacity:0;transform:translateY(.5em) scale(1.5);filter:blur(10px);
    animation:spChar .7s cubic-bezier(.2,.9,.3,1.2) forwards;animation-delay:calc(.35s + var(--i)*.14s)}
  #game-splash .sp-title{animation:spFlash .9s 1.3s ease-in-out}
  #game-splash .sp-line{width:0;height:2px;margin:18px 0 12px;background:linear-gradient(90deg,transparent,#38bdf8,transparent);
    animation:spLine .9s 1.1s ease-out forwards}
  #game-splash .sp-sub{font-size:13px;letter-spacing:.5em;color:#7dd3fc;opacity:0;animation:spFade .8s 1.4s forwards}
  #game-splash .sp-tag{margin-top:14px;font-size:12px;color:#94a3b8;opacity:0;animation:spFade .8s 1.8s forwards}
  #game-splash .sp-skip{position:absolute;bottom:28px;font-size:11px;color:#64748b;opacity:0;animation:spFade .6s 2s forwards,spBlink 1.6s 2.6s infinite}
  @keyframes spChar{to{opacity:1;transform:none;filter:blur(0)}}
  @keyframes spGlow{to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  @keyframes spFlash{50%{text-shadow:0 0 40px #fff,0 0 70px rgba(56,189,248,.9)}}
  @keyframes spLine{to{width:min(70vw,300px)}}
  @keyframes spFade{to{opacity:1}}
  @keyframes spBlink{50%{opacity:.35}}
  @media (prefers-reduced-motion:reduce){#game-splash *{animation-duration:.01s!important;animation-delay:0s!important}}
  `;

  const c = SPLASH_CONFIG;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'game-splash';
  el.innerHTML =
    '<div class="sp-glow"></div>' +
    '<div class="sp-title">' + [...c.title].map((ch, i) => '<span style="--i:' + i + '">' + (ch === ' ' ? '&nbsp;' : ch) + '</span>').join('') + '</div>' +
    '<div class="sp-line"></div>' +
    '<div class="sp-sub">' + c.subtitle + '</div>' +
    '<div class="sp-tag">' + c.tagline + '</div>' +
    '<div class="sp-skip">TAP TO START</div>';
  document.body.prepend(el);

  const close = () => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); style.remove(); }, 800);
  };
  el.addEventListener('click', close);
  setTimeout(close, c.holdMs);
})();
