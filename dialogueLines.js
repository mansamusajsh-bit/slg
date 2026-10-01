// ============================================================================
// 상황별 캐릭터 대사 (DialogueLines)
//   - SITUATIONS: 대사가 출력되는 상황 정의 (게임 로직이 이 key로 대사를 요청한다)
//   - DEFAULT_POOL: 상황별 기본 대사 풀. 캐릭터 생성 시 여기서 랜덤으로 몇 줄을 골라 부여한다.
//   - 캐릭터/유닛은 dialogues: { [situationKey]: string[] } 를 가진다.
//   - 대사 안의 {target} {hp} {maxHp} {win} {name} 은 출력 시 치환된다.
// ============================================================================

(function (global) {
  'use strict';

  const SITUATIONS = [
    { key: 'refuse_danger',   icon: '😨', label: '전투 거부 (승률 위험)',   desc: '호감도 30 이하 + 승률이 낮아 공격 명령을 거부할 때' },
    { key: 'refuse_lowhp',    icon: '🩸', label: '전투 거부 (빈사 상태)',   desc: '호감도 30 이하 + HP 25% 이하라 공격을 거부할 때' },
    { key: 'refuse_distrust', icon: '💔', label: '전투 거부 (불신)',        desc: '호감도 15 이하라 어떤 공격 명령도 거부할 때' },
    { key: 'refuse_skill',    icon: '🚫', label: '스킬 명령 거부',          desc: '호감도 30 이하라 공격 스킬 사용을 거부할 때' },
    { key: 'brave_attack',    icon: '🔥', label: '신뢰의 돌격',             desc: '호감도 70 이상인데 승률 50% 미만인 공격을 받아들일 때' },
    { key: 'forced_attack',   icon: '😤', label: '광폭화 강제 돌격',        desc: '호감도가 낮지만 지휘관 광폭화로 억지로 공격할 때' },
    { key: 'enemy_defeated',  icon: '⚔️', label: '적 격파',                desc: '공격으로 적을 쓰러뜨렸을 때 (35% 확률로 출력)' }
  ];

  const DEFAULT_POOL = {
    refuse_danger: [
      '{target}의 기세가 너무 흉포합니다... 살아서 돌아오지 못할 거예요!',
      '승산이 {win}%라고요? 이건 작전이 아니라 처형이잖아요!',
      '죽고 싶지 않아요...! 제발 이번 명령만은...!',
      '저 녀석한테 덤비라고요? 차라리 절 지금 베세요.',
      '이런 무모한 사지로는 못 갑니다. 다른 길을 찾으세요.',
      '지휘관님은 뒤에서 보기만 하시잖아요. 이번엔 못 따릅니다.',
      '…싫어요. 저도 살아서 집에 가고 싶다고요.',
      '{target} 앞에 서는 순간 끝이에요. 명령 철회해 주세요!',
      '계산은 할 줄 아시죠? 이건 그냥 버리는 패예요.',
      '거절합니다. 제 목숨은 그렇게 싸지 않아요.'
    ],
    refuse_lowhp: [
      '피가 멈추지 않아요... (HP {hp}/{maxHp}) 더 싸우다간 죽고 말 거예요!',
      '다리가... 움직이질 않아요. 지금은 무리예요.',
      '이 몸으로 또 싸우라고요? 붕대부터 감게 해주세요...',
      '시야가 흐려요... 한 번만 더 맞으면 끝이에요.',
      '숨 쉬는 것조차 버거워요. 제발 물러나게 해주세요.',
      '검을 쥘 힘도 없어요. 지금 나가면 개죽음이에요.',
      '…상처가 벌어졌어요. 이대로는 못 갑니다.',
      '살려주세요... 아직 죽기 싫어요.'
    ],
    refuse_distrust: [
      '지휘관님을 더는 신뢰할 수 없습니다! 이런 자살 특공 명령엔 따를 수 없어요!',
      '당신 명령엔 이제 안 움직입니다. 알아서 하세요.',
      '또 저를 소모품 취급하시는군요. 이번엔 사양하죠.',
      '몇 번이나 버려졌는지 세어보셨나요? 전 세고 있었어요.',
      '흥. 그 명령, 못 들은 걸로 하겠습니다.',
      '당신을 위해 피 흘릴 이유가 더는 없어요.',
      '명령이요? 부탁도 아니고 명령이요? …싫습니다.',
      '제 충성은 바닥났어요. 다른 사람한테 시키세요.'
    ],
    refuse_skill: [
      '그 힘을 그런 데 쓰라고요? 거절합니다.',
      '지금 그 기술을 쓰면 제가 먼저 쓰러져요. 못 해요.',
      '이건 제 기술이에요. 당신 명령으로 쓰는 게 아니라고요.',
      '…집중이 안 돼요. 지금은 못 씁니다.',
      '그렇게 함부로 부릴 수 있는 힘이 아니에요.',
      '싫어요. 그 기술은 믿는 사람을 위해서만 써요.'
    ],
    brave_attack: [
      '승산이 {win}%라도 괜찮아요. 지휘관님이 가라면 갑니다!',
      '무섭지 않다면 거짓말이지만… 당신을 믿어요.',
      '{target}이든 뭐든, 길은 제가 열겠습니다!',
      '이길 확률 따위 상관없어요. 지휘관님 곁이라면.',
      '맡겨주세요. 반드시 살아서 돌아올게요!',
      '불리한 싸움일수록 제 진가가 나오는 법이죠!',
      '지휘관님이 고른 길이라면, 그게 정답이에요.',
      '각오는 끝났습니다. 뒤는 부탁드려요!',
      '지켜봐 주세요. 이 정도 역경쯤은 넘어 보일게요.',
      '당신이 믿어준 만큼, 저도 당신을 믿어요. 갑니다!'
    ],
    forced_attack: [
      '…알았어요, 간다고요! 대신 죽으면 당신 탓이에요!',
      '이게 지휘관님 방식이군요. 기억해 둘게요.',
      '억지로 등 떠밀려 가는 건 이번이 마지막이에요.',
      '크윽… 몸이 멋대로… 좋아요, 가면 되잖아요!',
      '명령이니까 가는 거예요. 착각하지 마세요.',
      '살아 돌아오면… 각오하세요.'
    ],
    enemy_defeated: [
      '하나 처리했습니다!',
      '{target}, 쓰러뜨렸어요!',
      '보셨죠? 이 정도는 식은 죽 먹기예요.',
      '다음 상대는 누구죠?',
      '흥, 별것 아니었네.',
      '지휘관님, 길이 열렸습니다!',
      '휴… 이겼다. 다음도 맡겨주세요.',
      '이 승리는 지휘관님께 바칩니다.'
    ]
  };

  const AUTO_ASSIGN_COUNT = 3;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** 한 상황에 대해 기본 풀에서 n줄을 랜덤으로 뽑는다. */
  function randomLines(key, n = AUTO_ASSIGN_COUNT) {
    return shuffle(DEFAULT_POOL[key] || []).slice(0, n);
  }

  /** 모든 상황에 대해 랜덤 대사 세트를 만든다. */
  function randomDialogues(n = AUTO_ASSIGN_COUNT) {
    const out = {};
    SITUATIONS.forEach(s => { out[s.key] = randomLines(s.key, n); });
    return out;
  }

  /** 비어 있는 상황만 랜덤 대사로 채운다. */
  function fillMissing(dialogues, n = AUTO_ASSIGN_COUNT) {
    const out = {};
    SITUATIONS.forEach(s => {
      const lines = Array.isArray(dialogues?.[s.key]) ? dialogues[s.key].filter(l => String(l).trim()) : [];
      out[s.key] = lines.length ? lines : randomLines(s.key, n);
    });
    return out;
  }

  function fillVars(text, vars = {}) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
  }

  /**
   * 유닛의 상황별 대사를 하나 고른다. 유닛 고유 대사 → 기본 풀 순으로 찾는다.
   * vars: { target, hp, maxHp, win, name }
   */
  function pick(unit, key, vars = {}) {
    const own = Array.isArray(unit?.dialogues?.[key]) ? unit.dialogues[key].filter(l => String(l).trim()) : [];
    const pool = own.length ? own : (DEFAULT_POOL[key] || []);
    if (!pool.length) return '';
    const line = pool[Math.floor(Math.random() * pool.length)];
    return fillVars(line, {
      name: unit?.name,
      hp: unit?.hp,
      maxHp: unit?.maxHp,
      ...vars
    });
  }

  // --------------------------------------------------------------------------
  // 대사 편집기 (캐릭터 생성 탭 / 보관함 대사 편집 모달 공용)
  // --------------------------------------------------------------------------
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * container 안에 상황별 대사 textarea 묶음을 그린다. (한 줄 = 대사 하나)
   * 반환값: { getDialogues(), setDialogues(d), randomizeAll() }
   */
  function mountEditor(container, initial) {
    if (!container) return null;
    container.innerHTML = `
      <div class="dlg-editor-toolbar">
        <span class="dlg-editor-hint">한 줄에 대사 하나. 상황이 오면 이 중 하나가 랜덤으로 나옵니다.<br/>치환: <code>{target}</code> 적 이름 · <code>{win}</code> 승률% · <code>{hp}</code>/<code>{maxHp}</code> 체력</span>
        <button type="button" class="btn-cheat purple dlg-btn-all">🎲 전체 랜덤 부여</button>
      </div>
      ${SITUATIONS.map(s => `
        <div class="dlg-editor-row" data-key="${s.key}">
          <div class="dlg-editor-row-head">
            <span class="dlg-editor-label">${s.icon} ${esc(s.label)}</span>
            <button type="button" class="btn-cheat dlg-btn-one" title="이 상황만 랜덤 부여">🎲</button>
          </div>
          <div class="dlg-editor-desc">${esc(s.desc)}</div>
          <textarea class="dbg-form-control dlg-editor-text" rows="3" spellcheck="false"></textarea>
        </div>
      `).join('')}
    `;

    const areaOf = (key) => container.querySelector(`.dlg-editor-row[data-key="${key}"] textarea`);

    function setDialogues(d) {
      SITUATIONS.forEach(s => {
        const area = areaOf(s.key);
        if (area) area.value = (Array.isArray(d?.[s.key]) ? d[s.key] : []).join('\n');
      });
    }

    function getDialogues() {
      const out = {};
      SITUATIONS.forEach(s => {
        const area = areaOf(s.key);
        out[s.key] = (area?.value || '').split('\n').map(l => l.trim()).filter(Boolean);
      });
      return out;
    }

    function randomizeAll() { setDialogues(randomDialogues()); }

    container.querySelector('.dlg-btn-all').onclick = randomizeAll;
    container.querySelectorAll('.dlg-editor-row').forEach(row => {
      row.querySelector('.dlg-btn-one').onclick = () => {
        row.querySelector('textarea').value = randomLines(row.dataset.key).join('\n');
      };
    });

    setDialogues(initial || randomDialogues());
    return { getDialogues, setDialogues, randomizeAll };
  }

  global.DialogueLines = {
    SITUATIONS,
    DEFAULT_POOL,
    randomLines,
    randomDialogues,
    fillMissing,
    pick,
    mountEditor
  };
})(typeof window !== 'undefined' ? window : this);
