/**
 * returnByDeath.js — 사망회귀 연출 (효과음 + 화면). 외부 음원 파일 없이 Web Audio API로 직접 합성한다.
 *
 *   0.00s ~ 1.20s  시계 틱 (짧은 노이즈 버스트, 간격이 점점 줄어든다)      화면: 채도 감소 시작
 *   1.25s, 1.55s   심장 박동 2회 (저역 사인파 펄스) → 정적
 *   1.90s ~ 2.40s  낮은 음 → 높은 음으로 급상승하는 드론 (주파수 램프 + 필터)
 *   2.40s          소리가 끊긴다 (짧은 무음)                                화면: 흰색 플래시
 *   2.40s ~ 2.95s  무음                                                      화면: 페이드 인 (원래 색으로)
 *
 * window.ReturnByDeathFX.play({ muted }) → 연출이 끝나면 resolve되는 Promise.
 * 오디오 컨텍스트는 사용자 입력 이후에만 만든다 (입력 전이면 화면 연출만 한다).
 */
(function (global) {
  'use strict';

  const TIMING = { ticksEnd: 1.2, beat1: 1.25, beat2: 1.55, droneStart: 1.9, cut: 2.4, end: 2.95 };
  let ctx = null;

  function userHasInteracted() {
    const ua = global.navigator && global.navigator.userActivation;
    return ua ? ua.hasBeenActive : true; // userActivation을 모르는 브라우저는 호출 시점(클릭 처리 중)을 믿는다
  }

  function getContext() {
    if (!userHasInteracted()) return null;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function noiseBuffer(ac, seconds) {
    const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // 시계 틱: 3kHz 대역의 아주 짧은 노이즈. 간격이 0.22s에서 점점 줄어든다.
  function scheduleTicks(ac, out, t0) {
    const buf = noiseBuffer(ac, 0.03);
    let t = 0;
    let gap = 0.22;
    while (t < TIMING.ticksEnd) {
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3000;
      bp.Q.value = 6;
      const g = ac.createGain();
      const at = t0 + t;
      const level = 0.35 + 0.4 * (t / TIMING.ticksEnd);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.025);
      src.connect(bp).connect(g).connect(out);
      src.start(at);
      src.stop(at + 0.03);
      t += gap;
      gap = Math.max(0.035, gap * 0.8);
    }
  }

  // 심장 박동: 55Hz → 40Hz 사인 펄스 (쿵-쿵 두 겹)
  function scheduleHeartbeat(ac, out, at) {
    [0, 0.13].forEach((offset, i) => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      const g = ac.createGain();
      const s = at + offset;
      osc.frequency.setValueAtTime(58, s);
      osc.frequency.exponentialRampToValueAtTime(38, s + 0.16);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.9 : 0.6, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.2);
      osc.connect(g).connect(out);
      osc.start(s);
      osc.stop(s + 0.22);
    });
  }

  // 급상승 드론: 톱니파 2개(살짝 어긋난 음정) → 로우패스(컷오프도 함께 상승) → cut 시점에 즉시 정지
  function scheduleDrone(ac, out, t0) {
    const s = t0 + TIMING.droneStart;
    const e = t0 + TIMING.cut;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 8;
    lp.frequency.setValueAtTime(200, s);
    lp.frequency.exponentialRampToValueAtTime(6000, e);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.35, e - 0.05);
    g.gain.setValueAtTime(0.35, e - 0.005);
    g.gain.linearRampToValueAtTime(0, e); // 짧은 클릭 방지용 5ms 컷
    lp.connect(g).connect(out);
    [1, 1.007].forEach(detune => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55 * detune, s);
      osc.frequency.exponentialRampToValueAtTime(1400 * detune, e);
      osc.connect(lp);
      osc.start(s);
      osc.stop(e + 0.01);
    });
  }

  function playSound(t0Offset) {
    const ac = getContext();
    if (!ac) return;
    const master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);
    const t0 = ac.currentTime + t0Offset;
    scheduleTicks(ac, master, t0);
    scheduleHeartbeat(ac, master, t0 + TIMING.beat1);
    scheduleHeartbeat(ac, master, t0 + TIMING.beat2);
    scheduleDrone(ac, master, t0);
    setTimeout(() => { try { master.disconnect(); } catch (e) { /* 이미 끊김 */ } }, (TIMING.end + 0.5) * 1000);
  }

  // 화면: 채도 감소 → 흰색 플래시 → 페이드 인. 연출 중에는 입력을 막는다.
  function playVisual() {
    return new Promise(resolve => {
      const doc = global.document;
      // 화면 전체를 덮는 레이어의 backdrop-filter로 뒤 화면의 채도를 뺀다 (body에 filter를 걸면 fixed 요소가 깨진다).
      const fx = doc.createElement('div');
      fx.className = 'rbd-fx';
      fx.setAttribute('aria-hidden', 'true');
      const flash = doc.createElement('div');
      flash.className = 'rbd-fx-flash';
      fx.appendChild(flash);
      doc.body.appendChild(fx);

      const desat = 'grayscale(1) brightness(0.75)';
      fx.style.transition = `backdrop-filter ${TIMING.cut}s ease-in, -webkit-backdrop-filter ${TIMING.cut}s ease-in`;
      // 시작 상태를 확정(리플로우)한 뒤 바꿔야 트랜지션이 걸린다. rAF는 백그라운드 탭에서 멈출 수 있어 쓰지 않는다.
      void fx.offsetWidth;
      fx.style.backdropFilter = desat;
      fx.style.webkitBackdropFilter = desat;

      setTimeout(() => {
        flash.style.transition = 'none';
        flash.style.opacity = '1';
        // 플래시 뒤에서 원래 색으로 돌려놓는다
        fx.style.transition = 'none';
        fx.style.backdropFilter = 'none';
        fx.style.webkitBackdropFilter = 'none';
        void flash.offsetWidth;
        flash.style.transition = `opacity ${TIMING.end - TIMING.cut}s ease-out`;
        flash.style.opacity = '0';
      }, TIMING.cut * 1000);

      setTimeout(() => {
        fx.remove();
        resolve();
      }, TIMING.end * 1000);
    });
  }

  function play(options) {
    const muted = !!(options && options.muted);
    if (!muted) {
      try { playSound(0.02); } catch (e) { console.warn('[ReturnByDeathFX] 효과음 재생 실패', e); }
    }
    return playVisual();
  }

  global.ReturnByDeathFX = { play, TIMING };
})(typeof window !== 'undefined' ? window : globalThis);
