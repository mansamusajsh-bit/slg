/**
 * skillEngine.js — 스킬 / 스킬트리 / 상태이상 엔진
 *
 * 스킬 한 개 = 대상 지정(targeting) + 효과 목록(effects).
 *   targeting: { mode, rangeMin, rangeMax, radius, affects }
 *     mode    SELF(자신 중심) | ALLY(아군 1명 지정) | ENEMY(적 1명 지정) | TILE(칸 지정)
 *     radius  0 = 지정한 대상만, 1 이상 = 중심에서 맨해튼 거리 radius 이내 전부
 *     affects 범위 안에서 효과를 받는 쪽: ENEMY | ALLY | ALL
 *   effects: [{ type, value, duration, scale, to }]
 *     to      'targets'(기본, 범위 안 대상) | 'self'(시전자에게)
 *
 * 전투 로직(state, getTile, addLog 등)은 game.js가 configure()로 넘겨준다.
 * 상태이상은 unit.statuses = [{ type, value, turns, casterId, source }] 에 저장되며
 * 라운드(아군 턴 + 적 턴)가 끝날 때 1씩 줄어든다.
 */
(function (global) {
  'use strict';

  // --------------------------------------------------------------------------
  // 효과 카탈로그
  // --------------------------------------------------------------------------
  const EFFECTS = {
    DAMAGE:         { label: '피해',            icon: '⚔️', cat: 'attack',  hostile: true,  value: 30, scalable: true },
    DRAIN:          { label: '흡혈 피해',       icon: '🩸', cat: 'attack',  hostile: true,  value: 20, scalable: true },
    DOT:            { label: '지속 피해',       icon: '🔥', cat: 'attack',  hostile: true,  value: 8,  duration: 2, status: true },
    HEAL:           { label: '회복',            icon: '💚', cat: 'support', value: 30, scalable: true },
    REGEN:          { label: '지속 회복',       icon: '🌿', cat: 'support', value: 10, duration: 2, status: true, passive: true },
    SHIELD:         { label: '보호막',          icon: '🔰', cat: 'support', value: 25, duration: 2, status: true },
    CLEANSE:        { label: '정화 / 해제',     icon: '✨', cat: 'utility', value: 0 },
    BUFF_ATK:       { label: '공격력 증가 %',   icon: '💪', cat: 'buff',    value: 25, duration: 1, status: true, passive: true },
    BUFF_DEF:       { label: '방어력 증가 %',   icon: '🛡️', cat: 'buff',    value: 25, duration: 1, status: true, passive: true },
    DEBUFF_ATK:     { label: '공격력 감소 %',   icon: '📉', cat: 'debuff',  hostile: true,  value: 25, duration: 1, status: true },
    DEBUFF_DEF:     { label: '방어력 감소 %',   icon: '💔', cat: 'debuff',  hostile: true,  value: 25, duration: 1, status: true },
    MARK:           { label: '약점 표식 (받는 피해 +%)', icon: '🎯', cat: 'debuff', hostile: true, value: 30, duration: 2, status: true },
    STUN:           { label: '기절 (행동 불가)', icon: '💫', cat: 'control', hostile: true,  value: 0,  duration: 1, status: true },
    ROOT:           { label: '속박 (이동 불가)', icon: '⛓️', cat: 'control', hostile: true,  value: 0,  duration: 1, status: true },
    SLOW:           { label: '둔화 (AP 감소)',  icon: '🐌', cat: 'control', hostile: true,  value: 1,  duration: 1, status: true },
    TAUNT:          { label: '도발 (시전자만 공격)', icon: '📣', cat: 'control', hostile: true, value: 0, duration: 1, status: true },
    STEALTH:        { label: '은신 (적 AI가 노리지 않음)', icon: '👻', cat: 'utility', value: 0, duration: 1, status: true },
    PROTECT:        { label: '불굴 (치명상 1회 버팀)', icon: '🕊️', cat: 'utility', value: 0, duration: 2, status: true, passive: true },
    RESTORE_AP:     { label: 'AP 회복',         icon: '⚡', cat: 'utility', value: 1 },
    BONUS_AP:       { label: '턴 시작 AP +',    icon: '🔋', cat: 'utility', value: 1, passiveOnly: true, passive: true },
    COOLDOWN_RESET: { label: '재사용 대기 감소', icon: '⏩', cat: 'utility', value: 1 },
    KNOCKBACK:      { label: '밀쳐내기 (칸)',   icon: '💨', cat: 'mobility', hostile: true, value: 1 },
    PULL:           { label: '끌어오기 (칸)',   icon: '🪝', cat: 'mobility', hostile: true, value: 1 },
    TELEPORT:       { label: '순간이동 (지정 칸으로)', icon: '🌀', cat: 'mobility', value: 0, selfOnly: true },
    SWAP:           { label: '위치 교환',       icon: '🔄', cat: 'mobility', value: 0 }
  };

  const CATEGORY_LABELS = {
    attack: '공격', support: '회복', buff: '강화', debuff: '약화',
    control: '제어', utility: '유틸', mobility: '기동'
  };

  const TARGET_MODES = {
    SELF:  '자신 중심',
    ALLY:  '아군 1명 지정',
    ENEMY: '적 1명 지정',
    TILE:  '칸 지정'
  };
  const AFFECTS = { ENEMY: '적', ALLY: '아군', ALL: '피아 모두' };

  // --------------------------------------------------------------------------
  // 프리셋 스킬 라이브러리 (DEV 빌더에서 한 번에 추가 가능)
  // --------------------------------------------------------------------------
  const T = (mode, rangeMax, radius, affects, rangeMin) => ({ mode, rangeMin: rangeMin ?? (mode === 'SELF' ? 0 : 1), rangeMax, radius, affects });
  const PRESETS = {
    precise_strike: { name: '정밀 타격', icon: '🗡️', type: 'ACTIVE', costAP: 1, coolDown: 1, targeting: T('ENEMY', 1, 0, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 18, scale: 30 }] },
    whirlwind:      { name: '선풍연격', icon: '🌪️', type: 'ACTIVE', costAP: 2, coolDown: 2, targeting: T('SELF', 0, 1, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 22, scale: 20 }] },
    shield_bash:    { name: '방패 강타', icon: '🛡️', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('ENEMY', 1, 0, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 12 }, { type: 'STUN', duration: 1 }] },
    charge:         { name: '돌진 강타', icon: '🐎', type: 'ACTIVE', costAP: 2, coolDown: 2, targeting: T('ENEMY', 2, 0, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 20, scale: 25 }, { type: 'KNOCKBACK', value: 1 }] },
    fireball:       { name: '화염구', icon: '☄️', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 3, 1, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 16, scale: 20 }, { type: 'DOT', value: 6, duration: 2 }] },
    frost_nova:     { name: '서리 고리', icon: '❄️', type: 'ACTIVE', costAP: 2, coolDown: 3, targeting: T('SELF', 0, 2, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 10 }, { type: 'ROOT', duration: 1 }] },
    meteor:         { name: '유성 낙하', icon: '🌠', type: 'ACTIVE', costAP: 3, coolDown: 4, targeting: T('TILE', 4, 1, 'ENEMY', 2), effects: [{ type: 'DAMAGE', value: 35, scale: 30 }] },
    snipe:          { name: '급소 저격', icon: '🏹', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 4, 0, 'ENEMY', 2), effects: [{ type: 'DAMAGE', value: 28, scale: 25 }] },
    hunter_mark:    { name: '사냥꾼의 표식', icon: '🎯', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 4, 0, 'ENEMY'), effects: [{ type: 'MARK', value: 30, duration: 2 }, { type: 'DEBUFF_DEF', value: 20, duration: 2 }] },
    binding_arrow:  { name: '속박 화살', icon: '⛓️', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 3, 0, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 8 }, { type: 'ROOT', duration: 2 }] },
    hook:           { name: '갈고리 사슬', icon: '🪝', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 3, 0, 'ENEMY', 2), effects: [{ type: 'PULL', value: 2 }, { type: 'DEBUFF_ATK', value: 15, duration: 1 }] },
    blood_blade:    { name: '흡혈 검무', icon: '🩸', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 1, 0, 'ENEMY'), effects: [{ type: 'DRAIN', value: 20, scale: 20 }] },
    war_cry:        { name: '함성', icon: '📯', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('SELF', 0, 2, 'ALLY'), effects: [{ type: 'BUFF_ATK', value: 25, duration: 1 }] },
    taunt:          { name: '도발', icon: '📣', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('SELF', 0, 2, 'ENEMY'), effects: [{ type: 'TAUNT', duration: 1 }, { type: 'BUFF_DEF', value: 30, duration: 1, to: 'self' }] },
    guardian_oath:  { name: '수호의 맹세', icon: '🕊️', type: 'ACTIVE', costAP: 1, coolDown: 4, targeting: T('ALLY', 2, 0, 'ALLY'), effects: [{ type: 'PROTECT', duration: 2 }, { type: 'SHIELD', value: 20, duration: 2 }] },
    first_aid:      { name: '응급 처치', icon: '💚', type: 'ACTIVE', costAP: 1, coolDown: 1, targeting: T('ALLY', 1, 0, 'ALLY', 0), effects: [{ type: 'HEAL', value: 30 }] },
    sanctuary:      { name: '성역', icon: '⛪', type: 'ACTIVE', costAP: 2, coolDown: 3, targeting: T('SELF', 0, 1, 'ALLY'), effects: [{ type: 'HEAL', value: 20 }, { type: 'REGEN', value: 8, duration: 2 }, { type: 'CLEANSE' }] },
    purify:         { name: '정화의 빛', icon: '✨', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ALLY', 3, 0, 'ALLY', 0), effects: [{ type: 'CLEANSE' }, { type: 'SHIELD', value: 15, duration: 1 }] },
    command:        { name: '전술 지휘', icon: '🎖️', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('ALLY', 3, 0, 'ALLY'), effects: [{ type: 'RESTORE_AP', value: 2 }, { type: 'COOLDOWN_RESET', value: 1 }] },
    blink:          { name: '순간이동', icon: '🌀', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('TILE', 3, 0, 'ALLY', 1), effects: [{ type: 'TELEPORT' }] },
    swap:           { name: '위치 교환', icon: '🔄', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('ALLY', 4, 0, 'ALLY'), effects: [{ type: 'SWAP' }, { type: 'SHIELD', value: 15, duration: 1 }] },
    smoke:          { name: '연막탄', icon: '🌫️', type: 'ACTIVE', costAP: 1, coolDown: 3, targeting: T('SELF', 0, 1, 'ALLY'), effects: [{ type: 'STEALTH', duration: 1 }] },
    shotgun:        { name: '산탄 사격', icon: '💥', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('ENEMY', 2, 0, 'ENEMY'), effects: [{ type: 'DAMAGE', value: 16, scale: 20 }, { type: 'KNOCKBACK', value: 2 }] },
    bombard:        { name: '초토화 포격', icon: '💣', type: 'ACTIVE', costAP: 2, coolDown: 3, targeting: T('TILE', 4, 1, 'ENEMY', 2), effects: [{ type: 'DAMAGE', value: 26, scale: 20 }, { type: 'SLOW', value: 1, duration: 1 }] },
    reload:         { name: '긴급 재장전', icon: '🔁', type: 'ACTIVE', costAP: 0, coolDown: 4, targeting: T('SELF', 0, 0, 'ALLY'), effects: [{ type: 'COOLDOWN_RESET', value: 2 }, { type: 'RESTORE_AP', value: 1 }] },
    entrench:       { name: '참호 구축', icon: '🧱', type: 'ACTIVE', costAP: 1, coolDown: 2, targeting: T('SELF', 0, 0, 'ALLY'), effects: [{ type: 'BUFF_DEF', value: 40, duration: 1 }, { type: 'SHIELD', value: 15, duration: 1 }] },
    berserk:        { name: '광폭화', icon: '😤', type: 'ACTIVE', costAP: 0, coolDown: 3, targeting: T('SELF', 0, 0, 'ALLY'), effects: [{ type: 'BUFF_ATK', value: 40, duration: 1 }, { type: 'DEBUFF_DEF', value: 20, duration: 1 }] },
    // 패시브
    iron_will:      { name: '강철 의지', icon: '🛡️', type: 'PASSIVE', effects: [{ type: 'BUFF_DEF', value: 15 }] },
    weapon_master:  { name: '무기 숙련', icon: '⚔️', type: 'PASSIVE', effects: [{ type: 'BUFF_ATK', value: 15 }] },
    vitality:       { name: '재생력', icon: '🌿', type: 'PASSIVE', effects: [{ type: 'REGEN', value: 6 }] },
    mana_flow:      { name: '마나 순환', icon: '🔋', type: 'PASSIVE', effects: [{ type: 'BONUS_AP', value: 1 }] },
    undying:        { name: '불굴의 투지', icon: '🕊️', type: 'PASSIVE', effects: [{ type: 'PROTECT' }] },
    leadership_aura:{ name: '지휘 오라', icon: '🚩', type: 'PASSIVE', targeting: T('SELF', 0, 1, 'ALLY'), effects: [{ type: 'BUFF_ATK', value: 10 }, { type: 'BUFF_DEF', value: 10 }] }
  };

  // 병과별 추천 스킬트리: [프리셋 id, tier, 선행 프리셋 id 목록, 시작 습득 여부]
  const CLASS_TREES = {
    KNIGHT:  [['charge', 1, [], true], ['iron_will', 1, []], ['shield_bash', 2, ['charge']], ['taunt', 2, ['iron_will']], ['guardian_oath', 3, ['taunt']], ['leadership_aura', 3, ['shield_bash', 'taunt']], ['undying', 4, ['guardian_oath']]],
    MAGE:    [['fireball', 1, [], true], ['mana_flow', 1, []], ['frost_nova', 2, ['fireball']], ['blink', 2, ['mana_flow']], ['purify', 2, ['mana_flow']], ['meteor', 3, ['frost_nova']], ['command', 3, ['blink', 'purify']]],
    ARCHER:  [['snipe', 1, [], true], ['hunter_mark', 1, []], ['binding_arrow', 2, ['snipe']], ['smoke', 2, ['hunter_mark']], ['weapon_master', 2, ['snipe']], ['blink', 3, ['smoke']], ['bombard', 3, ['binding_arrow', 'weapon_master']]],
    MELEE:   [['precise_strike', 1, [], true], ['weapon_master', 1, []], ['blood_blade', 2, ['precise_strike']], ['hook', 2, ['precise_strike']], ['berserk', 2, ['weapon_master']], ['whirlwind', 3, ['blood_blade', 'berserk']], ['undying', 4, ['whirlwind']]],
    FIREARM: [['shotgun', 1, [], true], ['entrench', 1, []], ['bombard', 2, ['shotgun']], ['smoke', 2, ['entrench']], ['reload', 2, ['entrench']], ['swap', 3, ['smoke']], ['first_aid', 3, ['reload']]],
    DEFAULT: [['precise_strike', 1, [], true], ['first_aid', 1, []], ['iron_will', 1, []], ['whirlwind', 2, ['precise_strike']], ['blink', 2, ['first_aid']], ['taunt', 2, ['iron_will']], ['sanctuary', 3, ['first_aid', 'iron_will']], ['undying', 4, ['sanctuary']]]
  };

  // --------------------------------------------------------------------------
  // 유틸
  // --------------------------------------------------------------------------
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const newId = () => `skill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  let ctx = {
    getState: () => global.state || {},
    getTile: () => ({}),
    log: (msg) => console.log(msg),
    onUnitKilled: () => {}
  };
  function configure(options) { ctx = Object.assign({}, ctx, options || {}); }

  function sideOf(unit) { return unit && unit.owner === 'ENEMY' ? 'ENEMY' : 'PLAYER'; }
  function allUnits() {
    const s = ctx.getState();
    return [...(s.playerUnits || []), ...(s.enemyUnits || [])].filter(u => u && !u.isDead);
  }
  function unitsOfSide(side) {
    const s = ctx.getState();
    return ((side === 'ENEMY' ? s.enemyUnits : s.playerUnits) || []).filter(u => u && !u.isDead);
  }
  function isHostileTo(a, b) { return sideOf(a) !== sideOf(b); }

  // --------------------------------------------------------------------------
  // 정규화 (구버전 customSkill / skillTree 노드 → 신규 구조)
  // --------------------------------------------------------------------------
  function legacyToNew(raw) {
    const v = num(raw.effectValue, 20);
    if (String(raw.type).toUpperCase() === 'PASSIVE') {
      return { targeting: T('SELF', 0, 0, 'ALLY'), effects: [{ type: 'BUFF_ATK', value: v }, { type: 'BUFF_DEF', value: v }] };
    }
    switch (raw.targetType) {
      case 'AOE':  return { targeting: T('SELF', 0, 2, 'ENEMY'), effects: [{ type: 'DAMAGE', value: v }] };
      case 'SELF': return { targeting: T('SELF', 0, 0, 'ALLY'), effects: [{ type: 'RESTORE_AP', value: 9 }, { type: 'HEAL', value: v }] };
      case 'BUFF': return { targeting: T('SELF', 0, 1, 'ALLY'), effects: [{ type: 'HEAL', value: v }, { type: 'BUFF_ATK', value: 25, duration: 1 }, { type: 'BUFF_DEF', value: 25, duration: 1 }] };
      case 'SINGLE_TARGET':
      default:     return { targeting: T('ENEMY', 2, 0, 'ENEMY'), effects: [{ type: 'DAMAGE', value: v }] };
    }
  }

  function normalizeEffect(e) {
    const def = EFFECTS[e && e.type];
    if (!def) return null;
    const out = { type: e.type, value: num(e.value, def.value) };
    if (def.status) out.duration = Math.max(1, num(e.duration, def.duration || 1));
    if (def.scalable && num(e.scale) > 0) out.scale = num(e.scale);
    if (e.to === 'self') out.to = 'self';
    return out;
  }

  function normalizeSkill(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type).toUpperCase() === 'PASSIVE' ? 'PASSIVE' : 'ACTIVE';
    const base = Array.isArray(raw.effects) && raw.effects.length ? { targeting: raw.targeting, effects: raw.effects } : legacyToNew(raw);
    const tg = base.targeting || T('SELF', 0, 0, 'ALLY');
    const mode = TARGET_MODES[tg.mode] ? tg.mode : 'SELF';
    const rangeMax = mode === 'SELF' ? 0 : Math.max(0, num(tg.rangeMax, 1));
    const targeting = {
      mode,
      rangeMin: mode === 'SELF' ? 0 : Math.max(0, Math.min(rangeMax, num(tg.rangeMin, 1))),
      rangeMax,
      radius: Math.max(0, num(tg.radius, 0)),
      affects: AFFECTS[tg.affects] ? tg.affects : (mode === 'ENEMY' ? 'ENEMY' : 'ALLY')
    };
    let effects = base.effects.map(normalizeEffect).filter(Boolean);
    if (type === 'PASSIVE') {
      effects = effects.filter(e => EFFECTS[e.type].passive);
      effects.forEach(e => { delete e.duration; }); // 패시브는 상시 적용
    }
    else effects = effects.filter(e => !EFFECTS[e.type].passiveOnly);
    const skill = {
      id: raw.id || fallbackId || newId(),
      name: String(raw.name || '이름 없는 스킬'),
      icon: raw.icon || (type === 'PASSIVE' ? '🛡️' : '⚡'),
      imageUrl: raw.imageUrl || '',
      type,
      tier: Math.max(1, Math.min(4, num(raw.tier, 1))),
      prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites.filter(Boolean) : [],
      spCost: Math.max(0, num(raw.spCost, Math.max(1, num(raw.tier, 1)))),
      startsLearned: !!raw.startsLearned,
      costAP: type === 'ACTIVE' ? Math.max(0, num(raw.costAP, 1)) : 0,
      coolDown: type === 'ACTIVE' ? Math.max(1, num(raw.coolDown, 1)) : 0,   // 액티브 스킬은 최소 1턴: 한 턴에 같은 스킬을 두 번 쓰지 못한다
      targeting,
      effects
    };
    skill.description = (raw.description && !raw.autoDescription) ? String(raw.description) : describeSkill(skill);
    if (raw.autoDescription) skill.autoDescription = true;
    return skill;
  }

  function fromPreset(presetId, extra) {
    const p = PRESETS[presetId];
    if (!p) return null;
    return normalizeSkill(Object.assign(clone(p), { id: newId(), autoDescription: true }, extra || {}));
  }

  function buildClassTree(classType) {
    const rows = CLASS_TREES[classType] || CLASS_TREES.DEFAULT;
    const idMap = {};
    const nodes = rows.map(([pid, tier, , starts]) => {
      const node = fromPreset(pid, { tier, startsLearned: !!starts });
      idMap[pid] = node.id;
      return node;
    });
    rows.forEach(([, , prereqs], i) => { nodes[i].prerequisites = prereqs.map(p => idMap[p]).filter(Boolean); });
    return nodes;
  }

  // --------------------------------------------------------------------------
  // 랜덤 생성 (DEV 빌더의 🎲 버튼) — 효과·수치·이름·아이콘까지 정한다. 계층이 높을수록 수치가 크다.
  // --------------------------------------------------------------------------
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // 효과 종류별 수치 범위 [최소, 최대] (계층 1 기준) — 계층마다 +20%
  const RANDOM_VALUE_RANGE = {
    DAMAGE: [14, 26], DRAIN: [12, 22], DOT: [5, 10], HEAL: [18, 32], REGEN: [5, 10], SHIELD: [12, 25],
    BUFF_ATK: [15, 35], BUFF_DEF: [15, 35], DEBUFF_ATK: [10, 25], DEBUFF_DEF: [10, 25], MARK: [15, 35]
  };
  const RANDOM_PASSIVE_RANGE = { BUFF_ATK: [5, 15], BUFF_DEF: [5, 15], REGEN: [3, 7] };
  const SMALL_VALUE_MAX = { SLOW: 1, RESTORE_AP: 2, BONUS_AP: 1, COOLDOWN_RESET: 2, KNOCKBACK: 2, PULL: 2 };

  // 이름: 접두어 + 주효과에 맞는 명사 ("화염 강타", "성광의 결계")
  const NAME_PREFIXES = ['화염', '서리', '폭풍', '심연', '성광', '그림자', '강철', '혈월', '천둥', '질풍', '대지', '별빛', '망령', '황혼', '여명', '독사', '용린', '백야', '칠흑', '청람', '홍련', '은월', '파멸', '수호성'];
  const NAME_NOUNS = {
    DAMAGE: ['일격', '참격', '강타', '난무', '파쇄', '연격', '섬광', '포격'], DRAIN: ['흡혈', '포식', '갈취'],
    DOT: ['저주', '낙인', '독무', '업화'], HEAL: ['치유', '축복', '기도', '은총'], REGEN: ['숨결', '생명', '재생'],
    SHIELD: ['장벽', '결계', '방패'], BUFF_ATK: ['함성', '격노', '고양'], BUFF_DEF: ['수호', '철벽', '맹세'],
    DEBUFF_ATK: ['쇠약', '위압'], DEBUFF_DEF: ['침식', '균열'], MARK: ['표식', '낙인'], STUN: ['충격', '봉인'],
    ROOT: ['속박', '사슬'], SLOW: ['늪', '족쇄'], TAUNT: ['포효', '도발'], STEALTH: ['장막', '은신'],
    PROTECT: ['불굴', '가호'], CLEANSE: ['정화', '해방'], RESTORE_AP: ['가속', '각성'], BONUS_AP: ['순환', '각성'],
    COOLDOWN_RESET: ['회귀', '집중'], KNOCKBACK: ['폭풍', '충격파'], PULL: ['갈고리', '인력']
  };
  const NAME_ICONS = {
    DAMAGE: ['⚔️', '🗡️', '🔥', '⚡', '💥', '🌪️', '☄️'], DRAIN: ['🩸', '🦇'], DOT: ['🔥', '☠️', '🧪'], HEAL: ['💚', '✨', '🙏'],
    REGEN: ['🌿', '🍃'], SHIELD: ['🔰', '🛡️'], BUFF_ATK: ['💪', '📯'], BUFF_DEF: ['🛡️', '🧱'], PROTECT: ['🕊️'], BONUS_AP: ['🔋']
  };

  function randomValue(type, tier, passive) {
    const def = EFFECTS[type];
    if (SMALL_VALUE_MAX[type]) return rint(1, Math.min(SMALL_VALUE_MAX[type], tier >= 3 ? SMALL_VALUE_MAX[type] : 1));
    const range = (passive && RANDOM_PASSIVE_RANGE[type]) || RANDOM_VALUE_RANGE[type];
    if (!range) return def.value;
    const v = rint(range[0], range[1]) * (1 + 0.2 * (tier - 1));
    return range[1] >= 20 ? Math.max(5, Math.round(v / 5) * 5) : Math.round(v); // 큰 수치는 5 단위
  }

  function randomEffect(type, tier, passive, extra) {
    const def = EFFECTS[type];
    const e = { type, value: randomValue(type, tier, passive) };
    if (def.status && !passive) e.duration = type === 'STUN' ? 1 : rint(1, tier >= 3 ? 3 : 2);
    if (def.scalable && chance(0.6)) e.scale = rint(2, 6 + tier) * 5;
    return Object.assign(e, extra || {});
  }

  function randomName(primaryType) {
    const prefix = pick(NAME_PREFIXES);
    const noun = pick(NAME_NOUNS[primaryType] || NAME_NOUNS.DAMAGE);
    return chance(0.35) ? `${prefix}의 ${noun}` : `${prefix} ${noun}`;
  }

  /**
   * 무작위 스킬 노드 하나. opts: { type: 'ACTIVE'|'PASSIVE', tier, id, startsLearned, prerequisites, imageUrl }
   * 액티브는 공격형(적 대상) 또는 지원형(아군 대상)으로 나뉘어, 효과 조합이 대상과 맞게 나온다.
   */
  function randomSkill(opts = {}) {
    const type = opts.type === 'PASSIVE' ? 'PASSIVE' : 'ACTIVE';
    const tier = Math.max(1, Math.min(4, num(opts.tier, 1)));
    let targeting, effects;

    if (type === 'PASSIVE') {
      const primary = pick(['BUFF_ATK', 'BUFF_DEF', 'BUFF_ATK', 'BUFF_DEF', 'REGEN', tier >= 3 ? 'PROTECT' : 'REGEN', tier >= 2 ? 'BONUS_AP' : 'BUFF_ATK']);
      effects = [randomEffect(primary, tier, true)];
      if (chance(0.4)) {
        const second = pick(['BUFF_ATK', 'BUFF_DEF', 'REGEN'].filter(t => t !== primary));
        effects.push(randomEffect(second, tier, true));
      }
      targeting = (tier >= 2 && chance(0.35)) ? T('SELF', 0, 1, 'ALLY') : T('SELF', 0, 0, 'ALLY'); // 가끔 주변 아군 오라
    } else if (chance(0.7)) {
      // 공격형: 적 1명 / 칸 지정 범위 / 자신 중심 범위
      const shape = pick(['ENEMY', 'ENEMY', 'TILE', 'SELF']);
      if (shape === 'ENEMY') {
        const far = chance(0.5);
        targeting = T('ENEMY', far ? rint(3, 4) : rint(1, 2), chance(0.2 + 0.1 * tier) ? 1 : 0, 'ENEMY', far ? rint(1, 2) : 1);
      } else if (shape === 'TILE') targeting = T('TILE', rint(3, 4), 1, 'ENEMY', rint(1, 2));
      else targeting = T('SELF', 0, rint(1, 2), 'ENEMY');
      const primary = pick(['DAMAGE', 'DAMAGE', 'DAMAGE', 'DRAIN', 'DOT']);
      effects = [randomEffect(primary, tier, false)];
      const secondaries = ['DOT', 'DEBUFF_ATK', 'DEBUFF_DEF', 'MARK', 'SLOW', 'KNOCKBACK', 'ROOT', tier >= 2 ? 'STUN' : 'SLOW', 'SELF_BUFF'];
      if (targeting.mode === 'ENEMY' && targeting.radius === 0 && targeting.rangeMin >= 2) secondaries.push('PULL');
      const count = rint(0, tier >= 3 ? 2 : 1);
      for (let i = 0; i < count; i++) {
        const s = pick(secondaries.filter(t => !effects.some(e => e.type === t)));
        if (!s) break;
        if (s === 'SELF_BUFF') effects.push(randomEffect(pick(['BUFF_ATK', 'BUFF_DEF', 'SHIELD']), tier, false, { to: 'self' }));
        else effects.push(randomEffect(s, tier, false));
      }
    } else {
      // 지원형: 아군 1명 / 자신 중심 범위 / 자신
      const shape = pick(['ALLY', 'ALLY', 'SELF_AOE', 'SELF']);
      targeting = shape === 'ALLY' ? T('ALLY', rint(1, 3), 0, 'ALLY', 0)
        : shape === 'SELF_AOE' ? T('SELF', 0, rint(1, 2), 'ALLY')
        : T('SELF', 0, 0, 'ALLY');
      const pool = ['HEAL', 'HEAL', 'SHIELD', 'BUFF_ATK', 'BUFF_DEF', 'REGEN', 'CLEANSE', 'RESTORE_AP', tier >= 2 ? 'STEALTH' : 'SHIELD', tier >= 3 ? 'PROTECT' : 'HEAL', 'COOLDOWN_RESET'];
      const primary = pick(pool);
      effects = [randomEffect(primary, tier, false)];
      if (chance(0.5 + 0.1 * tier)) {
        const s = pick(pool.filter(t => t !== primary));
        effects.push(randomEffect(s, tier, false));
      }
    }

    const primaryType = effects[0].type;
    const hasControl = effects.some(e => ['STUN', 'ROOT', 'TAUNT', 'PROTECT', 'STEALTH'].includes(e.type));
    const aoe = targeting.radius > 0;
    return normalizeSkill({
      id: opts.id || newId(),
      name: randomName(primaryType),
      icon: pick(NAME_ICONS[primaryType] || [EFFECTS[primaryType].icon]),
      imageUrl: opts.imageUrl || '',
      type,
      tier,
      prerequisites: opts.prerequisites || [],
      startsLearned: !!opts.startsLearned,
      spCost: tier,
      costAP: type === 'ACTIVE' ? Math.min(3, 1 + (aoe && tier >= 2 ? 1 : 0) + (tier >= 4 ? 1 : 0)) : 0,
      coolDown: type === 'ACTIVE' ? Math.min(5, rint(1, 2) + Math.floor(tier / 2) + (hasControl ? 1 : 0)) : 0,
      targeting,
      effects,
      autoDescription: true
    });
  }

  // 무작위 스킬트리: T1 액티브(★시작 습득) + 패시브, T2 2~3개, T3 2개, T4 1개. 선행은 바로 아래 계층에서 1~2개.
  function buildRandomTree() {
    const layout = [
      [1, 'ACTIVE', true], [1, 'PASSIVE'],
      [2, 'ACTIVE'], [2, chance(0.5) ? 'ACTIVE' : 'PASSIVE'], ...(chance(0.5) ? [[2, 'ACTIVE']] : []),
      [3, 'ACTIVE'], [3, chance(0.5) ? 'ACTIVE' : 'PASSIVE'],
      [4, chance(0.75) ? 'ACTIVE' : 'PASSIVE']
    ];
    const nodes = [];
    layout.forEach(([tier, type, starts]) => {
      const lower = nodes.filter(n => n.tier === tier - 1);
      const prereqs = lower.length ? [pick(lower).id] : [];
      if (lower.length > 1 && chance(0.25)) prereqs.push(pick(lower.filter(n => n.id !== prereqs[0])).id);
      nodes.push(randomSkill({ type, tier, startsLearned: !!starts, prerequisites: prereqs }));
    });
    return nodes;
  }

  // --------------------------------------------------------------------------
  // 설명 자동 생성
  // --------------------------------------------------------------------------
  function describeEffect(e) {
    const d = EFFECTS[e.type];
    if (!d) return '';
    const dur = d.status && e.duration ? ` ${e.duration}턴` : '';
    const sc = e.scale ? `(+공격력 ${e.scale}%)` : '';
    const who = e.to === 'self' ? '자신에게 ' : '';
    switch (e.type) {
      case 'DAMAGE':   return `${who}피해 ${e.value}${sc}`;
      case 'DRAIN':    return `${who}피해 ${e.value}${sc}, 준 피해의 50% 흡수`;
      case 'DOT':      return `${who}매 턴 ${e.value} 지속 피해${dur}`;
      case 'HEAL':     return `${who}HP ${e.value}${sc} 회복`;
      case 'REGEN':    return `${who}매 턴 HP ${e.value} 회복${dur}`;
      case 'SHIELD':   return `${who}보호막 ${e.value}${dur}`;
      case 'CLEANSE':  return `${who}아군은 해로운 효과 제거 · 적은 강화 효과 해제`;
      case 'BUFF_ATK': return `${who}공격력 +${e.value}%${dur}`;
      case 'BUFF_DEF': return `${who}방어력 +${e.value}%${dur}`;
      case 'DEBUFF_ATK': return `${who}공격력 -${e.value}%${dur}`;
      case 'DEBUFF_DEF': return `${who}방어력 -${e.value}%${dur}`;
      case 'MARK':     return `${who}받는 피해 +${e.value}%${dur}`;
      case 'STUN':     return `${who}기절${dur}`;
      case 'ROOT':     return `${who}속박(이동 불가)${dur}`;
      case 'SLOW':     return `${who}턴 시작 AP -${e.value}${dur}`;
      case 'TAUNT':    return `${who}도발 — 시전자만 공격 가능${dur}`;
      case 'STEALTH':  return `${who}은신${dur}`;
      case 'PROTECT':  return `${who}치명상을 1회 HP 1로 버팀${dur}`;
      case 'RESTORE_AP': return `${who}AP +${e.value}`;
      case 'BONUS_AP': return `턴 시작 시 AP +${e.value}`;
      case 'COOLDOWN_RESET': return `${who}다른 스킬 재사용 대기 -${e.value}턴`;
      case 'KNOCKBACK': return `${e.value}칸 밀쳐냄 (막히면 충돌 피해 10)`;
      case 'PULL':     return `시전자 쪽으로 ${e.value}칸 끌어옴`;
      case 'TELEPORT': return '지정한 칸으로 순간이동';
      case 'SWAP':     return '대상과 위치 교환';
      default:         return d.label;
    }
  }

  function describeTargeting(skill) {
    const t = skill.targeting;
    if (skill.type === 'PASSIVE') {
      return t.radius > 0 ? `상시 · 주변 ${t.radius}칸 ${AFFECTS[t.affects]} 오라` : '상시 발동';
    }
    const range = t.mode === 'SELF' ? '' : `사거리 ${t.rangeMin === t.rangeMax ? t.rangeMax : `${t.rangeMin}~${t.rangeMax}`}`;
    let who;
    if (t.mode === 'SELF') who = t.radius > 0 ? `자신 주변 ${t.radius}칸 ${AFFECTS[t.affects]}` : '자신';
    else if (t.mode === 'TILE') who = t.radius > 0 ? `지정 칸 주변 ${t.radius}칸 ${AFFECTS[t.affects]}` : '지정 칸';
    else who = t.radius > 0 ? `${TARGET_MODES[t.mode]} + 주변 ${t.radius}칸` : (t.mode === 'ALLY' ? '아군 1명' : '적 1명');
    return [range, who].filter(Boolean).join(' · ');
  }

  function describeSkill(skill) {
    const parts = skill.effects.map(describeEffect).filter(Boolean);
    return `[${describeTargeting(skill)}] ${parts.join(', ')}`;
  }

  // --------------------------------------------------------------------------
  // 유닛의 스킬 상태 (습득 / SP / 쿨다운)
  // --------------------------------------------------------------------------
  function ensureUnitSkillState(unit) {
    if (!unit) return unit;
    // 스킬트리가 없는 기존 캐릭터: 병과 추천 트리를 붙여 준다 (DEV에서 직접 편집한 트리는 비어 있어도 유지).
    const hasTree = Array.isArray(unit.skillTree) && unit.skillTree.length > 0;
    if (!hasTree && !unit.skillTreeCustomized) {
      unit.skillTree = buildClassTree(unit.classType || unit.unitClass);
      // 고유 스킬이 이미 있는 캐릭터는 ★ 노드를 자동 습득하지 않는다 (SP로 습득).
      if (unit.customSkill) unit.learnedSkills = [];
    }
    if (!Array.isArray(unit.skillTree)) unit.skillTree = [];
    if (!Array.isArray(unit.learnedSkills)) {
      unit.learnedSkills = unit.skillTree.filter(n => n && n.startsLearned).map(n => n.id);
    }
    if (typeof unit.skillPoints !== 'number') unit.skillPoints = 0;
    // 스킬 해금 방식 변경(전투 승리 SP → 기억 계승 1회 = 해금 1개).
    // 구버전 세이브에 쌓인 SP는 회수한다. 이미 익힌 스킬은 그대로 유지된다.
    if (unit.skillUnlockMode !== 'absorb') {
      unit.skillPoints = 0;
      unit.skillUnlockMode = 'absorb';
    }
    if (!unit.skillCooldowns || typeof unit.skillCooldowns !== 'object') unit.skillCooldowns = {};
    if (!Array.isArray(unit.statuses)) unit.statuses = [];
    // 구버전 고유 스킬 쿨다운 이관
    const sigId = unit.customSkill && (unit.customSkill.id || 'signature');
    if (sigId && num(unit.customSkillCooldown) > 0 && unit.skillCooldowns[sigId] == null) {
      unit.skillCooldowns[sigId] = num(unit.customSkillCooldown);
    }
    return unit;
  }

  /** 유닛이 현재 사용할 수 있는(습득한) 스킬 전체. 고유 스킬(customSkill)은 항상 포함된다. */
  function getUnitSkills(unit) {
    if (!unit) return [];
    ensureUnitSkillState(unit);
    const out = [];
    const seen = new Set();
    if (unit.customSkill) {
      const sig = normalizeSkill(unit.customSkill, unit.customSkill.id || 'signature');
      if (sig) { sig.isSignature = true; out.push(sig); seen.add(sig.id); }
    }
    unit.skillTree.forEach(node => {
      if (!node || seen.has(node.id) || !unit.learnedSkills.includes(node.id)) return;
      const s = normalizeSkill(node);
      if (s) { out.push(s); seen.add(s.id); }
    });
    return out;
  }

  function getSkillCooldown(unit, skillId) { return num(unit && unit.skillCooldowns && unit.skillCooldowns[skillId]); }

  function getLearnState(unit, node) {
    ensureUnitSkillState(unit);
    if (unit.learnedSkills.includes(node.id)) return { state: 'learned' };
    const missing = (node.prerequisites || []).filter(p => !unit.learnedSkills.includes(p));
    if (missing.length) {
      const names = missing.map(id => (unit.skillTree.find(n => n.id === id) || {}).name || id);
      return { state: 'locked', reason: `선행: ${names.join(', ')}` };
    }
    // 해금권(skillPoints) 1장 = 스킬 1개. 노드의 spCost와 무관하게 항상 1장을 쓴다.
    const cost = SKILL_UNLOCK_COST;
    if (unit.skillPoints < cost) return { state: 'poor', reason: '레벨업 필요 (기억 계승)', cost };
    return { state: 'learnable', cost };
  }

  const SKILL_UNLOCK_COST = 1;

  function learnSkill(unit, nodeId) {
    const node = (unit.skillTree || []).find(n => n.id === nodeId);
    if (!node) return { ok: false, reason: '스킬을 찾을 수 없습니다.' };
    const ls = getLearnState(unit, node);
    if (ls.state !== 'learnable') return { ok: false, reason: ls.reason || '이미 습득했습니다.' };
    unit.skillPoints -= ls.cost;
    unit.learnedSkills.push(node.id);
    return { ok: true, cost: ls.cost };
  }

  /** 아직 익히지 않은 스킬트리 노드 수 = 앞으로 쓸 수 있는 해금권 수. */
  function getRemainingUnlocks(unit) {
    if (!unit) return 0;
    ensureUnitSkillState(unit);
    return unit.skillTree.filter(n => n && !unit.learnedSkills.includes(n.id)).length * SKILL_UNLOCK_COST;
  }

  /** 트리를 다 열고도 남는 해금권 수 (잔향으로 바꿀 수 있는 양). */
  function getSurplusSkillPoints(unit) {
    if (!unit) return 0;
    return Math.max(0, num(unit.skillPoints) - getRemainingUnlocks(unit));
  }

  // --------------------------------------------------------------------------
  // 상태이상
  // --------------------------------------------------------------------------
  function getStatuses(unit) { return (unit && Array.isArray(unit.statuses)) ? unit.statuses : []; }
  function hasStatus(unit, type) { return getStatuses(unit).some(s => s.type === type); }
  function statusSum(unit, type) { return getStatuses(unit).filter(s => s.type === type).reduce((a, s) => a + num(s.value), 0); }

  function addStatus(unit, effect, caster, skillName) {
    if (!Array.isArray(unit.statuses)) unit.statuses = [];
    const s = ctx.getState();
    // 적 턴에 걸린 효과는 다음 라운드 종료 때 줄어들기 시작하도록 1턴 보정
    const extra = s && s.__enemyPhase ? 1 : 0;
    const turns = num(effect.duration, 1) + extra;
    const existing = unit.statuses.find(st => st.type === effect.type && st.casterId === (caster && caster.id));
    if (existing) {
      existing.value = Math.max(num(existing.value), num(effect.value));
      existing.turns = Math.max(existing.turns, turns);
      existing.source = skillName;
    } else {
      unit.statuses.push({ type: effect.type, value: num(effect.value), turns, casterId: caster ? caster.id : null, source: skillName });
    }
  }

  function passiveEffectsOf(unit) {
    return getUnitSkills(unit).filter(s => s.type === 'PASSIVE');
  }

  /** 전투 확률 공식에 들어갈 보정치 (% 단위). */
  function getCombatModifiers(unit) {
    const out = { atk: 0, def: 0, mark: 0 };
    if (!unit) return out;
    out.atk += statusSum(unit, 'BUFF_ATK') - statusSum(unit, 'DEBUFF_ATK');
    out.def += statusSum(unit, 'BUFF_DEF') - statusSum(unit, 'DEBUFF_DEF');
    out.mark += statusSum(unit, 'MARK');
    // 자기 패시브 + 주변 아군의 오라 패시브
    unitsOfSide(sideOf(unit)).forEach(owner => {
      passiveEffectsOf(owner).forEach(p => {
        const r = p.targeting.radius;
        const applies = owner.id === unit.id ? true : (r > 0 && dist(owner, unit) <= r);
        if (!applies) return;
        p.effects.forEach(e => {
          if (e.type === 'BUFF_ATK') out.atk += e.value;
          if (e.type === 'BUFF_DEF') out.def += e.value;
        });
      });
    });
    return out;
  }

  function canMove(unit) { return !hasStatus(unit, 'ROOT') && !hasStatus(unit, 'STUN'); }
  function canAct(unit) { return !hasStatus(unit, 'STUN'); }
  function isTargetableByAI(unit) { return !hasStatus(unit, 'STEALTH'); }
  function breakStealth(unit) {
    if (unit && hasStatus(unit, 'STEALTH')) {
      unit.statuses = unit.statuses.filter(s => s.type !== 'STEALTH');
      ctx.log(`👻 ${unit.name}의 은신이 풀렸습니다.`, 'system');
    }
  }
  /** 도발 상태면 반드시 노려야 하는 유닛 (살아 있을 때만). */
  function getForcedTarget(unit) {
    const taunt = getStatuses(unit).find(s => s.type === 'TAUNT');
    if (!taunt) return null;
    return allUnits().find(u => u.id === taunt.casterId) || null;
  }

  /** 치명상을 입었을 때 불굴(PROTECT)로 버티는지 확인하고, 버티면 소모한다. */
  function tryPreventDeath(unit) {
    if (!unit) return false;
    const st = getStatuses(unit).find(s => s.type === 'PROTECT');
    if (st) {
      unit.statuses = unit.statuses.filter(s => s !== st);
    } else if (!unit.passiveProtectUsed && passiveEffectsOf(unit).some(p => p.effects.some(e => e.type === 'PROTECT'))) {
      unit.passiveProtectUsed = true;
    } else {
      return false;
    }
    unit.isDead = false;
    unit.hp = 1;
    if (unit.stats) unit.stats.hp = 1;
    ctx.log(`🕊️ [불굴] ${unit.name}이(가) 치명상을 버텨내고 HP 1로 살아남았습니다!`, 'gold');
    return true;
  }

  // --------------------------------------------------------------------------
  // HP 변화
  // --------------------------------------------------------------------------
  function applyDamage(target, amount, sourceName) {
    let dmg = Math.max(0, Math.round(amount));
    const markPct = statusSum(target, 'MARK');
    if (markPct > 0) dmg = Math.round(dmg * (1 + markPct / 100));
    // 보호막 흡수
    getStatuses(target).filter(s => s.type === 'SHIELD').forEach(sh => {
      if (dmg <= 0) return;
      const absorbed = Math.min(sh.value, dmg);
      sh.value -= absorbed;
      dmg -= absorbed;
    });
    target.statuses = getStatuses(target).filter(s => s.type !== 'SHIELD' || s.value > 0);
    target.hp = Math.max(0, Math.round(num(target.hp) - dmg));
    if (target.stats) target.stats.hp = target.hp;
    let killed = false;
    if (target.hp <= 0 && !tryPreventDeath(target)) {
      target.isDead = true;
      killed = true;
      ctx.onUnitKilled(target, sourceName);
    }
    return { dealt: dmg, killed };
  }

  function applyHeal(target, amount) {
    const before = num(target.hp);
    target.hp = Math.min(num(target.maxHp, 100), before + Math.max(0, Math.round(amount)));
    if (target.stats) target.stats.hp = target.hp;
    return target.hp - before;
  }

  // --------------------------------------------------------------------------
  // 대상 지정
  // --------------------------------------------------------------------------
  function tileExists(x, y) { return !!ctx.getTile(x, y); }
  function hostileUnitsAt(unit, x, y) { return allUnits().filter(u => u.x === x && u.y === y && isHostileTo(unit, u)); }
  function battleTiles() {
    const s = ctx.getState();
    const map = s && s.currentBattle && s.currentBattle.map;
    return (map && Array.isArray(map.tiles)) ? map.tiles : [];
  }

  /** 스킬을 지정할 수 있는 칸 목록 [{x,y}] */
  function getValidTargets(caster, skill) {
    const t = skill.targeting;
    if (t.mode === 'SELF') return [{ x: caster.x, y: caster.y }];
    const inRange = (p) => { const d = dist(caster, p); return d >= t.rangeMin && d <= t.rangeMax; };
    if (t.mode === 'ALLY' || t.mode === 'ENEMY') {
      const wantHostile = t.mode === 'ENEMY';
      const seen = new Set();
      return allUnits()
        .filter(u => isHostileTo(caster, u) === wantHostile && inRange(u))
        // 대상 지정 제한 (game.js가 넘겨준다: 국가 규칙 은신 등)
        .filter(u => !wantHostile || typeof ctx.canTarget !== 'function' || ctx.canTarget(caster, u))
        .filter(u => { const k = `${u.x},${u.y}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(u => ({ x: u.x, y: u.y }));
    }
    // TILE
    const needsEmpty = skill.effects.some(e => e.type === 'TELEPORT');
    return battleTiles()
      .filter(tile => inRange(tile))
      .filter(tile => !needsEmpty || hostileUnitsAt(caster, tile.x, tile.y).length === 0)
      .map(tile => ({ x: tile.x, y: tile.y }));
  }

  function isValidTarget(caster, skill, x, y) {
    return getValidTargets(caster, skill).some(p => p.x === x && p.y === y);
  }

  /** (x,y)를 중심으로 스킬이 영향을 주는 유닛 */
  function getAffectedUnits(caster, skill, x, y) {
    const t = skill.targeting;
    const matches = (u) => t.affects === 'ALL' || (t.affects === 'ENEMY' ? isHostileTo(caster, u) : !isHostileTo(caster, u));
    if (t.mode === 'SELF' && t.radius === 0) return [caster];
    if ((t.mode === 'ALLY' || t.mode === 'ENEMY') && t.radius === 0) {
      const wantHostile = t.mode === 'ENEMY';
      const here = allUnits().filter(u => u.x === x && u.y === y && isHostileTo(caster, u) === wantHostile);
      // 같은 칸에 여럿이면 1명만: 시전자 자신 > HP가 낮은 쪽
      here.sort((a, b) => (b.id === caster.id) - (a.id === caster.id) || a.hp - b.hp);
      return here.slice(0, 1);
    }
    return allUnits().filter(u => matches(u) && Math.abs(u.x - x) + Math.abs(u.y - y) <= t.radius);
  }

  /** 미리보기용: 영향 받는 칸 */
  function getAffectedTiles(caster, skill, x, y) {
    const t = skill.targeting;
    if (t.radius === 0) return [{ x, y }];
    return battleTiles().filter(tile => Math.abs(tile.x - x) + Math.abs(tile.y - y) <= t.radius).map(tile => ({ x: tile.x, y: tile.y }));
  }

  function canCast(caster, skill) {
    if (!caster || caster.isDead) return { ok: false, reason: '행동 불가' };
    if (!skill || skill.type !== 'ACTIVE') return { ok: false, reason: '패시브' };
    if (caster.isInactivated) return { ok: false, reason: '체납 정지' };
    if (hasStatus(caster, 'STUN')) return { ok: false, reason: '기절' };
    const cd = getSkillCooldown(caster, skill.id);
    if (cd > 0) return { ok: false, reason: `대기 ${cd}턴` };
    if (num(caster.ap) < skill.costAP) return { ok: false, reason: `AP ${skill.costAP} 필요` };
    if (skill.effects.some(e => e.type === 'TELEPORT' || (e.type === 'SWAP')) && !canMove(caster)) return { ok: false, reason: '속박됨' };
    if (getValidTargets(caster, skill).length === 0) return { ok: false, reason: '대상 없음' };
    // 자신 중심 범위 스킬인데 범위 안에 아무도 없고 자신에게 거는 효과도 없으면 쓸모가 없다.
    const t = skill.targeting;
    if (t.mode === 'SELF' && t.radius > 0 && !skill.effects.some(e => e.to === 'self' || EFFECTS[e.type].selfOnly)
        && getAffectedUnits(caster, skill, caster.x, caster.y).length === 0) {
      return { ok: false, reason: '범위 내 대상 없음' };
    }
    return { ok: true };
  }

  // --------------------------------------------------------------------------
  // 위치 이동 효과
  // --------------------------------------------------------------------------
  function stepDir(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (dx === 0 && dy === 0) return null;
    return Math.abs(dx) >= Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) };
  }
  function canStand(unit, x, y) { return tileExists(x, y) && hostileUnitsAt(unit, x, y).length === 0; }

  function pushUnit(target, dir, steps) {
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const nx = target.x + dir.dx, ny = target.y + dir.dy;
      if (!canStand(target, nx, ny)) break;
      target.x = nx; target.y = ny; moved++;
    }
    return moved;
  }

  // 적과 위치 교환은 양쪽 칸이 혼자일 때만: 겹친 부대가 있으면 적과 아군이 한 칸에 섞이게 된다.
  function getSwapBlockReason(caster, skill, targets) {
    if (!skill.effects.some(e => e.type === 'SWAP')) return null;
    for (const u of targets) {
      if (u.isDead || u.id === caster.id || !isHostileTo(caster, u)) continue;
      const stackedAllies = allUnits().some(o => o.id !== caster.id && o.x === caster.x && o.y === caster.y && !isHostileTo(caster, o));
      if (stackedAllies) return '위치 교환 실패 — 아군 부대와 겹쳐 있어 적과 자리를 바꿀 수 없습니다.';
      const stackedEnemies = allUnits().some(o => o.id !== u.id && o.x === u.x && o.y === u.y && isHostileTo(caster, o));
      if (stackedEnemies) return '위치 교환 실패 — 대상이 다른 적과 겹쳐 있어 자리를 바꿀 수 없습니다.';
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 시전
  // --------------------------------------------------------------------------
  /**
   * @returns {{ok:boolean, reason?:string, results?:Array<{unit, text, color}>}}
   */
  function cast(caster, skill, x, y) {
    const check = canCast(caster, skill);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (skill.targeting.mode === 'SELF') { x = caster.x; y = caster.y; }
    if (!isValidTarget(caster, skill, x, y)) return { ok: false, reason: '사거리 밖이거나 올바르지 않은 대상입니다.' };

    const targets = getAffectedUnits(caster, skill, x, y);
    const swapBlocked = getSwapBlockReason(caster, skill, targets);
    if (swapBlocked) return { ok: false, reason: swapBlocked };
    const results = [];
    const pushResult = (unit, text, color) => results.push({ unit, x: unit.x, y: unit.y, text, color });
    const atk = num(caster.atk, 40);
    let hostileUsed = false;
    let totalDrain = 0;

    skill.effects.forEach(e => {
      const def = EFFECTS[e.type];
      const recipients = (e.to === 'self' || def.selfOnly) ? [caster] : targets.filter(u => !u.isDead);
      if (def.hostile) hostileUsed = true;
      const power = e.value + (e.scale ? Math.round(atk * e.scale / 100) : 0);

      recipients.forEach(u => {
        if (u.isDead) return;
        // 효과 면역 (game.js가 넘겨준다: 국가 규칙 — 기절·밀쳐내기·도발 면역 등)
        if (isHostileTo(caster, u) && typeof ctx.isEffectImmune === 'function' && ctx.isEffectImmune(u, e.type)) {
          pushResult(u, '면역', '#94a3b8');
          ctx.log(`🛡️ ${u.name}은(는) ${def.label}에 면역입니다. (국가 규칙)`, 'warning');
          return;
        }
        switch (e.type) {
          case 'DAMAGE':
          case 'DRAIN': {
            const r = applyDamage(u, power, skill.name);
            pushResult(u, `-${r.dealt}`, '#ef4444');
            if (e.type === 'DRAIN') totalDrain += Math.round(r.dealt * 0.5);
            if (r.killed) pushResult(u, '격파!', '#f59e0b');
            break;
          }
          case 'HEAL': {
            const healed = applyHeal(u, power);
            pushResult(u, `+${healed}`, '#22c55e');
            break;
          }
          case 'CLEANSE': {
            const before = getStatuses(u).length;
            const removeHostile = !isHostileTo(caster, u);
            u.statuses = getStatuses(u).filter(s => {
              const hostileStatus = !!(EFFECTS[s.type] && EFFECTS[s.type].hostile);
              return removeHostile ? !hostileStatus : hostileStatus;
            });
            const removed = before - u.statuses.length;
            pushResult(u, removed ? `정화 ${removed}` : '정화', '#a78bfa');
            break;
          }
          case 'RESTORE_AP': {
            const cap = Math.max(num(u.baseAP, 2), num(u.ap));
            const gain = Math.min(e.value, cap - num(u.ap));
            u.ap = num(u.ap) + Math.max(0, gain);
            pushResult(u, `AP +${Math.max(0, gain)}`, '#0ea5e9');
            break;
          }
          case 'COOLDOWN_RESET': {
            Object.keys(u.skillCooldowns || {}).forEach(id => {
              if (u === caster && id === skill.id) return;
              u.skillCooldowns[id] = Math.max(0, num(u.skillCooldowns[id]) - e.value);
            });
            if (u.customSkillCooldown) u.customSkillCooldown = Math.max(0, u.customSkillCooldown - e.value);
            pushResult(u, '⏩ 대기 감소', '#0ea5e9');
            break;
          }
          case 'KNOCKBACK': {
            const dir = stepDir(caster, u);
            if (!dir) break;
            const moved = pushUnit(u, dir, e.value);
            if (moved < e.value) {
              const r = applyDamage(u, 10, skill.name);
              pushResult(u, `충돌 -${r.dealt}`, '#ef4444');
            } else pushResult(u, `💨 ${moved}칸`, '#94a3b8');
            break;
          }
          case 'PULL': {
            const dir = stepDir(u, caster);
            if (!dir) break;
            let moved = 0;
            for (let i = 0; i < e.value; i++) {
              const nx = u.x + dir.dx, ny = u.y + dir.dy;
              if (nx === caster.x && ny === caster.y) break;
              if (!canStand(u, nx, ny)) break;
              u.x = nx; u.y = ny; moved++;
            }
            pushResult(u, `🪝 ${moved}칸`, '#94a3b8');
            break;
          }
          case 'TELEPORT': {
            if (canStand(caster, x, y)) { caster.x = x; caster.y = y; pushResult(caster, '🌀', '#8b5cf6'); }
            break;
          }
          case 'SWAP': {
            if (u.id === caster.id) break;
            if (!canMove(u) && isHostileTo(caster, u)) break;
            const cx = caster.x, cy = caster.y;
            caster.x = u.x; caster.y = u.y;
            u.x = cx; u.y = cy;
            pushResult(u, '🔄', '#8b5cf6');
            break;
          }
          default: {
            if (def.status) {
              addStatus(u, e, caster, skill.name);
              pushResult(u, `${def.icon}`, def.hostile ? '#f97316' : '#38bdf8');
            }
          }
        }
      });
    });

    if (totalDrain > 0) {
      const healed = applyHeal(caster, totalDrain);
      pushResult(caster, `+${healed}`, '#22c55e');
    }

    caster.ap = Math.max(0, num(caster.ap) - skill.costAP);
    if (!caster.skillCooldowns) caster.skillCooldowns = {};
    // 유물(skillCooldown)이 재사용 대기를 늘리거나 줄인다 (대기가 있는 스킬은 최소 1턴)
    const cdMod = typeof ctx.getCooldownModifier === 'function' ? num(ctx.getCooldownModifier(caster)) : 0;
    // 액티브 스킬은 어떤 보정을 받아도 최소 1턴 대기한다 → 같은 스킬은 한 턴에 한 번만 (AP가 남아도 연속 사용 불가)
    let cooldown = Math.max(1, num(skill.coolDown) + cdMod);
    // 추가 보정 (game.js가 넘겨준다: 국가 규칙 — 마법사 재사용 대기 감소)
    if (typeof ctx.adjustCooldown === 'function') cooldown = Math.max(1, num(ctx.adjustCooldown(caster, cooldown)));
    caster.skillCooldowns[skill.id] = cooldown;
    if (skill.isSignature) caster.customSkillCooldown = cooldown;
    if (hostileUsed) breakStealth(caster);

    const names = [...new Set(targets.map(u => u.name))];
    ctx.log(`✨ [스킬: ${skill.name}] ${caster.name}${names.length ? ` → ${names.join(', ')}` : ''} · ${skill.effects.map(describeEffect).join(', ')}`, sideOf(caster) === 'ENEMY' ? 'danger' : 'gold');
    return { ok: true, results, targets };
  }

  // --------------------------------------------------------------------------
  // 턴 처리
  // --------------------------------------------------------------------------
  /** side 진영의 턴이 시작될 때: 지속 피해/회복, 기절·둔화, 패시브 AP, 쿨다운 감소 */
  function startSideTurn(side) {
    const s = ctx.getState();
    if (s) s.__enemyPhase = side === 'ENEMY';
    unitsOfSide(side).forEach(u => {
      ensureUnitSkillState(u);
      Object.keys(u.skillCooldowns).forEach(id => { if (u.skillCooldowns[id] > 0) u.skillCooldowns[id] -= 1; });

      const regen = statusSum(u, 'REGEN') + passiveEffectsOf(u).reduce((a, p) => a + p.effects.filter(e => e.type === 'REGEN').reduce((b, e) => b + e.value, 0), 0);
      if (regen > 0 && u.hp < u.maxHp) {
        const healed = applyHeal(u, regen);
        if (healed > 0) ctx.log(`🌿 ${u.name} 지속 회복 +${healed} (HP ${u.hp}/${u.maxHp})`, 'success');
      }
      const dot = statusSum(u, 'DOT');
      if (dot > 0) {
        const r = applyDamage(u, dot, '지속 피해');
        ctx.log(`🔥 ${u.name} 지속 피해 -${r.dealt}${r.killed ? ' → 쓰러졌습니다!' : ` (HP ${u.hp}/${u.maxHp})`}`, side === 'ENEMY' ? 'combat' : 'danger');
        if (r.killed) return;
      }

      const bonusAp = passiveEffectsOf(u).reduce((a, p) => a + p.effects.filter(e => e.type === 'BONUS_AP').reduce((b, e) => b + e.value, 0), 0);
      if (bonusAp > 0 && u.ap > 0) u.ap += bonusAp;

      if (hasStatus(u, 'STUN')) {
        u.ap = 0;
        ctx.log(`💫 ${u.name}은(는) 기절해 이번 턴 행동할 수 없습니다.`, 'warning');
      } else {
        const slow = statusSum(u, 'SLOW');
        if (slow > 0) {
          u.ap = Math.max(0, num(u.ap) - slow);
          ctx.log(`🐌 ${u.name} 둔화: AP -${slow}`, 'warning');
        }
      }
    });
  }

  /** 라운드(아군 턴 + 적 턴)가 끝날 때 상태이상 지속시간 감소 */
  function endRound() {
    const s = ctx.getState();
    if (s) s.__enemyPhase = false;
    allUnits().forEach(u => {
      if (!Array.isArray(u.statuses) || !u.statuses.length) return;
      u.statuses.forEach(st => { st.turns -= 1; });
      u.statuses = u.statuses.filter(st => st.turns > 0);
    });
  }

  /** 전투가 끝나면 전투 중 상태를 초기화한다. */
  function resetBattleState(unit) {
    if (!unit) return;
    unit.statuses = [];
    unit.skillCooldowns = {};
    unit.customSkillCooldown = 0;
    unit.passiveProtectUsed = false;
  }

  // --------------------------------------------------------------------------
  // 적 AI: 쓸 만한 스킬이 있으면 {skill, x, y, score} 반환
  // --------------------------------------------------------------------------
  function scorePlan(caster, skill, x, y) {
    const targets = getAffectedUnits(caster, skill, x, y);
    let score = 0;
    const atk = num(caster.atk, 40);
    skill.effects.forEach(e => {
      const def = EFFECTS[e.type];
      const recips = (e.to === 'self' || def.selfOnly) ? [caster] : targets;
      const power = e.value + (e.scale ? Math.round(atk * e.scale / 100) : 0);
      recips.forEach(u => {
        const hostile = isHostileTo(caster, u);
        const sign = def.hostile ? (hostile ? 1 : -1.5) : (hostile ? -1 : 1);
        switch (e.type) {
          case 'DAMAGE': case 'DRAIN':
            score += sign * (Math.min(power, u.hp) + (power >= u.hp ? 40 : 0)); break;
          case 'DOT': score += sign * power * e.duration * 0.8; break;
          case 'HEAL': score += sign * Math.min(power, u.maxHp - u.hp); break;
          case 'REGEN': score += sign * Math.min(power * e.duration, u.maxHp - u.hp) * 0.6; break;
          case 'SHIELD': score += sign * (u.hp < u.maxHp * 0.7 ? power * 0.6 : power * 0.2); break;
          case 'STUN': score += sign * 35 * e.duration; break;
          case 'ROOT': case 'SLOW': case 'TAUNT': case 'MARK': case 'DEBUFF_ATK': case 'DEBUFF_DEF': score += sign * 12; break;
          case 'BUFF_ATK': case 'BUFF_DEF': case 'PROTECT': score += sign * (unitsOfSide(sideOf(caster) === 'ENEMY' ? 'PLAYER' : 'ENEMY').some(p => dist(p, u) <= 3) ? 14 : 2); break;
          case 'KNOCKBACK': case 'PULL': score += sign * 5; break;
          case 'CLEANSE': score += getStatuses(u).filter(st => (EFFECTS[st.type] || {}).hostile !== hostile).length * 12 * (hostile ? 0.5 : 1); break;
          default: break;
        }
      });
    });
    return score - skill.costAP * 4;
  }

  function planAISkill(caster) {
    if (!caster || caster.isDead || !canAct(caster)) return null;
    let best = null;
    getUnitSkills(caster).forEach(skill => {
      if (skill.type !== 'ACTIVE' || !canCast(caster, skill).ok) return;
      if (skill.effects.some(e => e.type === 'TELEPORT' || e.type === 'SWAP')) return; // AI는 기동 스킬을 쓰지 않는다
      getValidTargets(caster, skill).forEach(p => {
        const score = scorePlan(caster, skill, p.x, p.y);
        if (!best || score > best.score) best = { skill, x: p.x, y: p.y, score };
      });
    });
    return best && best.score >= 15 ? best : null;
  }

  /** 적 유닛이 쓸 수 있는 스킬: 레벨에 따라 트리 상위 계층까지 습득한 것으로 간주 (보스는 전부 습득) */
  function prepareEnemySkills(unit) {
    ensureUnitSkillState(unit);
    const maxTier = unit.masterAllSkills ? Infinity : Math.min(4, 1 + Math.floor((num(unit.level, 1) - 1) / 2));
    unit.learnedSkills = unit.skillTree.filter(n => n && num(n.tier, 1) <= maxTier).map(n => n.id);
    return unit;
  }

  global.SkillEngine = {
    EFFECTS, CATEGORY_LABELS, TARGET_MODES, AFFECTS, PRESETS, CLASS_TREES,
    configure, normalizeSkill, normalizeEffect, fromPreset, buildClassTree, randomSkill, buildRandomTree, describeSkill, describeEffect, describeTargeting, newId,
    ensureUnitSkillState, getUnitSkills, getSkillCooldown, getLearnState, learnSkill,
    getRemainingUnlocks, getSurplusSkillPoints,
    getStatuses, hasStatus, getCombatModifiers, canMove, canAct, isTargetableByAI, breakStealth, getForcedTarget, tryPreventDeath,
    getValidTargets, isValidTarget, getAffectedUnits, getAffectedTiles, canCast, cast,
    startSideTurn, endRound, resetBattleState, planAISkill, prepareEnemySkills
  };
})(typeof window !== 'undefined' ? window : globalThis);
