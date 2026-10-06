/**
 * nationRules.js — 국가(작전지도 구역)별 고유 전투 규칙
 *
 * 사용법: <script src="nationRules.js"></script> (skillEngine.js 다음, game.js보다 먼저 로드)
 *
 * - 규칙은 "그 나라 적군"에게만 걸린다. 아군(플레이어) 유닛은 어떤 국가 규칙도 받지 않는다.
 * - 지금 싸우는 나라 = state.currentBattle.nationId (enterEncounter가 노드의 regionId로 넣는다).
 *   전투 중 상태(모르 부활 대기 등)는 state.currentBattle.nationState에 두므로 전투 저장/복원과 함께 간다.
 * - game.js는 아래 훅만 부른다. 나라별 분기는 이 파일에만 있다.
 *     getCombatMods(attacker, defender, ctx)  → { atkPct, defPct, ignoreDefPct, factors[] }  (승률 계산 + 승률 창)
 *     getAttackRangeBonus(unit) · getMobilityBonus(unit) · getMoveCostOverride(unit, tile)
 *     isEffectImmune(unit, effectType) · adjustSkillCooldown(unit, cooldown)        (skillEngine 연결)
 *     adjustExchangeDamage(attacker, defender, dmg, info)                         (교환 피해)
 *     onBattleStart(battle) · onTurnStart(side) · onKill(killer, victim)
 *     onAfterAttack(attacker, defender, result) · onUnitDeath(unit, info)
 *     redirectAttackTarget(attacker, defender) · canTargetUnit(attacker, target)
 *     countPendingRevives()                                                       (승리 판정)
 * - 무작위는 쓰지 않는다. 같은 상황이면 항상 같은 결과다.
 * - description / weakness는 부관 브리핑에 그대로 나가므로 수치 없이 말로만 쓴다.
 */
(function (global) {
  'use strict';

  const NATION_RULES = {
    liona: { id: 'liona', name: '경궁 기동', rule: 'ARCHER_MOBILITY', value: 2,
      description: '리오나의 궁수들은 발이 빨라 전장을 넓게 휘젓고 다닙니다.',
      weakness: '궁수 말고는 평범한 병력이니, 궁수를 먼저 붙잡아 근접전으로 끌어들이십시오.' },
    mira: { id: 'mira', name: '장궁대', rule: 'ARCHER_RANGE', value: 1,
      description: '미라의 궁수는 장궁을 써서 남들보다 한 걸음 더 먼 곳에서 쏩니다.',
      weakness: '궁수는 붙으면 약합니다. 지형에 몸을 숨기며 빠르게 거리를 좁히십시오.' },
    vaska: { id: 'vaska', name: '중장 기사', rule: 'KNIGHT_UNSHAKEN', value: -2, immune: ['STUN', 'KNOCKBACK', 'TAUNT'],
      description: '바스카의 기사는 중갑을 둘러 기절도, 밀쳐내기도, 도발도 통하지 않습니다.',
      weakness: '대신 갑옷이 무거워 느립니다. 거리를 두고 원거리로 깎아 내십시오.' },
    oria: { id: 'oria', name: '보석 마도', rule: 'MAGE_COOLDOWN', value: -1,
      description: '오리아의 마법사는 보석 촉매 덕에 주문을 훨씬 자주 씁니다.',
      weakness: '마법사의 몸은 여전히 허약합니다. 주문이 쏟아지기 전에 먼저 덮치십시오.' },
    luma: { id: 'luma', name: '습지 은신', rule: 'SWAMP_STEALTH', terrains: ['forest', 'jungle', 'swamp', 'marsh', 'wetland'],
      description: '루마 전사는 숲과 습지에 숨어, 바로 곁에서가 아니면 노릴 수조차 없습니다.',
      weakness: '바로 옆까지 다가가면 보입니다. 숲 밖으로 끌어내거나 붙어서 싸우십시오.' },
    tino: { id: 'tino', name: '부동 반격', rule: 'STANDFAST_COUNTER', value: 0.5,
      description: '티노의 근접병은 자리를 지키고 있으면 맞는 즉시 반드시 되받아칩니다.',
      weakness: '방금 움직인 병사는 반격하지 못합니다. 원거리로 치거나 먼저 움직이게 만드십시오.' },
    rokan: { id: 'rokan', name: '피의 광분', rule: 'BLOOD_FRENZY', step: 0.25, value: 25, max: 75,
      description: '로칸 병사는 다칠수록 더 사납게 덤벼듭니다.',
      weakness: '어설프게 상처만 내지 말고, 한 번에 끝장내십시오.' },
    savo: { id: 'savo', name: '도하 행군', rule: 'WATER_WALK', terrains: ['river', 'sea', 'water', 'lake'],
      description: '사보군은 강과 물가를 평지처럼 걸어서 건너옵니다.',
      weakness: '물을 건너는 재주뿐, 뭍에서는 평범합니다. 강가 뒤에 진을 치고 건너오는 적을 맞받아치십시오.' },
    torva: { id: 'torva', name: '호위', rule: 'BODYGUARD',
      description: '토르바 근접병은 곁의 동료가 공격받으면 대신 앞을 막아섭니다.',
      weakness: '근접병부터 떼어 내면 나머지는 무방비입니다.' },
    ara: { id: 'ara', name: '돌파 기마', rule: 'CHARGE_KNOCKBACK', value: 1,
      description: '아라 기사는 달려와 적을 쓰러뜨리면 그 기세로 옆의 병사까지 밀어냅니다.',
      weakness: '벽이나 적을 등지고 서 있으면 밀려나지 않습니다.' },
    elda: { id: 'elda', name: '신성 가호', rule: 'BATTLE_SHIELD', value: 0.3,
      description: '엘다군은 전투가 시작되면 모두 신성한 보호막을 두릅니다.',
      weakness: '보호막은 다시 생기지 않습니다. 고르게 두드려 벗겨 내십시오.' },
    naru: { id: 'naru', name: '현상금 사냥', rule: 'KILL_AP', value: 1,
      description: '나루 용병은 적을 쓰러뜨리면 그 기세로 곧바로 다시 움직입니다.',
      weakness: '다친 병사를 앞에 두지 마십시오. 사냥감이 없으면 기세도 없습니다.' },
    silva: { id: 'silva', name: '치고 빠지기', rule: 'SHOOT_AND_SCOOT', value: 1,
      description: '실바의 궁수와 총병은 쏘고 나면 곧바로 한 걸음 물러납니다.',
      weakness: '물러날 곳이 없는 구석으로 몰아넣으십시오.' },
    valen: { id: 'valen', name: '관통 탄환', rule: 'ARMOR_PIERCE', value: 50,
      description: '발렌 총병의 탄환은 갑옷을 반쯤 꿰뚫습니다.',
      weakness: '방어에 기대지 말고 총병에게 먼저 달려드십시오.' },
    arca: { id: 'arca', name: '밀집 방진', rule: 'PHALANX', min: 3, value: 30,
      description: '아르카군은 여럿이 붙어 서면 방패를 겹쳐 단단해집니다.',
      weakness: '대열을 끊어 따로 떨어진 병사를 노리십시오.' },
    mor: { id: 'mor', name: '불사', rule: 'UNDYING', value: 0.3,
      description: '모르의 군대는 처음 쓰러진 자가 얼마 지나지 않아 다시 일어섭니다.',
      weakness: '다시 일어선 자를 끝까지 처리해야 전투가 끝납니다.' }
  };

  let ctx = {
    getState: () => global.state || {},
    getTile: () => null,
    log: () => {},
    onRevive: () => {}
  };
  function configure(options) { ctx = Object.assign({}, ctx, options || {}); }

  // --------------------------------------------------------------------------
  // 공통 도우미
  // --------------------------------------------------------------------------
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const classOf = (u) => String((u && (u.classType || u.unitClass)) || '').toUpperCase();
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const terrainOf = (tile) => String((tile && (tile.terrain || tile.type)) || 'plain').toLowerCase();
  const isAlive = (u) => !!u && !u.isDead && !(typeof u.hp === 'number' && u.hp <= 0);

  function getBattle() {
    const s = ctx.getState();
    return (s && s.currentBattle) || null;
  }
  function getActiveNationId() {
    const b = getBattle();
    return (b && b.nationId && NATION_RULES[b.nationId]) ? b.nationId : null;
  }
  function getRule(id) { return NATION_RULES[id] || null; }
  function getActiveRule() { const id = getActiveNationId(); return id ? NATION_RULES[id] : null; }
  /** 이 유닛에게 지금 국가 규칙이 걸리는가 (상대국 적 유닛만) */
  function ruleFor(unit, ruleKey) {
    if (!unit || unit.owner !== 'ENEMY') return null;
    const r = getActiveRule();
    return r && r.rule === ruleKey ? r : null;
  }
  function label(r, extra) { return `국가 규칙: ${r.name}${extra ? ` — ${extra}` : ''}`; }
  function enemies() { return ((ctx.getState() || {}).enemyUnits || []).filter(isAlive); }
  function players() { return ((ctx.getState() || {}).playerUnits || []).filter(u => isAlive(u) && u.x >= 0 && u.y >= 0); }
  function nationState() {
    const b = getBattle();
    if (!b) return {};
    if (!b.nationState || typeof b.nationState !== 'object') b.nationState = {};
    return b.nationState;
  }
  /** 이번 턴(마지막 자기 턴)에 움직이지 않았는가. game.js가 movedTilesThisTurn을 자기 턴 시작마다 0으로 되돌린다. */
  const isStationary = (u) => num(u && u.movedTilesThisTurn) <= 0;

  // --------------------------------------------------------------------------
  // 승률 보정
  // --------------------------------------------------------------------------
  /** arca: 생존 적들 중 unit과 8방향으로 이어진 무리 크기 */
  function clusterSize(unit) {
    const all = enemies();
    const seen = new Set([unit.id]);
    const queue = [unit];
    while (queue.length) {
      const cur = queue.shift();
      all.forEach(o => {
        if (!seen.has(o.id) && chebyshev(cur, o) <= 1) { seen.add(o.id); queue.push(o); }
      });
    }
    return seen.size;
  }

  function getCombatMods(attacker, defender, info) {
    const out = { atkPct: 0, defPct: 0, ignoreDefPct: 0, factors: [] };
    if (!attacker || !defender || !getActiveRule()) return out;
    const strikeDist = info && Number.isFinite(info.strikeDist) ? info.strikeDist : manhattan(attacker, defender);

    let r = ruleFor(attacker, 'BLOOD_FRENZY');
    if (r) {
      const maxHp = num(attacker.maxHp, 100) || 100;
      const lost = 1 - Math.max(0, num(attacker.hp, maxHp)) / maxHp;
      const pct = Math.min(r.max, Math.floor(lost / r.step + 1e-9) * r.value);
      if (pct > 0) { out.atkPct += pct; out.factors.push({ side: 'atk', label: label(r, '상처 입을수록 공격'), pct }); }
    }
    r = ruleFor(attacker, 'ARMOR_PIERCE');
    if (r && classOf(attacker) === 'FIREARM') {
      out.ignoreDefPct += r.value;
      out.factors.push({ side: 'def', label: label(r, '대상 방어력 무시'), pct: -r.value });
    }
    r = ruleFor(defender, 'PHALANX');
    if (r) {
      const size = clusterSize(defender);
      if (size >= r.min) { out.defPct += r.value; out.factors.push({ side: 'def', label: label(r, `${size}기 밀집`), pct: r.value }); }
    }
    r = ruleFor(defender, 'STANDFAST_COUNTER');
    if (r && classOf(defender) === 'MELEE' && isStationary(defender) && strikeDist <= 1) {
      out.factors.push({ side: 'win', label: label(r, '이겨도 반드시 반격 피해를 받음'), pct: null });
    }
    if (!(info && info.redirected) && redirectAttackTarget(attacker, defender, { dryRun: true }) !== defender) {
      out.factors.push({ side: 'win', label: label(NATION_RULES.torva, '곁의 근접병이 대신 막아섬'), pct: null });
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // 사거리 · 이동력 · 이동 비용
  // --------------------------------------------------------------------------
  function getAttackRangeBonus(unit) {
    const r = ruleFor(unit, 'ARCHER_RANGE');
    return r && classOf(unit) === 'ARCHER' ? r.value : 0;
  }
  function getMobilityBonus(unit) {
    let r = ruleFor(unit, 'ARCHER_MOBILITY');
    if (r && classOf(unit) === 'ARCHER') return r.value;
    r = ruleFor(unit, 'KNIGHT_UNSHAKEN');
    if (r && classOf(unit) === 'KNIGHT') return r.value;
    return 0;
  }
  /** 이동 비용을 덮어쓸 때 숫자, 아니면 null */
  function getMoveCostOverride(unit, tile) {
    const r = ruleFor(unit, 'WATER_WALK');
    if (r && tile && r.terrains.includes(terrainOf(tile))) return 1;
    return null;
  }

  // --------------------------------------------------------------------------
  // 스킬 엔진 연결
  // --------------------------------------------------------------------------
  function isEffectImmune(unit, effectType) {
    const r = ruleFor(unit, 'KNIGHT_UNSHAKEN');
    return !!(r && classOf(unit) === 'KNIGHT' && r.immune.includes(effectType));
  }
  function adjustSkillCooldown(unit, cooldown) {
    const r = ruleFor(unit, 'MAGE_COOLDOWN');
    if (r && classOf(unit) === 'MAGE') return Math.max(0, num(cooldown) + r.value);
    return cooldown;
  }

  // --------------------------------------------------------------------------
  // 교환 피해 (tino)
  //   기존 구조: 승자는 살아남고 calculateRoundCombatDamage의 교환 피해만 받는다. 공격자가 이기면
  //   수비측 반격 피해(attackerDamage)는 승률이 높을수록 0에 가까워진다.
  //   부동 반격: 이동하지 않은 티노 근접병이 근접(거리 1) 공격을 받으면, 승패와 상관없이 공격자가 받는
  //   반격 피해가 최소한 "수비자 유효 공격력 × 50%"가 되도록 attackerDamage를 끌어올린다.
  //   (공격자가 지는 경우 공격자는 어차피 쓰러지므로 바뀌는 것이 없다. 교환 피해는 HP 1 아래로 내리지 않는다.)
  // --------------------------------------------------------------------------
  function adjustExchangeDamage(attacker, defender, dmg, info) {
    const r = ruleFor(defender, 'STANDFAST_COUNTER');
    if (!r || classOf(defender) !== 'MELEE' || !isStationary(defender)) return dmg;
    const strikeDist = info && Number.isFinite(info.strikeDist) ? info.strikeDist : manhattan(attacker, defender);
    if (strikeDist > 1) return dmg;
    const guaranteed = Math.max(1, Math.round(num(info && info.defenderAtk) * r.value));
    if (guaranteed > dmg.attackerDamage) {
      ctx.log(`🛡️ [${label(r)}] 자리를 지킨 ${defender.name}이(가) 반드시 되받아칩니다! (반격 피해 최소 ${guaranteed})`, 'warning');
      return { ...dmg, attackerDamage: guaranteed };
    }
    return dmg;
  }

  // --------------------------------------------------------------------------
  // 대상 지정 (torva 호위 · luma 은신)
  // --------------------------------------------------------------------------
  /** 호위: 공격받는 적 유닛 곁(거리 1)의 근접병이 대신 맞는다. 교전마다 한 번만 판정하므로 연쇄되지 않는다. */
  function redirectAttackTarget(attacker, defender, opts) {
    const r = ruleFor(defender, 'BODYGUARD');
    if (!r || !attacker || attacker.owner === 'ENEMY' || classOf(defender) === 'MELEE') return defender;
    const guards = enemies()
      .filter(o => o.id !== defender.id && classOf(o) === 'MELEE' && manhattan(o, defender) === 1)
      .sort((a, b) => num(b.hp) - num(a.hp) || String(a.id).localeCompare(String(b.id)));
    const guard = guards[0];
    if (!guard) return defender;
    if (!(opts && opts.dryRun)) {
      ctx.log(`🛡️ [${label(r)}] ${guard.name}이(가) ${defender.name}의 앞을 막아서 대신 공격을 받습니다!`, 'warning');
    }
    return guard;
  }

  /** 은신: 숲·습지 위의 루마 적은 바로 곁(거리 1)에서만 대상으로 지정할 수 있다. */
  function canTargetUnit(attacker, target) {
    const r = ruleFor(target, 'SWAMP_STEALTH');
    if (!r || !attacker || attacker.owner === 'ENEMY') return true;
    if (!r.terrains.includes(terrainOf(ctx.getTile(target.x, target.y)))) return true;
    return manhattan(attacker, target) <= 1;
  }

  // --------------------------------------------------------------------------
  // 이벤트
  // --------------------------------------------------------------------------
  /** 전투 시작: 이동력 보정(liona·vaska)과 보호막(elda)을 상대국 적에게 건다. */
  function onBattleStart(battle) {
    const r = getActiveRule();
    if (!r) return;
    const lines = [];
    enemies().forEach(e => {
      const bonus = getMobilityBonus(e);
      if (bonus && !e.nationApApplied) {
        const before = num(e.baseAP, 2) || 2;
        e.baseAP = Math.max(1, before + bonus);
        e.ap = e.baseAP;
        e.nationApApplied = true;
        lines.push(`${e.name} AP ${before}→${e.baseAP}`);
      }
      const shieldRule = ruleFor(e, 'BATTLE_SHIELD');
      if (shieldRule) {
        const value = Math.max(1, Math.round((num(e.maxHp, 100) || 100) * shieldRule.value));
        if (!Array.isArray(e.statuses)) e.statuses = [];
        e.statuses = e.statuses.filter(s => !(s.type === 'SHIELD' && s.source === '국가 규칙'));
        e.statuses.push({ type: 'SHIELD', value, turns: 50, casterId: null, source: '국가 규칙' });
        lines.push(`${e.name} 🔰${value}`);
      }
    });
    if (battle && typeof battle === 'object' && !battle.nationState) battle.nationState = {};
    ctx.log(`🏳️ [${label(r)}] ${r.description}${lines.length ? ` (${lines.join(' · ')})` : ''}`, 'warning');
  }

  /** 진영 턴 시작. 모르: 쓰러진 뒤 다음 적 턴이 오면 부활한다. */
  function onTurnStart(side) {
    if (side !== 'ENEMY') return;
    const r = getActiveRule();
    if (!r || r.rule !== 'UNDYING') return;
    const ns = nationState();
    const pending = ns.revive;
    if (!pending) return;
    const unit = ((ctx.getState() || {}).enemyUnits || []).find(e => e.id === pending.unitId);
    ns.revive = null;
    if (!unit || !unit.isDead) return;
    const spot = findReviveSpot(unit);
    unit.isDead = false;
    unit.hp = Math.max(1, Math.round((num(unit.maxHp, 100) || 100) * r.value));
    if (unit.stats) unit.stats.hp = unit.hp;
    unit.statuses = [];
    unit.x = spot.x; unit.y = spot.y;
    unit.revivedByNation = true;
    ctx.onRevive(unit);
    ctx.log(`⚰️ [${label(r)}] 쓰러졌던 ${unit.name}이(가) 다시 일어섰습니다! (HP ${unit.hp}/${unit.maxHp || 100})`, 'danger');
  }

  function findReviveSpot(unit) {
    const blocked = (x, y) => players().some(p => p.x === x && p.y === y);
    if (ctx.getTile(unit.x, unit.y) && !blocked(unit.x, unit.y)) return { x: unit.x, y: unit.y };
    for (let d = 1; d <= 30; d++) {
      for (let dy = -d; dy <= d; dy++) {
        const rest = d - Math.abs(dy);
        for (const dx of rest === 0 ? [0] : [-rest, rest]) {
          const x = unit.x + dx, y = unit.y + dy;
          if (ctx.getTile(x, y) && !blocked(x, y)) return { x, y };
        }
      }
    }
    return { x: unit.x, y: unit.y };
  }

  /** 적이 아군을 처치했을 때 (naru) */
  function onKill(killer, victim) {
    const r = ruleFor(killer, 'KILL_AP');
    if (!r || !victim || victim.owner === 'ENEMY') return;
    const cap = Math.max(num(killer.baseAP, 2), 0);
    const before = num(killer.ap);
    killer.ap = Math.min(cap, before + r.value);
    if (killer.ap > before) ctx.log(`💰 [${label(r)}] ${killer.name}이(가) ${victim.name}을(를) 쓰러뜨리고 AP +${killer.ap - before} 회복!`, 'danger');
  }

  /** 유닛이 쓰러졌을 때 (mor). info.captured면 포섭된 것이라 부활하지 않는다. */
  function onUnitDeath(unit, info) {
    const r = ruleFor(unit, 'UNDYING');
    if (!r || (info && info.captured)) return;
    const ns = nationState();
    if (ns.reviveUsed) return;
    ns.reviveUsed = true;
    ns.revive = { unitId: unit.id };
    ctx.log(`⚰️ [${label(r)}] ${unit.name}이(가) 쓰러졌지만… 시체가 아직 꿈틀거립니다. (다음 적 턴에 부활)`, 'danger');
  }

  function countPendingRevives() {
    const r = getActiveRule();
    if (!r || r.rule !== 'UNDYING') return 0;
    const pending = nationState().revive;
    if (!pending) return 0;
    const unit = ((ctx.getState() || {}).enemyUnits || []).find(e => e.id === pending.unitId);
    return unit && unit.isDead ? 1 : 0;
  }

  /**
   * 교전이 끝난 뒤 (attacker가 공격한 쪽).
   * result = { isWin, attackerStart:{x,y}, defenderPos:{x,y}, strikeDist, movedBeforeAttack }
   */
  function onAfterAttack(attacker, defender, result) {
    if (!attacker || !result) return;
    // ara: 이동 후 공격으로 이긴 기사 → 공격 방향으로 곁의 아군 1명을 1칸 밀어낸다 (막히면 무효)
    let r = ruleFor(attacker, 'CHARGE_KNOCKBACK');
    if (r && result.isWin && classOf(attacker) === 'KNIGHT' && result.movedBeforeAttack && isAlive(attacker)) {
      const dir = stepDir(result.attackerStart, result.defenderPos);
      if (dir) {
        const beyond = { x: result.defenderPos.x + dir.dx, y: result.defenderPos.y + dir.dy };
        const victim = players()
          .filter(p => chebyshev(p, result.defenderPos) === 1)
          .sort((a, b) => manhattan(a, beyond) - manhattan(b, beyond) || String(a.id).localeCompare(String(b.id)))[0];
        if (victim) {
          const nx = victim.x + dir.dx, ny = victim.y + dir.dy;
          const blocked = !ctx.getTile(nx, ny) || enemies().some(e => e.x === nx && e.y === ny);
          if (blocked) {
            ctx.log(`🐎 [${label(r)}] ${attacker.name}의 돌파가 ${victim.name}을(를) 밀어내려 했지만 뒤가 막혀 버텼습니다.`, 'warning');
          } else {
            victim.x = nx; victim.y = ny;
            ctx.log(`🐎 [${label(r)}] ${attacker.name}의 돌파에 ${victim.name}이(가) 1칸 밀려났습니다! → (${nx}, ${ny})`, 'danger');
          }
        }
      }
    }
    // silva: 사격을 마친 궁수·총병은 가장 가까운 아군에게서 멀어지는 빈 칸으로 1칸 물러난다
    r = ruleFor(attacker, 'SHOOT_AND_SCOOT');
    if (r && isAlive(attacker) && ['ARCHER', 'FIREARM'].includes(classOf(attacker))) {
      const foes = players();
      if (foes.length) {
        const nearest = (pt) => Math.min(...foes.map(p => manhattan(pt, p)));
        const here = nearest(attacker);
        const everyone = [...foes, ...enemies()];
        const best = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
          .map(d => ({ x: attacker.x + d.dx, y: attacker.y + d.dy }))
          .filter(pt => ctx.getTile(pt.x, pt.y) && !everyone.some(u => u.x === pt.x && u.y === pt.y))
          .map(pt => ({ ...pt, d: nearest(pt) }))
          .filter(pt => pt.d > here)
          .sort((a, b) => b.d - a.d)[0];
        if (best) {
          attacker.x = best.x; attacker.y = best.y;
          ctx.log(`🏹 [${label(r)}] ${attacker.name}이(가) 사격 후 한 걸음 물러났습니다 → (${best.x}, ${best.y})`, 'warning');
        }
      }
    }
  }

  function stepDir(from, to) {
    if (!from || !to) return null;
    const dx = to.x - from.x, dy = to.y - from.y;
    if (dx === 0 && dy === 0) return null;
    return Math.abs(dx) >= Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) };
  }

  global.NationRules = {
    NATION_RULES,
    configure, getRule, getActiveNationId, getActiveRule,
    getCombatMods, getAttackRangeBonus, getMobilityBonus, getMoveCostOverride,
    isEffectImmune, adjustSkillCooldown, adjustExchangeDamage,
    redirectAttackTarget, canTargetUnit,
    onBattleStart, onTurnStart, onKill, onAfterAttack, onUnitDeath, countPendingRevives
  };
  global.NATION_RULES = NATION_RULES;
})(typeof window !== 'undefined' ? window : globalThis);
