    'use strict';

    /* --------------------------------------------------------------------------
       Data State & Declarations
       -------------------------------------------------------------------------- */
    // LEGACY: 예전 기본 8x10 맵 크기. 전술 코드는 getBattleSize()(= state.currentBattle.map.width/height)를 쓴다.
    const GRID_COLS = 8;
    const GRID_ROWS = 10;

    // 지휘관 스킬 데이터 명세 (Passive Data & Logic)
    const COMMANDER_SKILLS_DATA = {
      BearDown: {
        id: 'BearDown',
        name: '베어 다운 (BearDown)',
        desc: '첫 번째 유닛 공격력 +20% 증가',
        cost: 1,
        prerequisite: null
      },
      Precision: {
        id: 'Precision',
        name: '세밀한 타격 (Precision)',
        desc: '적 지형 방어 보너스 1개(타일 방어) 무시',
        cost: 1,
        prerequisite: null
      },
      Berserk: {
        id: 'Berserk',
        name: '광폭화 (Berserk)',
        desc: '호감도 30 이하 및 저승률 상태에서도 전투 거부 무시하고 강제 공격',
        cost: 1,
        prerequisite: 'BearDown'
      },
      ShieldWall: {
        id: 'ShieldWall',
        name: '방패 장벽 (ShieldWall)',
        desc: '아군 전체 방어력 +15% 증가',
        cost: 1,
        prerequisite: null
      },
      Ironclad: {
        id: 'Ironclad',
        name: '철갑 외피 (Ironclad)',
        desc: '피격 피해 및 2차 스플래시 피해 30% 감소',
        cost: 1,
        prerequisite: 'ShieldWall'
      },
      RapidAdvance: {
        id: 'RapidAdvance',
        name: '신속한 진격 (RapidAdvance)',
        desc: '이동 시 소모 AP 포인트 50% 할인 (1 AP로 2칸 이동 효율)',
        cost: 1,
        prerequisite: null
      },
      CommanderLeadership: {
        id: 'CommanderLeadership',
        name: '지휘관의 통솔 (CommanderLeadership)',
        desc: '전투 승리 시 경험치 및 호감도 획득량 +30% 증폭',
        cost: 1,
        prerequisite: 'RapidAdvance'
      },
      StrategicDominance: {
        id: 'StrategicDominance',
        name: '전략적 지배 (StrategicDominance)',
        desc: '포섭 유닛의 초기 호감도 +25 추가 보정 (총 50 호감도로 시작)',
        cost: 1,
        prerequisite: 'CommanderLeadership'
      },
      DefendersLeader: {
        id: 'DefendersLeader',
        name: '수비의 리더 (DefendersLeader)',
        desc: '아군이 수세(적 승률 50% 초과)에서 방어할 때 선제 타격 2회(받는 피해 -10%) 및 반격 피해 +20%',
        cost: 1,
        prerequisite: 'Ironclad'
      },
      TacticalRetreat: {
        id: 'TacticalRetreat',
        name: '전략적 후퇴 (TacticalRetreat)',
        desc: '아군이 절대적 위기(적 승률 70% 초과)에서 방어하다 패배하면 퇴각 확률 +20%, 퇴각에 성공하면 HP 50% 회복',
        cost: 1,
        prerequisite: 'DefendersLeader'
      }
    };

    // 기본 병과별 추천 고유 스킬 프리셋
    const DEFAULT_CLASS_SKILLS = {
      KNIGHT: {
        name: '빛의 수호 성벽',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'BUFF',
        effectValue: 35,
        description: '성스러운 기도의 방벽을 전개하여 자신과 아군의 체력을 35 회복하고 이번 턴 공/방을 25% 증폭합니다.'
      },
      MAGE: {
        name: '유성 비전 폭풍',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'AOE',
        effectValue: 32,
        description: '사거리 2칸 내의 모든 적에게 비전 유성 폭격을 쏟아부어 32의 광역 마법 피해를 입힙니다.'
      },
      ARCHER: {
        name: '질풍의 급소 저격',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'SINGLE_TARGET',
        effectValue: 45,
        description: '적의 약점을 노려 단일 적군에게 45의 치명적인 방어 관통 저격 화살을 날립니다.'
      },
      MELEE: {
        name: '철벽 분쇄 돌격',
        type: 'ACTIVE',
        costAP: 1,
        coolDown: 2,
        targetType: 'SINGLE_TARGET',
        effectValue: 42,
        description: '전방 2칸 내의 적에게 돌진하여 진형을 무너뜨리고 42의 강타 물리 피해를 입힙니다.'
      },
      FIREARM: {
        name: '초토화 포격 집중',
        type: 'ACTIVE',
        costAP: 2,
        coolDown: 3,
        targetType: 'AOE',
        effectValue: 40,
        description: '중포 십자포화를 발사하여 사거리 내 모든 적군에게 40의 괴멸적인 폭발 피해를 입힙니다.'
      }
    };

    // ========================================================================
    // 월드 섹터 노드 정의 (World Map / Sector Nodes Data)
    // ========================================================================
    const WORLD_SECTORS = {
      'A-1': {
        id: 'A-1',
        name: '벨른 평원',
        icon: '🌾',
        difficulty: 'EASY',
        stars: '★☆☆☆☆',
        terrainDesc: '탁 트인 평야 지대로 기동력이 우수하며 ZOC 전선 형성이 빠름',
        terrainComposition: { plain: 65, forest: 25, hill: 10 },
        enemyForce: '👺 고블린 유격대 (두목 그룩)',
        // recPower: 예전 고정 추천 전투력. 화면에는 더 이상 쓰지 않는다 (estimateNodeEnemyPower가 실제 적 기준으로 계산).
        recPower: 320,
        upkeep: 15,
        // clearReward / upkeep: 예전 고정 문구·수치. 화면에는 더 이상 쓰지 않는다 (실제 지급 규칙·편성 유지비로 계산).
        clearReward: '250G + 장비',
        locked: false,
        // 2단계: Sector가 사용할 기본 TacticalMapTemplate id (지금은 sectorId와 1:1).
        // 나중에 A-1-forest 같은 복수 템플릿을 붙일 때 이 값만 바꾸면 된다.
        defaultTemplateId: 'A-1',
        // 로그라이크 노드 생성 시 뽑을 인카운터 유형 풀 (8단계 랜덤화에서 사용 예정, 현재는 미사용)
        encounterPool: ['battle', 'battle', 'event']
      },
      'A-2': {
        id: 'A-2',
        name: '아이젠 요새',
        icon: '🏰',
        difficulty: 'NORMAL',
        stars: '★★☆☆☆',
        terrainDesc: '성벽과 방어 망루가 빽빽한 방어 거점. 공성 원거리 병과 중요',
        terrainComposition: { plain: 40, forest: 20, hill: 40 },
        enemyForce: '🛡️ 철혈 방위군 (사령관 바르크)',
        recPower: 450,
        upkeep: 25,
        clearReward: '400G + 강철 방패',
        locked: false,
        defaultTemplateId: 'A-2',
        encounterPool: ['battle', 'battle', 'elite', 'event']
      },
      'B-1': {
        id: 'B-1',
        name: '에테르니아 왕도',
        icon: '👑',
        difficulty: 'HARD',
        stars: '★★★★☆',
        terrainDesc: '제국 수도 수복 작전. 고대 마법 결계와 다층 방어선 형성',
        terrainComposition: { plain: 30, forest: 30, hill: 40 },
        enemyForce: '🔮 마도 사제단 및 수호 골렘',
        recPower: 620,
        upkeep: 35,
        clearReward: '750G + 영웅의 서',
        locked: false,
        defaultTemplateId: 'B-1',
        encounterPool: ['battle', 'elite', 'event', 'boss']
      },
      'B-2': {
        id: 'B-2',
        name: '흑염 화산지대',
        icon: '🌋',
        difficulty: 'NIGHTMARE',
        stars: '★★★★★',
        terrainDesc: '용암 지열과 유독가스로 인해 턴당 지속 피해가 발생하는 극한 전장',
        terrainComposition: { plain: 20, forest: 10, hill: 70 },
        enemyForce: '🐉 심연의 흑룡 및 광신도 군단',
        recPower: 880,
        upkeep: 50,
        clearReward: '1500G + 드래곤 하트',
        locked: true,
        defaultTemplateId: 'B-2',
        encounterPool: ['elite', 'boss']
      }
    };
    // WORLD_SECTORS는 top-level const로 선언되어 있어 다른 <script> 태그(
    // civ4-editor.js, mapSchema.js)에서 window.WORLD_SECTORS로는 원래 보이지 않았다.
    // MapSchema.getSector()가 Sector 데이터를 읽을 수 있도록 명시적으로 전역에 노출한다.
    window.WORLD_SECTORS = WORLD_SECTORS;

    // 게스트 ID 생성기
    function generateGuestId() {
      const randNum = Math.floor(1000 + Math.random() * 9000);
      return `Guest_${randNum}`;
    }

    /* --------------------------------------------------------------------------
       HP Normalization & Percentage-Based Combat Mathematics Engine
       -------------------------------------------------------------------------- */

    /**
     * HP Normalization Utility
     * Iterates over all existing units in state (state.units, state.playerUnits,
     * state.enemyUnits, and tiles.units) and forces:
     *   unit.maxHp = 100;
     *   unit.hp = Math.min(100, Math.max(0, unit.hp)); (or reset to 100 if invalid)
     * Also keeps unit.stats synchronized with normalized HP values.
     *
     * @param {Object} [targetState] - Optional state object to normalize. Defaults to active state.
     * @returns {number} Count of unique units normalized.
     */
    function normalizeAllUnitsHP(targetState = (typeof state !== 'undefined' ? state : null)) {
      const s = targetState;
      const processedUnits = new Set();

      function normalizeUnit(unit) {
        if (!unit || typeof unit !== 'object' || processedUnits.has(unit)) return;
        processedUnits.add(unit);

        // Force maximum HP to standard 100-point scale
        unit.maxHp = 100;

        // Force current HP to integer clamped between 0 and 100 (or reset to 100 if invalid)
        if (typeof unit.hp !== 'number' || isNaN(unit.hp)) {
          unit.hp = 100;
        } else {
          unit.hp = Math.min(100, Math.max(0, Math.round(unit.hp)));
        }

        // Synchronize unit.stats object if present
        if (unit.stats && typeof unit.stats === 'object') {
          unit.stats.maxHp = 100;
          unit.stats.hp = unit.hp;
        }
      }

      if (s) {
        if (Array.isArray(s.playerUnits)) s.playerUnits.forEach(normalizeUnit);
        if (Array.isArray(s.enemyUnits)) s.enemyUnits.forEach(normalizeUnit);
        if (Array.isArray(s.units)) s.units.forEach(normalizeUnit);
      }

      const battleTiles = s && s.currentBattle && s.currentBattle.map && s.currentBattle.map.tiles;
      if (Array.isArray(battleTiles)) {
        battleTiles.forEach(t => {
          if (t && Array.isArray(t.units)) t.units.forEach(normalizeUnit);
        });
      }

      return processedUnits.size;
    }

    /**
     * Percentage Combat Strength Calculation
     * Formula: Effective Strength = Base Strength * (unit.hp / 100)
     *
     * @param {Object|number} unitOrBase - The unit object or raw base strength number.
     * @param {string|number} [typeOrHp='attack'] - Stat type ('attack'|'defense'|'strength') or current HP number.
     * @returns {number} Effective combat strength based on current HP percentage.
     */
    function calculateEffectiveStrength(unitOrBase, typeOrHp = 'attack') {
      if (typeof unitOrBase === 'number') {
        const base = unitOrBase;
        const hp = typeof typeOrHp === 'number' ? typeOrHp : 100;
        const clampedHp = Math.min(100, Math.max(0, hp));
        return base * (clampedHp / 100);
      }

      const unit = unitOrBase;
      if (!unit || typeof unit !== 'object') return 0;

      // 전투력은 최대 HP 대비 남은 HP 비율로 깎인다 (최대 HP가 100이 아닌 유닛도 만피면 100%).
      const maxHp = Number(unit.maxHp) > 0 ? Number(unit.maxHp)
        : (unit.stats && Number(unit.stats.maxHp) > 0 ? Number(unit.stats.maxHp) : 100);
      const hp = (typeof unit.hp === 'number' && !isNaN(unit.hp))
        ? Math.min(maxHp, Math.max(0, unit.hp))
        : (unit.isDead ? 0 : maxHp);
      const hpPercentage = hp / maxHp;

      const statType = typeof typeOrHp === 'string' ? typeOrHp.toLowerCase() : 'attack';
      let baseStrength = 10;

      if (statType === 'defense' || statType === 'def') {
        baseStrength = typeof unit.def === 'number' ? unit.def :
                       (unit.stats && typeof unit.stats.def === 'number') ? unit.stats.def :
                       (typeof unit.defensePower === 'number') ? unit.defensePower :
                       (typeof unit.atk === 'number') ? unit.atk : 10;
        // 지휘력 보정(사망회귀 보상)은 방어력 계산의 이 한 곳에서만 더한다.
        baseStrength += getCommandBonusDef(unit);
        // 지휘관 유물(군 전체 방어력 보정)
        baseStrength = Math.max(0, baseStrength + getArmyRelicBonus(unit, 'def'));
      } else if (statType === 'strength') {
        baseStrength = typeof unit.strength === 'number' ? unit.strength :
                       typeof unit.atk === 'number' ? unit.atk :
                       (unit.stats && typeof unit.stats.atk === 'number') ? unit.stats.atk :
                       (typeof unit.attackPower === 'number') ? unit.attackPower : 10;
      } else {
        // Default: attack / atk
        baseStrength = typeof unit.atk === 'number' ? unit.atk :
                       typeof unit.strength === 'number' ? unit.strength :
                       (unit.stats && typeof unit.stats.atk === 'number') ? unit.stats.atk :
                       (typeof unit.attackPower === 'number') ? unit.attackPower : 10;
        // 지휘관 유물(군 전체 공격력 보정)
        baseStrength = Math.max(1, baseStrength + getArmyRelicBonus(unit, 'atk'));
      }

      return baseStrength * hpPercentage;
    }

    /**
     * Calculates combat exchange damage per round and rounds damage to clean integers
     * so unit HP remains clean integers between 0 and 100.
     *
     * @param {Object} attacker - Attacker unit
     * @param {Object} defender - Defender unit
     * @param {boolean} attackerWon - Whether attacker won the round/exchange
     * @param {number} winChance - Win probability percentage (0 - 100)
     * @returns {{ attackerDamage: number, defenderDamage: number }}
     */
    function calculateRoundCombatDamage(attacker, defender, attackerWon, winChance) {
      const atkPower = calculateEffectiveStrength(attacker, 'atk');
      const defPower = calculateEffectiveStrength(defender, 'def');
      const winRate = Math.max(0.01, Math.min(0.99, (winChance || 50) / 100));

      let primaryDamage = 0;
      let counterDamage = 0;

      if (attackerWon) {
        primaryDamage = Math.round(atkPower * (1 + winRate * 0.4));
        counterDamage = Math.round(defPower * (1 - winRate) * 0.3);
      } else {
        primaryDamage = Math.round(defPower * (1 + (1 - winRate) * 0.5));
        counterDamage = Math.round(atkPower * winRate * 0.25);
      }

      let defenderDamage = attackerWon ? primaryDamage : counterDamage;
      let attackerDamage = attackerWon ? counterDamage : primaryDamage;

      // 승급 효과: 제식 훈련 — 방어 시 반격 피해 증가, 선제 타격 1회당 받는 피해 -5% (최대 -20%)
      const atkPromo = getPromotionEffectSummary(attacker);
      const defPromo = getPromotionEffectSummary(defender);
      // 유물: 반격 피해(counterDmg) / 지휘관 패시브: 수비의 리더(수세에서 선제 타격 2 + 반격 +20%) · 철갑 외피(아군 피격 피해 -30%)
      const cmdSkills = (state && state.commander && state.commander.unlockedSkills) || {};
      const attackerIsPlayer = isPlayerSideUnit(attacker);
      const defenderIsPlayer = isPlayerSideUnit(defender);
      let defCounter = defPromo.counterBonus + getRelicStatFor(defender, 'counterDmg') / 100;
      let defStrikes = defPromo.firstStrikes;
      if (defenderIsPlayer && cmdSkills.DefendersLeader && (Number(winChance) || 50) > 50) {
        defStrikes = Math.max(defStrikes, 2);
        defCounter += 0.20;
      }
      attackerDamage *= Math.max(0, 1 + defCounter);
      attackerDamage *= 1 - Math.min(0.20, atkPromo.firstStrikes * 0.05);
      defenderDamage *= 1 - Math.min(0.20, defStrikes * 0.05);
      if (cmdSkills.Ironclad) {
        if (attackerIsPlayer) attackerDamage *= 0.70;
        if (defenderIsPlayer) defenderDamage *= 0.70;
      }

      return {
        defenderDamage: Math.max(0, Math.round(defenderDamage)),
        attackerDamage: Math.max(0, Math.round(attackerDamage))
      };
    }

    // 통솔력 = 한 전투에 출전시킬 수 있는 최대 영웅 수. 지휘관 레벨로만 정해지고 소모되지 않는다.
    // (출격 비용은 따로 없다 — 출전 인원은 통솔력이, 유지 부담은 유닛 유지비가 제한한다)
    const LEADERSHIP_BASE = 4;               // Lv.1 통솔력
    const LEADERSHIP_LEVELS_PER_POINT = 2;   // 이 레벨마다 통솔력 +1 (Lv.3, 5, 7 …)

    function getLeadershipForLevel(level) {
      return LEADERSHIP_BASE + Math.floor(Math.max(0, (Number(level) || 1) - 1) / LEADERSHIP_LEVELS_PER_POINT);
    }

    // 유물 효과 중 출전 인원을 늘리는 것. commanderAP는 출격 AP가 있던 시절의 유물 데이터(같은 의미로 읽는다).
    const LEADERSHIP_RELIC_STATS = ['leadership', 'deploySlots', 'commanderAP'];
    // 지휘관 유물은 이 개수까지만 장착할 수 있고, 장착한 것만 효과가 난다.
    const COMMANDER_RELIC_SLOTS = 3;

    function getRelicLeadershipBonus() {
      return getEquippedCommanderRelics()
        .reduce((sum, r) => sum + (r.effects || [])
          .filter(fx => fx && LEADERSHIP_RELIC_STATS.includes(fx.stat))
          .reduce((acc, fx) => acc + (Number(fx.value) || 0), 0), 0);
    }

    function getLeadership() {
      return getLeadershipForLevel(state && state.commander ? state.commander.level : 1) + getRelicLeadershipBonus();
    }
    window.getLeadership = getLeadership;

    // 지휘관 경험치는 모두 여기로 준다. 레벨업마다 스킬 선택권 +1, 레벨에 따라 통솔력이 오른다.
    function grantCommanderExp(amount, reason) {
      const commander = state.commander;
      if (!commander || !(amount > 0)) return;
      // 유물 경험치 획득(%): 지휘관 유물만 (지휘관 경험치에는 선물 유물이 걸리지 않는다)
      const expPct = clampPercent(getCommanderRelicStat('expGain'), -50, 300);
      if (expPct) amount = Math.max(1, roundStochastic(amount * (1 + expPct / 100)));
      commander.exp = (commander.exp || 0) + amount;
      if (reason) addLog(`👑 ${reason}: 지휘관 경험치 +${amount} EXP`, 'gold');
      const noticeLines = [];
      while (commander.exp >= commander.maxExp) {
        const leadershipBefore = getLeadership();
        commander.exp -= commander.maxExp;
        commander.level += 1;
        commander.maxExp = Math.round(commander.maxExp * 1.4);
        const spGain = commander.level % 3 === 0 ? 1 : 0; // 3레벨마다 스킬 선택권 +1
        commander.skillPoints = (commander.skillPoints || 0) + spGain;
        const leadershipAfter = getLeadership();
        const leadershipText = leadershipAfter > leadershipBefore ? ` · 통솔력 ${leadershipBefore} → ${leadershipAfter}부대` : '';
        addLog(`👑 지휘관 레벨업! Lv.${commander.level}${spGain ? ' — 스킬 선택권 +1' : ''}${leadershipText}`, 'gold');
        noticeLines.push(`Lv.${commander.level} 달성${spGain ? ' — 스킬 선택권 +1' : ''}`);
        if (leadershipAfter > leadershipBefore) noticeLines.push(`통솔력 ${leadershipBefore} → ${leadershipAfter}부대`);
      }
      if (noticeLines.length) {
        noticeLines.push(`보유 스킬 선택권 ${commander.skillPoints}개 — 지휘관 스킬트리에서 새 패시브를 해금하세요.`);
        window.UI?.showGrowthNotice?.({
          key: 'commander', icon: '👑', title: `지휘관 레벨업! Lv.${commander.level}`, lines: noticeLines,
          actionLabel: '🌳 지휘관 스킬트리', onAction: openSkillsModal
        });
      }
    }

    // 유닛 레벨업 · 병과 승급 직후 안내창 → 해당 유닛의 스킬트리 탭으로 바로 이동
    function notifyUnitGrowth(unit, title, lines = []) {
      if (!unit || (unit.owner && unit.owner !== 'PLAYER')) return;
      const sp = Number(unit.skillPoints) || 0;
      window.UI?.showGrowthNotice?.({
        key: `unit-${unit.id}`, icon: '⭐', title,
        lines: [...lines, sp > 0 ? `스킬 해금권 ${sp}장 보유 — 스킬트리에서 새 스킬을 익히세요.` : '스킬트리에서 다음 스킬을 확인해 보세요.'],
        onAction: () => window.UI?.renderPromotionMenu?.(unit, { tab: 'skills' })
      });
    }

    // 아군 전사 시 지휘관 경험치 획득.
    function awardCommanderCasualtyExp(unit, amount = 25) {
      if (!unit || unit.owner !== 'PLAYER' || unit._commanderExpAwarded) return;
      unit._commanderExpAwarded = true;
      grantCommanderExp(amount, `아군 ${unit.name} 전사`);
      saveGameState(true);
    }

    // ========================================================================
    // 2차: player(영구) / run(회귀 시 초기화) 분리
    // ========================================================================
    const START_GOLD = 450;

    // 기본 3인(롤랑·발터·리리아)도 다른 캐릭터처럼 캐릭터 풀(Supabase characters)의 레코드다.
    // 고정 id로 풀에 시드하고(ensureStarterCharacterRecords), 시작 파티는 그 레코드로 만든다.
    // 레코드가 아직 안 들어왔으면(첫 로드 전) 아래 기본값으로 만든다. unitId는 예전 세이브와 맞춘 인스턴스 id.
    const STARTER_CHARACTERS = [
      { id: 'starter_roland', unitId: 'u1', name: '성기사 롤랑', classType: 'KNIGHT', avatar: '🐴', level: 2,
        stats: { hp: 100, maxHp: 100, atk: 48, def: 38, mobility: 3 }, favorability: 85, upkeep: 12, x: 3, y: 4, combatRank: 1 },
      { id: 'starter_walter', unitId: 'u2', name: '용병대장 발터', classType: 'MELEE', avatar: '⚔️', level: 1,
        stats: { hp: 85, maxHp: 85, atk: 35, def: 30, mobility: 2 }, favorability: 40, upkeep: 8, x: 2, y: 3, combatRank: 0 },
      // 호감도 30 이하 (전투 거부 테스트용)
      { id: 'starter_lilia', unitId: 'u3', name: '명사수 리리아', classType: 'ARCHER', avatar: '🏹', level: 1,
        stats: { hp: 70, maxHp: 70, atk: 42, def: 20, mobility: 2 }, favorability: 28, upkeep: 8, x: 1, y: 3, combatRank: 0 }
    ];

    // In-memory cache for Supabase 'characters' collection (Zero LocalStorage)
    // createInitialState()가 스크립트 초기화 중에 시작 파티를 만들므로 여기서 먼저 선언한다.
    let customCharactersCloudCache = [];

    function starterTemplateToRecord(t) {
      return {
        id: t.id,
        owner: 'PLAYER',
        name: t.name,
        unitClass: t.classType,
        classType: t.classType,
        avatar: t.avatar,
        stats: { ...t.stats },
        favorability: t.favorability,
        upkeep: t.upkeep,
        imageUrl: '',
        customSkill: DEFAULT_CLASS_SKILLS[t.classType] ? JSON.parse(JSON.stringify(DEFAULT_CLASS_SKILLS[t.classType])) : undefined,
        isStarter: true,
        createdAt: '2000-01-01T00:00:00.000Z' // 목록(최신순) 맨 아래에 둔다
      };
    }

    // 런 시작 파티. 런 초기값은 createInitialRun() 한 곳에서만 만들고, 파티는 항상 이 함수로 새로 만든다.
    function createStartingParty() {
      return STARTER_CHARACTERS.map(t => {
        const record = findCharacterRecord(t.id) || starterTemplateToRecord(t);
        const unit = characterRecordToUnit(record, { id: t.unitId, x: t.x, y: t.y, level: t.level, fullHp: true });
        // 트리를 따로 만들지 않은 캐릭터는 병과 추천 트리를 쓴다 (SkillEngine.ensureUnitSkillState)
        if (!(Array.isArray(record.skillTree) && record.skillTree.length)) {
          delete unit.skillTree;
          unit.skillTreeCustomized = false;
        }
        unit.promotions = { combatRank: t.combatRank || 0 };
        return unit;
      });
    }

    // 지휘관 이름을 직접 입력받는다. first=true 면 취소할 수 없고(기본 이름 유지) 입력할 때까지 묻는다.
    function promptCommanderName(first) {
      if (!state.commander || typeof window.prompt !== 'function') return;
      const cur = state.commander.name || '';
      const input = window.prompt(first ? '지휘관 이름을 입력하세요 (최대 12자)' : '새 지휘관 이름을 입력하세요 (최대 12자)', first ? '' : cur);
      const name = String(input || '').trim().slice(0, 12);
      if (!name) {
        if (first) state.commander.nameSet = false; // 취소하면 다음 로그인 때 다시 묻는다
        return;
      }
      state.commander.name = name;
      state.commander.nameSet = true;
      saveGameState(true);
      renderAll();
    }
    window.promptCommanderName = promptCommanderName;

    function createInitialCommander() {
      return {
        name: '레오나르도',
        level: 1,
        exp: 20,
        maxExp: 100,
        skillPoints: 1,
        unlockedSkills: {
          BearDown: false,
          Precision: false,
          Berserk: false,
          ShieldWall: false,
          Ironclad: false,
          RapidAdvance: false,
          CommanderLeadership: false,
          StrategicDominance: false
        }
      };
    }

    // 영구 플레이어 데이터 (Supabase gameState의 player). 사망회귀해도 유지된다.
    function createInitialPlayer() {
      return {
        loopCount: 0,                          // 사망회귀 횟수
        // 회귀해도 남는 기억: seed별 방문 노드(예지), 마지막으로 전멸한 전투(기시감)
        memories: { visitedNodesBySeed: {}, deathBattle: null },
        unlockedCharacters: [],                // 한 번이라도 손에 넣은 캐릭터 id
        settings: { muted: false }             // 음소거 (true면 회귀 효과음을 내지 않는다)
      };
    }

    /**
     * 런 초기값을 만드는 유일한 함수. 노드 그래프(RunEngine) + 파티 + 골드 + 지휘관 + 인벤토리 + 용병 명부
     * + 회귀 카드(loopReward: command/foresight/stash/dejavu, applyLoopRewardToRun 참고).
     * 지휘력 카드의 방어 +1은 run.commandBonus에 기록만 하고, 실제 가산은
     * getCommandBonusDef()(→ calculateEffectiveStrength 'def') 한 곳에서만 한다.
     */
    function createInitialRun(seed = null, loopReward = null) {
      const run = RunEngine.createRun(WORLD_SECTORS, seed);
      run.party = createStartingParty();
      run.reserve = [];
      run.gold = START_GOLD;
      run.commander = createInitialCommander();
      run.inventory = [];
      run.characterCollection = [];
      // 잔향: 스킬트리를 다 연 캐릭터의 기억 계승·남는 해금권이 바뀐 공용 재화. 5개 = 원하는 캐릭터의 해금권 1장.
      run.resonance = 0;
      run.encounterSeq = 0;
      run.nodeAttempts = {};
      run.echo = null;
      // 작전지도: 지도 형태(campaignRegions.js)는 고정, 회차별 구역 상태만 여기 둔다. 시작 구역 하나만 available.
      run.campaign = createCampaignState();
      // 부관: 회차마다 작전지도에서 새로 임명한다 ({ characterId, name }). 지휘력 카드의 방어 보정도 부관이 받는다.
      run.adjutant = null;
      // 보유 유물 (회귀하면 사라진다). 보스 유물 3택1을 고르는 중이면 pendingRelicChoice에 후보가 남는다.
      run.relics = [];
      run.pendingRelicChoice = null;
      // 장착한 지휘관 유물의 instanceId (최대 COMMANDER_RELIC_SLOTS개). 장착한 것만 효과가 난다.
      run.equippedRelics = [];
      // 진행 중인 전술 전투. run 아래에 있으므로 회귀(새 run)와 함께 사라진다.
      run.currentBattle = null;
      applyLoopRewardToRun(run, loopReward);
      return run;
    }
    window.createInitialRun = createInitialRun;

    // 기존 코드의 state.gold / state.playerUnits / state.reserveUnits / state.currentBattle 은 state.run의 필드를 가리킨다.
    // (열거 불가: JSON 직렬화 시 중복 저장되지 않는다.)
    const RUN_FIELD_ALIASES = {
      gold: 'gold', playerUnits: 'party', reserveUnits: 'reserve',
      commander: 'commander', inventory: 'inventory', characterCollection: 'characterCollection',
      currentBattle: 'currentBattle'
    };
    // 소비로 세지 않고 골드를 바꾼다 (세이브 복원, 턴 되돌리기, 디버그, 회귀 직전 몰수)
    function setGoldRaw(v) { if (state && state.run) state.run.gold = v; }
    window.setGoldRaw = setGoldRaw;
    function bindRunAccessors(s) {
      Object.entries(RUN_FIELD_ALIASES).forEach(([key, runKey]) => {
        Object.defineProperty(s, key, {
          get() { return s.run ? s.run[runKey] : undefined; },
          set(v) {
            if (!s.run) return;
            // 골드가 줄어든 만큼은 "소비"로 센다 (연준의 수요 지표). 서버 경제에서는 이 변화가 서버로 보내는 거래가 된다.
            // 저장 복원·되돌리기·디버그 등은 setGoldRaw(또는 Wallet)로 우회한다. 골드를 늘릴 때는 Wallet.earn(종류)을 쓴다.
            if (key === 'gold' && window.Wallet && Number.isFinite(v - s.run.gold) && v !== s.run.gold) window.Wallet.onGoldChange(s.run.gold, v);
            s.run[runKey] = v;
          },
          configurable: true,
          enumerable: false
        });
      });
      return s;
    }

    // 새 run 객체로 교체할 때 파티/골드가 없는 런(구버전 세이브 등)이면 이전 런의 값을 이어받는다.
    function adoptRun(nextRun) {
      const prev = state && state.run;
      if (prev && nextRun !== prev) {
        if (!Array.isArray(nextRun.party)) nextRun.party = Array.isArray(prev.party) ? prev.party : createStartingParty();
        if (!Array.isArray(nextRun.reserve)) nextRun.reserve = Array.isArray(prev.reserve) ? prev.reserve : [];
        if (typeof nextRun.gold !== 'number') nextRun.gold = typeof prev.gold === 'number' ? prev.gold : START_GOLD;
        if (!('commandBonus' in nextRun)) nextRun.commandBonus = prev.commandBonus || null;
        if (!nextRun.commander) nextRun.commander = prev.commander || createInitialCommander();
        if (!Array.isArray(nextRun.inventory)) nextRun.inventory = Array.isArray(prev.inventory) ? prev.inventory : [];
        if (!Array.isArray(nextRun.characterCollection)) nextRun.characterCollection = Array.isArray(prev.characterCollection) ? prev.characterCollection : [];
        if (typeof nextRun.resonance !== 'number') nextRun.resonance = Number(prev.resonance) || 0;
        if (!nextRun.nodeAttempts) nextRun.nodeAttempts = {};
      }
      // 작전지도 이전 세이브의 런: 구역 상태를 새로 만들고, 진행 중이던 노드 그래프는 시작 구역의 작전으로 이어 간다.
      // 전투는 restoreSavedBattle()이 따로 채운다.
      if (!nextRun.campaign) {
        nextRun.campaign = createCampaignState();
        if (nextRun.status === 'active') nextRun.campaign.currentRegionId = CAMPAIGN_MAP.startRegionId;
      }
      if (!('adjutant' in nextRun)) nextRun.adjutant = null;
      if (!('currentBattle' in nextRun)) nextRun.currentBattle = null;
      // 장착 슬롯 이전 세이브: 갖고 있던 지휘관 유물을 앞에서부터 슬롯 수만큼 장착해 둔다 (예전엔 전부 적용됐다).
      if (!Array.isArray(nextRun.equippedRelics)) {
        nextRun.equippedRelics = (Array.isArray(nextRun.relics) ? nextRun.relics : [])
          .filter(r => r && r.kind === 'commander' && r.instanceId)
          .slice(0, COMMANDER_RELIC_SLOTS)
          .map(r => r.instanceId);
      }
      state.run = nextRun;
      return nextRun;
    }

    // 기본 지휘관 & 유닛 상태 생성
    function createInitialState(customGuestId) {
      const guestId = customGuestId || generateGuestId();
      return bindRunAccessors({
        guest: {
          id: guestId,
          createdAt: new Date().toISOString(),
          lastSavedAt: new Date().toISOString()
        },
        currentView: 'CAMPAIGN', // 'CAMPAIGN' (작전지도) | 'STRATEGY' (구역 노드맵/전략 메인) | 'SECTOR_MAP' (8x14 전술 필드)
        currentSector: 'A-1',
        selectedSectorId: 'A-1',
        editingSectorId: 'A-1',
        // 전술 전투(currentBattle)는 state.run.currentBattle에 있다 — bindRunAccessors 참고.
        // 11~13단계: 로그라이크 런(노드 그래프 + 진행도). 전술 타일/적 데이터는 절대 여기에 넣지 않는다.
        // 2차: player(영구, 회귀해도 유지) / run(회귀 시 초기화) 분리.
        player: createInitialPlayer(),
        run: createInitialRun(null, null),
        encounterSeq: 0,      // Encounter id(enc-00001) 순번. 세이브의 roguelikeRun.encounterSeq로 영속화된다.
        selectedNodeId: null, // 전략맵에서 고른 노드 (UI 상태, 저장하지 않음)
        isCombatActive: false,
        isCombatPaused: false,
        strategy: {
          selectedSectorId: 'A-1',
          deploySelectedIds: null, // 출전 편성으로 선택된 영웅 id 목록 (null = 최초 진입 시 자동 초기화)
          deployKnownIds: [],
          armyDeck: {
            KNIGHT: 30,
            MAGE: 15,
            ARCHER: 25,
            MELEE: 20,
            FIREARM: 10
          },
          activeSkills: {
            RapidAdvance: true,
            BearDown: true,
            ShieldWall: true,
            StrategicDominance: false,
            Precision: false
          }
        },
        turn: 1,
        rewinders: 3,
        stackMoveEnabled: true, // 중첩 유닛 함께 이동 기본 활성화
        // 지휘관(commander) · 인벤토리(inventory) · 용병 명부(characterCollection) · 출전 명단(playerUnits) ·
        // 예비(reserveUnits) · 골드(gold)는 state.run에 있다 (회귀 시 초기화) — bindRunAccessors 참고.
        enemyUnits: [
          {
            id: 'e1',
            owner: 'ENEMY',
            name: '야생 고블린',
            classType: 'MELEE',
            avatar: '👺',
            level: 1,
            hp: 50,
            maxHp: 50,
            atk: 25,
            def: 18,
            baseAP: 2,
            ap: 2,
            x: 2,
            y: 1,
            isDead: false
          },
          {
            id: 'e2',
            owner: 'ENEMY',
            name: '야생 회색늑대',
            classType: 'MELEE',
            avatar: '🐺',
            level: 1,
            hp: 45,
            maxHp: 45,
            atk: 32,
            def: 15,
            baseAP: 2,
            ap: 2,
            x: 5,
            y: 1,
            isDead: false
          },
          {
            id: 'e3',
            owner: 'ENEMY',
            name: '암흑 흑마법사',
            classType: 'MAGE',
            avatar: '🔮',
            level: 2,
            hp: 65,
            maxHp: 65,
            atk: 52,
            def: 22,
            baseAP: 2,
            ap: 2,
            x: 6,
            y: 2,
            isDead: false
          },
          {
            id: 'e4',
            owner: 'ENEMY',
            name: '반란군 총병',
            classType: 'FIREARM',
            avatar: '💥',
            level: 2,
            hp: 75,
            maxHp: 75,
            atk: 58,
            def: 25,
            baseAP: 2,
            ap: 2,
            x: 5,
            y: 7,
            isDead: false
          },
          {
            id: 'e5',
            owner: 'ENEMY',
            name: '오크 돌격대장',
            classType: 'MELEE',
            avatar: '👹',
            level: 2,
            hp: 90,
            maxHp: 90,
            atk: 45,
            def: 32,
            baseAP: 2,
            ap: 2,
            x: 1,
            y: 6,
            isDead: false
          }
        ]
      });

      // LEGACY: 아래는 return 뒤라 실행되지 않는 코드다 (원래부터 도달 불가).
      // 초기 상태 유닛 체력 100-Point 정규화 자동 실행
      normalizeAllUnitsHP(initialState);
      return initialState;
    }

    // 전역 상태 변수
    // 전술 타일의 유일한 기준은 state.currentBattle.map.tiles (getBattleTiles() 참고).
    // LEGACY: 전역 tiles / state.tiles / 기본 8x10 맵은 7~8단계에서 제거되었다.
    let state = createInitialState();
    normalizeAllUnitsHP(state);
    let historyStack = []; // 리와인더용 실행 취소 스택
    let selectedUnitId = 'u1';
    const SQUAD_PANEL_PEEK_MS = 1000; // 중첩 부대 사이드 패널 자동 닫힘 시간
    const squadPanel = { open: false, pinned: false, timer: null };
    let currentInteractionMode = null; // 'MOVE' | 'ATTACK' | null
    let isEnemyTurnProcessing = false; // 적 AI 턴 진행 상태 플래그

    // 전술 전장 전투 및 승리 상태 관리
    let victoryProcessed = false;
    let defeatedEnemyCount = 0;

    window.victoryProcessed = victoryProcessed;
    window.defeatedEnemyCount = defeatedEnemyCount;

    // 스킬 엔진(skillEngine.js)에 전투 상태 접근 경로를 연결한다.
    let skillTargeting = null; // { unitId, skillId } — 스킬 대상 선택 중일 때만 설정
    if (window.SkillEngine) {
      SkillEngine.configure({
        getState: () => state,
        getTile: (x, y) => getTile(x, y),
        // 유물 스킬 재사용 대기(skillCooldown): 시전자에게 걸린 유물 수치만큼 쿨다운이 늘고 준다
        getCooldownModifier: (unit) => Math.round(getRelicStatFor(unit, 'skillCooldown')),
        log: (msg, type) => addLog(msg, type),
        onUnitKilled: (unit) => {
          if (unit.owner === 'ENEMY') {
            window.defeatedEnemyCount = (window.defeatedEnemyCount || 0) + 1;
            defeatedEnemyCount = window.defeatedEnemyCount;
          } else {
            awardCommanderCasualtyExp(unit);
          }
        }
      });
    }

    // ========================================================================
    // 단일 진실 공급원(Single Source of Truth): state.isCombatActive
    // 4곳(window.isCombatActive, window.battleActive, window.playerState.isCombatActive,
    // window.gameState.isCombatActive)은 중복 저장하지 않고 getter/setter로 state.isCombatActive를 참조
    // ========================================================================
    function defineCombatActiveGetters() {
      const combatDescriptor = {
        get() {
          return (typeof state !== 'undefined' && state) ? !!state.isCombatActive : false;
        },
        set(val) {
          if (typeof state !== 'undefined' && state) {
            state.isCombatActive = !!val;
          }
        },
        configurable: true,
        enumerable: true
      };

      Object.defineProperty(window, 'isCombatActive', combatDescriptor);
      Object.defineProperty(window, 'battleActive', combatDescriptor);

      if (!window.playerState) {
        window.playerState = {};
      }
      Object.defineProperty(window.playerState, 'isCombatActive', combatDescriptor);

      if (!window.gameState) {
        window.gameState = {};
      }
      Object.defineProperty(window.gameState, 'isCombatActive', combatDescriptor);
    }
    defineCombatActiveGetters();

    // Global playerState object for universal access across map classes & external modules
    if (!window.playerState) {
      window.playerState = {};
    }
    if (!('gold' in window.playerState)) {
      Object.defineProperty(window.playerState, 'gold', {
        get() {
          return (typeof state !== 'undefined' && state && typeof state.gold === 'number') ? state.gold : 0;
        },
        set(val) {
          if (typeof state !== 'undefined' && state) {
            state.gold = val;
          }
        },
        configurable: true,
        enumerable: true
      });
    }
    if (!('rewinders' in window.playerState)) {
      Object.defineProperty(window.playerState, 'rewinders', {
        get() {
          return (typeof state !== 'undefined' && state && typeof state.rewinders === 'number') ? state.rewinders : 0;
        },
        set(val) {
          if (typeof state !== 'undefined' && state) {
            state.rewinders = val;
          }
        },
        configurable: true,
        enumerable: true
      });
    }

    // 실시간 디버그 & 개발자 파라미터 상태 (Live Binding)
    const debugParams = {
      // 1. 병과별 실시간 기본 스탯 (ATK, DEF, baseAP, affection, hp - 100-Point Scale)
      unitClassStats: {
        KNIGHT: { atk: 48, def: 38, baseAP: 3, affection: 85, hp: 100 },
        MELEE: { atk: 35, def: 30, baseAP: 2, affection: 40, hp: 100 },
        ARCHER: { atk: 42, def: 20, baseAP: 2, affection: 28, hp: 100 },
        MAGE: { atk: 52, def: 22, baseAP: 2, affection: 60, hp: 100 },
        FIREARM: { atk: 58, def: 25, baseAP: 2, affection: 45, hp: 100 }
      },
      // 2. 밸런스 & 전투 공식 가중치
      tileDefBonusMultiplier: 1.0, // 0.0 ~ 3.0 (0% ~ 300%)
      collateralDamageMultiplier: 0.30, // 2차 피해 비율 (0% ~ 100%)
      winChanceAttackerWeight: 1.0, // 공격 가중치 0.2 ~ 3.0
      winChanceDefenderWeight: 1.0, // 방어 가중치 0.2 ~ 3.0
      // 3. 강제 승패 치트
      forcedBattleResult: 'NONE', // 'NONE' | 'FORCE_WIN' | 'FORCE_LOSE'
      // 4. 선택 타일 좌표 (치트 소환용)
      targetSpawnCoord: { x: 2, y: 2 }
    };
    let currentDebugClass = 'KNIGHT';

    /* --------------------------------------------------------------------------
       Guest Mode & Supabase Cloud Persistence System
       Zero LocalStorage: All state saved and loaded directly via Supabase
       -------------------------------------------------------------------------- */
    const STORAGE_KEY = 'slg_guest_save';

    // 클라우드 세이브를 불러오는 중에는 저장하지 않는다 (불러오기 전 초기 상태로 덮어쓰기 방지).
    let cloudLoadPending = false;

    // 게임 상태를 Supabase에 안전하게 영구 저장 (Zero LocalStorage)
    function saveGameState(silent = false) {
      try {
        if (!state) return;
        if (cloudLoadPending) return;
        if (!state.guest) {
          state.guest = {
            id: generateGuestId(),
            createdAt: new Date().toISOString(),
            lastSavedAt: new Date().toISOString()
          };
        }
        state.guest.lastSavedAt = new Date().toISOString();

        // 1. 유닛 이미지 중복 저장 방지:
        // 병과 공통 이미지는 Supabase game_configs/unit_images에 영구 저장되므로 페이로드 경량화
        const sanitizedPlayerUnits = state.playerUnits.map(u => {
          const isClassImg = u.imageUrl && customClassImages[u.classType] && u.imageUrl === customClassImages[u.classType];
          return {
            ...u,
            imageUrl: isClassImg ? '' : u.imageUrl
          };
        });

        // v3 저장 구조 (2차: 사망회귀).
        //   player        — 영구 데이터. 회귀해도 유지 (loopCount, memories, unlockedCharacters, 지휘관 등)
        //   run           — 이번 런. 회귀 시 초기화 (노드 그래프 + party/reserve/gold/commandBonus + campaign)
        //   run.currentBattle — 전투 중일 때만 (map + 실시간 전투 상태 live). 전투가 없으면 null.
        //                   (이전 v3 세이브는 최상위 currentBattle에 있었다 — normalizeSavePayload가 둘 다 읽는다.)
        if (state.run) state.run.encounterSeq = state.encounterSeq;
        syncUnlockedCharacters();
        const battleToSave = state.currentBattle ? {
          ...state.currentBattle,
          live: {
            enemyUnits: state.enemyUnits,
            deployedUnitIds: Array.isArray(state.currentDeployedUnitIds) ? state.currentDeployedUnitIds : [],
            defeatedEnemyCount: window.defeatedEnemyCount || 0
          }
        } : null;
        const payload = {
          version: '3.0.0',
          savedAt: state.guest.lastSavedAt,
          guest: state.guest,
          currentView: state.currentView || 'STRATEGY',
          player: {
            loopCount: Number(state.player?.loopCount) || 0,
            memories: state.player?.memories || { visitedNodesBySeed: {} },
            unlockedCharacters: Array.isArray(state.player?.unlockedCharacters) ? state.player.unlockedCharacters : [],
            settings: state.player?.settings || { muted: false },
            rewinders: state.rewinders, // 유료 아이템: 회귀해도 유지
            progression: {
              turn: state.turn,
              stackMoveEnabled: state.stackMoveEnabled,
              strategy: state.strategy || {
                selectedSectorId: 'A-1',
                armyDeck: { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
                activeSkills: { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
              },
              selectedUnitId: selectedUnitId
            }
          },
          run: state.run ? {
            ...state.run,
            party: sanitizedPlayerUnits,
            reserve: Array.isArray(state.reserveUnits) ? state.reserveUnits : [],
            gold: state.gold,
            commander: state.commander,
            inventory: Array.isArray(state.inventory) ? state.inventory : [],
            characterCollection: Array.isArray(state.characterCollection) ? state.characterCollection : [],
            currentBattle: battleToSave
          } : null
        };

        // Supabase 동기화 처리 (Cloud Database 영구 저장)
        if (typeof window.saveGameStateToCloud === 'function') {
          window.saveGameStateToCloud(payload);
          updateGuestSaveIndicator(true);
        } else if (window.SupabaseBridge && typeof window.SupabaseBridge.saveGameStateToCloud === 'function') {
          window.SupabaseBridge.saveGameStateToCloud(payload);
          updateGuestSaveIndicator(true);
        }

        if (!silent) {
          addLog(`💾 [클라우드 저장] 게임 상태가 Supabase에 안전하게 저장되었습니다. (Turn ${state.turn})`, 'system');
        }
      } catch (err) {
        console.warn('Failed to save to cloud storage:', err);
      }
    }

    // Supabase에서 저장된 게임 상태 불러오기 (Zero LocalStorage)
    // 13단계: 세이브 포맷 어댑터. v2(player / roguelikeRun / currentBattle)와 v1(평평한 구조)을 같은 모양으로 맞춘다.
    // v1 세이브에는 런이 없으므로 새 런이 만들어지고, 전투 중 상태는 원래 저장되지 않았으므로 전략맵에서 이어진다.
    function normalizeSavePayload(raw) {
      if (!raw || typeof raw !== 'object') return null;
      if (raw.player && typeof raw.player === 'object' && raw.run && typeof raw.run === 'object') {
        // v3: 캐릭터/골드는 run에 있다.
        const p = raw.player;
        const r = raw.run;
        const prog = p.progression || {};
        const savedBattle = r.currentBattle || raw.currentBattle || null;
        return {
          version: raw.version,
          savedAt: raw.savedAt,
          guest: raw.guest,
          currentView: raw.currentView,
          strategy: prog.strategy,
          turn: prog.turn,
          gold: r.gold,
          rewinders: p.rewinders,
          stackMoveEnabled: prog.stackMoveEnabled,
          commander: r.commander || prog.commander,
          playerUnits: r.party,
          characterCollection: r.characterCollection || p.characterCollection,
          reserveUnits: r.reserve,
          inventory: r.inventory || p.inventory,
          selectedUnitId: prog.selectedUnitId,
          playerMeta: { loopCount: p.loopCount, memories: p.memories, unlockedCharacters: p.unlockedCharacters, settings: p.settings },
          roguelikeRun: r,
          currentBattle: savedBattle,
          enemyUnits: (savedBattle && savedBattle.live && Array.isArray(savedBattle.live.enemyUnits)) ? savedBattle.live.enemyUnits : []
        };
      }
      if (raw.player && typeof raw.player === 'object') {
        // v2: player 아래에 characters/gold/roguelikeRun이 있었다. 읽어서 run으로 옮긴다.
        const p = raw.player;
        const prog = p.progression || {};
        return {
          version: raw.version,
          savedAt: raw.savedAt,
          guest: raw.guest,
          currentView: raw.currentView,
          strategy: prog.strategy,
          turn: prog.turn,
          gold: p.gold,
          rewinders: p.rewinders,
          stackMoveEnabled: prog.stackMoveEnabled,
          commander: prog.commander,
          playerUnits: p.characters,
          characterCollection: p.characterCollection,
          reserveUnits: p.reserveUnits,
          inventory: p.inventory,
          selectedUnitId: prog.selectedUnitId,
          roguelikeRun: p.roguelikeRun || null,
          currentBattle: raw.currentBattle || null,
          enemyUnits: (raw.currentBattle && raw.currentBattle.live && Array.isArray(raw.currentBattle.live.enemyUnits)) ? raw.currentBattle.live.enemyUnits : []
        };
      }
      return { ...raw, roguelikeRun: null, currentBattle: null, enemyUnits: [] };
    }

    // 저장된 런을 복원한다. 손상됐거나 없으면 새 런을 만든다 (캐릭터/골드는 loadGameState가 이어서 채운다).
    function restoreSavedRun(savedRun) {
      const check = savedRun ? RunEngine.validateRun(savedRun) : { valid: false, errors: [] };
      if (check.valid) {
        adoptRun(savedRun);
        state.encounterSeq = Number(savedRun.encounterSeq) || savedRun.encounters.length;
      } else {
        if (savedRun) console.warn('[Save] 저장된 런이 손상되어 새 런으로 대체합니다:', check.errors);
        const fresh = createInitialRun(null, savedRun && savedRun.loopReward ? savedRun.loopReward : null);
        state.run = fresh;
        state.encounterSeq = 0;
      }
      state.selectedNodeId = null;
      ensureNodeSelection();
    }

    // 전투 중 저장된 currentBattle을 복원한다. 돌려주는 값: 'active' | 'won' | null(복원할 전투 없음)
    function restoreSavedBattle(saved) {
      state.currentBattle = null;
      if (!saved || !saved.map || !Array.isArray(saved.map.tiles) || saved.map.tiles.length === 0) return null;
      const node = RunEngine.getNode(state.run, saved.nodeId);
      const stillValid = node && (saved.status === 'won' || RunEngine.isNodeAvailable(state.run, node.id));
      if (!stillValid) {
        console.warn('[Save] 저장된 전투의 노드가 현재 런과 맞지 않아 버립니다:', saved.nodeId);
        return null;
      }
      const { live, ...battle } = saved;
      state.currentBattle = battle;
      state.currentDeployedUnitIds = (live && Array.isArray(live.deployedUnitIds)) ? live.deployedUnitIds : [];
      state.selectedNodeId = node.id;
      state.selectedSectorId = battle.sectorId;
      state.currentSector = battle.sectorId;
      if (state.strategy) state.strategy.selectedSectorId = battle.sectorId;
      state.currentView = 'SECTOR_MAP';
      historyStack = [];
      if (battle.status === 'won') {
        state.isCombatActive = false;
        victoryProcessed = true;
        window.victoryProcessed = true;
        return 'won';
      }
      resetTacticalBattleState();
      defeatedEnemyCount = Number(live && live.defeatedEnemyCount) || 0;
      window.defeatedEnemyCount = defeatedEnemyCount;
      return 'active';
    }

    function loadGameState(cloudPayload = null) {
      try {
        const parsed = normalizeSavePayload(cloudPayload);
        if (!parsed || !parsed.playerUnits || !Array.isArray(parsed.playerUnits)) return false;

        if (parsed.guest && parsed.guest.id) {
          state.guest = parsed.guest;
        } else {
          state.guest = {
            id: generateGuestId(),
            createdAt: new Date().toISOString(),
            lastSavedAt: new Date().toISOString()
          };
        }

        // 전술 화면으로 복원할지는 아래 restoreSavedBattle()가 저장된 currentBattle이 있을 때만 결정한다.
        // (맵 없이 전술 화면이 복원되어 빈 화면이 되는 일이 없도록 기본은 전략맵)
        state.currentView = 'STRATEGY';
        state.currentSector = parsed.currentSector || 'A-1';
        restoreSavedRun(parsed.roguelikeRun);
        if (parsed.strategy) {
          state.strategy = {
            selectedSectorId: parsed.strategy.selectedSectorId || 'A-1',
            deploySelectedIds: Array.isArray(parsed.strategy.deploySelectedIds) ? parsed.strategy.deploySelectedIds : null,
            deployKnownIds: Array.isArray(parsed.strategy.deployKnownIds) ? parsed.strategy.deployKnownIds : [],
            armyDeck: parsed.strategy.armyDeck || { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
            activeSkills: parsed.strategy.activeSkills || { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
          };
        }

        // 영구 플레이어 데이터 (v2 이하 세이브에는 없으므로 기본값)
        const meta = parsed.playerMeta || {};
        const basePlayer = createInitialPlayer();
        state.player = {
          loopCount: Number(meta.loopCount) || 0,
          memories: (meta.memories && typeof meta.memories === 'object')
            ? { visitedNodesBySeed: { ...(meta.memories.visitedNodesBySeed || {}) }, deathBattle: meta.memories.deathBattle || null }
            : basePlayer.memories,
          unlockedCharacters: Array.isArray(meta.unlockedCharacters) ? meta.unlockedCharacters.map(String) : [],
          settings: { ...basePlayer.settings, ...(meta.settings || {}) }
        };

        state.turn = (typeof parsed.turn === 'number') ? parsed.turn : 1;
        setGoldRaw((typeof parsed.gold === 'number') ? parsed.gold : START_GOLD);
        state.rewinders = (typeof parsed.rewinders === 'number') ? parsed.rewinders : 3;
        state.stackMoveEnabled = (parsed.stackMoveEnabled !== undefined) ? parsed.stackMoveEnabled : true;

        if (parsed.commander) {
          state.commander = parsed.commander;
        }
        state.inventory = Array.isArray(parsed.inventory) ? parsed.inventory : (Array.isArray(state.inventory) ? state.inventory : []);
        if (Array.isArray(parsed.characterCollection)) {
          state.characterCollection = parsed.characterCollection;
        } else {
          state.characterCollection = Array.isArray(state.characterCollection) ? state.characterCollection : [];
        }
        state.reserveUnits = Array.isArray(parsed.reserveUnits) ? parsed.reserveUnits : [];

        if (Array.isArray(parsed.playerUnits)) {
          state.playerUnits = parsed.playerUnits;
          state.playerUnits.forEach(u => {
            if (!u.owner) u.owner = 'PLAYER';
            if (!u.unitClass) u.unitClass = u.classType || 'KNIGHT';
            if (!u.stats) {
              u.stats = { hp: u.hp, maxHp: u.maxHp, atk: u.atk, def: u.def, mobility: u.baseAP || 2 };
            }
            if (typeof u.favorability !== 'number') u.favorability = u.affection || 50;
            if (typeof u.affection !== 'number') u.affection = u.favorability || 50;
            // 스킬트리가 있는 캐릭터는 트리가 스킬을 결정하므로 구버전 기본 고유 스킬을 넣지 않는다.
            if (!u.customSkill && !(Array.isArray(u.skillTree) && u.skillTree.length) && DEFAULT_CLASS_SKILLS[u.unitClass]) {
              u.customSkill = JSON.parse(JSON.stringify(DEFAULT_CLASS_SKILLS[u.unitClass]));
            }
            if (typeof u.customSkillCooldown !== 'number') u.customSkillCooldown = 0;
            if (typeof u.imageUrl !== 'string') u.imageUrl = '';
            // 병과 이미지는 렌더 시 폴백으로만 쓴다 — 예전에 박아 넣은 병과 이미지는 걷어낸다
            if (isClassImageUrl(u.imageUrl)) u.imageUrl = '';
          });
        }
        if (Array.isArray(parsed.enemyUnits)) {
          state.enemyUnits = parsed.enemyUnits;
          state.enemyUnits.forEach(e => {
            if (!e.owner) e.owner = 'ENEMY';
            if (typeof e.baseAP !== 'number') {
              const preset = debugParams.unitClassStats[e.classType];
              e.baseAP = preset ? preset.baseAP : 2;
            }
            if (typeof e.ap !== 'number') e.ap = e.baseAP;
            if (typeof e.maxHp !== 'number') e.maxHp = e.hp || 100;
          });
        }

        // 불러온 모든 활성 유닛 체력 100-Point 정규화 자동 실행
        normalizeAllUnitsHP(state);

        // 구버전 기본 3인(u1~u3)·포섭 유닛("포섭된 X") 정리 — 캐릭터 DB가 아직 없으면 연결은 동기화 때 마저 한다
        migrateStarterUnits();
        migrateCapturedUnits();
        // 보스 유물 3택1을 고르다 나갔으면 다시 띄운다
        if (state.run && state.run.pendingRelicChoice) setTimeout(() => openRelicChoiceModal(), 0);

        if (parsed.selectedUnitId && state.playerUnits.some(u => u.id === parsed.selectedUnitId && !u.isDead)) {
          selectedUnitId = parsed.selectedUnitId;
        } else {
          const firstLiving = state.playerUnits.find(u => !u.isDead);
          selectedUnitId = firstLiving ? firstLiving.id : 'u1';
        }

        // 전투 중이던 세이브라면 전투를 복원한다 (유닛/적 상태는 위에서 이미 복원됨).
        const restoredBattle = restoreSavedBattle(parsed.currentBattle);
        if (!restoredBattle) {
          state.enemyUnits = [];
          state.currentView = getIdleView();
        }

        updateGuestSaveIndicator(false);
        renderAll();

        if (restoredBattle === 'active') {
          // 실시간 전투를 곧바로 재개하지 않고 일시정지 상태로 연다 (계속하기/후퇴 선택).
          addLog(`⚔️ [전투 복원] ${state.currentBattle.nodeId} (seed ${state.currentBattle.seed}) 전투가 저장된 상태로 복원되었습니다. 일시정지 상태입니다.`, 'system');
          openTacticalPauseMenu();
        } else if (restoredBattle === 'won') {
          addLog(`🏆 [전투 복원] ${state.currentBattle.nodeId} 전투는 이미 승리한 상태입니다. 보상을 수령하고 전략맵으로 돌아가세요.`, 'system');
          const rd = state.currentBattle.result || { gold: 0, rewinderGranted: false, defeatedCount: 0 };
          if (window.UI && typeof window.UI.showVictoryModal === 'function') window.UI.showVictoryModal(rd);
        } else {
          resumePendingRunFlow();
        }
        return true;
      } catch (err) {
        console.warn('Failed to load from Supabase:', err);
        return false;
      }
    }

    // 게스트 데이터 영구 초기화 및 새 게임 시작
    function resetGuestData() {
      historyStack = [];
      const newGuestId = generateGuestId();
      state = createInitialState(newGuestId);
      normalizeAllUnitsHP(state);
      selectedUnitId = 'u1';
      userCardViewPreference = 'AUTO';
      cardInspectedEnemyId = null;
      debugInspectedEnemyId = null;
      saveGameState(true);
      closeAllModals();
      renderAll();
      syncDebugInputsFromState();
      updateDebugInspector();
      addLog(`🔄 [데이터 초기화] 게스트 데이터가 초기화되었습니다. 새로운 게스트(${state.guest.id})로 1턴부터 시작합니다!`, 'gold');
    }

    // 상단 자동저장 상태 알림 배지 애니메이션 갱신
    function updateGuestSaveIndicator(justSaved = false) {
      const statusEl = document.getElementById('ui-guest-save-status');
      if (!statusEl) return;
      if (justSaved) {
        statusEl.textContent = '💾 저장 완료!';
        statusEl.classList.add('saving');
        setTimeout(() => {
          if (statusEl) {
            statusEl.textContent = '💾 자동저장 ON';
            statusEl.classList.remove('saving');
          }
        }, 1500);
      } else {
        statusEl.textContent = '💾 자동저장 ON';
      }
    }

    // 게스트 정보 모달 오픈
    function openGuestProfileModal() {
      closeAllModals();
      updateGuestModalInfo();
      const modal = document.getElementById('modal-guest-profile');
      if (modal) modal.classList.add('open');
    }

    // 게스트 정보 모달 데이터 실시간 바인딩
    function updateGuestModalInfo() {
      if (!state || !state.guest) return;
      const idEl = document.getElementById('modal-guest-id-val');
      const progEl = document.getElementById('modal-guest-progress-val');
      const createdEl = document.getElementById('modal-guest-created-val');
      const savedEl = document.getElementById('modal-guest-saved-val');

      if (idEl) idEl.textContent = state.guest.id;
      if (progEl) {
        const livingUnits = state.playerUnits.filter(u => !u.isDead).length;
        progEl.textContent = `Turn ${state.turn} / ${state.gold}G (생존 부대 ${livingUnits}기)`;
      }
      if (createdEl) {
        try {
          const d = new Date(state.guest.createdAt);
          createdEl.textContent = d.toLocaleString('ko-KR');
        } catch (e) {
          createdEl.textContent = state.guest.createdAt || '-';
        }
      }
      if (savedEl) {
        try {
          if (state.guest.lastSavedAt) {
            const d = new Date(state.guest.lastSavedAt);
            savedEl.textContent = d.toLocaleTimeString('ko-KR');
          } else {
            savedEl.textContent = '방금 전';
          }
        } catch (e) {
          savedEl.textContent = '방금 전';
        }
      }
    }

    // 초기화 확인 모달 오픈
    function openGuestResetModal() {
      closeAllModals();
      const modal = document.getElementById('modal-guest-reset-confirm');
      if (modal) modal.classList.add('open');
    }

    /* --------------------------------------------------------------------------
       Snapshot & Undo (리와인더) Engine
       -------------------------------------------------------------------------- */
    // 리와인더는 '턴 단위'로 되돌린다. 행동 직전마다 호출되지만, 스냅샷은 턴마다 첫 행동 직전
    // (= 그 턴 시작 상태)에 한 번만 저장한다. 같은 턴의 이후 행동은 체크포인트를 덮어쓰지 않는다.
    function saveHistorySnapshot() {
      const top = historyStack.length ? JSON.parse(historyStack[historyStack.length - 1]) : null;
      if (top && top.turn === state.turn) {
        saveGameState(true);
        return;
      }
      // 딥 카피 스냅샷 저장
      const snapshot = JSON.stringify({
        turn: state.turn,
        gold: state.gold,
        rewinders: state.rewinders,
        stackMoveEnabled: state.stackMoveEnabled,
        commander: state.commander,
        playerUnits: state.playerUnits,
        enemyUnits: state.enemyUnits
      });
      historyStack.push(snapshot);
      if (historyStack.length > 8) historyStack.shift();
      saveGameState(true);
    }

    function executeRewind() {
      if (isEnemyTurnProcessing) {
        addLog('⚠️ 적 AI 작전 수행 중에는 리와인드를 실행할 수 없습니다.', 'warning');
        return;
      }
      if (state.rewinders <= 0) {
        addLog('⚠️ [리와인더 고갈] 사용 가능한 리와인더가 없습니다! 마을 상점에서 충전하세요.', 'warning');
        return;
      }
      if (historyStack.length === 0) {
        addLog('⚠️ [리와인더] 되돌릴 이전 턴 기록이 없습니다.', 'warning');
        return;
      }

      // 이번 턴에 행동했다면 이번 턴 시작으로, 아직 아무것도 안 했다면 직전 턴 시작으로 돌아간다.
      const prevJson = historyStack.pop();
      const prev = JSON.parse(prevJson);
      const rewoundToThisTurn = prev.turn === state.turn;
      const currentRewinders = state.rewinders - 1;

      state.turn = prev.turn;
      Wallet.rewindTo(prev.gold); // 서버 경제에서는 쓴 만큼만 돌려받는다
      state.rewinders = currentRewinders;
      state.stackMoveEnabled = prev.stackMoveEnabled !== undefined ? prev.stackMoveEnabled : true;
      state.commander = prev.commander;
      state.playerUnits = prev.playerUnits;
      state.enemyUnits = prev.enemyUnits;
      cancelSkillTargeting(true);

      const where = rewoundToThisTurn ? `제 ${prev.turn}턴 시작 시점` : `직전 턴(제 ${prev.turn}턴) 시작 시점`;
      addLog(`⏳ [리와인더 가동!] 시공간 왜곡으로 ${where}으로 복원 완료! (잔여 리와인더: ${currentRewinders}개)`, 'capture');
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Logging & Console Output
       -------------------------------------------------------------------------- */
    const LOG_HISTORY_MAX = 500;
    const logHistory = []; // 지난 전투 로그 (회귀 카운터 버튼으로 열람)
    function addLog(msg, type = 'system') {
      logHistory.push({ msg: String(msg), type });
      if (logHistory.length > LOG_HISTORY_MAX) logHistory.shift();
      const wrap = document.getElementById('console-wrap');
      const div = document.createElement('div');
      div.className = `log-line log-${type}`;
      div.textContent = msg;
      wrap.appendChild(div);
      wrap.scrollTop = wrap.scrollHeight;
    }

    /* --------------------------------------------------------------------------
       Tile & Grid Logic
       -------------------------------------------------------------------------- */
    // 전술 타일 배열의 단일 접근점. 전투가 없으면 빈 배열(기본맵으로 대체하지 않는다).
    // 전략 화면 등 전투 밖에서도 안전하게 호출되므로 여기서는 절대 throw하지 않는다.
    function getBattleTiles() {
      const t = state && state.currentBattle && state.currentBattle.map && state.currentBattle.map.tiles;
      return Array.isArray(t) ? t : [];
    }
    window.getBattleTiles = getBattleTiles;

    // 7단계: 전술 화면(SECTOR_MAP)에서만 쓰는 엄격한 버전. state.currentBattle.map이 없다는 건
    // enterEncounter()를 거치지 않고 전술 화면에 들어왔다는 뜻이므로 버그로 보고 즉시 알려야 한다.
    // 콘솔/디버깅에서 "지금 활성 전투 맵이 실제로 있는가"를 확인할 때도 이 함수를 쓴다.
    function getActiveBattleMap() {
      const map = state && state.currentBattle && state.currentBattle.map;
      if (!map) {
        throw new Error('[TacticalEngineError] 활성화된 전투/맵 데이터가 없습니다. enterEncounter()를 거치지 않고 전술 화면에 진입했을 수 있습니다.');
      }
      return map;
    }
    window.getActiveBattleMap = getActiveBattleMap;

    // 전술 맵 크기의 단일 접근점 (하드코딩된 8x10 대신). 전투가 없으면 0x0.
    function getBattleSize() {
      const map = state && state.currentBattle && state.currentBattle.map;
      return { width: Number(map && map.width) || 0, height: Number(map && map.height) || 0 };
    }
    function isInsideBattleMap(x, y) {
      const { width, height } = getBattleSize();
      return x >= 0 && x < width && y >= 0 && y < height;
    }

    function getTile(x, y) {
      return getBattleTiles().find(t => t.x === x && t.y === y);
    }

    function getUnitsAt(x, y) {
      const players = state.playerUnits.filter(u => !u.isDead && u.x === x && u.y === y);
      const enemies = state.enemyUnits.filter(u => !u.isDead && u.x === x && u.y === y);
      return { players, enemies, total: players.length + enemies.length };
    }

    function getUnitAt(x, y) {
      // 1. 현재 선택된 아군 유닛이 (x, y)에 있으면 우선 반환
      const sel = state.playerUnits.find(u => !u.isDead && u.x === x && u.y === y && u.id === selectedUnitId);
      if (sel) return { unit: sel, isPlayer: true };

      // 2. 다른 생존 아군 유닛 반환
      const p = state.playerUnits.find(u => !u.isDead && u.x === x && u.y === y);
      if (p) return { unit: p, isPlayer: true };

      // 3. 디버그 인스펙터가 주시 중인 적군 반환
      if (debugInspectedEnemyId) {
        const inspected = state.enemyUnits.find(u => !u.isDead && u.x === x && u.y === y && u.id === debugInspectedEnemyId);
        if (inspected) return { unit: inspected, isPlayer: false };
      }

      // 4. 타일에 적군이 여러 기 중첩된 경우 방어력이 가장 높은 수비 유닛 반환
      const enemies = state.enemyUnits.filter(u => !u.isDead && u.x === x && u.y === y);
      if (enemies.length > 0) {
        const bestDef = enemies.slice().sort((a, b) => b.def - a.def)[0];
        return { unit: bestDef, isPlayer: false };
      }
      return null;
    }

    function getSelectedUnit() {
      return state.playerUnits.find(u => u.id === selectedUnitId && !u.isDead) || state.playerUnits.find(u => !u.isDead);
    }

    // 맵 클릭/범위 표시용: 첫 유닛으로 대체하지 않고, 실제로 선택한 유닛만 돌려준다 (없으면 null).
    function getExplicitSelectedUnit() {
      return selectedUnitId ? state.playerUnits.find(u => u.id === selectedUnitId && !u.isDead) || null : null;
    }

    let userCardViewPreference = 'AUTO'; // 'AUTO' | 'FORCE_NORMAL'
    let cardInspectedEnemyId = null;

    /* --------------------------------------------------------------------------
       Combat Odds & Range Query Helper Functions
       -------------------------------------------------------------------------- */
    function getEnemiesInRange(unit) {
      if (!unit || unit.isDead || unit.isInactivated || unit.ap <= 0) return [];
      const range = getUnitAttackRange(unit); // 신속한 진격 + 유물 사거리
      const inRange = [];
      state.enemyUnits.forEach(e => {
        if (!e.isDead) {
          const dist = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
          if (dist > 0 && dist <= range) {
            inRange.push(e);
          }
        }
      });
      return inRange;
    }

    /* --------------------------------------------------------------------------
       상황별 캐릭터 대사 (dialogueLines.js) + 일러스트 말풍선 연출
       -------------------------------------------------------------------------- */
    // ------------------------------------------------------------------------
    // 일러스트 로드 실패 대비: 외부 사이트(civitai 등) 이미지는 그쪽 사정으로 언제든 막힐 수 있다.
    // 처음 쓰는 URL은 몰래 한 번 불러 보고, 실패하면 빈칸 대신 병과 이미지 → 이모지 순으로 대체해 다시 그린다.
    // ------------------------------------------------------------------------
    const brokenImageUrls = new Set();
    const probedImageUrls = new Set();
    let brokenImageRerenderTimer = null;
    function probeImageUrl(url) {
      if (!url || url.startsWith('data:') || probedImageUrls.has(url) || typeof Image === 'undefined') return;
      probedImageUrls.add(url);
      const img = new Image();
      img.onerror = () => {
        brokenImageUrls.add(url);
        console.warn('[일러스트] 이미지를 불러오지 못해 대체 이미지로 표시합니다:', url);
        clearTimeout(brokenImageRerenderTimer);
        brokenImageRerenderTimer = setTimeout(() => {
          try { renderAll(); renderCustomCharactersList(); if (document.getElementById('pool-list')) renderCharacterPool(); } catch (e) { /* 화면 갱신 실패는 무시 */ }
        }, 300);
      };
      img.src = url;
    }
    function isImageUrlBroken(url) { return !!url && brokenImageUrls.has(String(url).trim()); }
    window.isImageUrlBroken = isImageUrlBroken;
    /** 후보 중 깨지지 않은 첫 이미지 URL (모두 없거나 깨졌으면 '') */
    function pickLoadableImage(...urls) {
      for (const u of urls) {
        const url = String(u || '').trim();
        if (!url) continue;
        probeImageUrl(url);
        if (!brokenImageUrls.has(url)) return url;
      }
      return '';
    }

    function getUnitIllustration(unit) {
      if (!unit) return '';
      return pickLoadableImage(unit.imageUrl, customClassImages[unit.classType],
        typeof SAMPLE_CLASS_IMAGES !== 'undefined' ? SAMPLE_CLASS_IMAGES[unit.classType] : '');
    }

    /* --------------------------------------------------------------------------
       공통 초상화(얼굴 크롭) — 맵 타일·선택 카드·출전 명부·가챠·캐릭터 목록이 모두 이 함수를 쓴다.
       전신 일러스트를 background로 확대해 얼굴 부분만 보여준다(찌그러짐 없음).
       캐릭터별 보정: char.portraitFocus = { x, y, zoom } (x/y: background-position %, zoom: 가로 배율)
       -------------------------------------------------------------------------- */
    const DEFAULT_PORTRAIT_FOCUS = { x: 50, y: 6, zoom: 2.2 };

    function getPortraitFocus(char) {
      const f = char?.portraitFocus || {};
      const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
      return {
        x: num(f.x, DEFAULT_PORTRAIT_FOCUS.x),
        y: num(f.y, DEFAULT_PORTRAIT_FOCUS.y),
        zoom: Math.max(1, num(f.zoom, DEFAULT_PORTRAIT_FOCUS.zoom))
      };
    }

    /**
     * @param {Object} char - 유닛 또는 캐릭터 레코드 (imageUrl, classType/unitClass, avatar, portraitFocus)
     * @param {Object} [opts]
     * @param {string} [opts.emojiSize] - 이미지가 없을 때 이모지 font-size (예: '20px')
     * @param {string} [opts.className] - 추가 클래스
     */
    function renderPortrait(char, opts = {}) {
      const cls = char?.classType || char?.unitClass;
      const url = pickLoadableImage(char?.imageUrl, customClassImages[cls]);
      const name = escapeGachaHtml(char?.name || '');
      const extra = opts.className ? ` ${opts.className}` : '';
      if (!url) {
        const avatar = char?.avatar || (typeof CLASS_META !== 'undefined' && CLASS_META[cls] ? CLASS_META[cls].avatar : '') || '👤';
        const size = opts.emojiSize ? ` style="font-size:${opts.emojiSize};"` : '';
        return `<span class="portrait-emoji${extra}"${size}>${escapeGachaHtml(avatar)}</span>`;
      }
      const f = getPortraitFocus(char);
      const cssUrl = url.replace(/["\\\n\r]/g, c => encodeURIComponent(c));
      const style = `background-image:url("${cssUrl}");background-size:${f.zoom * 100}% auto;background-position:${f.x}% ${f.y}%;`;
      return `<div class="portrait-crop${extra}" role="img" aria-label="${name}" style="${escapeGachaHtml(style)}"></div>`;
    }

    // 유닛에 대사가 없으면(구버전 유닛) 원본 캐릭터 레코드의 대사를 쓴다.
    function pickUnitLine(unit, situation, vars = {}) {
      if (!window.DialogueLines) return '';
      let source = unit;
      if (!unit?.dialogues && unit?.sourceCharacterId) {
        const record = getStoredCustomCharacters().find(c => String(c.id) === String(unit.sourceCharacterId));
        if (record?.dialogues) source = { ...unit, dialogues: record.dialogues, dialogueTone: unit.dialogueTone || record.dialogueTone };
      }
      return DialogueLines.pick(source, situation, vars);
    }

    // opts.hideIllust: 말풍선만 띄운다 (캐릭터 창이 이미 같은 일러스트를 보여주고 있을 때)
    function speakUnitLine(unit, situation, mood, vars = {}, opts = {}) {
      const line = pickUnitLine(unit, situation, vars);
      if (!line) return '';
      window.UI?.showUnitSpeech?.(unit, line, { imageUrl: opts.hideIllust ? '' : getUnitIllustration(unit), mood });
      addLog(`💬 "${unit.name}: ${line}"`, mood === 'refuse' ? 'danger' : 'system');
      return line;
    }

    /* --------------------------------------------------------------------------
       Command Interception & Refusal Guard Logic
       -------------------------------------------------------------------------- */
    // 호감도별 공격 명령 거부 확률. Berserk(광폭화) 지휘관 패시브가 있으면 거부하지 않는다.
    //   호감도 15 이하            → 무조건 거부 (불신)
    //   호감도 30 이하            → HP 25% 이하 또는 승률 50% 미만이면 거부, 그 외에도 40% 확률로 거부
    //   호감도 50 미만            → 승률 35% 미만 또는 HP 25% 이하이면 50% 확률로 거부
    function getRefusalRisk(unit, winChance = 1.0) {
      const none = { chance: 0, situation: null };
      if (!unit || unit.owner === 'ENEMY') return none;
      if (state?.commander?.unlockedSkills?.Berserk) return none;
      const affection = unit.affection ?? 50;
      const isCriticalHp = unit.hp / (unit.maxHp || 100) <= 0.25;
      if (affection <= 15) return { chance: 1, situation: 'refuse_distrust' };
      if (affection <= 30) {
        if (isCriticalHp) return { chance: 1, situation: 'refuse_lowhp' };
        if (winChance < 0.50) return { chance: 1, situation: 'refuse_danger' };
        return { chance: 0.40, situation: 'refuse_distrust' };
      }
      if (affection < 50) {
        if (isCriticalHp) return { chance: 0.50, situation: 'refuse_lowhp' };
        if (winChance < 0.35) return { chance: 0.50, situation: 'refuse_danger' };
      }
      return none;
    }

    // 거부 주사위는 유닛별로 턴당 한 번만 굴린다 (같은 턴에 공격을 연타해서 거부를 뚫지 못하게).
    function getTurnRefusalRoll(unit) {
      const turn = state.turn ?? 0;
      if (!unit._refusalRoll || unit._refusalRoll.turn !== turn) {
        unit._refusalRoll = { turn, value: Math.random() };
      }
      return unit._refusalRoll.value;
    }

    function checkCommandRefusal(unit, target, winChance = 1.0) {
      const risk = getRefusalRisk(unit, winChance);
      if (risk.chance <= 0) return false;
      if (risk.chance < 1 && getTurnRefusalRoll(unit) >= risk.chance) return false;

      const maxHp = unit.maxHp || 100;
      const fearDialogue = pickUnitLine(unit, risk.situation, { target: target?.name || '적군', win: Math.round(winChance * 100) });

      // a. 공포 비주얼 & 심장박동 사운드 효과 + 일러스트/말풍선 발동
      const speech = { unit, imageUrl: getUnitIllustration(unit) };
      if (typeof window.triggerFearFX === 'function') {
        window.triggerFearFX(unit.id, fearDialogue, undefined, speech);
      } else if (typeof window.UI?.triggerFearFX === 'function') {
        window.UI.triggerFearFX(unit.id, fearDialogue, undefined, speech);
      }

      // b. 방어 태세(Defensive Stance / Guard)로 자동 전환
      unit.stance = 'GUARD';
      unit.isGuarding = true;
      unit.guardBonusDef = 0.30; // 방어력 +30% 보너스

      // c. 이벤트 로그 출력
      addLog(`🛡️ [명령 거부 및 방어 태세] ${unit.name}(호감 ${unit.affection ?? 50}, HP ${unit.hp}/${maxHp}, 승률 ${Math.round(winChance * 100)}%)이(가) 명령을 거부하고 [방어 태세]로 전환했습니다! (방어력 +30%, AP 미소모)`, 'danger');

      // d. UI 갱신
      renderAll();

      return true; // 명령 차단 및 취소
    }

    function executeAttack(attacker, defender) {
      if (!attacker || !defender) return false;
      const odds = getCombatOdds(attacker, defender);
      const winRate = odds ? odds.P : 0.5;

      if (checkCommandRefusal(attacker, defender, winRate)) {
        return false;
      }
      executeCombat(attacker, defender);
      return true;
    }

    /* --------------------------------------------------------------------------
       Combat Odds & Civ4 Formula
       -------------------------------------------------------------------------- */
    function getCombatOdds(attacker, defender) {
      if (!attacker || !defender) return null;
      const skills = state.commander.unlockedSkills;
      const isPlayerAttacker = (attacker.owner === 'PLAYER' || !attacker.owner);
      const isPlayerDefender = (defender.owner === 'PLAYER' || !defender.owner);
      const isFirstUnit = isPlayerAttacker && (state.playerUnits.filter(u => !u.isDead)[0]?.id === attacker.id);
      const targetTile = getTile(defender.x, defender.y);
      // 승률 창 슬라이드용: 어떤 효과가 얼마나 반영됐는지 기록한다 (side: atk=공격력, def=방어력, win=승률)
      const factors = [];
      const addFactor = (side, label, pct) => { if (pct) factors.push({ side, label, pct: Math.round(pct * 10) / 10 }); };

      // 1. 공격력 산출 (Effective Strength = Base Strength * (HP / 100))
      let atkBonus = 1.0;
      // 병과 승급 효과 (전투 단계 · 도시 공격 · 지형 방어). 옛 combatRank 저장 형식도 getCombatRank가 읽는다.
      const atkPromo = getPromotionEffectSummary(attacker);
      const defPromo = getPromotionEffectSummary(defender);
      const tileFlags = getPromotionTileFlags(targetTile);
      atkBonus += atkPromo.atkPercent;
      addFactor('atk', '병과 승급', atkPromo.atkPercent * 100);
      if (tileFlags.isCityTile) { atkBonus += atkPromo.cityAtkBonus; addFactor('atk', '승급: 도시 공격', atkPromo.cityAtkBonus * 100); }
      if (isPlayerAttacker && skills.BearDown && isFirstUnit) {
        atkBonus += 0.20; // BearDown: 첫 유닛 공격력 +20%
        addFactor('atk', '지휘관 패시브: 버텨내기(첫 유닛)', 20);
      }
      // 유물 치명타율: 치명타는 피해 +50%이므로 기대값으로 공격력에 반영한다 (치명타율 10%p → 공격력 +5%)
      const critRate = clampPercent(getRelicStatFor(attacker, 'critRate'), 0, 100);
      if (critRate) { atkBonus += (critRate / 100) * 0.5; addFactor('atk', `유물 치명타율 ${Math.round(critRate)}% 기대값`, critRate * 0.5); }
      // 스킬 패시브 · 오라 · 버프/디버프 (skillEngine)
      const atkMods = window.SkillEngine ? SkillEngine.getCombatModifiers(attacker) : { atk: 0 };
      atkBonus = Math.max(0.1, atkBonus + atkMods.atk / 100);
      addFactor('atk', '스킬·오라·버프/디버프', atkMods.atk);
      if (attacker.customSkillBuffAtk) {
        atkBonus += attacker.customSkillBuffAtk;
        addFactor('atk', '커스텀 스킬 버프', attacker.customSkillBuffAtk * 100);
      }
      const effectiveAtk = calculateEffectiveStrength(attacker, 'atk');
      const finalAtk = effectiveAtk * atkBonus;

      // 2. 방어력 산출 (디버그 패널 타일 방어 배율 적용, Effective Strength = Base Strength * (HP / 100))
      let defBonus = 1.0;
      let rawTileDef = MapSchema.getTileDefBonus(targetTile);
      let tileDefBonus = rawTileDef * (debugParams.tileDefBonusMultiplier ?? 1.0);
      if (isPlayerAttacker && skills.Precision) {
        if (tileDefBonus > 0) factors.push({ side: 'def', label: '지휘관 패시브: 정밀 사격 — 지형 방어 무시', pct: null });
        tileDefBonus = 0; // Precision: 적 지형 방어 보너스 무시
      }
      // 유물 지형 방어(terrainDef): 방어 보너스가 있는 지형에서 그 보너스를 키운다
      const terrainRelic = getRelicStatFor(defender, 'terrainDef');
      if (terrainRelic && tileDefBonus > 0) tileDefBonus = Math.max(0, tileDefBonus + terrainRelic / 100);
      defBonus += tileDefBonus;
      addFactor('def', '지형 방어', tileDefBonus * 100);
      if (isPlayerDefender && skills.ShieldWall) {
        defBonus += 0.15; // ShieldWall: 아군 방어력 +15%
        addFactor('def', '지휘관 패시브: 방패의 벽', 15);
      }
      // 승급: 도시 주둔 · 게릴라(언덕/산악) · 삼림 전문 방어 보너스
      if (tileFlags.isCityTile) { defBonus += defPromo.cityDefBonus; addFactor('def', '승급: 도시 주둔', defPromo.cityDefBonus * 100); }
      if (tileFlags.isHillTile) { defBonus += defPromo.hillDefBonus; addFactor('def', '승급: 언덕·산악 게릴라', defPromo.hillDefBonus * 100); }
      if (tileFlags.isForestTile) { defBonus += defPromo.forestDefBonus; addFactor('def', '승급: 삼림 전문', defPromo.forestDefBonus * 100); }
      // 방어 태세 (GUARD stance) 보너스 +30% 적용
      if (defender.isGuarding || defender.stance === 'GUARD') {
        defBonus += (defender.guardBonusDef || 0.30);
        addFactor('def', '방어 태세', (defender.guardBonusDef || 0.30) * 100);
      }
      // 스킬 패시브 · 오라 · 버프/디버프 · 약점 표식 (skillEngine)
      const defMods = window.SkillEngine ? SkillEngine.getCombatModifiers(defender) : { def: 0, mark: 0 };
      defBonus += (defMods.def - defMods.mark) / 100;
      defBonus = Math.max(0.1, defBonus);
      addFactor('def', '스킬·오라·버프/디버프', defMods.def);
      addFactor('def', '약점 표식', -defMods.mark);
      if (defender.customSkillBuffDef) {
        defBonus += defender.customSkillBuffDef;
        addFactor('def', '커스텀 스킬 버프', defender.customSkillBuffDef * 100);
      }
      const effectiveDef = calculateEffectiveStrength(defender, 'def');
      const finalDef = effectiveDef * defBonus;

      // 3. 문명4 방식 승리 확률 P = (공격력 * W_atk) / (공격력 * W_atk + 방어력 * W_def)
      const wAtk = debugParams.winChanceAttackerWeight ?? 1.0;
      const wDef = debugParams.winChanceDefenderWeight ?? 1.0;
      const weightedAtk = finalAtk * wAtk;
      const weightedDef = finalDef * wDef;
      let P = (weightedAtk + weightedDef > 0) ? (weightedAtk / (weightedAtk + weightedDef)) : 0.5;
      // 유물 회피율: 방어자가 공격을 피할 확률만큼 공격자 승률이 줄어든다 (음수면 오히려 맞기 쉬워진다)
      const evasion = clampPercent(getRelicStatFor(defender, 'evasion'), -50, 75);
      if (evasion) P = Math.max(0, Math.min(1, P * (1 - evasion / 100)));
      if (evasion) addFactor('win', `방어자 유물 회피 (${evasion > 0 ? '승률 감소' : '승률 증가'})`, -evasion);
      if (wAtk !== 1 || wDef !== 1) factors.push({ side: 'win', label: `디버그 가중치 공격 ×${wAtk} / 방어 ×${wDef}`, pct: null });

      let isCheat = false;
      if (debugParams.forcedBattleResult === 'FORCE_WIN' || debugParams.forcedBattleResult === 'FORCE_LOSE') factors.push({ side: 'win', label: `디버그 강제 결과 (${debugParams.forcedBattleResult})`, pct: null });
      if (debugParams.forcedBattleResult === 'FORCE_WIN') {
        P = isPlayerAttacker ? 1.0 : 0.0;
        isCheat = true;
      } else if (debugParams.forcedBattleResult === 'FORCE_LOSE') {
        P = isPlayerAttacker ? 0.0 : 1.0;
        isCheat = true;
      }

      const winPercent = (P * 100).toFixed(1);
      // 확정 거부 상황 (승률 창 '거부위험' 표시용)
      const isDangerAffection = isPlayerAttacker && getRefusalRisk(attacker, P).chance >= 1;

      return {
        attacker,
        defender,
        finalAtk,
        finalDef,
        tileDefBonus,
        weightedAtk,
        weightedDef,
        P,
        winPercent,
        evasion,
        isCheat,
        isDangerAffection,
        factors,
        effectiveAtk,
        effectiveDef
      };
    }

    /** 스플래시 피해: HP를 최소 1까지만 깎는다 (전사시키지 않음). 실제로 깎인 양을 돌려준다. */
    function applySplashDamage(unit, amount) {
      const before = unit.hp;
      // 철갑 외피: 아군이 받는 2차 스플래시 피해 -30%
      if (isPlayerSideUnit(unit) && state.commander?.unlockedSkills?.Ironclad) amount *= 0.70;
      amount = absorbShield(unit, Math.max(0, Math.round(amount)));
      unit.hp = Math.max(Math.min(1, before), before - amount);
      if (unit.stats) unit.stats.hp = unit.hp;
      return before - unit.hp;
    }

    function isPlayerSideUnit(unit) {
      return !!unit && (unit.owner === 'PLAYER' || !unit.owner);
    }

    /** 보호막(SHIELD 상태)이 피해를 먼저 흡수한다. 흡수하고 남은 피해량을 돌려준다. */
    function absorbShield(unit, amount) {
      let dmg = Math.max(0, Math.round(amount));
      if (!unit || !Array.isArray(unit.statuses) || dmg <= 0) return dmg;
      unit.statuses.filter(s => s.type === 'SHIELD').forEach(sh => {
        if (dmg <= 0) return;
        const absorbed = Math.min(Number(sh.value) || 0, dmg);
        sh.value -= absorbed;
        dmg -= absorbed;
      });
      unit.statuses = unit.statuses.filter(s => s.type !== 'SHIELD' || s.value > 0);
      return dmg;
    }

    /** 교전 교환 피해: 보호막이 먼저 막고, HP는 1 아래로 내려가지 않는다 (전사는 승패 판정이 따로 정한다). */
    function applyExchangeDamage(unit, amount) {
      unit.hp = Math.max(1, Math.round(unit.hp - absorbShield(unit, amount)));
      if (unit.stats) unit.stats.hp = unit.hp;
    }

    /* --------------------------------------------------------------------------
       유물 효과 (지휘관 유물: 장착한 것만 / 선물 유물: 받은 캐릭터만)
       - atk/def (army)는 읽을 때 더한다(calculateEffectiveStrength). ap/mobility (army)는 전투 동안 baseAP에 얹었다가 전투가 끝나면 뺀다.
       - hp (army)는 최대 HP가 100으로 고정된 구조라 전투 시작 보호막으로 준다. (선물 유물의 hp/atk/def/ap/mobility/affection은 선물할 때 능력치에 직접 더한다)
       -------------------------------------------------------------------------- */
    const RELIC_PASSIVE_STATS = ['critRate', 'evasion', 'lifesteal', 'counterDmg', 'terrainDef', 'range', 'regen', 'shield', 'firstTurnAp', 'healAfterBattle', 'skillCooldown', 'expGain', 'spGain'];
    const RELIC_ARMY_STATS = ['atk', 'def', 'hp', 'ap', 'mobility'];
    const RELIC_GLOBAL_STATS = ['goldGain', 'shopDiscount', 'affection', 'rewinder'];

    function sumRelicEffects(relics, stat) {
      let sum = 0;
      (relics || []).forEach(r => (r && r.effects || []).forEach(fx => {
        if (fx && fx.stat === stat) sum += Number(fx.value) || 0;
      }));
      return sum;
    }

    /** 이 유닛에게 적용되는 유물 수치: 장착한 지휘관 유물(아군 전체) + 이 유닛이 받은 선물 유물. 적 유닛은 0. */
    function getRelicStatFor(unit, stat) {
      if (!isPlayerSideUnit(unit)) return 0;
      return sumRelicEffects(getEquippedCommanderRelics(), stat) + sumRelicEffects(unit.giftRelics, stat);
    }

    /** 지휘관 유물만 (상점 할인·골드 획득처럼 군 전체에 걸리는 수치) */
    function getCommanderRelicStat(stat) {
      return sumRelicEffects(getEquippedCommanderRelics(), stat);
    }

    /** 장착한 지휘관 유물이 아군에게 주는 능력치 보정 (atk/def/hp/ap/mobility) */
    function getArmyRelicBonus(unit, stat) {
      return isPlayerSideUnit(unit) ? sumRelicEffects(getEquippedCommanderRelics(), stat) : 0;
    }

    function clampPercent(value, min, max) {
      return Math.max(min, Math.min(max, Number(value) || 0));
    }

    /** 유물 골드 획득(%)을 수입에 얹는다. 서버가 건당 상한을 검사하므로 +100%까지만. */
    function applyRelicGoldGain(amount) {
      const pct = clampPercent(getCommanderRelicStat('goldGain'), -50, 100);
      return pct ? Math.max(1, Math.round(amount * (1 + pct / 100))) : amount;
    }

    /** 물가가 반영된 수입에 유물 골드 획득(%)까지 얹는다. 골드를 버는 곳은 모두 이 함수를 쓴다. */
    function scaleIncomeWithRelics(base) {
      return applyRelicGoldGain(scaleIncome(base));
    }

    /** 유물 상점 할인(%)을 이미 물가가 반영된 가격에 건다. */
    function applyRelicShopDiscount(price) {
      const pct = clampPercent(getCommanderRelicStat('shopDiscount'), 0, 75);
      return pct ? Math.max(1, Math.round(price * (1 - pct / 100))) : price;
    }
    /** 상점·고용 기준가 → 물가 × 유물 할인 */
    function scaleShopGold(base) { return applyRelicShopDiscount(scaleGold(base)); }
    window.scaleShopGold = scaleShopGold;

    /** 유물 경험치 획득(%) 배율 (유닛용: 지휘관 유물 + 선물 유물) */
    function getRelicExpMultiplier(unit) {
      return Math.max(0, 1 + clampPercent(getRelicStatFor(unit, 'expGain'), -50, 300) / 100);
    }

    /** 사거리 보정: 지휘관 신속한 진격(이동·공격 2칸) 위에 유물 사거리를 얹는다 (공격만 늘어난다). */
    function getUnitAttackRange(unit) {
      const base = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;
      return Math.max(1, base + Math.round(getRelicStatFor(unit, 'range')));
    }

    /** 전투 시작: 이동력(ap/mobility)·보호막(shield/hp)·첫 턴 AP(firstTurnAp)를 아군 출전 유닛에게 건다. */
    function applyRelicBattleStart() {
      const deployed = (state.playerUnits || []).filter(u => !u.isDead && u.isDeployed !== false && u.x >= 0);
      const lines = [];
      deployed.forEach(u => {
        // 이전 전투에서 남은 보정이 있으면 먼저 걷어낸다
        if (u.relicApBonus) { u.baseAP = Math.max(1, (Number(u.baseAP) || 1) - u.relicApBonus); u.relicApBonus = 0; }
        const apBonus = Math.round(getArmyRelicBonus(u, 'ap') + getArmyRelicBonus(u, 'mobility'));
        if (apBonus) {
          const before = Number(u.baseAP) || 1;
          u.baseAP = Math.max(1, before + apBonus);
          u.relicApBonus = u.baseAP - before;
        }
        const firstTurn = Math.round(getRelicStatFor(u, 'firstTurnAp'));
        u.ap = Math.max(0, (Number(u.baseAP) || 1) + firstTurn);

        const shield = Math.round(getRelicStatFor(u, 'shield') + getArmyRelicBonus(u, 'hp'));
        if (shield > 0) {
          if (!Array.isArray(u.statuses)) u.statuses = [];
          u.statuses = u.statuses.filter(s => !(s.type === 'SHIELD' && s.source === '유물'));
          u.statuses.push({ type: 'SHIELD', value: shield, turns: 50, casterId: null, source: '유물' });
        }
        if (apBonus || firstTurn || shield > 0) {
          lines.push(`${u.name}${shield > 0 ? ` 🔰${shield}` : ''}${firstTurn ? ` ⚡첫 턴 AP ${firstTurn > 0 ? '+' : ''}${firstTurn}` : ''}${apBonus ? ` 🏃AP ${apBonus > 0 ? '+' : ''}${apBonus}` : ''}`);
        }
      });
      if (lines.length) addLog(`💎 [유물 효과] 전투 시작 — ${lines.join(' · ')}`, 'gold');
    }

    /** 전투 종료: 전투 동안 얹었던 이동력 보정을 걷어낸다. */
    function removeRelicBattleBonuses() {
      (state.playerUnits || []).forEach(u => {
        if (u.relicApBonus) {
          u.baseAP = Math.max(1, (Number(u.baseAP) || 1) - u.relicApBonus);
          u.ap = Math.min(Number(u.ap) || 0, u.baseAP);
          u.relicApBonus = 0;
        }
      });
    }

    /** 아군 턴 시작: 유물 재생(regen)으로 HP 회복 (음수면 HP가 깎이지만 1 아래로는 내려가지 않는다). */
    function applyRelicRegen() {
      (state.playerUnits || []).filter(u => !u.isDead && u.isDeployed !== false).forEach(u => {
        const regen = Math.round(getRelicStatFor(u, 'regen'));
        if (!regen) return;
        const maxHp = Number(u.maxHp) > 0 ? Number(u.maxHp) : 100;
        const before = u.hp;
        u.hp = regen > 0 ? Math.min(maxHp, before + regen) : Math.max(1, before + regen);
        if (u.stats) u.stats.hp = u.hp;
        if (u.hp !== before) addLog(`💎 [유물 재생] ${u.name} HP ${u.hp > before ? '+' : ''}${u.hp - before} (${u.hp}/${maxHp})`, u.hp > before ? 'success' : 'warning');
      });
    }

    /** 전투 승리 정산: 전투 후 회복(healAfterBattle)·승리 SP(spGain)·호감도(affection, 지휘관 유물). */
    function applyRelicVictoryRewards() {
      const deployedIds = Array.isArray(state.currentDeployedUnitIds) ? state.currentDeployedUnitIds : [];
      const survivors = (state.playerUnits || []).filter(u => !u.isDead && u.hp > 0 && deployedIds.includes(u.id));
      const affection = Math.round(getCommanderRelicStat('affection'));
      survivors.forEach(u => {
        const heal = clampPercent(getRelicStatFor(u, 'healAfterBattle'), 0, 100);
        if (heal > 0) {
          const maxHp = Number(u.maxHp) > 0 ? Number(u.maxHp) : 100;
          const before = u.hp;
          u.hp = Math.min(maxHp, before + Math.max(1, Math.round(maxHp * heal / 100)));
          if (u.stats) u.stats.hp = u.hp;
          if (u.hp > before) addLog(`💎 [전투 후 회복] ${u.name} HP +${u.hp - before} (${u.hp}/${maxHp})`, 'success');
        }
        const sp = Math.round(getRelicStatFor(u, 'spGain'));
        if (sp > 0) {
          u.skillPoints = (Number(u.skillPoints) || 0) + sp;
          addLog(`💎 [유물] ${u.name} 스킬 해금권 +${sp}`, 'gold');
        }
        if (affection) GIFT_RELIC_APPLIERS.affection(u, affection);
      });
    }

    /**
     * 한 칸에 겹친 방어자 중 attacker를 상대로 막아낼 확률이 가장 높은 유닛을 고른다.
     * (공격자 승률이 가장 낮은 유닛. 같으면 HP가 많은 쪽)
     */
    function pickBestDefender(attacker, defenders) {
      let best = null;
      let bestP = Infinity;
      defenders.forEach(d => {
        const p = getCombatOdds(attacker, d)?.P ?? 0.5;
        if (p < bestP || (p === bestP && (d.hp || 0) > (best.hp || 0))) {
          best = d;
          bestP = p;
        }
      });
      return best;
    }

    /* --------------------------------------------------------------------------
       Combat Math & Engine (Civ4 Formula + Affection Check + Permadeath)
       -------------------------------------------------------------------------- */
    function executeCombat(attacker, defender) {
      saveHistorySnapshot();

      const odds = getCombatOdds(attacker, defender);
      if (!odds) return;

      const { finalAtk, finalDef, tileDefBonus, weightedAtk, weightedDef, P, winPercent, evasion } = odds;
      const skills = state.commander.unlockedSkills;
      const isPlayerAttacker = (attacker.owner === 'PLAYER' || !attacker.owner);

      addLog(`⚔️ [전투 개시] ${attacker.name}(공 ${finalAtk.toFixed(1)}) VS ${defender.name}(방 ${finalDef.toFixed(1)}${tileDefBonus > 0 ? ` [지형+${(tileDefBonus*100).toFixed(0)}%]` : ''})`, 'combat');
      addLog(`📊 [확률 산출] 승리 확률 P = ${weightedAtk.toFixed(1)} / (${weightedAtk.toFixed(1)} + ${weightedDef.toFixed(1)}) = ${winPercent}%${evasion ? ` (유물 회피 ${evasion > 0 ? '-' : '+'}${Math.abs(evasion)}%)` : ''}`, 'combat');

      // 4. 호감도/체력 공포 명령 거부 및 자동 방어 태세 전환 가드 (플레이어 유닛 전용)
      if (isPlayerAttacker && checkCommandRefusal(attacker, defender, P)) {
        return; // 전투 취소 및 AP 보존 상태로 방어 태세 전환 완료
      }
      const lineVars = { target: defender.name, win: Math.round(P * 100) };
      // 이번 교전에서 이미 대사가 나왔으면 격파 대사로 덮어쓰지 않는다
      let spokeThisCombat = false;
      if (isPlayerAttacker && attacker.affection < 50 && P < 0.50 && skills.Berserk) {
        addLog(`🔥 [지휘관 패시브: 광폭화] 호감도 저하(${attacker.affection})를 무시하고 강제 전투 돌입!`, 'warning');
        spokeThisCombat = !!speakUnitLine(attacker, 'forced_attack', 'forced', lineVars);
      } else if (isPlayerAttacker && attacker.affection >= 70 && P < 0.50) {
        spokeThisCombat = !!speakUnitLine(attacker, 'brave_attack', 'brave', lineVars);
      }

      // 5. 행동력(AP) 소모
      attacker.ap = Math.max(0, attacker.ap - 1);

      // 6. 주사위 굴림 (강제 승패 치트 지원)
      const roll = Math.random() * 100;
      let isWin = roll < (P * 100);

      if (debugParams.forcedBattleResult === 'FORCE_WIN') {
        isWin = isPlayerAttacker ? true : false;
        addLog(`⚡ [치트 발동] 디버그 강제 승리 (FORCE_WIN) 적용!`, 'gold');
      } else if (debugParams.forcedBattleResult === 'FORCE_LOSE') {
        isWin = isPlayerAttacker ? false : true;
        addLog(`⚡ [치트 발동] 디버그 강제 패배 (FORCE_LOSE) 적용!`, 'danger');
      } else {
        addLog(`🎲 [주사위 결과] Roll: ${roll.toFixed(1)} (목표: ${winPercent}% 미만) -> ${isWin ? '공격자 승리!' : '방어자 방어 성공!'}`, isWin ? 'success' : 'danger');
      }

      // 전투 교환 피해 계산 (Round Combat Damage & Clean Integer HP)
      const roundDmg = calculateRoundCombatDamage(attacker, defender, isWin, parseFloat(winPercent));

      // 불굴(PROTECT) 스킬: 패배한 쪽이 치명상을 1회 버티면 교전은 무승부로 끝난다.
      if (window.SkillEngine) SkillEngine.breakStealth(attacker);
      const combatLoser = isWin ? defender : attacker;
      const combatWinnerUnit = isWin ? attacker : defender;
      const loserSaved = !!(window.SkillEngine && SkillEngine.tryPreventDeath(combatLoser));

      // 퇴각 판정: 패배한 쪽이 승급(측면 기습)·지휘관 패시브의 퇴각 확률로 전사를 피한다.
      const combatMods = loserSaved ? null : calculateCombatModifiers(attacker, defender);
      const loserMods = combatMods ? (isWin ? combatMods.defender : combatMods.attacker) : null;
      const loserRetreatChance = loserMods ? (loserMods.retreatChance || 0) : 0;
      const loserRetreated = loserRetreatChance > 0 && Math.random() < loserRetreatChance;

      if (!loserSaved) {
        // 승자는 승률이 낮을수록 더 많은 병과 경험치를 얻는다
        const winnerChance = isWin ? P : (1 - P);
        awardPromotionXp(combatWinnerUnit, getVictoryXp(winnerChance), '전투 승리');
      }

      if (loserRetreated) {
        const loserDmg = isWin ? roundDmg.defenderDamage : roundDmg.attackerDamage;
        const winnerDmg = isWin ? roundDmg.attackerDamage : roundDmg.defenderDamage;
        applyExchangeDamage(combatLoser, loserDmg);
        if (loserMods.retreatHpRecovery > 0) {
          const maxHp = combatLoser.maxHp || 100;
          combatLoser.hp = Math.min(maxHp, combatLoser.hp + Math.round(maxHp * loserMods.retreatHpRecovery));
        }
        if (combatLoser.stats) combatLoser.stats.hp = combatLoser.hp;
        if (winnerDmg > 0) applyExchangeDamage(combatWinnerUnit, winnerDmg);
        addLog(`🏃 [퇴각 성공] ${combatLoser.name}이(가) 패배했지만 ${Math.round(loserRetreatChance * 100)}% 퇴각 판정에 성공해 살아남았습니다. (HP ${combatLoser.hp}/${combatLoser.maxHp || 100})`, 'warning');
        awardPromotionXp(combatLoser, PROMOTION_XP_GAIN.retreat, '퇴각 성공');
      } else if (loserSaved) {
        const combatWinner = isWin ? attacker : defender;
        const winnerDmg = isWin ? roundDmg.attackerDamage : roundDmg.defenderDamage;
        if (winnerDmg > 0) applyExchangeDamage(combatWinner, winnerDmg);
        addLog(`🕊️ [교전 무승부] ${combatLoser.name}이(가) 불굴로 버텨 전선이 유지됩니다. (${combatWinner.name} HP ${combatWinner.hp}/${combatWinner.maxHp})`, 'warning');
      } else if (isWin) {
        // 승리: 피격자(defender) 사망 (HP 0)
        defender.isDead = true;
        awardCommanderCasualtyExp(defender);
        defender.hp = 0;
        if (defender.stats) defender.stats.hp = 0;
        if (defender.owner === 'ENEMY') {
          window.defeatedEnemyCount = (window.defeatedEnemyCount || 0) + 1;
          defeatedEnemyCount = window.defeatedEnemyCount;
        }

        // 수비측 반격 교환 피해 적용 (HP 1 이상 정수 유지)
        if (roundDmg.attackerDamage > 0) {
          applyExchangeDamage(attacker, roundDmg.attackerDamage);
          addLog(`🛡️ [수비측 반격] ${defender.name}의 저항으로 ${attacker.name}에게 ${roundDmg.attackerDamage} 피해 (잔여 HP: ${attacker.hp}/${attacker.maxHp})`, 'warning');
        }

        if (isPlayerAttacker) {
          // A. 아군 플레이어의 공격 성공
          if (!spokeThisCombat && Math.random() < 0.35) {
            speakUnitLine(attacker, 'enemy_defeated', 'victory', lineVars);
          }
          const splashRatio = debugParams.collateralDamageMultiplier ?? 0.30;
          if (splashRatio > 0) {
            const splashDamage = Math.round(finalAtk * splashRatio);
            const adjEnemies = state.enemyUnits.filter(e =>
              !e.isDead && e.id !== defender.id &&
              Math.abs(e.x - defender.x) <= 1 && Math.abs(e.y - defender.y) <= 1
            );
            if (adjEnemies.length > 0) {
              adjEnemies.forEach(adj => {
                // 스플래시는 피해만 준다: HP 1 아래로는 깎지 않는다 (스플래시로는 아무도 죽지 않는다).
                const dealt = applySplashDamage(adj, splashDamage);
                addLog(`💥 [2차 스플래시 피해] 인접 적 ${adj.name}에게 ${dealt} 피해 (${(splashRatio*100).toFixed(0)}%)! (잔여 HP: ${adj.hp}/${adj.maxHp})`, 'warning');
              });
            }
          }

          // 포섭 판정: 확률·초기 호감도는 지휘관의 포섭 방침이 정한다. 포섭하지 못하면 전리품.
          if (!tryCaptureEnemy(defender, defender.x, defender.y)) {
            const lootGold = scaleIncomeWithRelics(Math.round((35 + defender.level * 10) * getCaptureDoctrine().lootMult));
            Wallet.earn('earn_loot', lootGold);
            addLog(`🏆 [적 격퇴 완료] ${defender.name} 처치 성공! 전리품 +${lootGold}G 획득`, 'gold');
          }

          // 호감도 (지휘관의 통솔: +30%). 병과 경험치 보너스는 awardPromotionXp가 준다.
          // 승률 50% 이하의 무모한 교전에서 이기면 오히려 호감도가 소폭 떨어진다.
          if (P <= AFFECTION_RULES.lowOddsThreshold) {
            adjustAffectionWithLog(attacker, AFFECTION_RULES.lowOddsWin, `무모한 교전(승률 ${winPercent}%) 불만`);
          } else {
            let affGain = 5;
            if (skills.CommanderLeadership) affGain = Math.round(affGain * 1.3);
            attacker.affection = Math.min(100, attacker.affection + affGain);
            addLog(`⭐ ${attacker.name} 호감도 +${affGain} 획득!`, 'success');
          }

          // 승리 시 적진 돌파 및 타일 전진 점령 (해당 타일에 남은 적이 없을 때)
          const remainingEnemiesAtTile = state.enemyUnits.filter(e => !e.isDead && e.x === defender.x && e.y === defender.y);
          // 유물 사거리로 멀리서 쏜 공격은 그 자리에서 쏜 것이라 전진하지 않는다 (이동 범위 안일 때만 점령 전진)
          const advanceRange = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;
          const strikeDist = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
          if (remainingEnemiesAtTile.length === 0 && strikeDist <= advanceRange) {
            const startX = attacker.x;
            const startY = attacker.y;
            const targetX = defender.x;
            const targetY = defender.y;
            const targetTile = getTile(targetX, targetY);

            if (state.stackMoveEnabled) {
              const squad = state.playerUnits.filter(u => !u.isDead && u.x === startX && u.y === startY && !u.isInactivated);
              squad.forEach(m => {
                m.x = targetX;
                m.y = targetY;
              });
              addLog(`🚩 [적진 돌파 점령!] ${attacker.name} 부대(총 ${squad.length}기)가 적을 소탕하고 [${targetTile ? targetTile.name : '목표'}] 타일로 전진 진격했습니다!`, 'gold');
            } else {
              attacker.x = targetX;
              attacker.y = targetY;
              addLog(`🚩 [적진 돌파 점령!] ${attacker.name}이(가) 적을 격퇴하고 [${targetTile ? targetTile.name : '목표'}] 타일로 전진 진격했습니다!`, 'gold');
            }
          }
        } else {
          // B. 적군(AI)의 공격 성공 -> 아군 유닛 영구 전사
          if (!tryCaptureAlly(defender, attacker)) {
            addLog(`💀 [아군 전사 (Permadeath)] 적 ${attacker.name}의 치명적인 공격에 아군 ${defender.name}이(가) 전사하여 영구 삭제되었습니다!`, 'danger');
            addLog(`💡 앗! 상단의 [⏳ 리와인더] 버튼을 눌러 직전 턴 상태로 복구할 수 있습니다!`, 'warning');
          }

          // 인접 아군 유닛들에게 스플래시 피해
          const splashRatio = debugParams.collateralDamageMultiplier ?? 0.30;
          if (splashRatio > 0) {
            const splashDamage = Math.round(finalAtk * splashRatio);
            const adjPlayers = state.playerUnits.filter(p =>
              !p.isDead && p.id !== defender.id &&
              Math.abs(p.x - defender.x) <= 1 && Math.abs(p.y - defender.y) <= 1
            );
            if (adjPlayers.length > 0) {
              adjPlayers.forEach(adj => {
                const dealt = applySplashDamage(adj, splashDamage);
                addLog(`💥 [적군 스플래시 피해] 인접 아군 ${adj.name}에게 ${dealt} 피해! (잔여 HP: ${adj.hp}/${adj.maxHp})`, 'danger');
              });
            }
          }

          // 해당 타일에 아군이 모두 없으면 적군이 전진 돌파
          const remainingPlayersAtTile = state.playerUnits.filter(p => !p.isDead && p.x === defender.x && p.y === defender.y);
          if (remainingPlayersAtTile.length === 0) {
            attacker.x = defender.x;
            attacker.y = defender.y;
            const targetTile = getTile(defender.x, defender.y);
            addLog(`🚩 [적군 전선 돌파] ${attacker.name}이(가) 아군 거점을 돌파하고 [${targetTile ? targetTile.name : '타일'}]로 진격했습니다!`, 'danger');
          }
        }
      } else {
        // 공격자 패배: 공격자(attacker) 영구 사망 (HP 0)
        attacker.isDead = true;
        awardCommanderCasualtyExp(attacker);
        attacker.hp = 0;
        if (attacker.stats) attacker.stats.hp = 0;
        if (attacker.owner === 'ENEMY') {
          window.defeatedEnemyCount = (window.defeatedEnemyCount || 0) + 1;
          defeatedEnemyCount = window.defeatedEnemyCount;
        }

        // 수비자 교환 피해 적용 (HP 1 이상 정수 유지)
        if (roundDmg.defenderDamage > 0) {
          applyExchangeDamage(defender, roundDmg.defenderDamage);
          addLog(`🗡️ [공격측 발악 타격] ${attacker.name}의 돌격으로 ${defender.name}에게 ${roundDmg.defenderDamage} 피해 (잔여 HP: ${defender.hp}/${defender.maxHp})`, 'warning');
        }

        if (isPlayerAttacker) {
          if (!tryCaptureAlly(attacker, defender)) {
            addLog(`💀 [영구 사망 (Permadeath)] ${attacker.name}이(가) 치명타를 입고 전사하여 영구 삭제되었습니다!`, 'danger');
            addLog(`💡 앗! 실수인가요? 상단의 [⏳ 리와인더] 버튼을 눌러 직전 턴 상태로 복구할 수 있습니다!`, 'warning');
          }
        } else {
          // 적군 공격자가 아군 수비자의 반격에 격퇴됨
          addLog(`🛡️ [반격 섬멸 성공!] 아군 ${defender.name}이(가) 적 ${attacker.name}의 돌격을 완벽히 저지하고 역공으로 적을 섬멸했습니다!`, 'success');
          const lootGold = scaleIncomeWithRelics(Math.round((35 + attacker.level * 10) * getCaptureDoctrine().lootMult));
          Wallet.earn('earn_loot', lootGold);
          addLog(`🏆 [적 격퇴 전리품] +${lootGold}G 국고 획득!`, 'gold');
          grantCommanderExp(20, '반격 섬멸');

          // 반격 승리 시 적 포섭 판정 (포섭 방침)
          tryCaptureEnemy(attacker, defender.x, defender.y);
        }
      }

      // 유물 흡혈(lifesteal): 승자가 입힌 피해의 일부만큼 HP를 회복한다
      const lifestealPct = clampPercent(getRelicStatFor(combatWinnerUnit, 'lifesteal'), 0, 100);
      if (lifestealPct > 0 && !combatWinnerUnit.isDead) {
        const dealt = isWin ? roundDmg.defenderDamage : roundDmg.attackerDamage;
        if (dealt > 0) {
          const maxHp = Number(combatWinnerUnit.maxHp) > 0 ? Number(combatWinnerUnit.maxHp) : 100;
          const beforeHp = combatWinnerUnit.hp;
          combatWinnerUnit.hp = Math.min(maxHp, beforeHp + Math.max(1, Math.round(dealt * lifestealPct / 100)));
          if (combatWinnerUnit.stats) combatWinnerUnit.stats.hp = combatWinnerUnit.hp;
          if (combatWinnerUnit.hp > beforeHp) addLog(`🩸 [유물 흡혈] ${combatWinnerUnit.name} HP +${combatWinnerUnit.hp - beforeHp} (${combatWinnerUnit.hp}/${maxHp})`, 'success');
        }
      }

      // 부대 전멸 상태 검증 (All-Units Defeat State Guard)
      if (typeof checkPartyWipeout === 'function') {
        checkPartyWipeout();
      }

      // 범용 전술 전장 승리 검증 및 보상 정산 (Universal Tactical Map Victory Check)
      if (typeof window.checkTacticalVictory === 'function') {
        window.checkTacticalVictory();
      }

      currentInteractionMode = null;
      renderAll();
      updateDebugInspector();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Move Logic (Single Unit & Coordinated Stack Movement)
       -------------------------------------------------------------------------- */
    function showStackAlertModal(title, messageHtml) {
      const modal = document.getElementById('modal-stack-alert');
      const titleEl = document.getElementById('stack-alert-title');
      const bodyEl = document.getElementById('stack-alert-body');
      if (titleEl) titleEl.innerText = title;
      if (bodyEl) bodyEl.innerHTML = messageHtml;
      if (modal) modal.classList.add('active');
    }

    function executeMove(unit, targetX, targetY) {
      if (window.SkillEngine && !SkillEngine.canMove(unit)) {
        addLog(`⛓️ [이동 불가] ${unit.name}은(는) 속박/기절 상태라 이동할 수 없습니다.`, 'warning');
        return;
      }

      const startX = unit.x;
      const startY = unit.y;
      const targetTile = getTile(targetX, targetY);
      // 지형별 진입 AP: 물·암벽은 더 든다 (도로가 깔리면 1)
      // (게릴라 II · 삼림 전문 II 승급은 산악/숲 진입 AP를 줄인다. 부대 이동은 가장 비싼 부대원 기준)
      let costAP = getUnitMoveCost(unit, targetTile);

      // 출발 타일에 주둔 중인 아군 유닛 수집
      const friendlyAtStart = state.playerUnits.filter(u => !u.isDead && u.x === startX && u.y === startY);
      const isStackMove = !!state.stackMoveEnabled && friendlyAtStart.length > 1;
      if (isStackMove) costAP = Math.max(...friendlyAtStart.map(m => getUnitMoveCost(m, targetTile)));

      if (isStackMove) {
        // [사용자 요구사항] 부대가 중첩되었을 때 함께이동(ON) 상태면 최소 AP 기준으로 움직임.
        // 누군가 AP가 부족하여 함께 이동할 수 없으면 팝업으로 알리고 이동 중단!
        const insufficientUnits = friendlyAtStart.filter(u => u.isInactivated || u.ap < costAP || (window.SkillEngine && !SkillEngine.canMove(u)));

        if (insufficientUnits.length > 0) {
          const namesStr = insufficientUnits.map(u => `${u.name}(AP ${u.ap}/${u.baseAP}${u.isInactivated ? ', 비활성' : ''})`).join(', ');
          addLog(`🚫 [부대 함께 이동 불가] ${namesStr}의 행동력(AP)이 부족하여 부대가 함께 이동할 수 없습니다! (필요 AP: ${costAP})`, 'danger');

          const detailListHtml = friendlyAtStart.map(u => {
            const isLack = u.isInactivated || u.ap < costAP;
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; background: ${isLack ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.08)'}; border: 1px solid ${isLack ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.2)'}; font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 16px;">${u.avatar}</span>
                  <div>
                    <span style="font-weight: 700; color: ${isLack ? '#ef4444' : '#15803d'};">${u.name}</span>
                    <span style="font-size: 9px; opacity: 0.8; margin-left: 4px;">Lv.${u.level} ${getClassLabel(u.classType)}</span>
                  </div>
                </div>
                <div style="text-align: right;">
                  <span style="font-weight: 800; color: ${isLack ? '#dc2626' : '#16a34a'};">AP ${u.ap} / ${u.baseAP}</span>
                  ${isLack ? `<span style="display: block; font-size: 9px; color: #ef4444; font-weight: 700;">이동 불가 (-${costAP - u.ap} AP)</span>` : `<span style="display: block; font-size: 9px; color: #16a34a;">이동 준비 완료</span>`}
                </div>
              </div>
            `;
          }).join('');

          const alertHtml = `
            <div style="font-size: 12px; line-height: 1.5; color: #1e293b;">
              <p style="margin: 0 0 6px 0;">
                현재 <b>함께이동(ON)</b> 모드로 부대 전체가 동시 진격을 시도했으나, 
                <b style="color: #dc2626;">행동력(AP)이 부족한 부대원</b>이 있어 함께 이동할 수 없습니다.
              </p>
              <div style="background: #f8fafc; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; border-left: 3px solid #f59e0b; color: #475569;">
                <b>필요 최소 AP:</b> <span style="color: #d97706; font-weight: 800;">${costAP} AP</span> (도착 지형 기준)<br>
                <b>부족한 유닛:</b> <span style="color: #dc2626; font-weight: 700;">${insufficientUnits.map(u => u.name).join(', ')}</span>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto;">
              ${detailListHtml}
            </div>
            <div style="display: flex; gap: 6px; margin-top: 4px;">
              <button class="btn-buy" style="flex: 1; padding: 8px; background: #0284c7; color: white; font-size: 11px;" onclick="closeAllModals()">
                확인 (부대 대기)
              </button>
              <button class="btn-buy" style="flex: 1; padding: 8px; background: #475569; color: white; font-size: 11px;" onclick="state.stackMoveEnabled = false; closeAllModals(); renderAll(); addLog('👤 [이동 모드 변경] 개별 이동 모드로 전환되었습니다. 이제 각 유닛을 단독 이동할 수 있습니다.', 'system');">
                개별 이동 모드로 전환 👤
              </button>
            </div>
          `;

          showStackAlertModal('⚠️ 부대 함께 이동 불가 (AP 부족)', alertHtml);
          return;
        }

        // 전체 부대원이 최소 AP 요건을 만족하므로 함께 이동 실행!
        saveHistorySnapshot();

        friendlyAtStart.forEach(m => {
          m.x = targetX;
          m.y = targetY;
          m.ap = Math.max(0, m.ap - costAP);
        });

        const minRemainingAP = Math.min(...friendlyAtStart.map(m => m.ap));
        const totalAtDest = state.playerUnits.filter(u => !u.isDead && u.x === targetX && u.y === targetY).length;
        addLog(`👟 [부대 동시 진격 완료!] 아군 총 ${friendlyAtStart.length}기가 [${targetTile.name}] 타일로 최소 AP(${costAP})를 소모하여 함께 이동했습니다! (부대 최소 잔여 AP: ${minRemainingAP}) [도착 타일 총 ${totalAtDest}기 주둔]`, 'success');
      } else {
        // 개별 단독 이동
        if (unit.isInactivated || unit.ap < costAP) {
          addLog(`⚠️ [이동 불가] ${unit.name}의 행동력(AP)이 부족합니다! (필요: ${costAP}, 현재: ${unit.ap})`, 'warning');
          return;
        }

        saveHistorySnapshot();

        unit.x = targetX;
        unit.y = targetY;
        unit.ap = Math.max(0, unit.ap - costAP);

        const friendlyStack = state.playerUnits.filter(u => !u.isDead && u.x === targetX && u.y === targetY);
        if (friendlyStack.length > 1) {
          addLog(`👟 [중첩 이동 완료] ${unit.name} -> [${targetTile.name}] (해당 타일에 아군 총 ${friendlyStack.length}기 중첩 집결! 잔여 AP: ${unit.ap})`, 'success');
        } else {
          addLog(`👟 [이동 완료] ${unit.name} -> [${targetTile.name}] (잔여 AP: ${unit.ap})`, 'system');
        }
      }

      currentInteractionMode = null;
      renderAll();
      updateDebugInspector();
    }

    /* --------------------------------------------------------------------------
       End Turn & Economy System (Upkeep + Village/City Safe Zone)
       -------------------------------------------------------------------------- */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function computeZocTiles() {
      const zocSet = new Set();
      const aliveEnemies = state.enemyUnits.filter(e => !e.isDead);
      aliveEnemies.forEach(e => {
        // 8방향 인접 타일들을 ZOC 통제 구역으로 판정
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = e.x + dx;
            const ny = e.y + dy;
            if (isInsideBattleMap(nx, ny)) {
              const hasEnemy = aliveEnemies.some(oe => oe.x === nx && oe.y === ny);
              if (!hasEnemy) {
                zocSet.add(`${nx},${ny}`);
              }
            }
          }
        }
      });
      return Array.from(zocSet).map(s => {
        const [x, y] = s.split(',').map(Number);
        return { x, y };
      });
    }

    function updateTurnUIState() {
      const banner = document.getElementById('ai-turn-banner');
      const endTurnBtn = document.getElementById('btn-end-turn');
      if (banner) {
        banner.style.display = isEnemyTurnProcessing ? 'flex' : 'none';
      }
      if (endTurnBtn) {
        if (isEnemyTurnProcessing) {
          endTurnBtn.classList.add('processing-enemy-turn');
          endTurnBtn.disabled = true;
          endTurnBtn.innerText = '적 AI 작전 중... 👾';
        } else {
          endTurnBtn.classList.remove('processing-enemy-turn');
          endTurnBtn.disabled = false;
          endTurnBtn.innerText = '턴 종료 ⏳';
        }
      }
    }

    async function executeEnemyDecision(enemy) {
      if (enemy.isDead || enemy.ap <= 0) return false;
      const SE = window.SkillEngine;
      if (SE && !SE.canAct(enemy)) return false;

      // 스킬 우선: 쓸 만한 스킬(피해·회복·제어 등)이 있으면 먼저 사용한다.
      if (SE) {
        const plan = SE.planAISkill(enemy);
        if (plan && Math.random() < 0.8) {
          const res = SE.cast(enemy, plan.skill, plan.x, plan.y);
          if (res.ok) {
            renderAll();
            showSkillFloatTexts(res.results);
            if (typeof checkPartyWipeout === 'function') checkPartyWipeout();
            await sleep(450);
            return true;
          }
        }
      }

      // 은신한 아군은 노리지 않고, 도발당했다면 도발한 유닛만 노린다.
      let livingPlayers = state.playerUnits.filter(p => !p.isDead && (!SE || SE.isTargetableByAI(p)));
      const forced = SE ? SE.getForcedTarget(enemy) : null;
      if (forced && forced.owner !== 'ENEMY') livingPlayers = [forced];
      const enemyCanMove = !SE || SE.canMove(enemy);
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
      ];

      // ========================================================================
      // 우선순위 1: 플레이어 유닛 공격 (Combat Trigger)
      // 사거리(1) 또는 이동 가능한 타일(2) 내에 공격 가능한 플레이어 유닛이 존재하는 경우,
      // 가장 HP가 낮거나 사거리에 가까운 플레이어 유닛을 타겟팅하여 이동 후 즉시 공격
      // ========================================================================
      if (livingPlayers.length > 0) {
        const attackCandidates = [];

        livingPlayers.forEach(p => {
          const dist = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y);
          if (dist === 1) {
            // 즉시 공격 가능 (사거리 1)
            attackCandidates.push({
              target: p,
              dist: 1,
              requiresMove: false,
              hp: p.hp
            });
          } else if (dist === 2 && enemy.ap >= 2 && enemyCanMove) {
            // 1보 전진 후 공격 가능 (AP 2 필요)
            // 전진 가능한 중간 타일 탐색 (아군 플레이어 유닛이 없는 빈 타일)
            const midTiles = directions
              .map(d => ({ x: enemy.x + d.dx, y: enemy.y + d.dy }))
              .filter(pt => getTile(pt.x, pt.y) && MapSchema.getTileMoveCost(getTile(pt.x, pt.y)) < enemy.ap && !state.playerUnits.some(pu => !pu.isDead && pu.x === pt.x && pu.y === pt.y) && (Math.abs(pt.x - p.x) + Math.abs(pt.y - p.y) === 1));

            if (midTiles.length > 0) {
              attackCandidates.push({
                target: p,
                dist: 2,
                requiresMove: true,
                moveStep: midTiles[0],
                hp: p.hp
              });
            }
          }
        });

        if (attackCandidates.length > 0) {
          // 적은 칸을 고를 뿐, 그 칸의 누가 맞을지는 고르지 못한다 (문명4 방식):
          // 아군이 겹쳐 있으면 이 적을 상대로 막아낼 확률이 가장 높은 아군이 방어에 나선다.
          attackCandidates.forEach(c => {
            const stack = livingPlayers.filter(p => p.x === c.target.x && p.y === c.target.y);
            c.target = pickBestDefender(enemy, stack);
            c.winChance = getCombatOdds(enemy, c.target)?.P ?? 0.5;
          });
          // 정렬 기준: 1. 사거리(dist) 오름차순 -> 2. 그 칸의 최선 방어자 상대 승률 내림차순 (가장 뚫기 쉬운 칸 우선)
          attackCandidates.sort((a, b) => {
            if (a.dist !== b.dist) return a.dist - b.dist;
            return b.winChance - a.winChance;
          });

          const chosen = attackCandidates[0];

          if (chosen.requiresMove && chosen.moveStep) {
            enemy.x = chosen.moveStep.x;
            enemy.y = chosen.moveStep.y;
            enemy.ap -= MapSchema.getTileMoveCost(getTile(chosen.moveStep.x, chosen.moveStep.y));
            const destTile = getTile(chosen.moveStep.x, chosen.moveStep.y);
            addLog(`👟 [적군 돌격 기동] ${enemy.name}이(가) 아군 ${chosen.target.name}을(를) 요격하기 위해 [${destTile ? destTile.name : '타일'}](${chosen.moveStep.x}, ${chosen.moveStep.y})로 전진했습니다! (잔여 AP: ${enemy.ap})`, 'warning');
            renderAll();
            await sleep(350);
          }

          if (!enemy.isDead && enemy.ap > 0) {
            addLog(`⚔️ [적군 기습 공격] ${enemy.name}이(가) 아군 ${chosen.target.name}(HP: ${chosen.target.hp}/${chosen.target.maxHp})에게 전투를 개시합니다!`, 'danger');
            executeCombat(enemy, chosen.target);
            renderAll();
            await sleep(400);
          }
          return true;
        }
      }

      if (!enemyCanMove) return false;

      // 유닛이 이동할 수 있는 인접 타일 탐색 (플레이어 유닛이 주둔 중이지 않은 타일)
      const validMoves = directions
        .map(d => ({ x: enemy.x + d.dx, y: enemy.y + d.dy }))
        .filter(pt => getTile(pt.x, pt.y) && MapSchema.getTileMoveCost(getTile(pt.x, pt.y)) <= enemy.ap && !state.playerUnits.some(pu => !pu.isDead && pu.x === pt.x && pu.y === pt.y));

      if (validMoves.length === 0) return false;

      // ========================================================================
      // 우선순위 2: 마을/도시 및 길목 차단 (ZOC / 포위망 형성)
      // 3셀 이내에 다른 적 유닛이 존재하는 경우, 상호 2셀 간격을 유지하며 길목 차단
      // ========================================================================
      const allyEnemies = state.enemyUnits.filter(e => !e.isDead && e.id !== enemy.id && (Math.abs(e.x - enemy.x) + Math.abs(e.y - enemy.y) <= 3));
      if (allyEnemies.length > 0) {
        const chokePoints = getBattleTiles().filter(t => t.isSafe || t.isCity || t.type === 'village' || t.type === 'city');

        // 각 후보 타일의 ZOC 포위망 적합도 점수 계산
        function scoreZocTile(pt) {
          let score = 0;
          // 1. 아군 적 유닛과 상호 2셀 간격 유지 보너스
          allyEnemies.forEach(a => {
            const d = Math.abs(pt.x - a.x) + Math.abs(pt.y - a.y);
            if (d === 2) score += 60; // 2셀 간격 유지 최고 점수
            else if (d === 1) score += 20; // 1셀(중첩/인접) 차선책
            else if (d === 3) score += 10;
          });

          // 2. 주요 거점 및 길목(마을, 도시 입구) 차단 보너스
          if (chokePoints.length > 0) {
            const minKeyDist = Math.min(...chokePoints.map(c => Math.abs(pt.x - c.x) + Math.abs(pt.y - c.y)));
            score -= minKeyDist * 5;
          }

          // 3. 플레이어 전선과의 대치 거리 (2~3셀 거리 압박)
          if (livingPlayers.length > 0) {
            const minPlayerDist = Math.min(...livingPlayers.map(p => Math.abs(pt.x - p.x) + Math.abs(pt.y - p.y)));
            score -= Math.abs(minPlayerDist - 2) * 8;
          }

          return score;
        }

        const currentScore = scoreZocTile({ x: enemy.x, y: enemy.y });
        let bestTile = null;
        let highestScore = currentScore;

        validMoves.forEach(m => {
          const s = scoreZocTile(m);
          if (s > highestScore) {
            highestScore = s;
            bestTile = m;
          }
        });

        if (bestTile) {
          enemy.x = bestTile.x;
          enemy.y = bestTile.y;
          enemy.ap -= MapSchema.getTileMoveCost(getTile(bestTile.x, bestTile.y));
          const targetTile = getTile(bestTile.x, bestTile.y);
          addLog(`🛡️ [적군 ZOC 차단선 형성] ${enemy.name}이(가) 동료 적군과 2셀 간격의 ZOC 포위망을 형성하며 [${targetTile ? targetTile.name : '길목'}](${bestTile.x}, ${bestTile.y})을(를) 차단했습니다! (잔여 AP: ${enemy.ap})`, 'warning');
          renderAll();
          return true;
        }
      }

      // ========================================================================
      // 우선순위 3: 마을/도시 거점 점령 및 압박
      // 가장 가까운 미점령 마을이나 도시(왕도/요새) 방향으로 전진 이동하여 거점 압박
      // ========================================================================
      const baseTargets = getBattleTiles().filter(t => t.isCity || t.type === 'village' || t.isSafe);
      if (baseTargets.length > 0) {
        let nearestBase = null;
        let minDistToBase = Infinity;

        baseTargets.forEach(b => {
          const d = Math.abs(enemy.x - b.x) + Math.abs(enemy.y - b.y);
          if (d < minDistToBase) {
            minDistToBase = d;
            nearestBase = b;
          }
        });

        if (nearestBase && minDistToBase > 0) {
          let bestBaseMove = null;
          let minDistanceAfterMove = minDistToBase;

          validMoves.forEach(m => {
            const d = Math.abs(m.x - nearestBase.x) + Math.abs(m.y - nearestBase.y);
            if (d < minDistanceAfterMove) {
              minDistanceAfterMove = d;
              bestBaseMove = m;
            }
          });

          if (bestBaseMove) {
            enemy.x = bestBaseMove.x;
            enemy.y = bestBaseMove.y;
            enemy.ap -= MapSchema.getTileMoveCost(getTile(bestBaseMove.x, bestBaseMove.y));
            const targetTile = getTile(bestBaseMove.x, bestBaseMove.y);
            addLog(`🏰 [적군 거점 압박] ${enemy.name}이(가) [${nearestBase.name}] 방면으로 전진 진격했습니다! -> [${targetTile ? targetTile.name : '타일'}](${bestBaseMove.x}, ${bestBaseMove.y}) (잔여 AP: ${enemy.ap})`, 'warning');
            renderAll();
            return true;
          }
        }
      }

      // ========================================================================
      // 우선순위 4: 정찰 및 배회 (Scout / Roam)
      // 플레이어 시작 지점(왕도 에테르니아 3, 4) 또는 생존 플레이어 방면으로 접근 탐색
      // ========================================================================
      const roamTarget = livingPlayers.length > 0 ? livingPlayers[0] : { x: 3, y: 4 };
      const curDistToRoam = Math.abs(enemy.x - roamTarget.x) + Math.abs(enemy.y - roamTarget.y);
      let bestRoamMove = null;
      let minRoamDist = curDistToRoam;

      validMoves.forEach(m => {
        const d = Math.abs(m.x - roamTarget.x) + Math.abs(m.y - roamTarget.y);
        if (d < minRoamDist) {
          minRoamDist = d;
          bestRoamMove = m;
        }
      });

      if (!bestRoamMove && validMoves.length > 0) {
        // 거리 감소가 없더라도 무작위 배회 탐색
        bestRoamMove = validMoves[Math.floor(Math.random() * validMoves.length)];
      }

      if (bestRoamMove) {
        enemy.x = bestRoamMove.x;
        enemy.y = bestRoamMove.y;
        enemy.ap -= MapSchema.getTileMoveCost(getTile(bestRoamMove.x, bestRoamMove.y));
        const targetTile = getTile(bestRoamMove.x, bestRoamMove.y);
        addLog(`🧭 [적군 수색 정찰] ${enemy.name}이(가) 아군 거점 방면을 수색 정찰 중입니다 -> [${targetTile ? targetTile.name : '타일'}](${bestRoamMove.x}, ${bestRoamMove.y}) (잔여 AP: ${enemy.ap})`, 'warning');
        renderAll();
        return true;
      }

      return false;
    }

    async function processEnemyTurn() {
      isEnemyTurnProcessing = true;
      updateTurnUIState();
      addLog(`👾 [적 AI 군단 턴 개시] 적 유닛들이 작전을 개시합니다...`, 'warning');
      renderAll();
      await sleep(400);

      // 생존 적 유닛 AP 회복
      const aliveEnemies = state.enemyUnits.filter(e => !e.isDead);
      aliveEnemies.forEach(e => {
        e.owner = 'ENEMY';
        if (typeof e.baseAP !== 'number') e.baseAP = 2;
        e.ap = e.baseAP;
        if (window.SkillEngine && !e.enemySkillsPrepared) {
          SkillEngine.prepareEnemySkills(e);
          e.enemySkillsPrepared = true;
        }
      });
      // 적 턴 시작: 지속 피해/회복, 기절·둔화, 쿨다운 감소
      if (window.SkillEngine) {
        SkillEngine.startSideTurn('ENEMY');
        renderAll();
      }

      // 각 적 유닛 순차적으로 행동 실행 (async/await 딜레이 350ms~500ms)
      for (const enemy of aliveEnemies) {
        if (enemy.isDead) continue;
        if (isDeployedForceWiped()) break;

        while (enemy.ap > 0 && !enemy.isDead) {
          const acted = await executeEnemyDecision(enemy);
          if (!acted) break; // 더 이상 가능한 행동이 없으면 다음 유닛으로
          await sleep(350);
        }
      }

      addLog(`🛡️ [적 AI 작전 완료] 적 군단의 모든 행동이 완료되었습니다.`, 'system');
      if (window.SkillEngine) SkillEngine.endRound();
      await sleep(300);
      isEnemyTurnProcessing = false;
      updateTurnUIState();
      if (typeof window.checkTacticalVictory === 'function') {
        window.checkTacticalVictory();
      }
      renderAll();
    }

    // 유닛 1기의 턴당 유지비. 턴 종료 정산과 전략 화면 표시가 같은 값을 쓴다 (값이 없으면 10G).
    function getUnitUpkeep(u) {
      const v = Number(u && u.upkeep);
      return scaleGold(Number.isFinite(v) && v >= 0 ? v : 10); // 기준 유지비 × 물가
    }
    window.getUnitUpkeep = getUnitUpkeep;

    async function executeEndTurn() {
      if (isEnemyTurnProcessing) return;
      if (getDeployPhase()) { addLog('👁️ [기시감] 먼저 아군 배치를 끝내세요 ("배치 완료").', 'warning'); return; }
      saveHistorySnapshot();

      // 1. 플레이어 턴 종료
      addLog(`🔚 [제 ${state.turn}턴 아군 작전 종료] 지휘관의 턴이 마감되었습니다.`, 'system');

      // 2. 필드 유닛 유지비 차감
      const livingUnits = state.playerUnits.filter(u => !u.isDead);
      let totalUpkeepNeeded = 0;
      let fieldUnits = [];
      let safeUnits = 0;

      livingUnits.forEach(unit => {
        const tile = getTile(unit.x, unit.y);
        // 마을(1x1) 및 도시(2x2)는 유지비 0G 완전 면제
        if (tile && tile.isSafe) {
          unit.isInactivated = false;
          safeUnits++;
        } else {
          totalUpkeepNeeded += getUnitUpkeep(unit);
          fieldUnits.push(unit);
        }
      });

      addLog(`🌾 [유지비 정산] 안전지대 주둔: ${safeUnits}기(0G 면제), 필드 유닛: ${fieldUnits.length}기(청구액: ${totalUpkeepNeeded}G)`, 'gold');

      if (state.gold >= totalUpkeepNeeded) {
        state.gold -= totalUpkeepNeeded;
        fieldUnits.forEach(u => u.isInactivated = false);
        addLog(`✅ 유지비 ${totalUpkeepNeeded}G 정상 납부 완료. (보유 잔액: ${state.gold}G)`, 'gold');
      } else {
        // 골드 부족: 고레벨 유닛부터 지불, 부족한 유닛은 영구 사망이 아닌 'isInactivated' 처리
        addLog(`⚠️ [골드 부족 경보!] 보유 골드(${state.gold}G)가 유지비(${totalUpkeepNeeded}G)보다 부족합니다!`, 'danger');
        fieldUnits.sort((a, b) => b.level - a.level);
        let curGold = state.gold;
        fieldUnits.forEach(u => {
          if (curGold >= getUnitUpkeep(u)) {
            curGold -= getUnitUpkeep(u);
            u.isInactivated = false;
          } else {
            u.isInactivated = true;
            addLog(`⛔ [체납 비활성화] ${u.name}(Lv.${u.level}) -> 작전 정지 (사망하지 않음)`, 'warning');
          }
        });
        state.gold = curGold;
      }

      currentInteractionMode = null;
      renderAll();
      saveGameState();

      // 유지비 정산 후 보유 골드가 0이면 전투 패배 처리 후 전략 화면으로 복귀한다.
      // 12단계: 패배도 finishEncounter()를 거친다 (노드는 완료되지 않고, 같은 노드에 다시 도전할 수 있다).
      if (Number(state.gold) <= 0) {
        addLog('💀 [패배] 유지비 정산 후 보유 골드가 0G가 되어 작전을 지속할 수 없습니다.', 'danger');
        finishEncounter({ victory: false, reason: 'bankrupt' });
        window.alert('패배했습니다. 유지비를 지불한 후 보유 골드가 0원이 되어 전략 화면으로 돌아갑니다.');
        return;
      }

      // 의무병 승급: 턴 종료 시 본인·인접 아군 회복
      applyMedicHealing();
      renderAll();

      // 3. 적 AI 턴 시작 (processEnemyTurn)
      await processEnemyTurn();

      // 4. 플레이어 턴 개시 및 AP 리셋
      state.turn += 1;
      addLog(`========== [제 ${state.turn}턴 아군 작전 개시] ==========`, 'system');

      const currentLiving = state.playerUnits.filter(u => !u.isDead);
      currentLiving.forEach(u => {
        u.ap = u.isInactivated ? 0 : u.baseAP;
        // 고유 스킬 쿨다운 1턴 감소 및 버프 리셋
        if (u.customSkillCooldown && u.customSkillCooldown > 0) {
          u.customSkillCooldown -= 1;
          if (u.customSkillCooldown === 0 && u.customSkill) {
            addLog(`✨ [스킬 재사용 가능] ${u.name}의 고유 스킬 [${u.customSkill.name}] 쿨다운이 완료되었습니다!`, 'gold');
          }
        }
        u.customSkillBuffAtk = 0;
        u.customSkillBuffDef = 0;
        u.isGuarding = false;
        u.guardBonusDef = 0;
        u.stance = 'NORMAL';
      });
      // 아군 턴 시작: 지속 피해/회복, 기절·둔화, 패시브 AP, 스킬 쿨다운 감소
      if (window.SkillEngine) {
        SkillEngine.startSideTurn('PLAYER');
        applyRelicRegen();
        if (typeof checkPartyWipeout === 'function') checkPartyWipeout();
        if (typeof window.checkTacticalVictory === 'function') window.checkTacticalVictory();
      }
      skillTargeting = null;

      // 선택된 유닛 갱신 (적 턴 중 사망했을 수 있으므로)
      const sel = getSelectedUnit();
      if (!sel || sel.isDead) {
        const firstLiving = currentLiving[0];
        if (firstLiving) selectedUnitId = firstLiving.id;
      }

      currentInteractionMode = null;
      isEnemyTurnProcessing = false;
      updateTurnUIState();
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       Offline Defense Simulation (비동기 수비 모드)
       -------------------------------------------------------------------------- */
    function runOfflineDefenseSimulation() {
      closeAllModals();
      saveHistorySnapshot();

      addLog(`🛡️ [오프라인 수비 시뮬레이션 가동] 가상 침공 레이드가 발생했습니다!`, 'warning');

      const livingUnits = state.playerUnits.filter(u => !u.isDead);
      const safeUnits = [];
      const fieldUnits = [];

      livingUnits.forEach(u => {
        const t = getTile(u.x, u.y);
        if (t && t.isSafe) {
          safeUnits.push(u);
        } else {
          fieldUnits.push(u);
        }
      });

      addLog(`🏰 안전지대(마을/도시) 주둔 유닛 ${safeUnits.length}기는 완벽히 보호되었습니다.`, 'success');

      if (fieldUnits.length === 0) {
        addLog(`🎉 필드에 노출된 유닛이 없어 적 침공군이 아무것도 얻지 못하고 퇴각했습니다!`, 'success');
        renderAll();
        return;
      }

      // 필드 유닛은 방어 모드 보너스(+20% 방어력)로 방어 시도
      addLog(`⚔️ 필드 주둔 유닛 ${fieldUnits.length}기가 긴급 방어 진형을 전개합니다.`, 'combat');

      // 가상 적의 총 공격력 vs 아군 총 방어력
      const totalDef = fieldUnits.reduce((acc, u) => acc + (u.def * 1.2), 0);
      const enemyRaidPower = 80 + Math.floor(Math.random() * 80);

      addLog(`📊 [침공 전력] 가상 적군 공격력 ${enemyRaidPower} VS 아군 총 방어력 ${totalDef.toFixed(0)}`, 'combat');

      if (totalDef >= enemyRaidPower) {
        // 수비 성공
        addLog(`🎉 [수비 대성공!] 강력한 방패 장벽으로 야간 기습을 완벽 격퇴했습니다!`, 'success');
      } else {
        // 패배 시: 전멸하지 않고 가장 약한 유닛 1기만 탈취/사망!
        fieldUnits.sort((a, b) => (a.atk + a.def + a.hp) - (b.atk + b.def + b.hp));
        const weakest = fieldUnits[0];
        weakest.isDead = true;
        awardCommanderCasualtyExp(weakest);

        addLog(`💥 [방어선 돌파!] 적의 야간 공습으로 방어선이 무너졌습니다!`, 'danger');
        addLog(`💀 [유닛 1기 탈취] 전멸하지 않고 가장 약했던 [${weakest.name}] 1개만 탈취/사망 처리되었습니다!`, 'danger');
        addLog(`⏱️ [1시간 보호막] 잔여 부대 전체에 1시간(1턴) 동안 긴급 방어막이 부여되어 연속 피해가 차단됩니다.`, 'system');
      }

      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       City Unit Sale (2x2 도시 전용 유닛 매각)
       -------------------------------------------------------------------------- */
    function executeCitySell() {
      const unit = getSelectedUnit();
      if (!unit) return;

      const tile = getTile(unit.x, unit.y);
      if (!tile || !tile.isCity) {
        const msg = '⚠️ 도시(2x2) 타일에 위치한 유닛만 매각할 수 있습니다!';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      saveHistorySnapshot();

      // 매각 환급 공식: 기본금 + 레벨보너스 + 호감도보너스 + 승급보너스
      const baseMap = { KNIGHT: 220, MAGE: 200, FIREARM: 180, ARCHER: 150, MELEE: 120 };
      const baseGold = baseMap[unit.classType] || 120;
      const levelMult = 1 + (unit.level - 1) * 0.35;
      const affBonus = Math.round(unit.affection * 2.0);
      const refund = scaleGold(Math.round(baseGold * levelMult + affBonus)); // 매각가도 물가를 따라간다

      unit.isDead = true;
      Wallet.earn('earn_sell', refund);

      addLog(`🏛️ [도시 유닛 매각] ${unit.name} 명예 퇴역 완료 -> +${refund}G 국고 환급!`, 'gold');
      closeAllModals();
      renderAll();
      saveGameState();
    }

    function getAcademyUpgradeCost() {
      return typeof window.getGamePrice === 'function' ? window.getGamePrice('ACADEMY_UPGRADE') : 300;
    }

    // 레벨이 1 오를 때의 스탯 상승 (아카데미 진급 · 기억 계승 공통)
    const LEVEL_UP_GROWTH = { atk: 8, def: 6 };

    function executeCityUpgrade() {
      const unit = getSelectedUnit();
      if (!unit) return;
      const cost = getAcademyUpgradeCost();

      if (state.gold < cost) {
        const msg = `⚠️ 골드가 부족합니다! (필요: ${cost}G)`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      saveHistorySnapshot();
      state.gold -= cost;
      unit.level += 1;
      unit.atk += LEVEL_UP_GROWTH.atk;
      unit.def += LEVEL_UP_GROWTH.def;
      unit.maxHp += 20;
      unit.hp = unit.maxHp;
      unit.skillPoints = (Number(unit.skillPoints) || 0) + 1;
      if (!unit.promotions) unit.promotions = {};
      if (Array.isArray(unit.promotions)) {
        // 승급(배열) 형식: 단계는 unit.combatRank에 쌓고, 전투 승급 사다리(combat_1~4)도 맞춰 준다.
        unit.combatRank = getCombatRank(unit) + 1;
        for (let i = 1; i <= Math.min(unit.combatRank, 4); i++) {
          if (!unit.promotions.includes(`combat_${i}`)) unit.promotions.push(`combat_${i}`);
        }
      } else {
        unit.promotions.combatRank = (unit.promotions.combatRank || 0) + 1;
      }

      addLog(`⚔️ [아카데미 진급] ${unit.name} 레벨업! (Lv.${unit.level}, 공 +8, 방 +6, 최대 HP +20, 스킬 해금권 +1) -${cost}G`, 'gold');
      closeAllModals();
      renderAll();
      saveGameState();
      notifyUnitGrowth(unit, `${unit.name} 레벨업! Lv.${unit.level}`, ['공격 +8 · 방어 +6 · 최대 HP +20', '스킬 해금권 +1']);
    }

    /* --------------------------------------------------------------------------
       Village Store Items (호감도 과일, 만찬, 리와인더)
       -------------------------------------------------------------------------- */
    function buyVillageItem(type, baseCost, affAdd) {
      const cost = scaleGold(baseCost); // 기준가 × 물가
      if (state.gold < cost) {
        const msg = `⚠️ 골드가 부족합니다! (필요: ${cost}G)`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      const unit = getSelectedUnit();
      if (type === 'REWIND') {
        saveHistorySnapshot();
        state.gold -= cost;
        state.rewinders += 1;
        addLog(`⏳ [리와인더 충전] 시공간 리와인더 1개 충전 완료! (보유: ${state.rewinders}개)`, 'gold');
        closeAllModals();
        renderAll();
        saveGameState();
        return;
      }

      if (!unit) {
        const msg = '⚠️ 호감도를 부여할 유닛을 먼저 선택하세요!';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      saveHistorySnapshot();
      state.gold -= cost;
      unit.affection = Math.min(100, getUnitAffection(unit) + affAdd);
      unit.favorability = unit.affection;
      addLog(`🎁 [선물 증정] ${unit.name}에게 보급품을 전달하여 호감도가 +${affAdd} 상승했습니다! (현재: ${unit.affection})`, 'success');
      closeAllModals();
      renderAll();
      saveGameState();
    }

    /* --------------------------------------------------------------------------
       UI Rendering & Event Listeners
       -------------------------------------------------------------------------- */
    function renderGrid() {
      const mapEl = document.getElementById('grid-map');
      if (!mapEl) return;
      mapEl.innerHTML = '';

      // 전술 화면의 맵 원본은 현재 전투 객체 하나만 사용한다.
      // LEGACY: state.tiles / 전역 tiles / 기본맵을 여기서 fallback으로 사용하지 않는다.
      const battleMap = state?.currentBattle?.map || null;
      // 7단계: SECTOR_MAP(전술 화면)인데 battleMap이 없으면 렌더 자체를 막지는 않되(빈 화면으로
      // 넘어가는 대신 UI가 멈추지 않게), 개발자에게는 getActiveBattleMap()과 동일한 오류를 콘솔에 남긴다.
      if (!battleMap && state?.currentView === 'SECTOR_MAP') {
        try { getActiveBattleMap(); } catch (err) { console.error(err.message); }
      }
      const currentTiles = Array.isArray(battleMap?.tiles) ? battleMap.tiles : [];
      const colCount = Number(battleMap?.cols) || 8;
      const rowCount = Number(battleMap?.rows) || 14;

      mapEl.style.display = 'grid';
      mapEl.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;
      mapEl.style.gridTemplateRows = `repeat(${rowCount}, 1fr)`;
      mapEl.style.setProperty('--grid-cols', colCount);
      mapEl.style.setProperty('--grid-rows', rowCount);
      if (colCount === 8 && rowCount === 14) {
        mapEl.classList.add('grid-8x14');
      } else {
        mapEl.classList.remove('grid-8x14');
      }

      // 배경 일러스트가 있는 맵: 그림을 그리드 전체에 깔고 타일은 투명한 격자로만 그린다.
      const bgUrl = battleMap?.background || null;
      mapEl.classList.toggle('has-bg', !!bgUrl);
      mapEl.style.backgroundImage = bgUrl ? `url("${encodeURI(bgUrl)}")` : '';

      const selUnit = getExplicitSelectedUnit();
      let moveTiles = [];
      let attackTiles = [];
      const zocTiles = computeZocTiles();

      // 스킬 대상 선택 중이면 이동/공격 표시 대신 스킬 대상 칸을 표시한다.
      let skillValid = [];
      let skillCaster = null;
      let skillObj = null;
      if (skillTargeting && window.SkillEngine) {
        skillCaster = state.playerUnits.find(u => u.id === skillTargeting.unitId && !u.isDead) || null;
        skillObj = skillCaster ? SkillEngine.getUnitSkills(skillCaster).find(sk => sk.id === skillTargeting.skillId) : null;
        if (skillCaster && skillObj) skillValid = SkillEngine.getValidTargets(skillCaster, skillObj);
        else cancelSkillTargeting(true);
      }

      if (!skillTargeting && selUnit && !selUnit.isDead && !selUnit.isInactivated && selUnit.ap > 0) {
        // 이동 범위 (상하좌우 1~2칸 맨해튼 거리)
        const range = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;
        const attackRange = getUnitAttackRange(selUnit); // 유물 사거리는 공격에만 더해진다
        currentTiles.forEach(t => {
          const dist = Math.abs(t.x - selUnit.x) + Math.abs(t.y - selUnit.y);
          if (dist > 0 && dist <= attackRange) {
            const hasEnemy = state.enemyUnits.some(e => !e.isDead && e.x === t.x && e.y === t.y);
            if (hasEnemy) {
              attackTiles.push(t);
            } else if (dist <= range && getUnitMoveCost(selUnit, t) <= selUnit.ap) {
              // 적이 없는 타일은 빈 타일 및 아군 유닛이 이미 있는 타일 모두 이동/중첩 가능! (AP가 지형 비용 이상일 때)
              moveTiles.push(t);
            }
          }
        });
      }

      currentTiles.forEach(t => {
        const tileDiv = document.createElement('div');
        const terrainType = t.terrain || t.type || 'plain';
        tileDiv.className = `tile ${terrainType}`;
        tileDiv.dataset.x = t.x;
        tileDiv.dataset.y = t.y;
        if (skillTargeting && skillObj) {
          if (skillCaster.x === t.x && skillCaster.y === t.y) tileDiv.classList.add('skill-caster');
          if (skillValid.some(p => p.x === t.x && p.y === t.y)) {
            tileDiv.classList.add('skill-target');
            tileDiv.onmouseenter = () => previewSkillArea(skillCaster, skillObj, t.x, t.y);
            tileDiv.onmouseleave = () => previewSkillArea(null);
          }
        }
        if (t.hasRoad) tileDiv.classList.add('has-road');
        if (t.structure) tileDiv.classList.add(`structure-${t.structure}`);

        const isSelected = selUnit && selUnit.x === t.x && selUnit.y === t.y;
        if (isSelected) tileDiv.classList.add('selected');

        const isZoc = zocTiles.some(zt => zt.x === t.x && zt.y === t.y);
        if (isZoc) tileDiv.classList.add('zoc-zone');

        // 스마트 모드: 유닛이 선택되면 이동 및 공격 가능 타일이 자동으로 활성화됨
        const canMove = moveTiles.some(mt => mt.x === t.x && mt.y === t.y);
        if (canMove) tileDiv.classList.add('move-target');

        const canAttack = attackTiles.some(at => at.x === t.x && at.y === t.y);
        if (canAttack) tileDiv.classList.add('attack-target');

        // 지형 방어 보너스 뱃지 & 스마트 액션 인디케이터
        const defPct = Math.round(MapSchema.getTileDefBonus(t) * 100);
        let actionIcon = '';
        if (canAttack) {
          actionIcon = '<span class="tile-action-indicator attack" title="클릭 시 즉시 자동 전투 개시!">⚔️</span>';
        } else if (canMove) {
          const moveCost = getUnitMoveCost(selUnit, t);
          actionIcon = moveCost > 1
            ? `<span class="tile-action-indicator move" title="클릭 시 즉시 이동 (AP ${moveCost} 소모)">👟${moveCost}</span>`
            : '<span class="tile-action-indicator move" title="클릭 시 즉시 이동">👟</span>';
        }

        const terrainIcons = {
          plain: '🌱', forest: '🌲', hill: '⛰️', mountain: '🏔️', river: '〰️', sea: '🌊'
        };
        const terrainIcon = terrainIcons[terrainType] || t.terrainIcon || '🌱';
        const structureIcons = { city: '🏰', village: '🏡', resource: '💎', tree: '🌴' };
        const structureIcon = structureIcons[t.structure] || '';
        const roadBadge = t.hasRoad ? '<span class="tile-road-dot" title="도로 (AP 할인)">🛣️</span>' : '';

        // 시드 변형으로 생긴 숲은 배경 그림에 없으므로 나무 스프라이트를 덧그린다.
        if (bgUrl) {
          const terrainNames = { plain: '평야', forest: '숲', hill: '언덕', mountain: '암벽', river: '강', sea: '바다' };
          tileDiv.title = `${t.name || terrainNames[terrainType] || terrainType}${defPct ? ` (방어 ${defPct > 0 ? '+' : ''}${defPct}%)` : ''}`;
        }
        const decorSprite = (bgUrl && t.decor === 'tree') ? '<span class="tile-decor-tree" aria-hidden="true"></span>' : '';

        tileDiv.innerHTML = `
          ${decorSprite}
          <span class="tile-def-badge">${defPct !== 0 ? (defPct > 0 ? '+' : '') + defPct + '%' : ''}</span>
          ${roadBadge}
          ${(bgUrl && !structureIcon) ? '' : `<span class="tile-terrain-icon">${structureIcon || terrainIcon}</span>`}
          ${actionIcon}
        `;

        // 타일 위 유닛 렌더링 (다중 유닛 중첩 지원)
        const pUnits = state.playerUnits.filter(u => !u.isDead && u.x === t.x && u.y === t.y);
        const eUnits = state.enemyUnits.filter(u => !u.isDead && u.x === t.x && u.y === t.y);

        if (pUnits.length > 0) {
          // 해당 타일에서 전면에 표시할 유닛 결정 (현재 선택된 유닛 우선)
          const topUnit = pUnits.find(u => u.id === selectedUnitId) || pUnits[0];
          if (pUnits.length > 1) tileDiv.classList.add('has-stack');
          tileDiv.appendChild(buildUnitToken(topUnit, pUnits, 'player'));
        } else if (eUnits.length > 0) {
          const topUnit = eUnits.find(e => e.id === debugInspectedEnemyId) || eUnits.slice().sort((a, b) => b.def - a.def)[0];
          if (eUnits.length > 1) tileDiv.classList.add('has-stack');
          tileDiv.appendChild(buildUnitToken(topUnit, eUnits, 'enemy'));
        }

        // 클릭 이벤트
        tileDiv.onclick = () => onTileClicked(t);
        mapEl.appendChild(tileDiv);
      });
      decorateDeployPhase(mapEl);
      renderDeployBanner();

      // 직접 선택한 유닛이 바뀐 순간에만 큰 얼굴 말풍선을 띄운다 (재렌더마다 다시 띄우지 않음).
      // getSelectedUnit()은 선택이 없어도 첫 유닛을 돌려주므로 selectedUnitId로 직접 찾는다.
      const bubbleUnit = selectedUnitId ? state.playerUnits.find(u => u.id === selectedUnitId && !u.isDead) || null : null;
      if (bubbleUnit && bubbleUnit.id !== lastTokenBubbleUnitId) showUnitTokenBubble(bubbleUnit, 'player');
      lastTokenBubbleUnitId = bubbleUnit ? bubbleUnit.id : null;
    }

    /* --------------------------------------------------------------------------
       맵 유닛 토큰 — 원형 얼굴 + 팀색 HP 링, 병과·중첩·상태는 원 밖 칩
       -------------------------------------------------------------------------- */
    function buildUnitToken(topUnit, stackUnits, side) {
      const hpPct = Math.max(0, Math.min(100, (topUnit.hp / topUnit.maxHp) * 100));
      const stacked = stackUnits.length > 1;
      const uDiv = document.createElement('div');
      uDiv.className = `unit-avatar unit-token unit-${side}${stacked ? ' stacked-card' : ''}${hpPct < 35 ? ' hp-low' : ''}`;
      uDiv.dataset.unitId = topUnit.id;
      uDiv.style.setProperty('--hp', hpPct.toFixed(1));
      uDiv.title = `${topUnit.name} · HP ${topUnit.hp}/${topUnit.maxHp}`;
      uDiv.innerHTML = renderPortrait(topUnit, { className: 'unit-token-face' });

      const badge = document.createElement('span');
      badge.className = 'unit-class-badge';
      badge.textContent = (topUnit.classType || topUnit.unitClass || '?')[0];
      uDiv.appendChild(badge);

      if (stacked) {
        const stackBadge = document.createElement('span');
        stackBadge.className = `unit-stack-badge${side === 'enemy' ? ' enemy' : ''}`;
        stackBadge.textContent = stackUnits.length;
        stackBadge.title = side === 'enemy'
          ? `${stackUnits.length}기 적군 밀집 중첩`
          : `${stackUnits.length}기 아군 중첩 (클릭 시 순환 선택)`;
        uDiv.appendChild(stackBadge);
      }
      appendStatusIcons(uDiv, stackUnits);

      if (topUnit.isInactivated) {
        const inactBadge = document.createElement('div');
        inactBadge.className = 'unit-inactivated-badge';
        inactBadge.textContent = '정지';
        uDiv.appendChild(inactBadge);
      }
      return uDiv;
    }

    // 선택/정찰한 유닛 위에 큰 얼굴 + 이름·HP 말풍선을 잠깐 띄운다.
    // #viewport에 붙이므로 그리드가 다시 그려져도 사라지지 않는다.
    let lastTokenBubbleUnitId = null;
    let tokenBubbleTimer = null;

    function showUnitTokenBubble(unit, side) {
      const viewport = document.getElementById('viewport');
      const tileEl = document.querySelector(`#grid-map .tile[data-x="${unit.x}"][data-y="${unit.y}"]`);
      if (!viewport || !tileEl) return;
      viewport.querySelector('.unit-token-bubble')?.remove();
      clearTimeout(tokenBubbleTimer);

      const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
      const cls = unit.classType || unit.unitClass;
      const clsName = (CLASS_META[cls]?.name || cls || '').split(' ')[0];
      const bubble = document.createElement('div');
      bubble.className = `unit-token-bubble ${side}`;
      bubble.innerHTML = `
        <div class="utb-face">${renderPortrait(unit, { emojiSize: '34px' })}</div>
        <div class="utb-info">
          <div class="utb-name"></div>
          <div class="utb-meta">${side === 'enemy' ? '적' : '아군'} · ${escapeGachaHtml(clsName)} · Lv.${unit.level || 1}</div>
          <div class="utb-hp"><i class="${hpPct < 35 ? 'low' : ''}" style="width:${hpPct}%"></i></div>
          <div class="utb-meta">HP ${unit.hp}/${unit.maxHp}</div>
        </div>`;
      bubble.querySelector('.utb-name').textContent = unit.name;
      viewport.appendChild(bubble);

      // 타일 위에 띄우고, 위쪽 공간이 없으면 아래로 뒤집는다. 좌우는 화면 안으로 맞춘다.
      const vr = viewport.getBoundingClientRect();
      const tr = tileEl.getBoundingClientRect();
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight, gap = 10;
      const tileCx = tr.left - vr.left + tr.width / 2;
      const left = Math.min(Math.max(tileCx - bw / 2, 4), vr.width - bw - 4);
      let top = tr.top - vr.top - bh - gap;
      if (top < 4) {
        top = tr.bottom - vr.top + gap;
        bubble.classList.add('below');
      }
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.setProperty('--tail', `${tileCx - left - 6}px`);

      tokenBubbleTimer = setTimeout(() => {
        bubble.classList.add('fade');
        setTimeout(() => bubble.remove(), 300);
      }, 2500);
    }

    function onTileClicked(tile) {
      if (isEnemyTurnProcessing) {
        addLog('⏳ 적 AI 군단이 작전을 수행 중입니다. 잠시만 기다려주세요...', 'system');
        return;
      }
      if (window.isCombatPaused || (state && state.isCombatPaused) || (window.playerState && window.playerState.isCombatPaused)) {
        addLog('⏸️ [전투 일시정지 중] 전술 작전이 일시 정지되었습니다. 일시 정지 메뉴에서 전투를 재개해주세요.', 'warning');
        return;
      }
      if (getDeployPhase()) { handleDeployClick(tile); return; }
      if (skillTargeting) {
        castTargetedSkillAt(tile.x, tile.y);
        return;
      }
      const selUnit = getExplicitSelectedUnit();
      const pUnits = state.playerUnits.filter(u => !u.isDead && u.x === tile.x && u.y === tile.y);
      const eUnits = state.enemyUnits.filter(u => !u.isDead && u.x === tile.x && u.y === tile.y);

      // 고정되지 않은 부대 사이드 패널은 다른 칸을 누르면 바로 닫는다
      if (squadPanel.open && !squadPanel.pinned && pUnits.length < 2) hideSquadPanel();

      // 디버그 패널 소환 좌표 동기화
      debugParams.targetSpawnCoord = { x: tile.x, y: tile.y };
      const coordEl = document.getElementById('lbl-spawn-target-coord');
      if (coordEl) coordEl.textContent = `타일 (X:${tile.x}, Y:${tile.y}) - ${tile.name}`;
      const numX = document.getElementById('num-spawn-x');
      const numY = document.getElementById('num-spawn-y');
      if (numX) numX.value = tile.x;
      if (numY) numY.value = tile.y;

      // ------------------------------------------------------------------------
      // CASE 1: 아군 유닛이 이미 선택되어 있는 상태 (스마트 이동 & 자동 교전 엔진)
      // ------------------------------------------------------------------------
      if (selUnit && !selUnit.isDead) {
        const dist = Math.abs(tile.x - selUnit.x) + Math.abs(tile.y - selUnit.y);
        const range = state.commander.unlockedSkills.RapidAdvance ? 2 : 1;
        const attackRange = getUnitAttackRange(selUnit); // 유물 사거리는 공격에만 더해진다

        // 1-A. 동일 타일(자기 자신 주둔지) 터치 시: 중첩 유닛 순환 선택
        if (dist === 0) {
          if (pUnits.length > 1) {
            const curIdx = pUnits.findIndex(u => u.id === selectedUnitId);
            const nextIdx = (curIdx + 1) % pUnits.length;
            selectedUnitId = pUnits[nextIdx].id;
            addLog(`👥 [중첩 부대 순환] ${pUnits[nextIdx].name} 선택 (${nextIdx + 1}/${pUnits.length}기) - 다시 터치 시 다음 부대원`, 'system');
            if (!squadPanel.pinned) showSquadPanel();
          } else {
            addLog(`ℹ️ [유닛 대기] ${selUnit.name} (현재 타일 위치 유지)`, 'system');
          }
          renderAll();
          updateDebugInspector();
          return;
        }

        // 1-B. 이동/사거리 범위 내 타일 터치 시 (dist <= range)
        if (dist <= (eUnits.length > 0 ? attackRange : range) && !selUnit.isInactivated && selUnit.ap > 0) {
          // ⚔️ 적이 주둔 중인 타일 -> 자동 즉시 전투 (Auto-Combat) 개시!
          if (eUnits.length > 0) {
            const targetDefender = eUnits.find(e => e.id === cardInspectedEnemyId) || eUnits.find(e => e.id === debugInspectedEnemyId) || eUnits.slice().sort((a, b) => b.def - a.def)[0];
            cardInspectedEnemyId = targetDefender.id;
            debugInspectedEnemyId = targetDefender.id;
            addLog(`🎯 [스마트 자동 교전] ${selUnit.name} -> 적 ${targetDefender.name} 위치로 진격하여 자동 전투를 시작합니다!`, 'combat');
            executeCombat(selUnit, targetDefender);
            return;
          }

          // 👟 적이 없는 타일 (빈 타일 또는 다른 아군 타일) -> 즉시 이동/중첩 집결!
          executeMove(selUnit, tile.x, tile.y);
          return;
        }

        // 1-C. 사거리 밖이지만 다른 아군이 있는 타일을 터치한 경우 -> 해당 아군으로 유닛 선택 전환!
        if (pUnits.length > 0) {
          selectedUnitId = pUnits[0].id;
          userCardViewPreference = 'AUTO';
          cardInspectedEnemyId = null;
          if (pUnits.length > 1) {
            addLog(`👥 [중첩 부대 전환] (${tile.x}, ${tile.y}) 타일의 ${pUnits[0].name} 선택 (총 ${pUnits.length}기 중첩)`, 'system');
            showSquadPanel();
          } else {
            addLog(`🎯 [유닛 선택 전환] ${pUnits[0].name} 선택 - 이동 및 교전 가능 범위가 갱신되었습니다.`, 'system');
          }
          openFullShotOverlay();
          renderAll();
          updateDebugInspector();
          return;
        }

        // 1-D. 사거리 밖의 적 타일 터치 시 -> 정찰 정보 표시 및 디버그 타겟 지정
        if (eUnits.length > 0) {
          const defUnit = eUnits.find(e => e.id === debugInspectedEnemyId) || eUnits.slice().sort((a, b) => b.def - a.def)[0];
          debugInspectedEnemyId = defUnit.id;
          cardInspectedEnemyId = defUnit.id;
          showUnitTokenBubble(defUnit, 'enemy');
          const stackNote = eUnits.length > 1 ? ` (적군 총 ${eUnits.length}기 밀집 중첩!)` : '';
          addLog(`🔍 [사거리 밖 적 정찰] ${defUnit.name} (공 ${defUnit.atk}, 방 ${defUnit.def}, HP ${defUnit.hp}/${defUnit.maxHp})${stackNote} - 현재 사거리(${range}칸) 밖입니다.`, 'combat');
          updateDebugInspector();
          return;
        }

        // 1-E. 사거리 밖의 마을/도시 터치 시 상점 열기
        if (tile.type === 'village') {
          openVillageModal();
          return;
        }
        if (tile.type === 'city') {
          openCityModal();
          return;
        }

        // 1-F. 사거리 밖의 빈 타일 터치 시 -> 유닛 선택 해제 및 풀샷 창 닫기
        selectedUnitId = null;
        closeFullShotOverlay();
        renderAll();
        addLog(`ℹ️ [선택 해제] 전장 맵을 확인하기 위해 유닛 선택 및 풀샷 창을 닫았습니다.`, 'system');
        return;
      }

      // ------------------------------------------------------------------------
      // CASE 2: 선택된 유닛이 없는 상태에서 타일을 클릭한 경우
      // ------------------------------------------------------------------------
      if (pUnits.length > 0) {
        selectedUnitId = pUnits[0].id;
        userCardViewPreference = 'AUTO';
        cardInspectedEnemyId = null;
        addLog(`🎯 [유닛 선택] ${pUnits[0].name} 선택 - 이동(초록) 및 공격(빨강) 가능 범위가 표시됩니다.`, 'system');
        if (pUnits.length > 1) showSquadPanel();
        openFullShotOverlay();
        renderAll();
        updateDebugInspector();
        return;
      }

      if (eUnits.length > 0) {
        const defUnit = eUnits[0];
        debugInspectedEnemyId = defUnit.id;
        showUnitTokenBubble(defUnit, 'enemy');
        addLog(`🔍 [적 정찰] ${defUnit.name} (공 ${defUnit.atk}, 방 ${defUnit.def}, HP ${defUnit.hp}/${defUnit.maxHp})`, 'combat');
        updateDebugInspector();
        return;
      }

      if (tile.type === 'village') {
        openVillageModal();
        return;
      }
      if (tile.type === 'city') {
        openCityModal();
        return;
      }

      selectedUnitId = null;
      closeFullShotOverlay();
      currentInteractionMode = null;
      renderAll();
    }

    /* --------------------------------------------------------------------------
       Battle Victory Odds View Renderer (전투 승리 확률 카드 인터페이스)
       -------------------------------------------------------------------------- */
    function renderOddsFactorPanel(odds, attacker, defender) {
      const panel = document.getElementById('odds-fx-panel');
      const trigger = document.querySelector('#unit-card-odds-view .odds-rate-badge');
      if (!panel || !trigger) return;
      if (!trigger.dataset.fxBound) {
        trigger.dataset.fxBound = '1';
        const wrap = trigger.closest('.unit-card-odds');
        const open = v => panel.classList.toggle('open', v);
        trigger.addEventListener('mouseenter', () => open(true));
        wrap.addEventListener('mouseleave', () => open(false));
        trigger.addEventListener('click', ev => { ev.stopPropagation(); open(!panel.classList.contains('open')); });
      }
      const row = f => {
        const val = f.pct === null || f.pct === undefined ? '' : `<b class="${f.pct > 0 ? 'up' : 'down'}">${f.pct > 0 ? '+' : ''}${f.pct}%</b>`;
        return `<div class="odds-fx-row"><span>${escapeGachaHtml(f.label)}</span>${val}</div>`;
      };
      const section = (title, base, list) => `
        <div class="odds-fx-sec">
          <div class="odds-fx-head"><span>${title}</span><b>${base}</b></div>
          ${list.length ? list.map(row).join('') : '<div class="odds-fx-row none"><span>적용된 보정 없음</span></div>'}
        </div>`;
      const by = side => odds.factors.filter(f => f.side === side);
      const hpPct = u => { const m = Number(u.maxHp) > 0 ? Number(u.maxHp) : 100; return Math.round((Math.max(0, Number(u.hp) || 0) / m) * 100); };
      panel.innerHTML = `
        <div class="odds-fx-title">📊 승률 산출 근거 <small>P = 공격 ÷ (공격 + 방어)</small></div>
        <div class="odds-fx-cols">
          ${section(`⚔️ ${escapeGachaHtml(attacker.name)} 공격`, `${odds.effectiveAtk.toFixed(1)} → ${odds.finalAtk.toFixed(1)}`,
            [{ side: 'atk', label: `유효 공격력 (HP ${hpPct(attacker)}% 반영)`, pct: null }, ...by('atk')])}
          ${section(`🛡️ ${escapeGachaHtml(defender.name)} 방어`, `${odds.effectiveDef.toFixed(1)} → ${odds.finalDef.toFixed(1)}`,
            [{ side: 'def', label: `유효 방어력 (HP ${hpPct(defender)}% 반영)`, pct: null }, ...by('def')])}
        </div>
        ${by('win').length ? `<div class="odds-fx-sec">${by('win').map(row).join('')}</div>` : ''}
        <div class="odds-fx-result">최종 승률 <b>${odds.winPercent}%</b></div>`;
    }

    function renderBattleOddsView(attacker, inRangeEnemies) {
      if (!attacker || !inRangeEnemies || inRangeEnemies.length === 0) return;

      // 대상 방어 유닛 결정 (현재 주시 중인 적 우선)
      let defender = inRangeEnemies.find(e => e.id === cardInspectedEnemyId) ||
                     inRangeEnemies.find(e => e.id === debugInspectedEnemyId) ||
                     inRangeEnemies[0];
      cardInspectedEnemyId = defender.id;
      debugInspectedEnemyId = defender.id;

      // 승률 계산 (getCombatOdds)
      const odds = getCombatOdds(attacker, defender);
      if (!odds) return;

      // 1. 공격측 (플레이어) 렌더링
      const atkAvatar = document.getElementById('odds-atk-avatar');
      const atkName = document.getElementById('odds-atk-name');
      const atkPower = document.getElementById('odds-atk-power');
      if (atkAvatar) atkAvatar.textContent = attacker.avatar;
      if (atkName) atkName.textContent = attacker.name;
      if (atkPower) atkPower.textContent = odds.finalAtk.toFixed(1);

      // 2. 방어측 (적군) 렌더링
      const defAvatar = document.getElementById('odds-def-avatar');
      const defName = document.getElementById('odds-def-name');
      const defPower = document.getElementById('odds-def-power');
      if (defAvatar) defAvatar.textContent = defender.avatar;
      if (defName) defName.textContent = defender.name;
      if (defPower) {
        const bonusTxt = odds.tileDefBonus > 0 ? `<span style="font-size:7px; opacity:0.85; margin-left:1px;">(+${Math.round(odds.tileDefBonus * 100)}%)</span>` : '';
        defPower.innerHTML = `${odds.finalDef.toFixed(1)}${bonusTxt}`;
      }

      // 3. 중앙 승률 및 게이지 바
      const winRateEl = document.getElementById('odds-win-rate');
      const statusTagEl = document.getElementById('odds-status-tag');
      const meterFillEl = document.getElementById('odds-meter-fill');

      const P = odds.P;
      const winPct = (P * 100).toFixed(1);

      let statusText = '호각';
      let statusBg = '#fef3c7';
      let statusColor = '#b45309';
      let meterColor = '#f59e0b';
      let rateColor = '#d97706';

      if (odds.isDangerAffection) {
        statusText = '🚫 거부위험';
        statusBg = '#fee2e2';
        statusColor = '#b91c1c';
        meterColor = '#ef4444';
        rateColor = '#dc2626';
      } else if (P >= 0.70) {
        statusText = '🛡️ 압도/유리';
        statusBg = '#dcfce7';
        statusColor = '#15803d';
        meterColor = '#10b981';
        rateColor = '#16a34a';
      } else if (P <= 0.35) {
        statusText = '⚠️ 불리/위험';
        statusBg = '#fee2e2';
        statusColor = '#b91c1c';
        meterColor = '#ef4444';
        rateColor = '#dc2626';
      }

      if (winRateEl) {
        winRateEl.textContent = `${winPct}%`;
        winRateEl.style.color = rateColor;
      }
      if (statusTagEl) {
        statusTagEl.textContent = statusText;
        statusTagEl.style.backgroundColor = statusBg;
        statusTagEl.style.color = statusColor;
      }
      if (meterFillEl) {
        meterFillEl.style.width = `${Math.min(100, Math.max(0, P * 100))}%`;
        meterFillEl.style.backgroundColor = meterColor;
      }

      // 3-1. 승률 산출 근거 슬라이드 (승률 표시에 마우스를 올리거나 탭하면 펼쳐진다)
      renderOddsFactorPanel(odds, attacker, defender);

      // 4. 복수 적군 대상 선택 칩 렌더링
      const chipsContainer = document.getElementById('odds-target-chips');
      if (chipsContainer) {
        if (inRangeEnemies.length > 1) {
          chipsContainer.style.display = 'flex';
          chipsContainer.innerHTML = inRangeEnemies.map(e => {
            const eOdds = getCombatOdds(attacker, e);
            const ePct = eOdds ? `${Math.round(eOdds.P * 100)}%` : '';
            return `
              <button class="odds-target-chip ${e.id === defender.id ? 'active' : ''}" data-enemy-id="${e.id}">
                <span>${e.avatar}</span>
                <span>${e.name}</span>
                <b style="font-size:7.5px;">(${ePct})</b>
              </button>
            `;
          }).join('');
          chipsContainer.querySelectorAll('.odds-target-chip').forEach(btn => {
            btn.onclick = (ev) => {
              ev.stopPropagation();
              const eid = btn.getAttribute('data-enemy-id');
              if (eid) {
                cardInspectedEnemyId = eid;
                debugInspectedEnemyId = eid;
                renderAll();
                updateDebugInspector();
              }
            };
          });
        } else {
          chipsContainer.style.display = 'none';
        }
      }

      // 5. 교전 개시 버튼 바인딩
      const fastAtkBtn = document.getElementById('btn-odds-fast-attack');
      if (fastAtkBtn) {
        fastAtkBtn.onclick = (ev) => {
          ev.stopPropagation();
          addLog(`🎯 [승률 창 교전 개시] ${attacker.name} -> 적 ${defender.name} 즉시 전투 시작!`, 'combat');
          executeCombat(attacker, defender);
        };
      }

      // 6. 기본 유닛 정보 전환 버튼 바인딩
      const toggleBtn = document.getElementById('btn-toggle-card-view');
      if (toggleBtn) {
        toggleBtn.onclick = (ev) => {
          ev.stopPropagation();
          userCardViewPreference = 'FORCE_NORMAL';
          renderAll();
        };
      }
    }

    function renderHeaderAndCard() {
      // Header Info
      document.getElementById('ui-cmd-level').textContent = `Lv.${state.commander.level}`;
      document.getElementById('ui-cmd-exp-fill').style.width = `${Math.min(100, (state.commander.exp / state.commander.maxExp) * 100)}%`;
      document.getElementById('ui-gold').textContent = `${state.gold}G`;
      document.getElementById('ui-rewinder').textContent = `${state.rewinders}/3`;
      document.getElementById('ui-turn').textContent = `Turn ${state.turn}`;
      document.getElementById('ui-sp-count').textContent = `${state.commander.skillPoints} SP`;

      // Selected Unit Card Info
      const unit = getSelectedUnit();
      renderSquadSidePanel(unit);
      if (!unit) return;

      const cardAvatar = document.getElementById('card-avatar');
      if (cardAvatar) {
        cardAvatar.classList.add('char-main-portrait');
        cardAvatar.innerHTML = renderPortrait(unit, { emojiSize: '30px' });
      }
      document.getElementById('card-name').textContent = unit.name;
      document.getElementById('card-level').textContent = `Lv.${unit.level}`;
      document.getElementById('card-stats').innerHTML = `
        <span>⚔️ ATK <b>${unit.atk}</b></span>
        <span>🛡️ DEF <b>${formatDefense(unit)}${unit.isGuarding ? '<span style="color:#10b981; font-size:10px; font-weight:800; margin-left:2px;">(+30% 방어)</span>' : ''}</b></span>
        <span>⚡ AP <b style="color: ${unit.ap > 0 ? '#0284c7' : '#ef4444'}">${unit.ap}/${unit.baseAP}</b></span>
        ${unit.isGuarding ? '<span style="background:#0284c7; color:#fff; border-radius:4px; padding:1px 4px; font-size:9px; font-weight:800;">🛡️방어태세</span>' : ''}
      `;

      const hpPct = Math.max(0, (unit.hp / unit.maxHp) * 100);
      document.getElementById('card-hp-text').textContent = `${unit.hp}/${unit.maxHp}`;
      document.getElementById('card-hp-fill').style.width = `${hpPct}%`;

      document.getElementById('card-aff-text').textContent = `${unit.affection}/100`;
      document.getElementById('card-aff-fill').style.width = `${unit.affection}%`;
      if (unit.affection <= 30) {
        document.getElementById('card-aff-text').innerHTML = `${unit.affection}/100 <span style="color:#ef4444;">(거부위험)</span>`;
      }

      // 전투 승리 확률 창 (이동/사거리 내 적 존재 시 자동 변환)
      const inRangeEnemies = getEnemiesInRange(unit);
      const cardEl = document.getElementById('selected-unit-card');
      const normalViewEl = document.getElementById('unit-card-normal-view');
      const oddsViewEl = document.getElementById('unit-card-odds-view');
      const oddsBadgeBtn = document.getElementById('btn-show-odds-badge');

      if (inRangeEnemies.length > 0 && userCardViewPreference !== 'FORCE_NORMAL') {
        if (cardEl) cardEl.classList.add('battle-odds-mode');
        if (normalViewEl) normalViewEl.style.display = 'none';
        if (oddsViewEl) oddsViewEl.style.display = 'flex';
        renderBattleOddsView(unit, inRangeEnemies);
      } else {
        if (cardEl) cardEl.classList.remove('battle-odds-mode');
        if (oddsViewEl) oddsViewEl.style.display = 'none';
        if (normalViewEl) normalViewEl.style.display = 'flex';

        if (oddsBadgeBtn) {
          if (inRangeEnemies.length > 0) {
            oddsBadgeBtn.style.display = 'inline-flex';
            oddsBadgeBtn.onclick = (e) => {
              e.stopPropagation();
              userCardViewPreference = 'AUTO';
              renderAll();
            };
          } else {
            oddsBadgeBtn.style.display = 'none';
          }
        }

        // Promotion Menu Button Binding
        const promoBtn = document.getElementById('btn-show-promo-menu');
        if (promoBtn) {
          promoBtn.style.display = (unit.owner === 'PLAYER' || !unit.owner) ? 'inline-flex' : 'none';
          promoBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.renderPromotionMenu === 'function') {
              window.renderPromotionMenu(unit);
            } else if (typeof window.UI?.renderPromotionMenu === 'function') {
              window.UI.renderPromotionMenu(unit);
            }
          };
        }
      }
    }

    // ------------------------------------------------------------------------
    // 중첩 부대 사이드 패널: 겹친 타일을 누르면 부대 반대편에서 1초간 나타났다 사라진다.
    // 그 사이 패널을 조작(부대원 선택 등)하면 고정되어 닫기/스택 해산 전까지 유지된다.
    // ------------------------------------------------------------------------
    function clearSquadPanelTimer() {
      if (squadPanel.timer) { clearTimeout(squadPanel.timer); squadPanel.timer = null; }
    }
    function applySquadPanelOpen() {
      const el = document.getElementById('squad-side-panel');
      if (el) el.classList.toggle('open', squadPanel.open);
    }
    function showSquadPanel() {
      clearSquadPanelTimer();
      squadPanel.open = true;
      squadPanel.pinned = false;
      squadPanel.timer = setTimeout(() => {
        squadPanel.timer = null;
        if (!squadPanel.pinned) { squadPanel.open = false; applySquadPanelOpen(); }
      }, SQUAD_PANEL_PEEK_MS);
    }
    function pinSquadPanel() {
      if (!squadPanel.open) return;
      clearSquadPanelTimer();
      squadPanel.pinned = true;
    }
    function hideSquadPanel() {
      clearSquadPanelTimer();
      squadPanel.open = false;
      squadPanel.pinned = false;
      applySquadPanelOpen();
    }
    window.hideSquadPanel = hideSquadPanel;

    function renderSquadSidePanel(unit) {
      const panel = document.getElementById('squad-side-panel');
      if (!panel) return;
      const fieldEl = document.getElementById('view-sector-field');
      const inField = !!(fieldEl && fieldEl.classList.contains('active'));
      const stackUnits = (inField && unit && !unit.isDead)
        ? state.playerUnits.filter(u => !u.isDead && u.x === unit.x && u.y === unit.y)
        : [];
      if (stackUnits.length < 2) {
        if (squadPanel.open) hideSquadPanel();
        return;
      }

      // 부대 위치에서 먼 쪽으로: 맵 왼쪽 절반이면 오른쪽, 오른쪽 절반이면 왼쪽
      const { width } = getBattleSize();
      const onLeftHalf = unit.x < width / 2;
      panel.classList.toggle('side-right', onLeftHalf);
      panel.classList.toggle('side-left', !onLeftHalf);

      const costAP = 1;
      const minAP = Math.min(...stackUnits.map(su => su.isInactivated ? 0 : su.ap));
      const hasAPShortage = minAP < costAP;
      const stackOn = !!state.stackMoveEnabled;

      panel.innerHTML = `
        <div class="squad-panel-header">
          <div class="squad-panel-title">
            👥 부대 편성 (${stackUnits.length}기)
            ${stackOn ? `<span class="squad-panel-sub" style="color:${hasAPShortage ? '#ef4444' : '#16a34a'};">최소 AP: ${minAP}</span>` : ''}
          </div>
          <button class="squad-panel-close" id="btn-squad-panel-close" title="닫기">✕</button>
        </div>
        <div class="squad-panel-list">
          ${stackUnits.map(su => {
            const isShort = stackOn && (su.isInactivated || su.ap < costAP);
            const hpPct = Math.max(0, Math.min(100, (su.hp / (su.maxHp || 1)) * 100));
            return `
              <button class="squad-member ${su.id === unit.id ? 'active' : ''} ${isShort ? 'ap-short' : ''}" data-unit-id="${su.id}" title="${escapeGachaHtml(su.name)} (AP: ${su.ap}/${su.baseAP}${su.isInactivated ? ', 정지' : ''})">
                <span class="squad-member-avatar">${renderPortrait(su, { emojiSize: '20px' })}</span>
                <span class="squad-member-info">
                  <span class="squad-member-name">${escapeGachaHtml(su.name)}</span>
                  <span class="squad-member-meta">AP ${su.ap}/${su.baseAP}${su.isInactivated ? ' · 정지' : ''} · HP ${su.hp}/${su.maxHp}</span>
                  <span class="squad-member-hp"><span style="width:${hpPct}%;"></span></span>
                </span>
              </button>
            `;
          }).join('')}
        </div>
        <div class="squad-panel-footer">
          <button class="squad-move-toggle ${stackOn ? (hasAPShortage ? 'warn' : 'on') : ''}" id="btn-squad-move-toggle" title="중첩 부대 동시 이동 모드 토글 (최소 AP 기준 일괄 이동)">
            ${stackOn ? (hasAPShortage ? '⚠️ 동시이동 (AP 부족)' : '👥 동시이동 ON') : '👤 개별이동'}
          </button>
        </div>
      `;

      // 패널을 건드리는 순간 고정 (자동 닫힘 타이머보다 먼저 잡히도록 pointerdown 사용)
      panel.onpointerdown = () => pinSquadPanel();
      panel.querySelectorAll('.squad-member[data-unit-id]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          pinSquadPanel();
          const uid = btn.getAttribute('data-unit-id');
          if (uid) {
            selectedUnitId = uid;
            renderAll();
            updateDebugInspector();
          }
        };
      });
      const toggleBtn = document.getElementById('btn-squad-move-toggle');
      if (toggleBtn) {
        toggleBtn.onclick = (e) => {
          e.stopPropagation();
          pinSquadPanel();
          state.stackMoveEnabled = !state.stackMoveEnabled;
          addLog(`👥 [부대 동시 이동] ${state.stackMoveEnabled ? '활성화 (ON - 최소 AP 기준 일괄 이동)' : '해제 (OFF - 개별 이동)'}`, 'gold');
          renderAll();
        };
      }
      const closeBtn = document.getElementById('btn-squad-panel-close');
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          hideSquadPanel();
        };
      }
      applySquadPanelOpen();
    }

    // ========================================================================
    // [ 1단계: 월드맵 / 전략 메인 화면 (Strategy Main View) 상호작용 엔진 ]
    // ========================================================================

    // ========================================================================
    // [ 11단계: 로그라이크 런 / 노드 ]
    // 노드는 { id, type, sectorId, next }만 가진다. 전술 타일은 전투 진입 시점에 enterEncounter()가 만든다.
    // 순수 로직(그래프 생성/해금 규칙)은 runEngine.js, 여기서는 state/DOM과 연결만 한다.
    // ========================================================================
    function getRun() {
      return state ? state.run : null;
    }

    // 노드 조회의 단일 진입점. nodeId를 생략하면 전략맵에서 선택 중인 노드.
    function getCurrentNode(nodeId) {
      const run = getRun();
      if (!run) return null;
      return RunEngine.getNode(run, nodeId != null ? nodeId : state.selectedNodeId);
    }
    window.getCurrentNode = getCurrentNode;

    // 선택 노드가 없거나 이미 완료된 노드면 "지금 갈 수 있는 첫 노드"로 옮긴다. 잠긴 노드는 열람용으로 그대로 선택할 수 있다.
    function ensureNodeSelection() {
      const run = getRun();
      if (!run) return null;
      const sel = RunEngine.getNode(run, state.selectedNodeId);
      if (sel && RunEngine.getNodeStatus(run, sel.id) !== 'completed') return sel;
      const next = RunEngine.getAvailableNodes(run)[0] || null;
      if (next) state.selectedNodeId = next.id;
      else if (!sel) state.selectedNodeId = null;
      return RunEngine.getNode(run, state.selectedNodeId);
    }

    function nodeTypeLabel(node) {
      const meta = node && RunEngine.NODE_META[node.type];
      return meta ? meta.label : '';
    }

    function selectNode(nodeId) {
      const node = getCurrentNode(nodeId);
      if (!node) return false;
      const sec = WORLD_SECTORS[node.sectorId] || { id: node.sectorId, name: node.sectorId, difficulty: '' };
      state.selectedNodeId = node.id;
      state.selectedSectorId = node.sectorId;
      state.currentSector = node.sectorId;
      if (state.strategy) state.strategy.selectedSectorId = node.sectorId;
      renderStrategyView();
      addLog(`📍 [노드 선택] ${node.id} · ${nodeTypeLabel(node)} — [${sec.id} ${sec.name}] (${RunEngine.getNodeStatus(state.run, node.id)})`, 'system');
      saveGameState(true);
      return true;
    }
    window.selectNode = selectNode;
    // 예전 호출부(콘솔 등) 호환용: 섹터 id로 부르면 그 섹터에서 지금 열려 있는 노드를 선택한다. 섹터에서 곧바로 전투에 들어가는 길은 없다.
    window.selectWorldSector = function selectWorldSector(sectorId) {
      const run = getRun();
      const node = run && (RunEngine.getAvailableNodes(run).find(n => n.sectorId === String(sectorId))
        || run.mapState.nodes.find(n => n.sectorId === String(sectorId) && RunEngine.getNodeStatus(run, n.id) !== 'completed'));
      if (!node) {
        addLog(`⚠️ [${sectorId}] 섹터에서 선택할 수 있는 노드가 이번 런에 없습니다.`, 'warning');
        return false;
      }
      return selectNode(node.id);
    };

    function startNewRun(customSeed = null, opts = {}) {
      if (state.currentBattle && state.currentBattle.status === 'active') {
        const msg = '⚠️ 전투 중에는 새 런을 시작할 수 없습니다.';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return false;
      }
      const cur = state.run;
      if (!opts.force && cur && cur.status === 'active' && cur.completedNodes.length > 0) {
        if (!window.confirm('진행 중인 런을 포기하고 새 런을 시작할까요? (캐릭터/골드는 유지됩니다)')) return false;
      }
      // 수동 새 런(디버그/재도전): 노드 그래프만 새로 만들고 파티·골드·지휘력 보정은 그대로 이어간다.
      // 사망회귀(returnByDeath)는 이 함수를 쓰지 않는다 — 그쪽은 createInitialRun()으로 전부 초기화한다.
      const prevRun = state.run;
      const nextRun = createInitialRun(customSeed, null);
      if (prevRun) {
        ['party', 'reserve', 'gold', 'commander', 'inventory', 'characterCollection', 'resonance', 'commandBonus', 'loopReward', 'foresight', 'dejavuEliteFree', 'echo', 'adjutant', 'walletOutbox', 'inboxDone', 'pledgeJournal', 'pendingSecure']
          .forEach(k => { if (k in prevRun) nextRun[k] = prevRun[k]; });
      }
      state.run = nextRun;
      state.encounterSeq = 0;
      state.selectedNodeId = null;
      state.currentBattle = null;
      ensureNodeSelection();
      addLog(`🧭 [새 런 시작] seed ${state.run.seed} — 작전지도에서 구역을 고르세요.`, 'gold');
      state.currentView = 'CAMPAIGN';
      renderAll();
      saveGameState();
      return true;
    }
    window.startNewRun = startNewRun;

    // ---- 전투가 없는 노드(이벤트/상점) ----
    function healAllPlayerUnits() {
      (state.playerUnits || []).forEach(u => {
        if (u.isDead) return;
        const max = Number(u.maxHp) || 100;
        u.hp = max;
        if (u.stats && typeof u.stats === 'object') u.stats.hp = max;
      });
    }

    function applyNodeEffects(effects, ref) {
      const lines = [];
      (effects || []).forEach(e => {
        if (e.type === 'gold') { const g = scaleIncomeWithRelics(e.amount); Wallet.earn('earn_event', g, ref); lines.push(`+${g}G`); }
        else if (e.type === 'rewinder') { state.rewinders += e.amount; lines.push(`리와인더 +${e.amount}`); }
        else if (e.type === 'heal_all') { healAllPlayerUnits(); lines.push('전원 체력 회복'); }
      });
      return lines.join(', ');
    }

    function closeRunNodeModal() {
      const m = document.getElementById('modal-run-node');
      if (m) m.remove();
    }

    // 이벤트/상점 노드를 끝낸다: 효과는 이 시점에 "한 번만" 적용되고(이중 클릭 방지), 노드가 완료되어 다음 노드가 열린다.
    function completeNonBattleNode(node, detail) {
      const run = state.run;
      if (!RunEngine.isNodeAvailable(run, node.id)) return false;
      const res = RunEngine.completeNode(run, node.id);
      if (!res.ok) { console.warn('[Run] 노드 완료 실패:', res.reason); return false; }
      state.encounterSeq += 1;
      RunEngine.recordEncounter(run,
        { id: `enc-${String(state.encounterSeq).padStart(5, '0')}`, nodeId: node.id, sectorId: node.sectorId, type: node.type, seed: run.seed, templateId: null },
        true, { reason: 'node', detail: detail || null });
      state.selectedNodeId = null;
      ensureNodeSelection();
      addLog(`✅ [${nodeTypeLabel(node)} 완료] ${node.id} → 다음 노드 ${res.unlockedNodes.join(', ') || '없음'}`, 'gold');
      closeRunNodeModal();
      renderAll();
      saveGameState();
      return true;
    }

    function openRunNodeModal(node) {
      if (isRunBlocked()) return reportRunBlocked();
      closeRunNodeModal();
      const run = state.run;
      const overlay = document.createElement('div');
      overlay.id = 'modal-run-node';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:99990;';
      const card = document.createElement('div');
      card.style.cssText = 'background:#0f172a;border:2px solid #38bdf8;border-radius:16px;padding:20px;max-width:380px;width:92%;color:#f8fafc;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.5);';
      overlay.appendChild(card);
      const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
      const btnCss = 'width:100%;padding:10px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;border:1px solid #475569;background:#1e293b;color:#e2e8f0;margin-top:8px;';

      if (node.type === 'event') {
        const ev = RunEngine.rollEvent(run, node);
        card.appendChild(el('div', 'font-size:40px;', '❓'));
        card.appendChild(el('h2', 'font-size:17px;font-weight:900;margin:6px 0;color:#7dd3fc;', ev.title));
        card.appendChild(el('p', 'font-size:12px;color:#cbd5e1;line-height:1.6;margin-bottom:10px;', ev.text));
        const ok = el('button', btnCss + 'background:linear-gradient(135deg,#0284c7,#38bdf8);color:#fff;border:none;', '확인');
        ok.onclick = () => {
          if (!RunEngine.isNodeAvailable(state.run, node.id)) return;
          const applied = applyNodeEffects(ev.effects, `${Number(state.player && state.player.loopCount) || 0}:${node.id}`);
          addLog(`❓ [이벤트] ${ev.title}: ${applied}`, 'gold');
          completeNonBattleNode(node, ev.id);
        };
        card.appendChild(ok);
      } else {
        const offers = RunEngine.getShopOffers(run, node).map(o => ({ ...o, cost: scaleShopGold(o.cost) })); // 기준가 × 물가 × 유물 할인
        const bought = new Set();
        card.appendChild(el('div', 'font-size:40px;', '🛒'));
        card.appendChild(el('h2', 'font-size:17px;font-weight:900;margin:6px 0;color:#7dd3fc;', '보급 상점'));
        const goldLine = el('p', 'font-size:12px;color:#fbbf24;font-weight:800;margin-bottom:6px;');
        card.appendChild(goldLine);
        const list = el('div');
        card.appendChild(list);
        const refresh = () => {
          goldLine.textContent = `보유 골드: ${state.gold}G`;
          list.innerHTML = '';
          offers.forEach(o => {
            const done = bought.has(o.id);
            const b = el('button', btnCss, done ? `${o.label} — 구매 완료` : `${o.label} — ${o.cost}G`);
            b.disabled = done || state.gold < o.cost;
            if (b.disabled) b.style.opacity = '0.5';
            b.onclick = () => {
              if (bought.has(o.id) || state.gold < o.cost) return;
              state.gold -= o.cost;
              bought.add(o.id);
              const applied = applyNodeEffects(o.effects, `${Number(state.player && state.player.loopCount) || 0}:${node.id}:${o.id}`);
              addLog(`🛒 [상점] ${o.label} 구매 (-${o.cost}G) → ${applied}`, 'gold');
              refresh();
              renderAll();
              saveGameState(true);
            };
            list.appendChild(b);
          });
        };
        refresh();
        const leave = el('button', btnCss + 'background:linear-gradient(135deg,#0284c7,#38bdf8);color:#fff;border:none;', '떠나기');
        leave.onclick = () => completeNonBattleNode(node, 'shop');
        card.appendChild(leave);
      }
      document.body.appendChild(overlay);
    }

    // ========================================================================
    // [ 적 자동 생성: 아군과 같은 캐릭터 풀에서 뽑는다 ]
    // 적 후보 = 캐릭터 풀(Supabase characters) 전체. 어떤 캐릭터를 몇 명, 어느 자리에 세울지는
    // seed로 결정된다(MapSchema.generateBattleMapWithSeed). 여기서는 "후보 목록"만 만든다.
    // 섹터 난이도와 노드 타입에 따라 레벨/스탯 배율이 붙는다.
    // ========================================================================
    const ENEMY_DIFFICULTY_SCALE = {
      EASY: { level: 1, mult: 0.8 },
      NORMAL: { level: 2, mult: 1.0 },
      HARD: { level: 3, mult: 1.15 },
      NIGHTMARE: { level: 4, mult: 1.3 }
    };
    const ENEMY_NODE_TYPE_SCALE = {
      battle: { levelBonus: 0, mult: 1.0 },
      elite: { levelBonus: 1, mult: 1.1 },
      boss: { levelBonus: 3, mult: 1.25, apBonus: 3, masterSkills: true } // 보스는 소수 정예 + 행동력(AP) 보너스
    };

    // 캐릭터 풀이 아직 로드되지 않았다면(전투를 너무 일찍 시작한 경우) 한 번 불러온다.
    async function ensureCharacterPoolLoaded() {
      if (customCharactersCloudCache.length > 0) return;
      try {
        if (typeof window.getCharactersFromCloud === 'function') {
          const chars = await window.getCharactersFromCloud();
          if (Array.isArray(chars)) syncGlobalCharactersFromSupabase(chars);
        }
      } catch (e) {
        console.warn('[Encounter] 캐릭터 풀 로드 실패:', e);
      }
    }

    // 국가(구역)별 적 보정: REGION_COMBAT 특색 + 위협도(1~6) 공통 보정(위협도 1당 스탯 +2%, 위협도 4부터 레벨 +1).
    // regionId가 없거나 모르는 구역이면 중립(보정 없음).
    function getRegionEnemyProfile(regionId) {
      const neutral = { hp: 1, atk: 1, def: 1, level: 0, count: 0, hostage: 0, intel: '' };
      const region = typeof REGIONS !== 'undefined' ? REGIONS[regionId] : null;
      if (!region) return neutral;
      const c = (typeof REGION_COMBAT !== 'undefined' && REGION_COMBAT[regionId]) || neutral;
      const threatMult = 1 + ((Number(region.threat) || 1) - 1) * 0.02;
      return {
        hp: (c.hp || 1) * threatMult,
        atk: (c.atk || 1) * threatMult,
        def: (c.def || 1) * threatMult,
        level: (c.level || 0) + ((Number(region.threat) || 1) >= 4 ? 1 : 0),
        count: c.count || 0,
        hostage: c.hostage || 0,
        intel: c.intel || ''
      };
    }
    window.getRegionEnemyProfile = getRegionEnemyProfile;

    function buildEnemyPool(sector, nodeType, regionId) {
      const diff = ENEMY_DIFFICULTY_SCALE[String(sector && sector.difficulty).toUpperCase()] || ENEMY_DIFFICULTY_SCALE.NORMAL;
      const typ = ENEMY_NODE_TYPE_SCALE[nodeType] || ENEMY_NODE_TYPE_SCALE.battle;
      const prof = getRegionEnemyProfile(regionId);
      return getStoredCustomCharacters()
        .filter(c => c && c.id && c.name && (c.classType || c.unitClass))
        .map(c => characterRecordToUnit(c, {
          id: c.id,
          owner: 'ENEMY',
          level: diff.level + typ.levelBonus + prof.level,
          statMultiplier: diff.mult * typ.mult,
          hpMult: prof.hp,
          atkMult: prof.atk,
          defMult: prof.def,
          apBonus: typ.apBonus || 0,
          masterSkills: !!typ.masterSkills,
          fullHp: true
        }));
    }

    // ------------------------------------------------------------------------
    // 전략맵 '출현 적' 정보: WORLD_SECTORS의 설명 문구(enemyForce)가 아니라 실제 전투와 같은 규칙으로 만든다.
    //   후보 = buildEnemyPool (캐릭터 풀), 레벨 = 섹터 난이도 + 노드 타입,
    //   인원 = 전술맵 템플릿의 적 스폰 지점 수 (MapSchema.generateBattleMapWithSeed와 같은 범위).
    //   맵에 적을 직접 배치한 고정 전투면 그 적들을 그대로, 예지/기억으로 아는 노드면 이번 전장의 적을 정확히 보여 준다.
    // ------------------------------------------------------------------------
    const enemyIntelTemplateCache = new Map(); // templateId → Promise<template|null>

    function getNodeTemplateId(node, sector) {
      return node.mapTemplateId || sector.mapTemplateId || sector.defaultTemplateId || MapSchema.resolveDefaultTemplateId(node.sectorId);
    }

    function loadEnemyIntelTemplate(templateId) {
      if (!enemyIntelTemplateCache.has(templateId)) {
        enemyIntelTemplateCache.set(templateId, loadTacticalMapTemplate(templateId).catch(err => {
          enemyIntelTemplateCache.delete(templateId); // 다음에 다시 시도
          console.warn('[Strategy] 출현 적 계산용 템플릿 로드 실패', err);
          return null;
        }));
      }
      return enemyIntelTemplateCache.get(templateId);
    }

    function getEnemyLevelFor(sector, nodeType, regionId) {
      const diff = ENEMY_DIFFICULTY_SCALE[String(sector && sector.difficulty).toUpperCase()] || ENEMY_DIFFICULTY_SCALE.NORMAL;
      const typ = ENEMY_NODE_TYPE_SCALE[nodeType] || ENEMY_NODE_TYPE_SCALE.battle;
      return diff.level + typ.levelBonus + getRegionEnemyProfile(regionId).level;
    }

    // ========================================================================
    // [ 전투력(PWR) — 아군·적 공통 ]
    // 실제 승률 공식(getCombatOdds)에 들어가는 값만 쓴다:
    //   공격 = atk × (1 + 승급 단계 × 10%), 방어 = def + 지휘력 보정, 둘 다 남은 HP 비율만큼 깎인다.
    // 레벨·스킬 보유 여부는 따로 더하지 않는다 (레벨업은 공격·방어 상승으로 이미 반영된다).
    // 기준: 공 40 · 방 30 · 만피 캐릭터 = 140 PWR.
    // ========================================================================
    function calculateUnitPower(u) {
      if (!u || u.isDead) return 0;
      const atk = (Number(u.atk ?? (u.stats && u.stats.atk)) || 40) + getArmyRelicBonus(u, 'atk');
      const def = (Number(u.def ?? (u.stats && u.stats.def)) || 30) + getCommandBonusDef(u) + getArmyRelicBonus(u, 'def');
      const rank = getCombatRank(u);
      const maxHp = Number(u.maxHp ?? (u.stats && u.stats.maxHp)) || 100;
      const hp = (typeof u.hp === 'number' && !isNaN(u.hp)) ? Math.min(maxHp, Math.max(0, u.hp)) : maxHp;
      return Math.round((atk * (1 + rank * 0.1) + def) * (hp / maxHp) * 2);
    }
    window.calculateUnitPower = calculateUnitPower;

    // ------------------------------------------------------------------------
    // 적 인원: 섹터 진행도에 따라 늘어난다 (오차 1명).
    //   섹터 순서 = 런 지도와 같은 난이도순(RunEngine.sortSectorIds). 첫 섹터 일반 전투 2~3명,
    //   다음 섹터마다 +1명, 정예는 +1명 (보스는 항상 1~2명). 템플릿 적 스폰이 모자라면 생성기가 스폰 옆 빈 칸을 더 쓴다.
    //   에디터에서 적을 직접 배치한 맵(고정 전투)은 이 규칙을 따르지 않고 배치한 그대로 나온다.
    // ------------------------------------------------------------------------
    const ENEMY_COUNT_RULE = { base: 2, perSector: 1, spread: 1, max: 10, typeBonus: { battle: 0, elite: 1, boss: 1 } };

    function getSectorProgressIndex(sectorId) {
      const ids = (window.RunEngine && typeof RunEngine.sortSectorIds === 'function')
        ? RunEngine.sortSectorIds(WORLD_SECTORS) : Object.keys(WORLD_SECTORS);
      return Math.max(0, ids.indexOf(String(sectorId)));
    }

    /** @returns {[number, number]} 이 노드 전투의 적 인원 [최소, 최대] */
    function getEnemyCountRange(node) {
      const r = ENEMY_COUNT_RULE;
      // 보스전: 1~2명만 나온다 (대신 스탯 배율·AP 보너스가 붙는다)
      if (node && node.type === 'boss') return [1, 2];
      // 적 최대 출전 수 = 플레이어 최대 출전 수(통솔력) - 1
      const cap = Math.max(1, Math.min(r.max, getLeadership() - 1));
      const countBonus = getRegionEnemyProfile(node && node.regionId).count; // 국가 특색 (수가 많은/적은 나라)
      const min = Math.max(1, Math.min(cap, r.base + getSectorProgressIndex(node && node.sectorId) * r.perSector + (r.typeBonus[node && node.type] || 0) + countBonus));
      return [min, Math.min(cap, min + r.spread)];
    }
    window.getEnemyCountRange = getEnemyCountRange;

    function getTemplateManualEnemies(template) {
      return (template && template.metadata && Array.isArray(template.metadata.units) ? template.metadata.units : [])
        .filter(u => u && (u.owner === 'ENEMY' || u.side === 'ENEMY'));
    }

    /**
     * 노드의 예상 적 전투력 (출현 적 정보와 같은 규칙).
     * 예지/기억으로 아는 노드와 고정 배치 전투는 정확한 합계, 그 외에는 "인원 범위 × 후보 평균 전투력".
     * @returns {Promise<{min:number,max:number,exact:boolean}|null>}
     */
    async function estimateNodeEnemyPower(node, sector) {
      const run = state.run;
      const knows = isForeseenNode(run, node.id) || (getDeathMemory(run, node.id) && getNodeAttempts(run, node.id) === 0);
      if (knows) {
        const p = await previewNode(node);
        if (p && Array.isArray(p.enemies) && !p.error && !p.retry) {
          const sum = p.enemies.reduce((s, e) => s + (Number(e.power) || 0), 0);
          return { min: sum, max: sum, exact: true };
        }
      }
      await ensureCharacterPoolLoaded();
      const template = await loadEnemyIntelTemplate(getNodeTemplateId(node, sector));
      if (!template) return null;
      const manual = getTemplateManualEnemies(template);
      if (manual.length) {
        const sum = manual.reduce((s, u) => s + calculateUnitPower(u), 0);
        return { min: sum, max: sum, exact: true };
      }
      const pool = buildEnemyPool(sector, node.type, node.regionId);
      if (!pool.length) return null;
      const avg = pool.reduce((s, u) => s + calculateUnitPower(u), 0) / pool.length;
      const [min, max] = getEnemyCountRange(node);
      return { min: Math.round(avg * min), max: Math.round(avg * max), exact: min === max };
    }
    window.estimateNodeEnemyPower = estimateNodeEnemyPower;

    function formatPowerEstimate(est) {
      if (!est) return '— PWR';
      return est.min === est.max ? `${est.min} PWR` : `${est.min}~${est.max} PWR`;
    }

    // el에 선택한 노드의 예상 적 전투력을 채운다. 같은 노드를 다시 그릴 때는 이전 값을 유지해 깜빡이지 않게 한다.
    function renderNodeEnemyPower(el, node, sector) {
      if (!el || !node) return;
      const token = String(Math.random());
      el.dataset.powerToken = token;
      if (el.dataset.powerNodeId !== node.id) {
        el.textContent = '계산 중…';
        el.title = '';
      }
      el.dataset.powerNodeId = node.id;
      estimateNodeEnemyPower(node, sector).then(est => {
        if (el.dataset.powerToken !== token) return;
        el.textContent = formatPowerEstimate(est);
        el.title = !est ? '전술맵이나 캐릭터 풀을 불러오지 못했습니다'
          : est.exact ? '이번 전장에 나올 적의 전투력 합계'
          : '적 인원 범위 × 후보 평균 전투력 (실제 인원은 전장 시드로 정해집니다)';
      }).catch(err => console.warn('[Strategy] 적 전투력 계산 실패', err));
    }

    // ------------------------------------------------------------------------
    // 클리어 보상: WORLD_SECTORS의 고정 문구(clearReward) 대신 실제 지급 규칙으로 만든다.
    //   골드 = 적 수 × 100 × (정예 1.5 / 보스 10)  (MapSchema.generateEncounterRewards)
    //   리와인더 = 보스 확정, 그 외 50%
    //   유물 = 보상 풀 `${섹터}-battle|elite|boss-relic`이 있을 때 (보스는 3개 중 1개 선택)
    //   예지/기억으로 아는 노드는 이번 전장의 정확한 보상을 보여 준다.
    // ------------------------------------------------------------------------
    async function describeNodeClearReward(node, sector) {
      const run = state.run;
      const knows = isForeseenNode(run, node.id) || (getDeathMemory(run, node.id) && getNodeAttempts(run, node.id) === 0);
      const parts = [];
      let exact = false;
      if (knows) {
        const p = await previewNode(node);
        if (p && Array.isArray(p.rewards) && !p.error && !p.retry) {
          parts.push(describeRewards(p.rewards));
          exact = true;
        }
      }
      if (!exact) {
        const template = await loadEnemyIntelTemplate(getNodeTemplateId(node, sector));
        const manual = getTemplateManualEnemies(template);
        const [min, max] = manual.length ? [manual.length, manual.length] : getEnemyCountRange(node);
        const mult = node.type === 'boss' ? 10 : node.type === 'elite' ? 1.5 : 1;
        const gMin = Math.round(Math.max(1, min) * 100 * mult);
        const gMax = Math.round(Math.max(1, max) * 100 * mult);
        parts.push(gMin === gMax ? `${gMin}G` : `${gMin}~${gMax}G`);
        parts.push(node.type === 'boss' ? '리와인더 1' : '리와인더 50%');
      }
      const suffix = RELIC_POOL_SUFFIX[node.type];
      if (suffix) {
        const data = await ensureRewardDataLoaded().catch(() => null);
        if (data && data.pools.has(`${node.sectorId}-${suffix}`)) parts.push(node.type === 'boss' ? '유물 3택1' : '유물');
      }
      return { text: parts.join(' · '), exact };
    }
    window.describeNodeClearReward = describeNodeClearReward;

    function renderNodeClearReward(el, node, sector) {
      if (!el || !node) return;
      const token = String(Math.random());
      el.dataset.rewardToken = token;
      if (el.dataset.rewardNodeId !== node.id) { el.textContent = '계산 중…'; el.title = ''; }
      el.dataset.rewardNodeId = node.id;
      describeNodeClearReward(node, sector).then(r => {
        if (el.dataset.rewardToken !== token) return;
        el.textContent = r.text || '—';
        el.title = (r.exact ? '이번 전장의 확정 보상' : '적 인원 범위에 따른 예상 보상')
          + ' · 이와 별도로 포섭하지 못한 적을 격파하면 전리품 골드를 얻습니다';
      }).catch(err => console.warn('[Strategy] 클리어 보상 계산 실패', err));
    }

    function clearNodeEnemyPower(el) {
      if (!el) return;
      el.dataset.powerToken = '';
      el.dataset.powerNodeId = '';
      el.textContent = '—';
      el.title = '';
    }

    function formatEnemyNames(list, max = 4) {
      const names = list.map(e => `${e.avatar || '👤'} ${e.name}`);
      return names.length > max ? `${names.slice(0, max).join(', ')} 외 ${names.length - max}명` : names.join(', ');
    }

    /** 템플릿 없이 알 수 있는 부분 (후보·레벨). 템플릿을 불러오면 summarizeNodeEnemies가 인원까지 채운다. */
    function summarizeNodeEnemiesQuick(node, sector) {
      const pool = buildEnemyPool(sector, node.type, node.regionId);
      if (!pool.length) return '캐릭터 풀을 불러오는 중…';
      return `Lv.${getEnemyLevelFor(sector, node.type, node.regionId)} · 후보 ${pool.length}명: ${formatEnemyNames(pool)}`;
    }

    async function summarizeNodeEnemies(node, sector) {
      const run = state.run;
      // 예지/기억/기시감으로 이번 전장을 아는 노드: 실제로 나올 적을 그대로
      const knows = isForeseenNode(run, node.id) || (getDeathMemory(run, node.id) && getNodeAttempts(run, node.id) === 0);
      if (knows) {
        const p = await previewNode(node);
        if (p && Array.isArray(p.enemies) && !p.error && !p.retry) {
          return `적 ${p.enemies.length}명: ${p.enemies.map(e => `${e.avatar} ${e.name} Lv.${e.level}`).join(', ') || '없음'}`;
        }
      }
      await ensureCharacterPoolLoaded();
      const template = await loadEnemyIntelTemplate(getNodeTemplateId(node, sector));
      if (!template) return `${summarizeNodeEnemiesQuick(node, sector)} (전술맵 없음)`;
      const manual = getTemplateManualEnemies(template);
      if (manual.length) {
        // 맵에 직접 배치한 적 = 고정 전투. 매번 같은 적이 나온다.
        return `적 ${manual.length}명 (고정 배치): ${formatEnemyNames(manual, 6)}`;
      }
      const pool = buildEnemyPool(sector, node.type, node.regionId);
      if (!pool.length) return '적으로 쓸 캐릭터가 없습니다';
      const [min, max] = getEnemyCountRange(node);
      const count = min === max ? `${min}명` : `${min}~${max}명`;
      return `적 ${count} · Lv.${getEnemyLevelFor(sector, node.type, node.regionId)} · 후보 ${pool.length}명: ${formatEnemyNames(pool)}`;
    }

    // el에 출현 적 정보를 채운다 (먼저 바로 아는 부분, 템플릿을 불러온 뒤 전체). 그 사이 노드가 바뀌면 덮어쓰지 않는다.
    function renderNodeEnemyIntel(el, node, sector) {
      if (!el || !node) return;
      const token = String(Math.random());
      el.dataset.intelToken = token;
      el.textContent = summarizeNodeEnemiesQuick(node, sector);
      el.title = '';
      summarizeNodeEnemies(node, sector).then(text => {
        if (el.dataset.intelToken !== token) return;
        el.textContent = text;
        el.title = text;
      }).catch(err => console.warn('[Strategy] 출현 적 정보 계산 실패', err));
    }

    // 0. Encounter 진입점 — 2단계: Sector → TacticalMapTemplate → CurrentBattle 순서로만 조립한다.
    /**
     * 전술 맵 템플릿 로더. tacticalMapTemplates/{templateId}만 조회한다.
     * 없거나 유효하지 않으면 명확한 에러를 던진다 — 기본맵으로 대체하지 않는다.
     * @returns {Promise<Object>} 정규화·검증된 TacticalMapTemplate
     */
    async function loadTacticalMapTemplate(templateId) {
      const loader = (typeof window.loadTacticalMapTemplateFromSupabase === 'function')
        ? window.loadTacticalMapTemplateFromSupabase
        : (window.SupabaseBridge && typeof window.SupabaseBridge.loadTacticalMapTemplateFromSupabase === 'function'
            ? window.SupabaseBridge.loadTacticalMapTemplateFromSupabase.bind(window.SupabaseBridge)
            : null);
      if (!loader) throw new Error('Supabase tacticalMapTemplates 로더를 찾을 수 없습니다.');
      let data;
      try {
        data = await loader(templateId);
      } catch (err) {
        throw new Error(`전술 맵 템플릿 로드 실패 (${templateId}): ${err?.message || 'Supabase 연결 오류'}`);
      }
      if (!data) throw new Error(`전술 맵 템플릿을 찾을 수 없음: ${templateId} (맵 에디터에서 저장하거나, 구버전 맵이면 콘솔에서 migrateScenarioMaps() 실행)`);
      const template = MapSchema.normalizeTacticalMapTemplate(data, templateId);
      validateTemplate(template);
      return template;
    }
    window.loadTacticalMapTemplate = loadTacticalMapTemplate;

    // width*height와 tiles 크기 일치, spawnPoints 존재 등은 MapSchema.validateTacticalMapTemplate가 확인한다.
    function validateTemplate(template) {
      const check = template ? MapSchema.validateTacticalMapTemplate(template) : { valid: false, errors: ['정규화 실패'] };
      if (!check.valid) throw new Error(`전술 맵 템플릿이 유효하지 않음: ${template?.id || '?'} — ${check.errors.join(', ')}`);
      return template;
    }

    //    이 함수 안에서 타일 객체를 직접 손으로 조립하지 않는다. 전부 MapSchema를 거친다.
    //    8단계: Seed 기반 랜덤화(MapSchema.generateBattleMapWithSeed)가 randomize:true로 적용된다.
    //    지형 변형/보물 상자는 매 진입마다(같은 노드는 항상 같게) 달라지고, 에디터가 직접
    //    배치한 적은 그대로, 아닌 경우는 enemyPool에서 seed로 뽑는다(로스터 연결 전까지는 0명).
    async function enterEncounter(nodeId) {
      const reportError = (msg) => {
        console.error(`❌ [Encounter] ${msg}`);
        addLog(`❌ [Encounter] ${msg}`, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return false;
      };

      // 11단계: 전투는 전략맵의 "노드"를 통해서만 들어갈 수 있다. sectorId만으로 전술맵에 들어가는 길은 없다.
      if (isRunBlocked()) return reportRunBlocked();
      ensureRewardDataLoaded(); // 전투가 끝날 때 유물 보상을 굴릴 수 있게 미리 불러 둔다 (기다리지 않는다)
      const requestedNodeId = String(nodeId || state?.selectedNodeId || '');
      const node = getCurrentNode(requestedNodeId);
      if (!node) return reportError(`노드 '${requestedNodeId}'를 찾을 수 없습니다. 전투는 전략맵의 노드를 통해서만 시작할 수 있습니다.`);
      if (!RunEngine.isBattleType(node.type)) return reportError(`'${node.id}'는 전투 노드가 아닙니다 (${node.type}).`);
      if (!RunEngine.isNodeAvailable(state.run, node.id)) return reportError(`'${node.id}' 노드는 아직 열리지 않았거나 이미 완료되었습니다.`);
      const targetSectorId = String(node.sectorId);

      if (!window.MapSchema) {
        return reportError('MapSchema 모듈을 찾을 수 없습니다 (mapSchema.js 로드 순서를 확인하세요).');
      }

      // Sector(전략) → 이 섹터가 사용할 TacticalMapTemplate id를 해석한다.
      // WORLD_SECTORS[sectorId].defaultTemplateId(또는 mapTemplateId)만 바꾸면 코드 변경 없이 다른 템플릿을 붙일 수 있다.
      const sector = WORLD_SECTORS?.[targetSectorId] || { id: targetSectorId };
      const templateId = node.mapTemplateId || sector.mapTemplateId || sector.defaultTemplateId || MapSchema.resolveDefaultTemplateId(targetSectorId);

      // 8단계: 전투 진입마다 새 seed를 만든다(매판 새로운 전장). seed는 battle.seed와 로그에 남으므로
      // 버그가 나면 그 값만 있으면 같은 전장을 재현할 수 있다.
      // 재현하려면 콘솔에서 state.forcedSeed = 'A-1-849201' 을 넣고 다시 진입한다 (1회용).
      // seed 결정은 enterBattleWithSeed()가 맡는다: forcedSeed가 있으면 그 값(1회용), 없으면 새로 뽑는다.
      // 이번 런에서 이 노드에 처음 들어가면 런 seed에서 정해진 전장 seed를 쓴다 (예지/기시감이 보여 준 그대로).
      const plannedSeed = getPlannedBattleSeed(state.run, node);
      const replaySeed = state.forcedSeed ? String(state.forcedSeed) : plannedSeed;
      state.forcedSeed = null;

      console.log(`⚔️ [Encounter] ${targetSectorId} 전투 진입 시작 — 템플릿 [${templateId}]을(를) Supabase에서 로드`);

      // 템플릿이 없거나 유효하지 않으면 실패 처리한다. 절대 기본맵으로 몰래 대체하지 않는다.
      let template;
      try {
        template = await loadTacticalMapTemplate(templateId);
      } catch (err) {
        return reportError(err?.message || String(err));
      }

      // TacticalMapTemplate → CurrentBattle. 여기서만 실전 인스턴스가 만들어진다.
      // randomize:true — 8단계 Seed 생성기를 켠다. 에디터가 직접 배치한 적(map.units)이
      // 있는 템플릿은 MapSchema.generateBattleMapWithSeed()가 자동으로 랜덤화 대상에서 제외한다.
      // enemyPool은 아직 프로젝트에 '적 유닛 로스터' 데이터가 없어 빈 배열로 둔다 — 로스터가
      // 생기는 즉시 여기 하나만 채우면 랜덤 적 스폰이 켜진다. 그때까지는 지형/보물 상자만
      // 매 진입마다(같은 노드는 항상 같게) 달라진다.
      await ensureCharacterPoolLoaded();
      const enemyPool = buildEnemyPool(sector, node.type, node.regionId);

      if (typeof window.enterBattleWithSeed !== 'function') {
        const msg = 'enterBattleWithSeed를 찾을 수 없습니다 (seedEngine.js 로드를 확인하세요).';
        console.error(`❌ [Encounter] ${msg}`);
        addLog(`❌ [Encounter] ${msg}`, 'warning');
        return false;
      }
      const battle = window.enterBattleWithSeed(template, replaySeed, {
        sectorId: targetSectorId,
        nodeId: node.id,
        type: node.type, // 'battle' | 'elite' | 'boss' — rewards 배율에 반영된다
        enemyPool,
        enemyCount: getEnemyCountRange(node), // 섹터 진행도에 따른 적 인원 (오차 1명)
        state
      });
      const seed = battle ? battle.seed : null;

      if (!battle) {
        const msg = `${targetSectorId} CurrentBattle 생성에 실패했습니다.`;
        console.error(`❌ [Encounter] ${msg}`);
        addLog(`❌ [Encounter] ${msg}`, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return false;
      }

      // 적이 한 명도 없으면 전투가 성립하지 않는다(시작하자마자 승리하는 것을 막는다).
      // 원인은 둘 중 하나다: 템플릿에 에디터가 배치한 적이 없고, 캐릭터 풀도 비어 있다.
      if (!Array.isArray(battle.enemies) || battle.enemies.length === 0) {
        state.currentBattle = null;
        return reportError(enemyPool.length === 0
          ? `적으로 쓸 캐릭터가 없습니다. 캐릭터 풀(characters)에 캐릭터를 만들거나, [${templateId}] 맵에 적을 직접 배치하세요.`
          : `[${templateId}] 맵에 적 스폰 지점을 배치할 수 없어 적이 생성되지 않았습니다.`);
      }

      const cols = battle.map.width;
      const rows = battle.map.height;

      // 전술 렌더러의 기준 데이터는 오직 state.currentBattle.map이다.
      // LEGACY: state.tiles / 전역 tiles 별칭은 7~8단계에서 제거되었다. 전술 코드는 getBattleTiles()로만 접근한다.
      state.currentBattle = battle;
      state.currentBattle.nodeId = node.id;
      // 전술 화면이 섹터 표시명을 위해 WORLD_SECTORS를 직접 보지 않도록 진입 시점에 복사해 둔다.
      state.currentBattle.sectorName = sector.name || targetSectorId;
      state.currentBattle.seed = seed;
      // 작전지도 구역. 구역 진입 흐름이 붙기 전까지는 시작 구역으로 고정한다.
      state.currentBattle.regionId = (state.run.campaign && state.run.campaign.currentRegionId) || CAMPAIGN_MAP.startRegionId;
      state.selectedNodeId = node.id;
      historyStack = []; // 이전 전투의 되감기 스냅샷이 이번 전투로 새어 들어오지 않게 한다.
      state.selectedSectorId = targetSectorId;
      state.currentSector = targetSectorId;
      if (state.strategy) state.strategy.selectedSectorId = targetSectorId;

      // 8단계: 적 배치는 이제 MapSchema.createCurrentBattle()이 전부 끝내 놓았다
      // (에디터가 직접 배치한 적은 그대로, 아니면 seed 기반 생성기 결과를 battle.enemies에 담아 반환).
      // 여기서는 그 스냅샷을 전투 엔진이 실시간으로 쓰는 state.enemyUnits로 옮기기만 한다.
      // 항상 대입해서, 적이 0명인 템플릿에 들어갔을 때 이전 전투의 enemyUnits가 남아있는
      // 문제도 함께 없앤다.
      state.enemyUnits = Array.isArray(battle.enemies) ? battle.enemies.slice() : [];
      // 아군 배치: 출전 편성에서 선택된 영웅만 배치하고, 지형 타일은 절대 변경하지 않는다.
      if (Array.isArray(state.playerUnits)) {
        // 에디터에서 찍은 아군 스폰(map.spawnPoints.player)을 우선 쓰고, 없을 때만 예전 하단 고정 슬롯으로 대체한다.
        const templatePlayerSpawns = (battle.map.spawnPoints && Array.isArray(battle.map.spawnPoints.player))
          ? battle.map.spawnPoints.player : [];
        const fallbackSlots = [
          { x: 3, y: Math.max(0, rows - 2) },
          { x: 4, y: Math.max(0, rows - 2) },
          { x: 2, y: Math.max(0, rows - 2) },
          { x: 5, y: Math.max(0, rows - 2) },
          { x: 3, y: Math.max(0, rows - 1) },
          { x: 4, y: Math.max(0, rows - 1) },
          { x: 2, y: Math.max(0, rows - 1) },
          { x: 5, y: Math.max(0, rows - 1) }
        ];
        const deploySlots = templatePlayerSpawns.length > 0 ? templatePlayerSpawns : fallbackSlots;
        const alive = state.playerUnits.filter(u => !u.isDead);
        // 선택 정보가 없으면(구버전 세이브 등) 기존처럼 전원 출전
        const deployedIds = (Array.isArray(state.currentDeployedUnitIds) && state.currentDeployedUnitIds.length > 0)
          ? state.currentDeployedUnitIds
          : alive.map(u => u.id);
        let slotIdx = 0;
        alive.forEach(unit => {
          if (deployedIds.includes(unit.id)) {
            const slot = deploySlots[slotIdx % deploySlots.length];
            slotIdx++;
            unit.isDeployed = true;
            unit.x = Math.min(cols - 1, slot.x);
            unit.y = Math.min(rows - 1, slot.y);
          } else {
            // 미편성 영웅은 이번 전장 밖(-1,-1)에 두어 전투/렌더링에서 제외한다.
            unit.isDeployed = false;
            unit.x = -1;
            unit.y = -1;
          }
        });
      }

      // 도전 횟수 (재도전은 새 seed)
      if (!state.run.nodeAttempts) state.run.nodeAttempts = {};
      state.run.nodeAttempts[node.id] = getNodeAttempts(state.run, node.id) + 1;
      // 기시감: 지난 생에 전멸한 바로 그 전장 / 기시감 카드의 첫 엘리트
      const death = getDeathMemory(state.run, node.id);
      if (death && death.battleSeed === seed) {
        startDeployPhase(battle, 'death');
      } else if (state.run.dejavuEliteFree && node.type === 'elite') {
        state.run.dejavuEliteFree = false;
        startDeployPhase(battle, 'card');
      }
      applyRelicBattleStart();
      applyEchoAtBattleStart();
      speakBattleStartLine(battle);

      console.log(`✅ [Encounter] ${targetSectorId} (템플릿 ${templateId}, seed=${seed}) → state.currentBattle.map 완료`, {
        tiles: battle.map.tiles.length,
        enemies: battle.enemies.length,
        cols,
        rows
      });
      addLog(`🗺️ [Encounter] [${targetSectorId}] 템플릿 [${templateId}] 적용 — seed: ${seed} (${battle.map.tiles.length} tiles, 적 스폰 ${(battle.map.spawnPoints?.enemy || []).length}곳, 적 ${battle.enemies.length}명)`, 'gold');
      return true;
    }
    window.enterEncounter = enterEncounter;

    // 1. 뷰 레이어 전환 엔진 (Strategy View <-> Sector Map)
    function switchGameView(targetView) {
      if (!state) return;

      // 12단계: 이미 승리한 전투에서 "전략맵으로" 나가면 그 자리에서 결과 처리(보상/노드 완료)를 끝낸다.
      // (승리 직후에는 isCombatActive가 꺼져 있어 일시정지 메뉴를 거치지 않고 곧장 전략맵으로 오기 때문)
      if (targetView === 'STRATEGY' && state.currentBattle && state.currentBattle.status === 'won') {
        finishEncounter({ victory: true });
        return;
      }
      // 구역 작전을 시작하기 전에는 전략맵(노드 그래프)이 없다 → 작전지도로.
      if (targetView === 'STRATEGY' && !getCurrentRegionId() && !state.currentBattle) targetView = 'CAMPAIGN';
      // 11단계: 진행 중인 전투(currentBattle) 없이 전술 화면으로 들어가는 길은 없다. 섹터 id로 몰래 전투를 만들지 않는다.
      if (targetView !== 'STRATEGY' && targetView !== 'GACHA' && targetView !== 'CAMPAIGN' && !(state.currentBattle && state.currentBattle.map && state.currentBattle.map.tiles && state.currentBattle.map.tiles.length)) {
        const msg = '⚠️ 진행 중인 전투가 없습니다. 전략맵에서 노드를 선택해 출격하세요.';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        targetView = 'STRATEGY';
      }

      // 전투 진행 중인 상태에서 전략 화면으로 전환을 시도하면 전술 일시정지 메뉴 호출
      const isCombatOngoing = !!(state && state.isCombatActive);
      if (targetView === 'STRATEGY' && isCombatOngoing && !state.isCombatPaused) {
        if (typeof window.openTacticalPauseMenu === 'function') {
          window.openTacticalPauseMenu();
          return;
        }
      }

      state.currentView = targetView;

      const viewStrat = document.getElementById('view-strategy-main');
      const viewSector = document.getElementById('view-sector-field');
      const viewGacha = document.getElementById('view-character-gacha');
      const viewCampaign = document.getElementById('view-campaign-map');

      if (viewGacha) viewGacha.classList.toggle('active', targetView === 'GACHA');
      if (viewCampaign) viewCampaign.classList.toggle('active', targetView === 'CAMPAIGN');

      if (targetView === 'CAMPAIGN') {
        if (viewStrat) viewStrat.classList.remove('active');
        if (viewSector) viewSector.classList.remove('active');
        renderCampaignView();
      } else if (targetView === 'GACHA') {
        if (viewStrat) viewStrat.classList.remove('active');
        if (viewSector) viewSector.classList.remove('active');
        renderCharacterGacha();
        addLog(`💰 [용병 고용] 용병 고용소를 열었습니다.`, 'system');
      } else if (targetView === 'STRATEGY') {
        if (viewStrat) viewStrat.classList.add('active');
        if (viewSector) viewSector.classList.remove('active');
        if (viewGacha) viewGacha.classList.remove('active');
        renderStrategyView();
        addLog(`🗺️ [전략 지휘 본부] 월드맵 및 출전 부대 편성 화면으로 이동했습니다.`, 'system');
      } else {
        if (viewGacha) viewGacha.classList.remove('active');
        if (viewStrat) viewStrat.classList.remove('active');
        if (viewSector) viewSector.classList.add('active');

        // 전술 화면은 항상 state.currentBattle.map만 그린다 (위에서 전투 존재를 이미 확인했다).
        const secId = state.currentBattle.sectorId;
        state.selectedSectorId = secId;
        state.currentSector = secId;
        renderGrid();
        renderHeaderAndCard();
        updateFullShotOverlay();

        addLog(`⚔️ [전술 작전 전개] [${secId} ${state.currentBattle.sectorName || secId}] 전술 필드로 진입했습니다.`, 'combat');
      }
      saveGameState(true);
    }
    window.switchGameView = switchGameView;

    // 2. 월드 섹터 노드 선택
    // selectWorldSector()는 11단계에서 selectNode()로 대체되었다 (호환용 shim은 run 헬퍼 블록에 있음).

    // 3. 지휘관 패시브 스킬 토글
    function toggleCommanderSkill(skillKey) {
      const unlocked = !!state.commander?.unlockedSkills?.[skillKey];
      if (!unlocked) {
        openSkillsModal();
        addLog('스킬은 스킬트리에서 레벨업 선택권으로 해금할 수 있습니다.', 'system');
      } else {
        addLog('해금한 지휘관 스킬은 항상 적용됩니다. 별도 ON/OFF는 없습니다.', 'system');
      }
    }
    window.toggleCommanderSkill = toggleCommanderSkill;

    // 4. 출전 부대 스택 수량 조절
    function updateArmyStack(cls, delta) {
      if (!state.strategy || !state.strategy.armyDeck) return;
      const deck = state.strategy.armyDeck;
      const currentVal = deck[cls] || 0;
      let newVal = Math.max(0, currentVal + delta);

      // 전체 100 유닛 한도 검증
      const totalOther = Object.keys(deck).reduce((acc, k) => k === cls ? acc : acc + (deck[k] || 0), 0);
      if (totalOther + newVal > 100) {
        newVal = 100 - totalOther;
      }
      deck[cls] = newVal;

      renderStrategyView();
      saveGameState(true);
    }
    window.updateArmyStack = updateArmyStack;

    // 5. 부대 프리셋
    function applyArmyPreset(type) {
      if (!state.strategy) return;
      if (type === 'BALANCED') {
        state.strategy.armyDeck = { KNIGHT: 25, MAGE: 20, ARCHER: 25, MELEE: 20, FIREARM: 10 };
        addLog(`⚖️ [부대 편성 프리셋] 균형 잡힌 5병과 전술 편성을 적용했습니다.`, 'system');
      } else if (type === 'CAVALRY') {
        state.strategy.armyDeck = { KNIGHT: 60, MAGE: 10, ARCHER: 15, MELEE: 10, FIREARM: 5 };
        addLog(`🐴 [부대 편성 프리셋] 기사 돌격 중심 고기동 편성을 적용했습니다.`, 'system');
      } else if (type === 'RANGED') {
        state.strategy.armyDeck = { KNIGHT: 15, MAGE: 30, ARCHER: 35, MELEE: 10, FIREARM: 10 };
        addLog(`🏹 [부대 편성 프리셋] 마법사/궁수 원거리 화력 편성을 적용했습니다.`, 'system');
      } else if (type === 'DEFENSIVE') {
        state.strategy.armyDeck = { KNIGHT: 20, MAGE: 15, ARCHER: 20, MELEE: 40, FIREARM: 5 };
        addLog(`🛡️ [부대 편성 프리셋] 보병 철벽 방어 진형 편성을 적용했습니다.`, 'system');
      }
      renderStrategyView();
      saveGameState(true);
    }
    window.applyArmyPreset = applyArmyPreset;

    // ========================================================================
    // 캐릭터 가챠 / 소환소
    // 원본 풀: Supabase 'characters' 컬렉션 -> customCharactersCloudCache
    // 획득 기록: state.characterCollection (게임 상태에 함께 저장)
    // ========================================================================
    let gachaLastResults = [];
    const GACHA_HIRE_BASE = 100;          // 용병 고용 1회 (기준가 — 실제 가격은 인플레이션 반영: getGachaHireCost)
    const getGachaHireCost = () => scaleShopGold(GACHA_HIRE_BASE);
    const EMERGENCY_RECRUIT_BASE = 200;   // 전멸 후 긴급 모집 1회 (무작위, 기준가)
    const getEmergencyRecruitCost = () => scaleGold(EMERGENCY_RECRUIT_BASE);

    function getCharacterGachaPool() {
      return Array.isArray(customCharactersCloudCache) ? customCharactersCloudCache.filter(c => c && c.id) : [];
    }

    async function ensureCharacterGachaPool() {
      if (!getCharacterGachaPool().length && typeof window.getCharactersFromCloud === 'function') {
        const chars = await window.getCharactersFromCloud();
        if (Array.isArray(chars)) syncGlobalCharactersFromSupabase(chars);
      }
      return getCharacterGachaPool();
    }

    // ---- 전사한 캐릭터의 재등장: 같은 캐릭터 데이터지만 다른 사람(이름만 다름)으로 나온다 ----
    const MERC_ALIAS_NAMES = [
      '카일', '에단', '로웰', '브람', '세드릭', '오스윈', '루카', '다리우스', '하랄', '이안', '펠릭스', '가렛',
      '마커스', '레온', '빅토르', '엘리아', '세라', '미렐', '아델', '노라', '이솔데', '카린', '리아나', '벨라'
    ];

    // 이번 런에서 전사한 캐릭터 id (전사한 유닛은 출전 명단에 isDead로 남는다)
    function getFallenCharacterIds() {
      return new Set((state.playerUnits || []).filter(u => u && !isUnitAlive(u)).map(getCharacterId).filter(Boolean));
    }

    // "성기사 롤랑" → "성기사 세드릭": 칭호는 두고 이름만 바꾼다. 지금 쓰는 이름과 겹치지 않게 고른다.
    function makeMercAlias(record) {
      const used = new Set([...(state.playerUnits || []), ...(state.reserveUnits || [])].map(u => u && u.name));
      (state.characterCollection || []).forEach(e => { if (e && e.alias) used.add(e.alias); });
      const parts = String(record.name || '').trim().split(/\s+/);
      const title = parts.length > 1 ? parts.slice(0, -1).join(' ') + ' ' : '';
      const free = MERC_ALIAS_NAMES.map(n => title + n).filter(n => n !== record.name && !used.has(n));
      if (free.length) return free[Math.floor(Math.random() * free.length)];
      let i = 2;
      while (used.has(`${title}무명 ${i}`)) i++;
      return `${title}무명 ${i}`;
    }

    // 캐릭터 id가 없는 구버전 유닛도 있으므로 이름이 같은 전사자도 같은 사람으로 본다.
    function getHireAlias(record) {
      const fallenNames = new Set((state.playerUnits || []).filter(u => u && !isUnitAlive(u)).map(u => u.name));
      const fallen = getFallenCharacterIds().has(String(record.id)) || fallenNames.has(record.name);
      return fallen ? makeMercAlias(record) : null;
    }

    function escapeGachaHtml(value) {
      return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
    }

    function getGachaClassName(charObj) {
      const cls = charObj?.unitClass || charObj?.classType || 'KNIGHT';
      return (typeof CLASS_META !== 'undefined' && CLASS_META[cls]) ? CLASS_META[cls].name : cls;
    }

    function getGachaAvatarHtml(charObj) {
      return renderPortrait(charObj);
    }

    function renderGachaCharacterCard(charObj, extraClass = '') {
      const stats = charObj?.stats || {};
      return `<div class="gacha-card ${extraClass}">
        <div class="gacha-card-image">${getGachaAvatarHtml(charObj)}</div>
        <div class="gacha-card-info">
          <div class="gacha-card-name">${escapeGachaHtml(charObj?.name || '이름 없는 영웅')}</div>
          <div class="gacha-card-class">${escapeGachaHtml(getGachaClassName(charObj))}</div>
          <div class="gacha-card-stats">HP ${stats.hp || 100} · ATK ${stats.atk || 40} · DEF ${stats.def || 30}</div>
        </div>
      </div>`;
    }

    function renderCharacterGacha() {
      const pool = getCharacterGachaPool();
      const collection = Array.isArray(state?.characterCollection) ? state.characterCollection : [];
      const poolCount = document.getElementById('gacha-pool-count');
      const ownedCount = document.getElementById('gacha-owned-count');
      const resultGrid = document.getElementById('gacha-result-grid');
      const status = document.getElementById('gacha-status');
      if (poolCount) poolCount.textContent = `DB ${pool.length}명`;
      if (ownedCount) ownedCount.textContent = `미편입 사본 ${collection.length}장`;
      const costDesc = document.getElementById('gacha-cost-desc');
      if (costDesc) costDesc.textContent = `1회 ${getGachaHireCost()}G · 보유 골드 ${Number(state.gold) || 0}G`;
      document.querySelectorAll('[data-gacha-price]').forEach(el => { el.textContent = `${getGachaHireCost() * Number(el.dataset.gachaPrice)}G · RANDOM × ${el.dataset.gachaPrice}`; });
      document.querySelectorAll('.gacha-summon-btn').forEach(b => {
        if (status && status.dataset.busy) return;
        b.disabled = (Number(state.gold) || 0) < getGachaHireCost() * (Number(b.dataset.amount) || 1);
      });
      if (status && pool.length > 0 && !status.dataset.busy) status.textContent = `고용 가능 용병 ${pool.length}명`;

      if (resultGrid) {
        resultGrid.innerHTML = gachaLastResults.length
          ? gachaLastResults.map(c => renderGachaCharacterCard(c, 'result')).join('')
          : `<div class="gacha-empty">고용 결과가 여기에 표시됩니다.</div>`;
      }
    }

    let gachaReturnView = 'STRATEGY';
    async function openCharacterGacha() {
      if (state && state.currentView !== 'GACHA') gachaReturnView = state.currentView === 'CAMPAIGN' ? 'CAMPAIGN' : 'STRATEGY';
      switchGameView('GACHA');
      const status = document.getElementById('gacha-status');
      const pool = getCharacterGachaPool();
      if (pool.length > 0) return;
      if (status) { status.textContent = '캐릭터 DB를 불러오는 중...'; status.dataset.busy = '1'; }
      try {
        if (typeof window.getCharactersFromCloud === 'function') {
          const chars = await window.getCharactersFromCloud();
          if (Array.isArray(chars)) syncGlobalCharactersFromSupabase(chars);
        }
        const loaded = getCharacterGachaPool();
        if (status) status.textContent = loaded.length ? `고용 가능 용병 ${loaded.length}명` : '고용 가능한 용병이 없습니다. DEV에서 캐릭터를 먼저 등록해주세요.';
      } catch (err) {
        console.error('Character gacha pool load error:', err);
        if (status) status.textContent = '캐릭터 DB를 불러오지 못했습니다.';
      } finally {
        if (status) delete status.dataset.busy;
        renderCharacterGacha();
      }
    }
    window.openCharacterGacha = openCharacterGacha;

    function closeCharacterGacha() {
      switchGameView(gachaReturnView);
    }
    window.closeCharacterGacha = closeCharacterGacha;

    function clearGachaResults() {
      gachaLastResults = [];
      renderCharacterGacha();
    }
    window.clearGachaResults = clearGachaResults;

    async function summonCharacters(amount = 1) {
      const buttons = document.querySelectorAll('.gacha-summon-btn');
      buttons.forEach(b => b.disabled = true);
      const status = document.getElementById('gacha-status');
      if (status) { status.textContent = '고용 중...'; status.dataset.busy = '1'; }
      let message = '';
      try {
        const cost = getGachaHireCost() * amount;
        if ((Number(state.gold) || 0) < cost) throw new Error(`골드가 부족합니다. (필요 ${cost}G · 보유 ${Number(state.gold) || 0}G)`);
        const pool = await ensureCharacterGachaPool();
        if (!pool.length) throw new Error('고용 가능한 용병이 없습니다.');
        state.gold -= cost;

        if (!Array.isArray(state.characterCollection)) state.characterCollection = [];
        const results = [];
        for (let i = 0; i < amount; i++) {
          const character = pool[Math.floor(Math.random() * pool.length)];
          const alias = getHireAlias(character); // 전사한 캐릭터면 다른 이름의 사람으로 고용된다
          state.characterCollection.push({
            instanceId: `gacha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            characterId: character.id,
            ...(alias ? { alias } : {}),
            acquiredAt: new Date().toISOString()
          });
          results.push(alias ? { ...character, name: alias } : character);
        }
        gachaLastResults = results;

        saveGameState(true);
        const names = results.map(c => c.name || '영웅').join(', ');
        message = `${amount}회 고용 완료 (-${cost}G): ${names} — 용병 명부에서 출전 명단에 편입하세요.`;
        addLog(`💰 [용병 고용] ${amount}회 고용 완료 (-${cost}G, 잔여 ${state.gold}G) — ${names} (용병 명부에서 편입)`, 'gold');
      } catch (err) {
        console.error('Character gacha error:', err);
        message = err.message || '고용에 실패했습니다.';
      } finally {
        delete status?.dataset.busy;
        renderCharacterGacha();
        if (status) status.textContent = message;
        if (typeof renderStrategyView === 'function') renderStrategyView();
      }
    }
    window.summonCharacters = summonCharacters;

    // 6. 전략 메인 화면 데이터 전체 렌더링
    // ---- 전략 화면 지형 막대: 전술맵 템플릿 기준 ---------------------------------
    const sectorTerrainCache = {}; // templateId -> {plain,forest,hill,water}
    function applyTerrainBars(comp) {
      const c = Object.assign({ plain: 0, forest: 0, hill: 0, water: 0 }, comp || {});
      [['plain', '평지'], ['forest', '숲'], ['hill', '산악'], ['water', '강/바다']].forEach(([k, label]) => {
        const el = document.getElementById(`strat-bar-${k}`);
        if (!el) return;
        el.style.width = `${c[k]}%`;
        el.title = `${label} ${c[k]}%`;
      });
    }
    async function refreshSectorTerrainBars(sectorId) {
      const templateId = MapSchema.resolveDefaultTemplateId(sectorId);
      if (!sectorTerrainCache[templateId]) {
        try {
          const loader = (typeof window.loadTacticalMapTemplateFromSupabase === 'function')
            ? window.loadTacticalMapTemplateFromSupabase
            : (window.SupabaseBridge && window.SupabaseBridge.loadTacticalMapTemplateFromSupabase
                ? window.SupabaseBridge.loadTacticalMapTemplateFromSupabase.bind(window.SupabaseBridge) : null);
          if (!loader) return;
          const doc = await loader(templateId);
          const tpl = MapSchema.normalizeTacticalMapTemplate(doc, templateId);
          const comp = tpl ? MapSchema.computeTerrainComposition(tpl.tiles) : null;
          if (!comp) return; // 저장된 템플릿이 없으면 기본 수치 유지
          sectorTerrainCache[templateId] = comp;
        } catch (e) {
          console.warn('[Strategy] 지형 비율 계산용 템플릿 로드 실패', e);
          return;
        }
      }
      // 로딩 중에 다른 섹터로 바뀌었다면 덮어쓰지 않는다.
      const nowSel = (state.strategy && state.strategy.selectedSectorId) || 'A-1';
      if (nowSel === sectorId) applyTerrainBars(sectorTerrainCache[templateId]);
    }
    // 에디터가 저장한 직후 호출: 방금 저장한 타일로 캐시를 갱신한다.
    window.updateSectorTerrainCache = function (templateId, tiles) {
      const comp = MapSchema.computeTerrainComposition(tiles);
      if (comp) sectorTerrainCache[templateId] = comp;
    };

    // Supabase에 저장된 월드 섹터를 게임의 섹터 레지스트리와 병합한다.
    // 정적 WORLD_SECTORS는 기본 메타데이터, game_configs/world_sectors는 사용자 생성 섹터와 맵의 원본이다.
    let worldSectorsLoadPromise = null;
    async function ensureWorldSectorsLoaded(force = false) {
      if (worldSectorsLoadPromise && !force) return worldSectorsLoadPromise;
      worldSectorsLoadPromise = (async () => {
        try {
          const loader = window.loadGameConfigFromCloud || window.SupabaseBridge?.loadGameConfigFromCloud?.bind(window.SupabaseBridge);
          if (typeof loader !== 'function') return;
          const config = await loader('world_sectors');
          const stored = Array.isArray(config?.worldSectors) ? config.worldSectors : [];
          state.worldSectors = stored;
          stored.forEach((saved) => {
            if (!saved?.id) return;
            const base = WORLD_SECTORS[saved.id] || {};
            WORLD_SECTORS[saved.id] = {
              ...base, ...saved,
              id: String(saved.id),
              name: saved.name || base.name || String(saved.id),
              icon: saved.icon || base.icon || '🗺️',
              difficulty: saved.difficulty || base.difficulty || 'NORMAL',
              stars: saved.stars || base.stars || '★★☆☆☆',
              terrainDesc: saved.terrainDesc || base.terrainDesc || '사용자 제작 전술 구역',
              enemyForce: saved.enemyForce || base.enemyForce || '미확인 적군',
              recPower: Number(saved.recPower ?? base.recPower ?? 400),
              upkeep: Number(saved.upkeep ?? base.upkeep ?? 0),
              clearReward: saved.clearReward || base.clearReward || '보상 미설정',
              defaultTemplateId: saved.defaultTemplateId || saved.id,
              locked: saved.locked === true
            };
          });
          refreshWorldSectorNodes();
        } catch (error) {
          console.warn('[Strategy] 월드 섹터 동기화 실패', error);
        } finally {
          worldSectorsLoadPromise = null;
        }
      })();
      return worldSectorsLoadPromise;
    }
    window.ensureWorldSectorsLoaded = ensureWorldSectorsLoaded;

    function refreshWorldSectorNodes() {
      const canvas = document.getElementById('strat-world-map-canvas');
      const run = getRun();
      if (!canvas || !run || !run.mapState) return;
      ensureNodeSelection();
      canvas.querySelectorAll('.strat-node-pin').forEach(n => n.remove());

      // 층(layer)은 왼쪽→오른쪽, 같은 층의 노드는 위→아래로 배치한다.
      const layers = run.mapState.layers;
      const pos = {};
      layers.forEach((layer, li) => {
        const x = layers.length === 1 ? 50 : 8 + (li / (layers.length - 1)) * 84;
        layer.forEach((id, i) => {
          pos[id] = { x, y: layer.length === 1 ? 55 : 28 + (i / (layer.length - 1)) * 54 };
        });
      });

      const svg = document.getElementById('strat-run-lines');
      if (svg) {
        const availIds = new Set(RunEngine.getAvailableNodes(run).map(n => n.id));
        svg.innerHTML = run.mapState.nodes.map(n => n.next.map(t => {
          const a = pos[n.id], b = pos[t];
          if (!a || !b) return '';
          const traveled = run.completedNodes.includes(n.id) && run.completedNodes.includes(t);
          const open = n.id === run.currentNodeId && availIds.has(t);
          const stroke = traveled ? '#16a34a' : open ? '#0284c7' : '#94a3b8';
          const dash = traveled ? '' : open ? ' stroke-dasharray="3,2"' : ' stroke-dasharray="1.5,2"';
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${traveled || open ? 1.6 : 1.1}" opacity="${traveled || open ? 0.9 : 0.45}"${dash} />`;
        }).join('')).join('');
      }

      const statusText = { completed: '완료', available: '진입 가능', locked: '잠김' };
      run.mapState.nodes.forEach(node => {
        const p = pos[node.id];
        if (!p) return;
        const status = RunEngine.getNodeStatus(run, node.id);
        const meta = RunEngine.NODE_META[node.type] || { icon: '❔', label: node.type };
        const sec = WORLD_SECTORS[node.sectorId] || { name: node.sectorId };
        const remembered = isRememberedNode(run, node.id);
        const deathHere = !!getDeathMemory(run, node.id);
        const label = `${node.id} ${sec.name} · ${meta.label} (${statusText[status]})${remembered ? ' · 💭 기억나는 장소' : ''}${deathHere ? ' · ☠️ 지난 생에 쓰러진 곳' : ''}`;
        const pin = document.createElement('div');
        pin.className = `strat-node-pin run-node node-${node.type} is-${status}${remembered ? ' is-remembered' : ''}${state.selectedNodeId === node.id ? ' active' : ''}`;
        pin.id = `node-pin-${node.id}`;
        pin.style.left = `${p.x}%`;
        pin.style.top = `${p.y}%`;
        pin.setAttribute('role', 'button');
        pin.setAttribute('tabindex', '0');
        pin.setAttribute('aria-label', label);
        pin.title = label;
        pin.innerHTML = `<div class="strat-node-circle"><div class="strat-node-pulse"></div><span>${meta.icon}</span>${deathHere ? '<span class="strat-node-memory" aria-hidden="true">☠️</span>' : remembered ? '<span class="strat-node-memory" aria-hidden="true">💭</span>' : ''}</div><span class="strat-node-tag">${meta.label}</span>`;
        pin.addEventListener('click', () => selectNode(node.id));
        pin.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); } });
        canvas.appendChild(pin);
      });

      const hud = document.getElementById('strat-run-hud-text');
      if (hud) {
        const regionId = getCurrentRegionId(run);
        const where = regionId && typeof REGIONS !== 'undefined' && REGIONS[regionId] ? REGIONS[regionId].title.ko : run.seed;
        hud.textContent = run.status === 'won'
          ? `🏆 런 클리어 · ${where}`
          : `🧭 ${where} · ${run.completedNodes.length}/${layers.length}층`;
      }
    }
    window.refreshWorldSectorNodes = refreshWorldSectorNodes;

    /**
     * 공용 상단 헤더 (게스트 id · 지휘관 · 용병 고용/명부 · 통솔력/골드/리와인더).
     * 헤더 DOM은 하나뿐이고, 작전지도와 전략맵 중 지금 보이는 화면의 맨 위로 옮겨 붙인다.
     */
    const SHARED_HEADER_LABELS = { 'view-strategy-main': 'STRATEGY COMMAND CENTER', 'view-campaign-map': 'OPERATION MAP' };
    function mountSharedHeader(viewId) {
      const header = document.getElementById('shared-strat-header');
      const view = document.getElementById(viewId);
      if (!header || !view) return;
      if (header.parentElement !== view) view.insertBefore(header, view.firstChild);
      const label = document.getElementById('strat-mode-label');
      if (label) label.textContent = SHARED_HEADER_LABELS[viewId] || SHARED_HEADER_LABELS['view-strategy-main'];
    }
    window.mountSharedHeader = mountSharedHeader;

    function renderStrategyHeader() {
      if (!state) return;
      const cmdName = document.getElementById('strat-cmd-name');
      const cmdLvl = document.getElementById('strat-cmd-level');
      const cmdExpFill = document.getElementById('strat-cmd-exp-fill');
      const cmdAP = document.getElementById('strat-cmd-ap');
      const stratGold = document.getElementById('strat-gold');
      const stratRewind = document.getElementById('strat-rewinder');
      const stratGuestId = document.getElementById('strat-guest-id');

      if (cmdName) cmdName.textContent = state.commander ? state.commander.name : '레오나르도';
      if (cmdLvl) cmdLvl.textContent = `Lv.${state.commander ? state.commander.level : 1}`;
      if (cmdExpFill && state.commander) {
        const pct = Math.min(100, Math.round((state.commander.exp / (state.commander.maxExp || 100)) * 100));
        cmdExpFill.style.width = `${pct}%`;
      }
      if (cmdAP) cmdAP.textContent = `${getLeadership()}부대`;
      if (stratGold) stratGold.textContent = `${state.gold}G`;
      if (stratRewind) stratRewind.textContent = `${state.rewinders}/3`;
      if (stratGuestId && state.guest) {
        stratGuestId.textContent = state.guest.supabaseUid ? `FB_${state.guest.supabaseUid.substring(0, 5)}` : state.guest.id;
      }
    }
    window.renderStrategyHeader = renderStrategyHeader;

    function renderStrategyView() {
      if (!state?.worldSectorsLoaded) { ensureWorldSectorsLoaded().then(() => { state.worldSectorsLoaded = true; renderStrategyView(); }); }
      refreshWorldSectorNodes();
      if (!state) return;
      const strat = state.strategy || {
        selectedSectorId: 'A-1',
        armyDeck: { KNIGHT: 30, MAGE: 15, ARCHER: 25, MELEE: 20, FIREARM: 10 },
        activeSkills: { RapidAdvance: true, BearDown: true, ShieldWall: true, StrategicDominance: false, Precision: false }
      };

      mountSharedHeader('view-strategy-main');
      renderStrategyHeader();

      // Selected Node -> Sector Details (11단계: 섹터가 아니라 "선택한 노드"가 기준)
      const selNode = ensureNodeSelection();
      const curSec = (selNode && WORLD_SECTORS[selNode.sectorId]) || WORLD_SECTORS[strat.selectedSectorId] || WORLD_SECTORS['A-1'];
      if (selNode) {
        strat.selectedSectorId = selNode.sectorId;
        state.selectedSectorId = selNode.sectorId;
        state.currentSector = selNode.sectorId;
      }
      const selNodeIsBattle = !selNode || RunEngine.isBattleType(selNode.type);
      const iconEl = document.getElementById('strat-sector-icon');
      const nameEl = document.getElementById('strat-sector-name-text');
      const diffBadge = document.getElementById('strat-sector-diff-badge');
      const descEl = document.getElementById('strat-sector-terrain-desc');
      const enemyEl = document.getElementById('strat-sector-enemy');
      const powerEl = document.getElementById('strat-sector-power');
      const upkeepEl = document.getElementById('strat-sector-upkeep');
      const rewardEl = document.getElementById('strat-sector-reward');

      if (iconEl) iconEl.textContent = curSec.icon;
      if (nameEl) nameEl.textContent = `${selNode ? (RunEngine.NODE_META[selNode.type]?.label || '') + ' · ' : ''}[${curSec.id}] ${curSec.name}`;
      if (diffBadge) {
        diffBadge.className = `strat-diff-badge ${curSec.difficulty.toLowerCase()}`;
        diffBadge.textContent = `${curSec.difficulty} ${curSec.stars}`;
      }
      if (descEl) descEl.textContent = curSec.terrainDesc;
      if (enemyEl) {
        if (selNode && selNodeIsBattle) renderNodeEnemyIntel(enemyEl, selNode, curSec);
        else enemyEl.textContent = curSec.enemyForce;
      }
      if (powerEl) {
        if (selNode && selNodeIsBattle) renderNodeEnemyPower(powerEl, selNode, curSec);
        else clearNodeEnemyPower(powerEl);
      }
      // 예상 턴당 유지비: 섹터 고정값이 아니라 출전 편성 유닛 유지비 합계 (아래 로스터 계산 후 채운다)
      if (rewardEl && selNode && selNodeIsBattle) renderNodeClearReward(rewardEl, selNode, curSec);
      else if (rewardEl) { rewardEl.dataset.rewardToken = ''; rewardEl.dataset.rewardNodeId = ''; rewardEl.textContent = '—'; }
      if (!selNodeIsBattle) {
        // 이벤트/상점 노드에는 적이 없다.
        if (descEl) descEl.textContent = selNode.type === 'shop' ? '군수 물자를 구입할 수 있는 보급 거점입니다.' : '전투 없이 무작위 사건이 벌어지는 구역입니다.';
        if (enemyEl) { enemyEl.dataset.intelToken = ''; enemyEl.textContent = '— (전투 없음)'; enemyEl.title = ''; }
        clearNodeEnemyPower(powerEl);
        if (upkeepEl) upkeepEl.textContent = '—';
        if (rewardEl) { rewardEl.dataset.rewardToken = ''; rewardEl.dataset.rewardNodeId = ''; rewardEl.textContent = selNode.type === 'shop' ? '골드로 구매' : '사건 결과에 따름'; }
      }

      // Terrain Bars
      const bPlain = document.getElementById('strat-bar-plain');
      const bForest = document.getElementById('strat-bar-forest');
      const bHill = document.getElementById('strat-bar-hill');
      // 지형 막대: 에디터에서 저장한 전술맵 템플릿에서 계산한 값을 우선 쓴다.
      // 아직 로드되지 않았거나 저장된 템플릿이 없으면 WORLD_SECTORS의 기본 수치를 임시로 보여 주고,
      // 곧바로 아래 refreshSectorTerrainBars()가 실제 맵 기준 값으로 교체한다.
      applyTerrainBars(sectorTerrainCache[MapSchema.resolveDefaultTemplateId(curSec.id)] || curSec.terrainComposition);
      refreshSectorTerrainBars(curSec.id);

      // Skill chips active states
      if (strat.activeSkills) {
        Object.keys(strat.activeSkills).forEach(k => {
          const chip = document.getElementById(`skill-chip-${k}`);
          if (chip) {
            const isAct = !!strat.activeSkills[k];
            chip.classList.toggle('active', isAct);
            const pill = chip.querySelector('.strat-skill-toggle-pill');
            if (pill) pill.textContent = isAct ? 'ON' : 'OFF';
          }
        });
      }

      // 출전 부대 편성 = 아군 캐릭터(영웅) 기반 (1편성부대 = 1캐릭터, 통솔력 제한)
      const activeUnits = (state.playerUnits || []).filter(u => !u.isDead);
      const selectedIds = ensureDeploySelectionInit();
      const totalUnits = selectedIds.length;
      const maxLeadership = getLeadership();

      let totalPower = 0;
      let totalUpkeep = 0;

      const rosterContainer = document.getElementById('strat-characters-roster-wrap');
      // 포로: 적에게 붙잡힌 영웅. 몸값을 내면 명단으로 돌아온다.
      const captiveHtml = getCaptives().map(u => {
        const ransom = Number(u.captive.ransom) || getCaptiveRansom(u);
        const affordable = state.gold >= ransom;
        return `
          <div class="strat-char-roster-item is-benched" title="${escapeGachaHtml(u.name)} — ${escapeGachaHtml(u.captive.captor)}에게 붙잡힘">
            <span class="strat-char-roster-check">⛓️</span>
            <div class="strat-char-roster-avatar">${renderPortrait(u, { emojiSize: '15px' })}</div>
            <div class="strat-char-roster-info">
              <div class="strat-char-roster-name-row">
                <span class="strat-char-roster-name">${escapeGachaHtml(u.name)}</span>
                <span class="strat-char-lv-badge">Lv.${u.level || 1}</span>
              </div>
              <div class="strat-char-roster-stats"><span>포로 · ${escapeGachaHtml(u.captive.captor)}에게 붙잡힘</span></div>
            </div>
            <button type="button" class="strat-char-roster-badge ${affordable ? 'ready' : 'benched'}" ${affordable ? '' : 'disabled'} onclick="event.stopPropagation(); payCaptiveRansom('${u.id}')">몸값 ${ransom}G</button>
          </div>`;
      }).join('');
      if (rosterContainer) {
        if (activeUnits.length === 0) {
          rosterContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 11px; padding: 14px;">현재 생존 중인 아군 영웅이 없습니다.</div>` + captiveHtml;
        } else {
          rosterContainer.innerHTML = activeUnits.map((u, idx) => {
            const cls = u.classType || u.unitClass || 'KNIGHT';
            const clsMeta = (typeof CLASS_META !== 'undefined' && CLASS_META[cls]) ? CLASS_META[cls] : { name: cls, avatar: '👤' };
            const uPower = calculateUnitPower(u);
            const uUpkeep = getUnitUpkeep(u);
            const isSelected = selectedIds.includes(u.id);
            if (isSelected) {
              totalPower += uPower;
              totalUpkeep += uUpkeep;
            }

            const avatarContent = renderPortrait(u, { emojiSize: '15px' });

            return `
              <div class="strat-char-roster-item ${isSelected ? 'is-selected' : 'is-benched'}" title="${u.name} (클릭 시 출전 선택/해제)" onclick="toggleDeployUnitSelection('${u.id}')" role="checkbox" aria-checked="${isSelected}" tabindex="0">
                <span class="strat-char-roster-check">${isSelected ? '✅' : '⬜'}</span>
                <div class="strat-char-roster-avatar">
                  ${avatarContent}
                </div>
                <div class="strat-char-roster-info">
                  <div class="strat-char-roster-name-row">
                    <span class="strat-char-roster-name">${u.name || ('부대 ' + (idx + 1))}</span>
                    <span class="strat-char-class-badge">${clsMeta.name}</span>
                    <span class="strat-char-lv-badge">Lv.${u.level || 1}</span>
                  </div>
                  <div class="strat-char-roster-stats">
                    <span>⚔️ ${u.atk || 40}</span>
                    <span>🛡️ ${formatDefense(u)}</span>
                    <span>❤️ ${u.hp || 100}/${u.maxHp || 100}</span>
                    <span style="color: #0284c7; font-weight: 800;">⚡ ${uPower} PWR</span>
                  </div>
                </div>
                <div class="strat-char-roster-badge ${isSelected ? 'ready' : 'benched'}" onclick="event.stopPropagation(); selectRosterUnitAndOpenProfile('${u.id}')">
                  상태창 🔍
                </div>
              </div>
            `;
          }).join('') + captiveHtml;
        }
      } else {
        // Fallback calculations if roster container missing
        activeUnits.filter(u => selectedIds.includes(u.id)).forEach(u => {
          totalPower += calculateUnitPower(u);
          totalUpkeep += getUnitUpkeep(u);
        });
      }

      const totalUnitsEl = document.getElementById('strat-total-units');
      const armyPowerEl = document.getElementById('strat-army-power');
      const armyUpkeepEl = document.getElementById('strat-army-upkeep');
      const leadershipLimitSub = document.getElementById('strat-leadership-limit-sub');

      if (leadershipLimitSub) {
        leadershipLimitSub.textContent = `통솔력 한도: 최대 ${maxLeadership}부대`;
      }

      if (totalUnitsEl) {
        totalUnitsEl.textContent = `${totalUnits} / ${maxLeadership}`;
        if (totalUnits > maxLeadership) {
          totalUnitsEl.classList.add('warning');
          totalUnitsEl.title = `통솔력(${maxLeadership})을 초과하여 출격할 수 없습니다!`;
        } else {
          totalUnitsEl.classList.remove('warning');
          totalUnitsEl.title = `1편성부대 = 1영웅 캐릭터 (통솔력 한도 내 출전)`;
        }
      }
      if (armyPowerEl) armyPowerEl.textContent = `${Math.round(totalPower)} PWR`;
      if (armyUpkeepEl) armyUpkeepEl.textContent = `${Math.round(totalUpkeep)}G / 턴`;
      if (upkeepEl && selNodeIsBattle) {
        upkeepEl.textContent = `${Math.round(totalUpkeep)}G / 턴`;
        upkeepEl.title = `출전 편성 ${totalUnits}기의 유지비 합계 (턴 종료마다 청구, 마을·도시 칸에 주둔한 유닛은 면제)`;
      }

      // Bottom Action Summary
      const destSummary = document.getElementById('strat-action-summary-dest');
      if (destSummary) destSummary.textContent = `[${curSec.id} ${curSec.name}] ${selNode ? nodeTypeLabel(selNode) + ' ' : ''}작전 준비`;

      const actionCostEl = document.getElementById('strat-action-summary-cost');
      if (actionCostEl) {
        actionCostEl.textContent = selNodeIsBattle
          ? `👑 통솔력 ${totalUnits} / ${maxLeadership} | ${totalUnits} 영웅 부대 출동`
          : '전투 없는 노드';
      }

      // 출격 버튼: 런 상태/노드 상태에 따라 문구와 활성 여부가 바뀐다.
      const launchBtn = document.getElementById('btn-open-deploy-modal');
      if (launchBtn && state.run) {
        const nodeStatus = selNode ? RunEngine.getNodeStatus(state.run, selNode.id) : 'locked';
        let enabled = false, text = '아직 열리지 않은 노드', icon = '🔒';
        if (state.run.status !== 'active') { text = '런 종료'; icon = '🏆'; }
        else if (nodeStatus === 'completed') { text = '이미 완료한 노드'; icon = '✔'; }
        else if (nodeStatus === 'available') {
          enabled = true;
          if (selNodeIsBattle) { text = '작전 개시 (출격)'; icon = '⚔️'; }
          else if (selNode.type === 'shop') { text = '상점 입장'; icon = '🛒'; }
          else { text = '이벤트 진행'; icon = '❓'; }
        }
        const spans = launchBtn.querySelectorAll('span');
        if (spans[0]) spans[0].textContent = icon;
        if (spans[1]) spans[1].textContent = text;
        launchBtn.disabled = !enabled;
        launchBtn.style.opacity = enabled ? '' : '0.55';
        launchBtn.style.cursor = enabled ? '' : 'not-allowed';
      }

      // Header sub-tag in sector map view
      const subTagEl = document.getElementById('ui-sector-sub-tag');
      if (subTagEl) subTagEl.textContent = `SECTOR ${curSec.id}: ${curSec.name.toUpperCase()}`;

      // 회귀 보상: 선택 노드의 예지/기시감 정보
      renderNodeForesight(state.selectedNodeId ? RunEngine.getNode(state.run, state.selectedNodeId) : null);
    }
    window.renderStrategyView = renderStrategyView;

    // ------------------------------------------------------------------------
    // 출전 부대 편성: 보유 영웅 중 이번 작전에 데려갈 영웅을 직접 고른다.
    // state.strategy.deploySelectedIds = 출전 선택 영웅 id 목록
    // ------------------------------------------------------------------------
    function getDeployLeadershipLimit() {
      return getLeadership();
    }

    function ensureDeploySelectionInit() {
      if (!state.strategy) return [];
      const aliveIds = (state.playerUnits || []).filter(u => !u.isDead).map(u => u.id);
      const st = state.strategy;
      if (!Array.isArray(st.deployKnownIds)) st.deployKnownIds = [];

      if (!Array.isArray(st.deploySelectedIds)) {
        // 최초: 기존 동작(전원 출전)과 호환되도록 통솔력 한도 내에서 앞에서부터 자동 선택
        st.deploySelectedIds = aliveIds.slice(0, getDeployLeadershipLimit());
        st.deployKnownIds = aliveIds.slice();
      } else {
        // 새로 합류한 영웅은 자동으로 편성 명단에 추가 (한도 내에서)
        aliveIds.forEach(id => {
          if (!st.deployKnownIds.includes(id)) {
            st.deployKnownIds.push(id);
            if (st.deploySelectedIds.length < getDeployLeadershipLimit()) st.deploySelectedIds.push(id);
          }
        });
        // 사망/이탈한 영웅은 선택 목록에서 제거
        st.deploySelectedIds = st.deploySelectedIds.filter(id => aliveIds.includes(id));
        // 통솔력 한도보다 많이 골라 둔 명단(예전 세이브 등)은 앞에서부터 한도만큼만 남긴다
        const limit = getDeployLeadershipLimit();
        if (st.deploySelectedIds.length > limit) st.deploySelectedIds = st.deploySelectedIds.slice(0, limit);
      }
      return st.deploySelectedIds;
    }

    function getSelectedDeployUnits() {
      const ids = ensureDeploySelectionInit();
      return (state.playerUnits || []).filter(u => !u.isDead && ids.includes(u.id));
    }

    function toggleDeployUnitSelection(unitId) {
      if (!state.strategy) return;
      const sel = ensureDeploySelectionInit();
      const idx = sel.indexOf(unitId);
      if (idx >= 0) {
        sel.splice(idx, 1);
      } else {
        const limit = getDeployLeadershipLimit();
        if (sel.length >= limit) {
          const msg = `⚠️ 통솔력 한도(${limit}부대)를 초과하여 더 편성할 수 없습니다.`;
          addLog(msg, 'warning');
          if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
          return;
        }
        sel.push(unitId);
      }
      renderStrategyView();
      saveGameState(true);
    }
    window.toggleDeployUnitSelection = toggleDeployUnitSelection;

    function setDeploySelectionAll(selectAll) {
      if (!state.strategy) return;
      ensureDeploySelectionInit();
      if (selectAll) {
        const alive = (state.playerUnits || []).filter(u => !u.isDead).map(u => u.id);
        const limit = getDeployLeadershipLimit();
        state.strategy.deploySelectedIds = alive.slice(0, limit);
        if (alive.length > limit) {
          const msg = `⚠️ 통솔력 한도(${limit}부대)까지만 자동 선택되었습니다.`;
          addLog(msg, 'warning');
          if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        }
      } else {
        state.strategy.deploySelectedIds = [];
      }
      renderStrategyView();
      saveGameState(true);
    }
    window.setDeploySelectionAll = setDeploySelectionAll;

    // 전략 편성 화면에서 영웅 카드 클릭 시 캐릭터 상태창(풀샷 오버레이) 열기
    function selectRosterUnitAndOpenProfile(unitId) {
      if (!state || !state.playerUnits) return;
      const u = state.playerUnits.find(unit => unit.id === unitId);
      if (u) {
        selectedUnitId = u.id;
        openFullShotOverlay(u);
        const clsMeta = (typeof CLASS_META !== 'undefined' && CLASS_META[u.classType]) ? CLASS_META[u.classType] : { name: u.classType };
        addLog(`📋 [캐릭터 상태창] ${u.name} (Lv.${u.level || 1} ${clsMeta.name}) 상세 정보 및 능력치를 확인합니다.`, 'system');
      }
    }
    window.selectRosterUnitAndOpenProfile = selectRosterUnitAndOpenProfile;

    // 7. 섹터 강습 출격 시뮬레이션 모달 오픈
    function openSectorDeployModal() {
      if (isRunBlocked()) return reportRunBlocked();
      const modal = document.getElementById('modal-sector-deploy');
      if (!modal) return;

      const strat = state.strategy;
      // 11단계: 모달은 "선택한 노드"가 열려 있을 때만 뜬다. 이벤트/상점 노드는 출전 편성 없이 전용 창으로 간다.
      const selNode = ensureNodeSelection();
      const warnNode = (msg) => {
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
      };
      if (!selNode) { warnNode('⚠️ 선택된 노드가 없습니다.'); return; }
      if (state.run.status !== 'active') { warnNode('🏆 이번 런은 이미 종료되었습니다.'); return; }
      if (!RunEngine.isNodeAvailable(state.run, selNode.id)) { warnNode('🔒 아직 열리지 않았거나 이미 완료한 노드입니다.'); return; }
      if (!RunEngine.isBattleType(selNode.type)) { openRunNodeModal(selNode); return; }
      const curSec = WORLD_SECTORS[selNode.sectorId] || { id: selNode.sectorId, name: selNode.sectorId, difficulty: 'NORMAL', stars: '', terrainDesc: '', enemyForce: '' };

      // 총 부대 수 및 전투력 계산 (1편성부대 = 1캐릭터)
      const activeUnits = getSelectedDeployUnits();
      const totalUnits = activeUnits.length;
      const maxLeadership = getLeadership();
      let myPower = 0;
      activeUnits.forEach(u => {
        myPower += calculateUnitPower(u);
      });
      myPower = Math.round(myPower); // calculateUnitPower: 적과 같은 공식

      const titleEl = document.getElementById('deploy-sim-sector-name');
      const descEl = document.getElementById('deploy-sim-desc');
      const myPowerEl = document.getElementById('deploy-sim-my-power');
      const myUnitsEl = document.getElementById('deploy-sim-units-count');
      const enemyPowerEl = document.getElementById('deploy-sim-enemy-power');
      const enemyNameEl = document.getElementById('deploy-sim-enemy-name');
      const diffEl = document.getElementById('deploy-sim-diff');

      if (titleEl) titleEl.textContent = `[${curSec.id}] ${curSec.name} ${nodeTypeLabel(selNode)} 작전`;
      if (descEl) descEl.textContent = `${curSec.terrainDesc} 아군 선봉 ${totalUnits}개 영웅 부대가 전술 필드로 워프 전개합니다.`;
      if (myPowerEl) myPowerEl.textContent = `${myPower} PWR`;
      if (myUnitsEl) myUnitsEl.textContent = `${totalUnits}개 부대 (${totalUnits}명) 편성 완료`;
      const leadershipEl = document.getElementById('deploy-sim-leadership');
      if (leadershipEl) leadershipEl.textContent = `${totalUnits} / ${maxLeadership}부대`;
      // 적 전투력: 고정 추천치가 아니라 실제 적 생성 규칙(캐릭터 풀 × 난이도 배율 × 스폰 수)으로 계산
      if (enemyPowerEl) renderNodeEnemyPower(enemyPowerEl, selNode, curSec);
      if (enemyNameEl) renderNodeEnemyIntel(enemyNameEl, selNode, curSec);
      if (diffEl) {
        diffEl.className = `strat-diff-badge ${curSec.difficulty.toLowerCase()}`;
        diffEl.textContent = `${curSec.difficulty} ${curSec.stars}`;
      }

      modal.style.display = 'flex';
      modal.classList.add('open');
    }
    window.openSectorDeployModal = openSectorDeployModal;

    function closeSectorDeployModal() {
      const modal = document.getElementById('modal-sector-deploy');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
      }
    }
    window.closeSectorDeployModal = closeSectorDeployModal;

    // 8. 강습 작전 개시 (출격)
    async function launchSectorOperation() {
      if (!state.strategy) return;
      // 11단계: 출격은 "지금 열려 있는 전투 노드"에서만 가능하다.
      const launchNode = ensureNodeSelection();
      if (!launchNode || state.run.status !== 'active' || !RunEngine.isBattleType(launchNode.type) || !RunEngine.isNodeAvailable(state.run, launchNode.id)) {
        const msg = '⚠️ 출격할 수 있는 전투 노드가 선택되지 않았습니다.';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        closeSectorDeployModal();
        return;
      }
      const activeUnits = getSelectedDeployUnits();
      const maxLeadership = getLeadership();
      if (activeUnits.length === 0) {
        const msg = '⚠️ 출전할 영웅이 편성되지 않았습니다. 출전 부대 편성에서 영웅을 선택하세요.';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        closeSectorDeployModal();
        return;
      }
      if (activeUnits.length > maxLeadership) {
        const msg = `⚠️ 현재 편성된 부대 수(${activeUnits.length}개)가 지휘관 통솔력(${maxLeadership})을 초과하여 출격할 수 없습니다!`;
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }

      // 1) state.selectedSectorId = currentSector.id; 현재 선택된 섹터 ID 저장
      const activeSectorId = launchNode.sectorId;
      state.selectedSectorId = activeSectorId;
      state.currentSector = activeSectorId;
      if (state.strategy) state.strategy.selectedSectorId = activeSectorId;

      // 이번 전투에 실제로 투입될 영웅 id를 전투 진입 전에 확정한다 (enterEncounter가 이 값으로 배치).
      state.currentDeployedUnitIds = activeUnits.map(u => u.id);

      closeSectorDeployModal();

      const curSec = WORLD_SECTORS[activeSectorId] || { id: activeSectorId, name: activeSectorId };
      addLog(`🚀 [작전 개시] ${launchNode.id} · [${curSec.id} ${curSec.name}] 전장으로 아군 선봉 ${activeUnits.length}개 부대가 출격했습니다!`, 'gold');

      // 전술 전장 상태 초기화 및 전투 활성화 플래그 설정
      if (typeof window.resetTacticalBattleState === 'function') {
        window.resetTacticalBattleState();
      }

      const views = window.GAME_VIEWS || { WORLD_STRATEGY: 'WORLD_STRATEGY', SECTOR_FIELD: 'SECTOR_FIELD', STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY' };
      const sectorView = views.SECTOR_FIELD || 'SECTOR_MAP';

      // 단일 진실 공급원인 state.isCombatActive 활성화 (나머지 4곳은 getter로 자동 참조)
      if (state) {
        state.isCombatActive = true;
        state.isCombatPaused = false;
        state.savedTacticalState = null;
        state.currentView = sectorView;
      }
      window.isCombatPaused = false;
      if (window.playerState) {
        window.playerState.isCombatPaused = false;
        window.playerState.savedTacticalState = null;
        window.playerState.currentView = sectorView;
      }
      if (window.gameState) {
        window.gameState.isCombatPaused = false;
        window.gameState.savedTacticalState = null;
        window.gameState.currentView = sectorView;
      }

      // 2) 전투 진입은 enterEncounter() 하나만 담당한다.
      const activeNodeId = launchNode.id;
      const encounterReady = await enterEncounter(activeNodeId);
      if (!encounterReady) {
        // 맵 로드 실패 시 전투를 시작한 것으로 남기지 않는다.
        state.isCombatActive = false;
        state.currentView = 'STRATEGY';
        renderStrategyView();
        saveGameState(true);
        return;
      }

      state.currentView = 'SECTOR_MAP';
      switchGameView('SECTOR_MAP');
    }
    window.launchSectorOperation = launchSectorOperation;

    function renderAll() {
      renderLoopCounter();
      renderDeployBanner();
      const viewCampaign = document.getElementById('view-campaign-map');
      if (viewCampaign) viewCampaign.classList.toggle('active', !!(state && state.currentView === 'CAMPAIGN'));
      if (state && state.currentView === 'CAMPAIGN') {
        document.getElementById('view-strategy-main')?.classList.remove('active');
        document.getElementById('view-sector-field')?.classList.remove('active');
        renderCampaignView();
      } else if (state && state.currentView === 'STRATEGY') {
        document.getElementById('modal-adjutant')?.remove(); // 부관 임명 창은 작전지도 전용
        const viewStrat = document.getElementById('view-strategy-main');
        const viewSector = document.getElementById('view-sector-field');
        if (viewStrat) viewStrat.classList.add('active');
        if (viewSector) viewSector.classList.remove('active');
        renderStrategyView();
      } else {
        const viewStrat = document.getElementById('view-strategy-main');
        const viewSector = document.getElementById('view-sector-field');
        if (viewStrat) viewStrat.classList.remove('active');
        if (viewSector) viewSector.classList.add('active');
        renderGrid();
        renderHeaderAndCard();
        updateFullShotOverlay();
      }
    }

    /* --------------------------------------------------------------------------
       Modal Windows Handling
       -------------------------------------------------------------------------- */
    function closeAllModals() {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
    }

    /* --------------------------------------------------------------------------
       Unit Class Special Skill (병과특기) System
       -------------------------------------------------------------------------- */
    const UNIT_CLASS_SKILLS = {
      KNIGHT: {
        skillName: '돌격 태세 (Assault Stance)',
        icon: '🏇',
        tag: '기동 돌격기',
        costAP: 1,
        atkBonus: 6,
        desc: '기사도의 강인한 돌격력을 실어 이번 턴 공격력을 +6 영구(턴 내) 증폭합니다.'
      },
      MELEE: {
        skillName: '배수의 진 (Berserk Wrath)',
        icon: '⚔️',
        tag: '강습 연타',
        costAP: 1,
        atkBonus: 6,
        desc: '검기를 집중하여 전방 적을 분쇄하는 돌파력을 얻습니다. 이번 턴 공격력이 +6 증가합니다.'
      },
      ARCHER: {
        skillName: '정밀 저격 (Eagle Eye)',
        icon: '🏹',
        tag: '약점 사격',
        costAP: 1,
        atkBonus: 6,
        desc: '적의 사각지대와 급소를 간파하여 치명타 확률을 극대화합니다. 이번 턴 공격력이 +6 증가합니다.'
      }
    };

    function openClassSkillModal(targetUnit) {
      const unit = targetUnit || getSelectedUnit();
      if (!unit) {
        addLog('⚠️ 먼저 전장에서 아군 유닛을 선택해주세요.', 'system');
        return;
      }

      const modal = document.getElementById('modal-class-skill');
      if (!modal) return;

      const skillData = UNIT_CLASS_SKILLS[unit.classType] || {
        skillName: '전선의 함성 (Battle Roar)',
        icon: '✨',
        tag: '병과 고유기',
        costAP: 1,
        atkBonus: 6,
        desc: '아군 부대의 사기를 진작하여 이번 턴 공격력을 +6 증가시킵니다.'
      };

      const titleEl = document.getElementById('class-skill-modal-title');
      if (titleEl) {
        titleEl.innerHTML = `✨ ${unit.name} - 병과 고유 특기`;
      }

      const bodyEl = document.getElementById('class-skill-modal-body');
      if (bodyEl) {
        const canUse = unit.ap >= skillData.costAP && !unit.isInactivated && !unit.isDead;
        bodyEl.innerHTML = `
          <!-- Unit Profile Mini Banner -->
          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%); border: 1.5px solid #bae6fd; border-radius: 14px; padding: 12px; display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 30px; width: 48px; height: 48px; background: #ffffff; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.08); border: 2px solid #38bdf8; flex-shrink: 0;">
              ${unit.avatar}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 14px; font-weight: 900; color: #0f172a; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span>${unit.name}</span>
                <span style="font-size: 10px; background: #f59e0b; color: #fff; padding: 1px 6px; border-radius: 6px; font-weight: 900;">Lv.${unit.level}</span>
                <span style="font-size: 10px; background: #e0e7ff; color: #4338ca; padding: 1px 6px; border-radius: 6px; font-weight: 800;">${unit.classType}</span>
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px; display: flex; gap: 8px;">
                <span>⚔️ ATK <b style="color:#0f172a;">${unit.atk}</b></span>
                <span>🛡️ DEF <b style="color:#0f172a;">${formatDefense(unit)}</b></span>
                <span>⚡ AP <b style="color:${unit.ap > 0 ? '#0284c7' : '#ef4444'};">${unit.ap}/${unit.baseAP}</b></span>
              </div>
            </div>
          </div>

          <!-- Skill Card -->
          <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px;">${skillData.icon}</span>
                <div>
                  <div style="font-size: 14px; font-weight: 900; color: #0f172a;">${skillData.skillName}</div>
                  <div style="font-size: 10px; color: #8b5cf6; font-weight: 800;">${skillData.tag}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 11px; font-weight: 900; background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; padding: 2px 8px; border-radius: 12px;">
                  ⚡ AP ${skillData.costAP} 소모
                </span>
              </div>
            </div>

            <p style="font-size: 12px; line-height: 1.5; color: #334155; margin: 0 0 10px 0; background: #f8fafc; padding: 8px 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
              ${skillData.desc}
            </p>

            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; color: #475569; padding-top: 4px;">
              <span>발동 효과: 이번 턴 <b style="color: #ea580c;">공격력 +${skillData.atkBonus}</b></span>
              <span style="color: ${canUse ? '#059669' : '#dc2626'}; font-weight: 900;">
                ${canUse ? '● 발동 가능' : (unit.ap < skillData.costAP ? '● 행동력(AP) 부족' : '● 행동 완료')}
              </span>
            </div>
          </div>

          <!-- Action Button -->
          <div style="margin-top: 4px;">
            ${canUse ? `
              <button id="btn-modal-exec-skill" style="width: 100%; padding: 12px; font-size: 13.5px; font-weight: 900; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff; border: none; box-shadow: 0 4px 12px rgba(109, 40, 217, 0.35); cursor: pointer; transition: all 0.15s ease;">
                ✨ 병과특기 즉시 발동 (AP 1 소모)
              </button>
            ` : `
              <button disabled style="width: 100%; padding: 12px; font-size: 13.5px; font-weight: 900; border-radius: 12px; background: #cbd5e1; color: #64748b; border: none; cursor: not-allowed;">
                ⚠️ 특기 발동 불가 (AP 부족 또는 행동 완료)
              </button>
            `}
          </div>
        `;

        const execBtn = document.getElementById('btn-modal-exec-skill');
        if (execBtn) {
          execBtn.onclick = () => {
            if (unit.ap < skillData.costAP || unit.isInactivated) return;
            saveHistorySnapshot();
            unit.ap -= skillData.costAP;
            unit.atk += skillData.atkBonus;
            addLog(`✨ [병과특기] ${unit.name}의 ${skillData.skillName} 발동! (이번 턴 공격력 +${skillData.atkBonus} 증가)`, 'success');
            renderAll();
            openClassSkillModal(unit);
          };
        }
      }

      modal.classList.add('open');
    }

    window.openSkillsModal = openSkillsModal;

    // 지휘관 창 탭 (부관·스킬 / 보유 유물)
    function switchCommanderTab(tab) {
      document.querySelectorAll('#modal-skills .cmd-tab').forEach(btn => {
        const on = btn.dataset.cmdTab === tab;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('#modal-skills .cmd-tab-panel').forEach(panel => {
        panel.hidden = panel.dataset.cmdPanel !== tab;
      });
      if (tab === 'relics') renderCommanderRelics();
      if (tab === 'capture') renderCaptureDoctrinePanel();
    }
    window.switchCommanderTab = switchCommanderTab;

    function renderCommanderRelics() {
      const relics = getOwnedRelics();
      const countEl = document.getElementById('cmd-relic-count');
      if (countEl) countEl.textContent = relics.length;
      const list = document.getElementById('modal-relic-list');
      if (!list) return;
      const levelPart = getLeadershipForLevel(state.commander ? state.commander.level : 1);
      const relicPart = getRelicLeadershipBonus();
      const equipped = getEquippedCommanderRelics();
      const locked = isCharacterPoolLocked();
      const summary = `
        <div class="relic-summary">
          <span>👑 통솔력 <b>${levelPart + relicPart}부대</b></span>
          <small>지휘관 Lv.${state.commander ? state.commander.level : 1} ${levelPart}부대${relicPart ? ` + 유물 ${relicPart}부대` : ''}</small>
        </div>
        <div class="relic-note">지휘관 유물은 ${COMMANDER_RELIC_SLOTS}개까지 장착할 수 있고 장착한 것만 효과가 납니다 (지금은 통솔력 효과만 적용). 선물 유물은 캐릭터에게 선물하면 등급에 따라 호감도가 오르고(${Object.values(RELIC_RARITY_META).map(m => `${m.label} +${m.giftAffection}`).join(' · ')}) 유물 능력치도 더해집니다. 회귀하면 유물은 사라집니다.</div>`;
      const pending = state.run && state.run.pendingRelicChoice
        ? `<button type="button" class="adj-btn relic-pending-btn" onclick="openRelicChoiceModal()">👑 보스 유물 선택이 남아 있습니다 — 고르기</button>` : '';
      const slots = Array.from({ length: COMMANDER_RELIC_SLOTS }, (_, i) => {
        const r = equipped[i];
        if (!r) return `<div class="relic-slot empty"><span class="relic-slot-no">${i + 1}</span><span>빈 슬롯</span></div>`;
        const rarity = RELIC_RARITY_META[r.rarity] || RELIC_RARITY_META.common;
        return `
          <button type="button" class="relic-slot" style="--relic-color:${rarity.color}" data-relic-unequip="${escapeGachaHtml(r.instanceId)}" ${locked ? 'disabled' : ''} title="눌러서 장착 해제">
            <span class="relic-slot-no">${i + 1}</span>
            <span class="relic-icon">${r.imageUrl ? `<img src="${escapeGachaHtml(r.imageUrl)}" alt="">` : '💎'}</span>
            <span class="relic-slot-name">${escapeGachaHtml(r.name)}</span>
          </button>`;
      }).join('');
      const slotBox = `
        <div class="relic-section-title">장착 슬롯 <small>${equipped.length} / ${COMMANDER_RELIC_SLOTS}</small></div>
        <div class="relic-slots">${slots}</div>
        ${locked ? '<div class="relic-note">전투 중에는 장착을 바꿀 수 없습니다.</div>' : ''}`;
      const commander = relics.filter(r => r.kind !== 'gift');
      const gifts = relics.filter(r => r.kind === 'gift');
      const full = equipped.length >= COMMANDER_RELIC_SLOTS;
      const commanderCards = commander.map(r => {
        const on = isRelicEquipped(r);
        const btn = on
          ? `<button type="button" class="relic-pick-btn ghost" data-relic-unequip="${escapeGachaHtml(r.instanceId)}" ${locked ? 'disabled' : ''}>장착 해제</button>`
          : `<button type="button" class="relic-pick-btn" data-relic-equip="${escapeGachaHtml(r.instanceId)}" ${locked || full ? 'disabled' : ''}>${full ? '슬롯 가득 참' : '장착'}</button>`;
        return relicCardHtml(r, { equipped: on, button: btn });
      }).join('');
      const giftCards = gifts.map(r => relicCardHtml(r, {
        button: `<button type="button" class="relic-pick-btn gift" data-relic-gift="${escapeGachaHtml(r.instanceId)}">🎁 선물하기</button>`
      })).join('');
      const section = (title, count, cards) => count
        ? `<div class="relic-section-title">${title} <small>${count}</small></div><div class="relic-grid">${cards}</div>` : '';
      list.innerHTML = summary + pending + slotBox + (relics.length
        ? section('지휘관 유물', commander.length, commanderCards) + section('선물 유물 (보관 중)', gifts.length, giftCards)
        : '<div class="adj-empty">아직 가진 유물이 없습니다.</div>');
      list.querySelectorAll('[data-relic-equip]').forEach(b => { b.onclick = () => setRelicEquipped(b.dataset.relicEquip, true); });
      list.querySelectorAll('[data-relic-unequip]').forEach(b => { b.onclick = () => setRelicEquipped(b.dataset.relicUnequip, false); });
      list.querySelectorAll('[data-relic-gift]').forEach(b => { b.onclick = () => openRelicGiftPicker({ relicInstanceId: b.dataset.relicGift }); });
      // 효과 이름표(RewardEngine)가 아직 없으면 불러온 뒤 다시 그린다
      if (!window.RewardEngine && relics.length) ensureRewardDataLoaded().then(data => { if (data) renderCommanderRelics(); });
    }

    function openSkillsModal() {
      const modal = document.getElementById('modal-skills');
      renderAdjutantPanel();
      renderCommanderRelics();
      renderCaptureDoctrinePanel();
      const grid = document.getElementById('modal-skill-grid');
      document.getElementById('modal-sp-display').textContent = state.commander.skillPoints;

      grid.innerHTML = '';
      Object.keys(COMMANDER_SKILLS_DATA).forEach(skillId => {
        const s = COMMANDER_SKILLS_DATA[skillId];
        const isUnlocked = state.commander.unlockedSkills[skillId];
        const hasPrereq = !s.prerequisite || state.commander.unlockedSkills[s.prerequisite];
        const canUnlock = !isUnlocked && hasPrereq && state.commander.skillPoints >= s.cost;

        const card = document.createElement('div');
        card.className = `skill-card ${isUnlocked ? 'unlocked' : ''}`;
        card.innerHTML = `
          <div class="skill-card-name">
            <span>${s.name}</span>
            <span>${isUnlocked ? '✅ 해금' : s.cost + ' SP'}</span>
          </div>
          <div class="skill-card-desc">${s.desc}</div>
          ${s.prerequisite ? `<div style="font-size: 9px; color: #f59e0b;">(선행: ${COMMANDER_SKILLS_DATA[s.prerequisite].name})</div>` : ''}
          ${!isUnlocked ? `
            <button class="btn-skill-unlock ${canUnlock ? 'can-unlock' : ''}" ${!canUnlock ? 'disabled' : ''} onclick="unlockCommanderSkill('${skillId}')">
              ${canUnlock ? '스킬 해금하기' : (hasPrereq ? 'SP 부족' : '선행 스킬 필요')}
            </button>
          ` : ''}
        `;
        grid.appendChild(card);
      });

      modal.classList.add('open');
    }

    function unlockCommanderSkill(skillId) {
      const s = COMMANDER_SKILLS_DATA[skillId];
      if (state.commander.skillPoints < s.cost) return;

      saveHistorySnapshot();
      state.commander.skillPoints -= s.cost;
      state.commander.unlockedSkills[skillId] = true;

      addLog(`⭐ [지휘관 패시브 해금] ${s.name} 능력이 활성화되었습니다!`, 'gold');
      openSkillsModal(); // Re-render modal
      renderAll();
      saveGameState();
    }

    // data-base-price 가 붙은 버튼의 가격 표시를 현재 물가로 고친다 (마을 보급소)
    function refreshPriceLabels(root) {
      (root || document).querySelectorAll('[data-base-price]').forEach(el => {
        el.textContent = `${scaleGold(Number(el.dataset.basePrice))}G ${el.dataset.priceSuffix || ''}`.trim();
      });
    }
    window.refreshPriceLabels = refreshPriceLabels;

    function openVillageModal() {
      const modal = document.getElementById('modal-village');
      refreshPriceLabels(modal);
      modal.classList.add('open');
    }

    function openCityModal() {
      const unit = getSelectedUnit();
      if (unit) {
        document.getElementById('city-sell-title').textContent = `💰 [${unit.name}] 명예 퇴역 (매각)`;
      }
      const upgradeBtn = document.getElementById('btn-city-upgrade');
      if (upgradeBtn) upgradeBtn.textContent = `${getAcademyUpgradeCost()}G 훈련`;
      document.getElementById('modal-city').classList.add('open');
    }

    /* --------------------------------------------------------------------------
       Character Image Management & Full-Shot Overlay System (우마무스메풍 전신 풀샷)
       -------------------------------------------------------------------------- */
    const CLASS_META = {
      KNIGHT: { name: '기사', icon: '🐴', role: '전열 탱커 & 돌격기', color: '#0284c7' },
      MAGE: { name: '마법사', icon: '🔮', role: '광역 마법 화력 지원', color: '#7c3aed' },
      ARCHER: { name: '궁수', icon: '🏹', role: '원거리 저격 및 급소 사격', color: '#16a34a' },
      MELEE: { name: '근접', icon: '⚔️', role: '근접 방벽 및 백병전', color: '#dc2626' },
      FIREARM: { name: '화기', icon: '💥', role: '원거리 포격 및 진지 돌파', color: '#ea580c' }
    };

    // 직업(병과) 표시명. CLASS_META에 없으면 코드값 그대로.
    function getClassLabel(cls) {
      return (cls && CLASS_META[cls]?.name) || cls || '';
    }
    window.getClassLabel = getClassLabel;

    let customClassImages = {
      KNIGHT: '',
      MAGE: '',
      ARCHER: '',
      MELEE: '',
      FIREARM: ''
    };

    // 고해상도 판타지 애니메 스타일 전신 풀샷 벡터 프리셋 (외부 네트워크 의존성 없는 즉시 로드용)
    const SAMPLE_CLASS_IMAGES = {
      KNIGHT: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="kg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#0284c7"/>
            </linearGradient>
            <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="100%" stop-color="#f59e0b"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#e0f2fe" opacity="0.35"/>
          <path d="M 120 110 Q 70 240 60 380 Q 140 400 170 380 Q 160 250 160 120 Z" fill="#0284c7" opacity="0.85"/>
          <path d="M 160 120 Q 170 250 180 380 Q 240 395 260 370 Q 220 230 190 110 Z" fill="#0369a1" opacity="0.9"/>
          <ellipse cx="160" cy="185" rx="42" ry="55" fill="url(#kg)"/>
          <path d="M 130 150 L 190 150 L 175 225 L 145 225 Z" fill="#ffffff" opacity="0.25"/>
          <rect x="132" y="225" width="56" height="12" rx="3" fill="#334155"/>
          <rect x="152" y="223" width="16" height="16" rx="4" fill="url(#gold)"/>
          <rect x="135" y="237" width="22" height="135" rx="8" fill="#0f172a"/>
          <rect x="163" y="237" width="22" height="135" rx="8" fill="#1e293b"/>
          <ellipse cx="146" cy="375" rx="15" ry="8" fill="#0284c7"/>
          <ellipse cx="174" cy="375" rx="15" ry="8" fill="#0369a1"/>
          <ellipse cx="118" cy="135" rx="18" ry="14" fill="url(#gold)"/>
          <ellipse cx="202" cy="135" rx="18" ry="14" fill="url(#gold)"/>
          <circle cx="160" cy="85" r="32" fill="#fed7aa"/>
          <path d="M 128 75 Q 160 30 192 75 Q 200 105 188 115 Q 160 95 132 115 Z" fill="#fef08a"/>
          <path d="M 145 70 Q 160 45 175 70 Q 165 95 155 95 Z" fill="#fef08a"/>
          <path d="M 135 75 Q 160 70 185 75" stroke="url(#gold)" stroke-width="4" fill="none"/>
          <polygon points="160,60 166,74 154,74" fill="url(#gold)"/>
          <ellipse cx="148" cy="88" rx="4" ry="6" fill="#0284c7"/>
          <circle cx="147" cy="86" r="1.5" fill="#ffffff"/>
          <ellipse cx="172" cy="88" rx="4" ry="6" fill="#0284c7"/>
          <circle cx="171" cy="86" r="1.5" fill="#ffffff"/>
          <path d="M 158 97 Q 160 100 162 97" stroke="#f43f5e" stroke-width="2" fill="none"/>
          <rect x="222" y="40" width="8" height="340" rx="4" fill="#e2e8f0"/>
          <polygon points="226,15 218,50 234,50" fill="url(#gold)"/>
          <rect x="210" y="210" width="32" height="8" rx="3" fill="url(#gold)"/>
          <circle cx="226" cy="214" r="7" fill="#38bdf8"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#38bdf8" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">✨ HOLY KNIGHT ROLAND</text>
        </svg>
      `),
      MAGE: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c084fc"/>
              <stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient>
            <linearGradient id="pStar" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f472b6"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#faf5ff" opacity="0.4"/>
          <path d="M 120 160 Q 80 300 70 385 Q 160 405 250 385 Q 240 300 200 160 Z" fill="url(#mg)"/>
          <path d="M 140 180 L 160 385 L 180 180 Z" fill="#ffffff" opacity="0.2"/>
          <ellipse cx="160" cy="170" rx="35" ry="45" fill="#581c87"/>
          <circle cx="160" cy="95" r="28" fill="#fed7aa"/>
          <path d="M 132 80 Q 90 140 85 240 Q 110 240 115 160 Q 140 80 132 80 Z" fill="#c084fc"/>
          <path d="M 188 80 Q 230 140 235 240 Q 210 240 205 160 Q 180 80 188 80 Z" fill="#a855f7"/>
          <path d="M 135 85 Q 160 60 185 85 Q 180 110 160 100 Q 140 110 135 85 Z" fill="#a855f7"/>
          <ellipse cx="149" cy="98" rx="4" ry="5.5" fill="#7c3aed"/>
          <circle cx="148" cy="96" r="1.5" fill="#fff"/>
          <ellipse cx="171" cy="98" rx="4" ry="5.5" fill="#7c3aed"/>
          <circle cx="170" cy="96" r="1.5" fill="#fff"/>
          <polygon points="160,15 125,75 195,75" fill="#4c1d95"/>
          <ellipse cx="160" cy="74" rx="48" ry="12" fill="#581c87"/>
          <rect x="135" y="66" width="50" height="7" fill="url(#pStar)"/>
          <rect x="75" y="60" width="7" height="320" rx="3.5" fill="#78350f"/>
          <circle cx="78" cy="55" r="20" fill="none" stroke="#e879f9" stroke-width="4"/>
          <polygon points="78,38 88,55 78,72 68,55" fill="#f472b6"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#e879f9" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">🔮 HIGH ARCHMAGE CELESTE</text>
        </svg>
      `),
      ARCHER: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4ade80"/>
              <stop offset="100%" stop-color="#15803d"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#f0fdf4" opacity="0.4"/>
          <path d="M 125 125 Q 90 260 85 375 Q 160 395 235 375 Q 230 260 195 125 Z" fill="url(#ag)"/>
          <ellipse cx="160" cy="185" rx="34" ry="46" fill="#14532d"/>
          <path d="M 130 140 L 190 225" stroke="#78350f" stroke-width="8"/>
          <rect x="138" y="240" width="18" height="135" rx="6" fill="#78350f"/>
          <rect x="164" y="240" width="18" height="135" rx="6" fill="#451a03"/>
          <circle cx="160" cy="95" r="28" fill="#fed7aa"/>
          <path d="M 132 85 Q 160 45 188 85 Q 192 120 185 130 Q 160 110 135 130 Z" fill="#fbbf24"/>
          <polygon points="132,95 105,80 134,105" fill="#fecdd3"/>
          <polygon points="188,95 215,80 186,105" fill="#fecdd3"/>
          <ellipse cx="150" cy="98" rx="4" ry="5.5" fill="#15803d"/>
          <circle cx="149" cy="96" r="1.5" fill="#fff"/>
          <ellipse cx="170" cy="98" rx="4" ry="5.5" fill="#15803d"/>
          <circle cx="169" cy="96" r="1.5" fill="#fff"/>
          <path d="M 225 35 Q 285 200 225 370" fill="none" stroke="#b45309" stroke-width="7" stroke-linecap="round"/>
          <path d="M 225 35 L 225 370" fill="none" stroke="#86efac" stroke-width="2"/>
          <path d="M 170 200 L 260 200" stroke="#f59e0b" stroke-width="4"/>
          <polygon points="265,200 255,194 255,206" fill="#22c55e"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#4ade80" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">🏹 WIND RUNNER LYRIA</text>
        </svg>
      `),
      MELEE: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="mlg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f87171"/>
              <stop offset="100%" stop-color="#b91c1c"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#fef2f2" opacity="0.4"/>
          <path d="M 115 130 L 205 130 L 195 260 L 125 260 Z" fill="url(#mlg)"/>
          <rect x="130" y="260" width="26" height="120" rx="8" fill="#334155"/>
          <rect x="164" y="260" width="26" height="120" rx="8" fill="#1e293b"/>
          <path d="M 60 140 Q 95 140 100 170 L 100 280 Q 60 320 50 330 Q 40 280 40 170 Z" fill="#991b1b" stroke="#fca5a5" stroke-width="4"/>
          <polygon points="70,190 85,220 55,220" fill="#fef08a"/>
          <circle cx="160" cy="90" r="28" fill="#fed7aa"/>
          <path d="M 130 85 L 140 45 L 155 70 L 170 35 L 180 70 L 195 48 L 190 85 Z" fill="#dc2626"/>
          <rect x="110" y="115" width="100" height="20" rx="10" fill="#7f1d1d"/>
          <rect x="220" y="70" width="16" height="260" rx="4" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
          <polygon points="228,40 216,75 240,75" fill="#e2e8f0"/>
          <rect x="208" y="240" width="40" height="12" rx="4" fill="#d97706"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#f87171" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">⚔️ IRON VANGUARD WALTER</text>
        </svg>
      `),
      FIREARM: "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
          <defs>
            <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fb923c"/>
              <stop offset="100%" stop-color="#c2410c"/>
            </linearGradient>
          </defs>
          <circle cx="160" cy="180" r="140" fill="#fff7ed" opacity="0.4"/>
          <path d="M 120 120 L 200 120 L 225 380 L 95 380 Z" fill="url(#fg)"/>
          <rect x="140" y="130" width="40" height="130" fill="#1c1917"/>
          <rect x="105" y="120" width="25" height="12" rx="4" fill="#fbbf24"/>
          <rect x="190" y="120" width="25" height="12" rx="4" fill="#fbbf24"/>
          <circle cx="160" cy="90" r="28" fill="#fed7aa"/>
          <ellipse cx="160" cy="72" rx="36" ry="14" fill="#7c2d12"/>
          <circle cx="175" cy="65" r="7" fill="#fbbf24"/>
          <rect x="210" y="40" width="10" height="320" rx="3" fill="#292524"/>
          <rect x="212" y="160" width="22" height="45" rx="5" fill="#78350f"/>
          <circle cx="215" cy="40" r="8" fill="#f97316"/>
          <rect x="30" y="398" width="260" height="28" rx="14" fill="rgba(15,23,42,0.85)"/>
          <text x="160" y="417" fill="#fb923c" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">💥 ARTILLERY MARSHAL VICTOR</text>
        </svg>
      `)
    };

    /* --------------------------------------------------------------------------
       Image Compression Utility (LocalStorage 5MB Quota Protection)
       -------------------------------------------------------------------------- */
    function compressImageDataUrl(dataUrlOrFile, maxWidth = 640, maxHeight = 960, quality = 0.8) {
      return new Promise((resolve) => {
        const processImg = (srcStr) => {
          if (!srcStr || !srcStr.startsWith('data:image/')) {
            return resolve(srcStr);
          }
          // SVG or small images under 60KB don't need raster compression
          if (srcStr.startsWith('data:image/svg+xml') || srcStr.length < 60000) {
            return resolve(srcStr);
          }
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.max(1, Math.round(width * ratio));
              height = Math.max(1, Math.round(height * ratio));
            }
            try {
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', quality);
              resolve(compressed);
            } catch (e) {
              resolve(srcStr);
            }
          };
          img.onerror = () => resolve(srcStr);
          img.src = srcStr;
        };

        if (typeof dataUrlOrFile === 'string') {
          processImg(dataUrlOrFile);
        } else if (dataUrlOrFile instanceof File || dataUrlOrFile instanceof Blob) {
          const reader = new FileReader();
          reader.onload = (e) => processImg(e.target.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(dataUrlOrFile);
        } else {
          resolve('');
        }
      });
    }

    // Zero LocalStorage: 더 이상 브라우저 쿼터 제한이 없으므로 클라우드 저장소 활용
    function cleanStorageQuotaIfBloated() {
      // Pure Cloud Storage architecture - No local storage quota needed
    }

    // 병과 공통 이미지는 렌더 시점 폴백(getUnitIllustration 등)으로만 쓴다. 유닛 imageUrl에 굳혀 넣으면
    // 캐릭터 고유 이미지를 덮어쓰고, 병과 이미지가 바뀌어도 예전 그림이 남는다.
    function isClassImageUrl(url) {
      if (!url) return false;
      if (Object.values(customClassImages || {}).includes(url)) return true;
      return typeof SAMPLE_CLASS_IMAGES !== 'undefined' && Object.values(SAMPLE_CLASS_IMAGES).includes(url);
    }

    // 예전 코드가 유닛에 박아 넣은 병과 이미지를 걷어낸다 (캐릭터 고유 이미지는 그대로 둔다)
    function stripBakedClassImages() {
      [...(state.playerUnits || []), ...(state.reserveUnits || [])]
        .forEach(u => { if (u && isClassImageUrl(u.imageUrl)) u.imageUrl = ''; });
    }

    function applyStoredCustomImages() {
      if (typeof window.loadGameConfigFromCloud === 'function') {
        window.loadGameConfigFromCloud('unit_images').then(data => {
          if (data && data.customClassImages) {
            customClassImages = { ...customClassImages, ...data.customClassImages };
            stripBakedClassImages();
            renderAll();
            updateFullShotOverlay();
          }
        }).catch(err => console.warn("Load class images error:", err));
      }

      // Realtime subscription for unit class images across devices
      if (typeof window.subscribeGameConfig === 'function') {
        window.subscribeGameConfig('unit_images', (data) => {
          if (data && data.customClassImages) {
            customClassImages = { ...customClassImages, ...data.customClassImages };
            stripBakedClassImages();
            renderAll();
            updateFullShotOverlay();
          }
        });
      }
    }

    function saveClassImage(classType, imgSource) {
      const meta = CLASS_META[classType] || { name: classType };

      // Base64인 경우 Supabase Storage에 직접 업로드하여 공개 URL 획득 후 Supabase 저장
      if (imgSource && imgSource.startsWith('data:') && typeof window.uploadCharacterAvatar === 'function') {
        addLog(`☁️ [Supabase Storage] ${meta.name} 이미지를 클라우드 스토리지에 전송 중...`, 'system');
        window.uploadCharacterAvatar(imgSource, `class_${classType}`).then(downloadUrl => {
          stripBakedClassImages();
          customClassImages[classType] = downloadUrl;
          if (typeof window.saveGameConfigToCloud === 'function') {
            window.saveGameConfigToCloud('unit_images', { customClassImages });
          }
          addLog(`🎨 [캐릭터 이미지 적용] [${meta.name}] Supabase Storage URL이 성공적으로 등록되었습니다!`, 'success');
          renderDebugImageManager();
          renderAll();
          updateFullShotOverlay();
          saveGameState(true);
        }).catch(err => {
          console.error("Storage upload failed, saving directly:", err);
          stripBakedClassImages();
          customClassImages[classType] = imgSource;
          if (typeof window.saveGameConfigToCloud === 'function') {
            window.saveGameConfigToCloud('unit_images', { customClassImages });
          }
          renderDebugImageManager();
          renderAll();
          updateFullShotOverlay();
          saveGameState(true);
        });
      } else {
        stripBakedClassImages();
        customClassImages[classType] = imgSource;
        if (typeof window.saveGameConfigToCloud === 'function') {
          window.saveGameConfigToCloud('unit_images', { customClassImages });
        }
        addLog(`🎨 [캐릭터 이미지 적용] [${meta.name}] 이미지가 성공적으로 등록되었습니다!`, 'success');
        renderDebugImageManager();
        renderAll();
        updateFullShotOverlay();
        saveGameState(true);
      }
    }

    function resetClassImage(classType) {
      stripBakedClassImages();
      customClassImages[classType] = '';

      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('unit_images', { customClassImages });
      }

      const meta = CLASS_META[classType] || { name: classType };
      addLog(`🔄 [캐릭터 이미지 초기화] [${meta.name}] 이미지가 기본 실루엣으로 복원되었습니다.`, 'system');

      renderDebugImageManager();
      renderAll();
      updateFullShotOverlay();
      saveGameState(true);
    }

    function applySamplePresetImages() {
      stripBakedClassImages();
      Object.keys(SAMPLE_CLASS_IMAGES).forEach(cls => {
        customClassImages[cls] = SAMPLE_CLASS_IMAGES[cls];
      });

      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('unit_images', { customClassImages });
      }

      addLog(`✨ [샘플 일러스트 일괄 적용] 5종 전 병과에 고해상도 판타지 전신 일러스트 프리셋이 반영되었습니다!`, 'gold');
      renderDebugImageManager();
      renderAll();
      updateFullShotOverlay();
      saveGameState(true);
    }

    function resetAllClassImages() {
      stripBakedClassImages();
      Object.keys(CLASS_META).forEach(cls => {
        customClassImages[cls] = '';
      });

      if (typeof window.saveGameConfigToCloud === 'function') {
        window.saveGameConfigToCloud('unit_images', { customClassImages });
      }

      addLog(`🔄 [전체 이미지 초기화] 모든 병과의 커스텀 이미지가 제거되고 기본 실루엣으로 복원되었습니다.`, 'system');
      renderDebugImageManager();
      renderAll();
      updateFullShotOverlay();
      saveGameState(true);
    }

    function processImageFile(classType, file) {
      if (!file || !file.type.startsWith('image/')) {
        addLog('⚠️ 지원되지 않는 파일 형식입니다. PNG, JPG, WebP, SVG 이미지 파일을 선택해주세요.', 'warning');
        return;
      }
      addLog('⏳ 일러스트 이미지 최적화 압축 중...', 'system');
      compressImageDataUrl(file, 640, 960, 0.8).then(dataUrl => {
        if (dataUrl) {
          saveClassImage(classType, dataUrl);
        }
      });
    }

    function onClassFileSelected(classType, inputEl) {
      if (inputEl && inputEl.files && inputEl.files[0]) {
        processImageFile(classType, inputEl.files[0]);
        inputEl.value = '';
      }
    }

    function onClassUrlApplied(classType) {
      const input = document.getElementById(`url-input-${classType}`);
      if (!input) return;
      const url = input.value.trim();
      if (!url) {
        addLog('⚠️ 등록할 이미지 URL 주소를 입력해주세요.', 'warning');
        return;
      }
      saveClassImage(classType, url);
    }

    function renderDebugImageManager() {
      const container = document.getElementById('dbg-class-images-list');
      if (!container) return;

      container.innerHTML = '';

      Object.keys(CLASS_META).forEach(classKey => {
        const meta = CLASS_META[classKey];
        const curImg = customClassImages[classKey] || '';
        const card = document.createElement('div');
        card.className = 'dbg-class-img-card';
        card.id = `dbg-card-${classKey}`;

        card.innerHTML = `
          <div class="dbg-class-img-header">
            <div class="dbg-class-img-title">
              <span>${meta.icon}</span>
              <span>${meta.name}</span>
            </div>
            <span class="dbg-class-img-badge ${curImg ? 'active' : ''}">
              ${curImg ? '🎨 커스텀 등록됨' : '기본 실루엣'}
            </span>
          </div>

          <div class="dbg-class-img-body">
            <!-- Left: Thumbnail Preview & Drag/Drop Zone -->
            <div class="dbg-img-preview-box ${curImg ? 'has-img' : ''}" id="dbg-preview-box-${classKey}" title="이미지 파일을 이곳으로 드래그 & 드롭하거나 클릭하여 등록">
              ${curImg ? `
                <img src="${curImg}" class="dbg-img-preview-thumb" alt="${meta.name}" />
              ` : `
                <span class="dbg-preview-placeholder-ico">${meta.icon}</span>
                <span class="dbg-preview-placeholder-txt">드래그&드롭<br>또는 클릭</span>
              `}
              <div class="dbg-preview-drop-overlay">📥 이미지 놓기</div>
            </div>

            <!-- Right: Controls (Upload File, URL Input, Reset) -->
            <div class="dbg-img-controls-col">
              <div style="display: flex; gap: 6px; align-items: center;">
                <input type="file" id="file-input-${classKey}" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display: none;" onchange="onClassFileSelected('${classKey}', this)">
                <button class="btn-dbg-upload" onclick="document.getElementById('file-input-${classKey}').click()">
                  📁 내 컴퓨터 파일 선택 (PNG/JPG)
                </button>
                ${curImg ? `
                  <button class="btn-dbg-img-reset" onclick="resetClassImage('${classKey}')" title="등록된 이미지 삭제 및 기본값 복원">
                    🗑️ 초기화
                  </button>
                ` : ''}
              </div>

              <div class="dbg-url-input-row">
                <input type="text" id="url-input-${classKey}" class="dbg-url-text-input" placeholder="웹 이미지 URL (https://...)" value="${curImg.startsWith('http') ? curImg : ''}">
                <button class="btn-dbg-apply-url" onclick="onClassUrlApplied('${classKey}')">
                  URL 등록
                </button>
              </div>

              <div style="font-size: 9px; color: #64748b; line-height: 1.3;">
                💡 <b>권장 비율:</b> 세로형 3:4 또는 9:16 (PNG/JPG/WebP/SVG)<br>
                브라우저 LocalStorage에 즉시 영구 저장되어 유지됩니다.
              </div>
            </div>
          </div>
        `;

        // Setup Drag & Drop on the preview box
        const previewBox = card.querySelector(`#dbg-preview-box-${classKey}`);
        if (previewBox) {
          previewBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewBox.classList.add('drag-over');
          });
          previewBox.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewBox.classList.remove('drag-over');
          });
          previewBox.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewBox.classList.remove('drag-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const file = e.dataTransfer.files[0];
              processImageFile(classKey, file);
            }
          });
          previewBox.addEventListener('click', () => {
            const fi = document.getElementById(`file-input-${classKey}`);
            if (fi) fi.click();
          });
        }

        container.appendChild(card);
      });
    }

    /* --------------------------------------------------------------------------
       Custom Character & Skill Creation Studio Controller
       -------------------------------------------------------------------------- */
    const CUSTOM_CHARACTERS_STORAGE_KEY = 'slg_custom_created_characters';
    let createCharImageDataUrl = '';
    let createCharPortraitFocus = null; // 생성 폼 초상화 얼굴 위치 (openNewCharacterPortraitEditor)
    let createCharDialogueEditor = null; // 생성 탭 상황별 대사 편집기 (DialogueLines.mountEditor)

    // 병과 선택 변경 시 기본 스탯, 추천 고유 스킬 및 실루엣 자동 동기화
    function onCustomClassSelectChanged(classType) {
      const presetStats = debugParams.unitClassStats[classType] || { atk: 40, def: 30, baseAP: 2, affection: 75, hp: 90 };
      const avatarMap = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
      const avatar = avatarMap[classType] || '👤';

      const hpInput = document.getElementById('create-char-hp');
      const atkInput = document.getElementById('create-char-atk');
      const defInput = document.getElementById('create-char-def');
      const mobInput = document.getElementById('create-char-mobility');
      const placeholder = document.getElementById('create-char-preview-placeholder');

      if (hpInput) hpInput.value = presetStats.hp;
      if (atkInput) atkInput.value = presetStats.atk;
      if (defInput) defInput.value = presetStats.def;
      if (mobInput) mobInput.value = presetStats.baseAP;
      if (placeholder && !createCharImageDataUrl) placeholder.textContent = avatar;

      // 사용자가 손대지 않은 스킬트리 초안이면 새 병과의 추천 트리로 교체
      if (window.UI && typeof window.UI.resetDevDraftSkillTree === 'function') {
        window.UI.resetDevDraftSkillTree(classType);
      }
    }

    // 스킬 액티브/패시브 타입 토글 (패시브일 경우 소모 AP/쿨다운 숨김 및 0 처리)
    function onCustomSkillTypeChanged(type) {
      const activeRow = document.getElementById('create-skill-active-row');
      const apInput = document.getElementById('create-skill-ap');
      const cdInput = document.getElementById('create-skill-cd');
      const targetSelect = document.getElementById('create-skill-target');

      if (type === 'PASSIVE') {
        if (activeRow) activeRow.style.display = 'none';
        if (apInput) apInput.value = 0;
        if (cdInput) cdInput.value = 0;
        if (targetSelect) {
          targetSelect.innerHTML = `
            <option value="BUFF">🛡️ 공방 능력치 증폭 패시브 (BUFF)</option>
          `;
        }
      } else {
        if (activeRow) activeRow.style.display = 'grid';
        if (apInput && parseInt(apInput.value, 10) === 0) apInput.value = 1;
        if (cdInput && parseInt(cdInput.value, 10) === 0) cdInput.value = 2;
        if (targetSelect) {
          targetSelect.innerHTML = `
            <option value="BUFF">💖 아군 회복 및 공방 버프 (BUFF)</option>
            <option value="SINGLE_TARGET">🎯 단일 적군 집중 타격 (SINGLE_TARGET)</option>
            <option value="AOE">💥 사거리 내 광역 폭격 (AOE)</option>
            <option value="SELF">🌟 자신 행동력 완전 회복 (SELF)</option>
          `;
        }
      }
    }

    // 신규 캐릭터 전신 이미지 업로드 및 URL 바인딩
    function onCustomCharFileSelected(inputEl) {
      if (inputEl && inputEl.files && inputEl.files[0]) {
        const file = inputEl.files[0];
        if (!file.type.startsWith('image/')) {
          addLog('⚠️ 지원되지 않는 이미지 파일입니다. PNG, JPG, WebP 파일을 선택해주세요.', 'warning');
          return;
        }
        addLog('⏳ 일러스트 이미지 최적화 압축 중...', 'system');
        compressImageDataUrl(file, 640, 960, 0.8).then(compressedUrl => {
          setNewCharacterImage(compressedUrl);
          addLog('🖼️ 캐릭터 전신 일러스트가 최적화되어 성공적으로 등록되었습니다.', 'success');
        });
        inputEl.value = '';
      }
    }

    function onCustomCharUrlChanged(url) {
      const trimmed = (url || '').trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
        setNewCharacterImage(trimmed);
      } else if (!trimmed) {
        clearCustomCharImage();
      }
    }

    function setNewCharacterImage(dataUrlOrUrl) {
      if (dataUrlOrUrl !== createCharImageDataUrl) createCharPortraitFocus = null;
      createCharImageDataUrl = dataUrlOrUrl;
      const previewImg = document.getElementById('create-char-preview-img');
      const placeholder = document.getElementById('create-char-preview-placeholder');
      const urlInput = document.getElementById('create-char-img-url');

      if (previewImg && placeholder) {
        if (dataUrlOrUrl) {
          previewImg.src = dataUrlOrUrl;
          previewImg.style.display = 'block';
          placeholder.style.display = 'none';
        } else {
          previewImg.style.display = 'none';
          placeholder.style.display = 'block';
        }
      }
      if (urlInput && dataUrlOrUrl.startsWith('http')) {
        urlInput.value = dataUrlOrUrl;
      }
    }

    function clearCustomCharImage() {
      createCharImageDataUrl = '';
      createCharPortraitFocus = null;
      const previewImg = document.getElementById('create-char-preview-img');
      const placeholder = document.getElementById('create-char-preview-placeholder');
      const urlInput = document.getElementById('create-char-img-url');

      if (previewImg) previewImg.style.display = 'none';
      if (placeholder) {
        placeholder.style.display = 'block';
        const curClass = document.getElementById('create-char-class')?.value || 'KNIGHT';
        const avatarMap = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
        placeholder.textContent = avatarMap[curClass] || '👤';
      }
      if (urlInput) urlInput.value = '';
      addLog('🗑️ 캐릭터 일러스트 등록이 초기화되었습니다.', 'system');
    }

    function applyPresetImageToNewChar() {
      const curClass = document.getElementById('create-char-class')?.value || 'KNIGHT';
      const presetImg = customClassImages[curClass] || PRESET_SVG_PORTRAITS[curClass];
      if (presetImg) {
        setNewCharacterImage(presetImg);
        addLog(`✨ [${CLASS_META[curClass]?.name || curClass}] 추천 프리셋 일러스트를 불러왔습니다.`, 'gold');
      }
    }

    function setupCustomCharDropzone() {
      const dropzone = document.getElementById('create-char-dropzone');
      if (!dropzone) return;

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            addLog('⏳ 일러스트 이미지 최적화 압축 중...', 'system');
            compressImageDataUrl(file, 640, 960, 0.8).then(compressedUrl => {
              setNewCharacterImage(compressedUrl);
              addLog('📥 드래그&드롭으로 캐릭터 이미지가 최적화되어 등록되었습니다.', 'success');
            });
          } else {
            addLog('⚠️ 이미지 파일(PNG/JPG)만 드래그하여 등록할 수 있습니다.', 'warning');
          }
        }
      });
    }

    // 캐릭터 & 고유 스킬 생성 및 전장 배치
    async function createAndDeployCharacter() {
      const nameInput = document.getElementById('create-char-name');
      const classSelect = document.getElementById('create-char-class');
      const favInput = document.getElementById('create-char-favorability');
      const hpInput = document.getElementById('create-char-hp');
      const atkInput = document.getElementById('create-char-atk');
      const defInput = document.getElementById('create-char-def');
      const mobInput = document.getElementById('create-char-mobility');

      const charName = (nameInput?.value || '').trim();
      if (!charName) {
        addLog('⚠️ 캐릭터 이름을 입력해주세요.', 'warning');
        if (nameInput) nameInput.focus();
        return;
      }

      const unitClass = classSelect?.value || 'KNIGHT';
      const favorability = Math.max(0, Math.min(100, parseInt(favInput?.value, 10) || 75));
      const hp = Math.max(10, parseInt(hpInput?.value, 10) || 100);
      const atk = Math.max(1, parseInt(atkInput?.value, 10) || 45);
      const def = Math.max(1, parseInt(defInput?.value, 10) || 35);
      const mobility = Math.max(1, Math.min(6, parseInt(mobInput?.value, 10) || 2));

      // 스킬트리: DEV 빌더에서 만든 초안 (★ 노드는 생성 즉시 습득)
      const skillTree = (typeof window.UI?.getDevDraftSkillTree === 'function')
        ? window.UI.getDevDraftSkillTree()
        : (window.SkillEngine ? SkillEngine.buildClassTree(unitClass) : []);
      const initialSkillPoints = Math.max(0, parseInt(document.getElementById('create-char-sp')?.value, 10) || 0);
      const learnedSkills = skillTree.filter(n => n.startsLearned).map(n => n.id);

      const avatarMap = { KNIGHT: '🐴', MAGE: '🔮', ARCHER: '🏹', MELEE: '⚔️', FIREARM: '💥' };
      const avatar = avatarMap[unitClass] || '👤';

      // 상황별 대사: 편집기 입력값, 비어 있는 상황은 기본 풀에서 랜덤 부여
      const dialogues = window.DialogueLines
        ? (createCharDialogueEditor
          ? DialogueLines.fillMissing(createCharDialogueEditor.getDialogues(), createCharDialogueEditor.getTone())
          : DialogueLines.randomDialogues())
        : undefined;

      // 생성 위치 선정 (왕도 x:3, y:4 또는 인접 빈 타일)
      let spawnX = 3;
      let spawnY = 4;
      const occupiedByAnyPlayer = (x, y) => state.playerUnits.some(u => !u.isDead && u.x === x && u.y === y);
      if (occupiedByAnyPlayer(spawnX, spawnY)) {
        const candidates = [
          { x: 3, y: 5 }, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 3 }, { x: 4, y: 5 }
        ];
        const emptyCandidate = candidates.find(c => isInsideBattleMap(c.x, c.y) && !occupiedByAnyPlayer(c.x, c.y));
        if (emptyCandidate) {
          spawnX = emptyCandidate.x;
          spawnY = emptyCandidate.y;
        }
      }

      saveHistorySnapshot();

      // Supabase Storage 이미지 업로드 처리 (DataURL일 경우 Cloud Storage에 영구 보관)
      let finalImageUrl = createCharImageDataUrl || '';
      if (window.SupabaseBridge && createCharImageDataUrl && createCharImageDataUrl.startsWith('data:')) {
        addLog('☁️ [Supabase Storage] 캐릭터 일러스트를 Supabase Storage에 업로드 중...', 'system');
        try {
          const uploadedUrl = await window.SupabaseBridge.uploadCharacterImage(createCharImageDataUrl, charName);
          if (uploadedUrl) {
            finalImageUrl = uploadedUrl;
            addLog('✅ [Supabase Storage] 일러스트가 클라우드 Storage에 업로드되어 영구 URL이 발급되었습니다!', 'success');
          }
        } catch (storageErr) {
          console.warn('Storage upload fallback:', storageErr);
        }
      }

      const newId = 'custom_' + Date.now();
      const newCharacter = {
        id: newId,
        owner: 'PLAYER',
        name: charName,
        unitClass: unitClass,
        classType: unitClass,
        avatar: avatar,
        level: 1,
        stats: {
          hp: hp,
          maxHp: hp,
          atk: atk,
          def: def,
          mobility: mobility
        },
        hp: hp,
        maxHp: hp,
        atk: atk,
        def: def,
        baseAP: mobility,
        ap: mobility,
        favorability: favorability,
        affection: favorability,
        upkeep: 10,
        x: spawnX,
        y: spawnY,
        imageUrl: finalImageUrl,
        portraitFocus: createCharPortraitFocus || undefined,
        dialogues: dialogues,
        dialogueTone: createCharDialogueEditor ? createCharDialogueEditor.getTone() : undefined,
        isInactivated: false,
        isDead: false,
        promotions: { combatRank: 0 },
        skillTree: skillTree,
        learnedSkills: learnedSkills,
        skillTreeCustomized: true,
        skillPoints: initialSkillPoints,
        initialSkillPoints: initialSkillPoints,
        skillUnlockMode: 'absorb',
        skillCooldowns: {},
        statuses: []
      };

      // 플레이어 유닛 등록
      state.playerUnits.push(newCharacter);
      selectedUnitId = newId;

      // 영구 캐릭터 보관함에도 저장 (LocalStorage 백업)
      saveCustomCharacterRecord(newCharacter);

      // Supabase 'characters' 컬렉션 동기화
      if (window.SupabaseBridge) {
        window.SupabaseBridge.syncCharacterToSupabase(newCharacter).then(ok => {
          if (ok) {
            addLog(`☁️ [Supabase 동기화] 캐릭터 [${charName}] 데이터가 'characters' 컬렉션에 동기화되었습니다.`, 'gold');
          }
        });
      }

      saveGameState();
      renderAll();
      renderCustomCharactersList();
      // 다음 캐릭터는 새 랜덤 대사로 시작
      if (createCharDialogueEditor) createCharDialogueEditor.randomizeAll();

      // 디버그 모달을 닫고 풀샷 오버레이 즉시 오픈 연출
      closeAllModals();
      openFullShotOverlay(newCharacter);

      addLog(`✨ [신규 영웅 탄생!] Lv.1 ${charName} (${CLASS_META[unitClass]?.name || unitClass})이(가) 전장 (${spawnX}, ${spawnY})에 출진했습니다!`, 'gold');
      const startNames = skillTree.filter(n => learnedSkills.includes(n.id)).map(n => n.name);
      addLog(`🌳 [스킬트리] ${skillTree.length}개 노드 · 시작 습득: ${startNames.join(', ') || '없음'} · SP ${initialSkillPoints}`, 'system');
    }

    function getStoredCustomCharacters() {
      return customCharactersCloudCache;
    }

    // Supabase 전역 'characters' 컬렉션 동기화 (모든 접속자/기기/브라우저 간 완전 실시간 공유)
    function syncGlobalCharactersFromSupabase(cloudCharacters) {
      if (!Array.isArray(cloudCharacters)) return;
      try {
        customCharactersCloudCache = [...cloudCharacters];
        // 최신 생성일자 순 정렬
        customCharactersCloudCache.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        ensureStarterCharacterRecords();
        renderCustomCharactersList();
        // 캐릭터 DB가 들어왔으니 구버전 유닛을 원본 캐릭터와 연결한다 (저장은 다음 저장 때 같이 된다)
        if (state) {
          const starters = migrateStarterUnits();
          const captured = migrateCapturedUnits();
          if (starters || captured) renderAll();
        }
      } catch (e) {
        console.warn("Global characters sync error:", e);
      }
    }

    function saveCustomCharacterRecord(charObj) {
      try {
        // Direct save to Supabase (slg_records) & Storage
        if (typeof window.saveCharacterToCloud === 'function') {
          window.saveCharacterToCloud(charObj).then(() => {
            console.log("☁️ [Cloud Character] 캐릭터 Supabase 동기화 완료:", charObj.id);
          });
        }
        // 즉시 메모리 캐시 반영
        const existingIdx = customCharactersCloudCache.findIndex(c => c.id === charObj.id);
        if (existingIdx >= 0) {
          customCharactersCloudCache[existingIdx] = { ...customCharactersCloudCache[existingIdx], ...charObj };
        } else {
          customCharactersCloudCache.unshift(charObj);
        }
        renderCustomCharactersList();
      } catch (e) {
        console.warn('Failed to save custom character record:', e);
      }
    }

    function renderCustomCharactersList() {
      const container = document.getElementById('dbg-custom-char-list');
      const countEl = document.getElementById('dbg-custom-char-count');
      if (!container) return;

      const list = getStoredCustomCharacters();
      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        container.innerHTML = `
          <div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px 0;">
            아직 생성된 커스텀 캐릭터가 없습니다. 위 입력폼에서 첫 영웅을 생성해보세요!
          </div>
        `;
        return;
      }

      const externalCount = list.filter(c => isExternalImageUrl(c.imageUrl)).length;
      const archiveBar = externalCount ? `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; font-size:10.5px; color:#92400e;">
            <span>외부 사이트 그림 ${externalCount}개 — 그 사이트가 막히면 사라질 수 있습니다.</span>
            <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #0d9488; flex-shrink:0;" onclick="archiveExternalIllustrations()">☁️ 전부 보관</button>
          </div>` : '';
      container.innerHTML = archiveBar + list.map(c => {
        const meta = CLASS_META[c.unitClass || c.classType] || { icon: c.avatar || '👤', name: c.unitClass || '영웅' };
        const tree = Array.isArray(c.skillTree) ? c.skillTree : [];
        const starts = tree.filter(n => n.startsLearned).map(n => n.name);
        const skillSummary = c.customSkill
          ? `🌟 ${c.customSkill.name}${tree.length ? ` · 트리 ${tree.length}개` : ''}`
          : `🌳 트리 ${tree.length}개 노드${starts.length ? ` · 시작: ${starts.join(', ')}` : ''}`;
        const imgDisplay = renderPortrait({ ...c, avatar: c.avatar || meta.icon }, { emojiSize: '20px' });

        return `
          <div style="display: flex; flex-direction: column; align-items: stretch; padding: 8px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <button type="button" onclick="changeCustomCharacterImage('${c.id}')" title="클릭해서 일러스트 변경" style="width: 38px; height: 38px; padding: 0; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; cursor: pointer;">
                ${imgDisplay}
              </button>
              <div style="min-width: 0;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <strong style="font-size: 12px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</strong>
                  ${isImageUrlBroken(c.imageUrl) ? '<span style="font-size: 9px; font-weight: 700; color: #b91c1c; background: #fee2e2; padding: 1px 5px; border-radius: 4px;" title="그림을 불러오지 못해 대체 그림으로 표시 중">⚠️ 그림 깨짐</span>' : ''}
                  <span style="font-size: 9px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 1px 5px; border-radius: 4px;">${meta.name.split(' ')[0]}</span>
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px; white-space: nowrap;">
                  HP ${c.stats?.hp || 100} / ATK ${c.stats?.atk || 40} / DEF ${c.stats?.def || 30} / 호감도 ${c.favorability || 75}
                </div>
                <div style="font-size: 9.5px; color: #6366f1; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${skillSummary}
                </div>
              </div>
            </div>

            <div class="char-vault-actions" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #b45309;" onclick="openCharacterIllustrationEditor('${c.id}')" title="일러스트 변경 · 내 저장소로 보관">
                🖼️ 그림
              </button>
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #7c3aed;" onclick="openCharacterRenameEditor('${c.id}')" title="이름 변경">
                ✏️ 이름
              </button>
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #0284c7;" onclick="openCharacterSkillTreeEditor('${c.id}')" title="스킬 · 스킬트리 편집">
                🌳 트리
              </button>
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #db2777;" onclick="openCharacterDialogueEditor('${c.id}')" title="상황별 대사 편집">
                💬 대사
              </button>
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #0d9488;" onclick="openCharacterPortraitEditor('${c.id}')" title="초상화 얼굴 위치 편집">
                🎯 얼굴
              </button>
              <button class="btn-cheat purple" style="font-size: 9px; padding: 4px 7px;" onclick="spawnSavedCustomCharacter('${c.id}')" title="현재 전장에 이 캐릭터를 추가 배치합니다.">
                소환
              </button>
              <button class="btn-cheat" style="font-size: 9px; padding: 4px 6px; background: #ef4444;" onclick="deleteSavedCustomCharacter('${c.id}')" title="보관함에서 삭제합니다.">
                삭제
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 캐릭터 풀(Supabase characters) 레코드 하나를 전투 유닛으로 만든다.
    // 아군 소환(spawnSavedCustomCharacter)과 적 자동 생성(buildEnemyPool)이 "같은 함수"를 쓰므로
    // 같은 캐릭터는 아군으로 나오든 적으로 나오든 같은 스탯/스킬 구조를 가진다.
    // o: { id, owner, x, y, level, statMultiplier, fullHp }
    function characterRecordToUnit(target, o = {}) {
      const clone = (v) => JSON.parse(JSON.stringify(v));
      const mult = Number(o.statMultiplier) || 1;
      // 스탯별 추가 배율 (국가 특색 등). 없으면 1.
      const hpMult = Number(o.hpMult) || 1, atkMult = Number(o.atkMult) || 1, defMult = Number(o.defMult) || 1;
      const scale = (v, extra = 1) => Math.max(1, Math.round((Number(v) || 0) * mult * extra));
      const baseStats = target.stats || { hp: 100, maxHp: 100, atk: 40, def: 30, mobility: 2 };
      const maxHp = scale(baseStats.maxHp || baseStats.hp || 100, hpMult);
      const hp = o.fullHp ? maxHp : scale(baseStats.hp || 100, hpMult);
      const atk = scale(baseStats.atk || 40, atkMult);
      const def = scale(baseStats.def || 30, defMult);
      const ap = (Number(baseStats.mobility) || 2) + (Number(o.apBonus) || 0);
      const stats = clone(baseStats);
      if (mult !== 1 || hpMult !== 1 || atkMult !== 1 || defMult !== 1) Object.assign(stats, { hp, maxHp, atk, def });
      return {
        id: o.id || ('custom_' + Date.now()),
        owner: o.owner || 'PLAYER',
        sourceCharacterId: target.id || null,
        name: target.name,
        unitClass: target.unitClass || target.classType,
        classType: target.classType || target.unitClass,
        avatar: target.avatar || '👤',
        level: Number(o.level) || 1,
        stats,
        hp,
        maxHp,
        atk,
        def,
        baseAP: ap,
        ap,
        favorability: target.favorability || 75,
        affection: target.favorability || 75,
        upkeep: Number(target.upkeep) || 10,
        x: o.x,
        y: o.y,
        imageUrl: target.imageUrl || '',
        portraitFocus: target.portraitFocus ? clone(target.portraitFocus) : undefined,
        dialogues: target.dialogues ? clone(target.dialogues) : undefined,
        dialogueTone: target.dialogueTone,
        isInactivated: false,
        isDead: false,
        promotions: { combatRank: 0 },
        customSkill: target.customSkill ? clone(target.customSkill) : undefined,
        customSkillCooldown: 0,
        skillTree: target.skillTree ? clone(target.skillTree) : (window.DEFAULT_SKILL_TREE_TEMPLATE ? clone(window.DEFAULT_SKILL_TREE_TEMPLATE) : []),
        skillTreeCustomized: !!target.skillTreeCustomized,
        skillPoints: (o.owner || 'PLAYER') === 'ENEMY' ? 0 : (Number(target.initialSkillPoints) >= 0 ? Number(target.initialSkillPoints) : 0),
        skillUnlockMode: 'absorb',
        skillCooldowns: {},
        statuses: [],
        masterAllSkills: !!o.masterSkills // 보스: 스킬트리 전부 습득 (SkillEngine.prepareEnemySkills)
      };
    }

    // ------------------------------------------------------------------------
    // 기억 계승: 가챠로 얻은 같은 캐릭터 1장(characterCollection)을 소모해
    // 레벨 +1, 스킬 해금권 +1. 스킬트리 노드는 해금권 1장당 1개씩 열 수 있다.
    // ------------------------------------------------------------------------
    function getAbsorbMaterials(unit) {
      const charId = unit && (unit.sourceCharacterId || unit.id);
      if (!charId || !Array.isArray(state.characterCollection)) return [];
      return state.characterCollection.filter(e => e && String(e.characterId) === String(charId));
    }
    window.getAbsorbMaterials = getAbsorbMaterials;

    function absorbDuplicateCharacter(unitId) {
      const unit = (state.playerUnits || []).find(u => u.id === unitId && !u.isDead)
        || (state.reserveUnits || []).find(u => u.id === unitId);
      if (!unit) return { ok: false, reason: '유닛을 찾을 수 없습니다.' };
      const materials = getAbsorbMaterials(unit);
      if (!materials.length) return { ok: false, reason: '계승할 다른 시간선의 잔영이 없습니다.' };

      const material = materials[materials.length - 1];
      state.characterCollection.splice(state.characterCollection.indexOf(material), 1);
      if (window.SkillEngine) SkillEngine.ensureUnitSkillState(unit);

      // 남은 스킬을 다 열 만큼 해금권이 이미 있으면, 더 받아들이지 못한 경험은 잔향으로 남는다 (레벨도 오르지 않는다).
      if (isSkillTreeSaturated(unit)) {
        state.run.resonance = getResonance() + 1;
        addLog(`🔔 [기억 계승] ${unit.name}은(는) 더 받아들일 기억이 없다 — 시간선의 경험이 잔향으로 남았다. 잔향 +1 (보유 ${state.run.resonance}개, 남은 잔영 ${materials.length - 1}장)`, 'gold');
        saveGameState(true);
        return { ok: true, resonance: true, level: unit.level };
      }

      unit.level = (Number(unit.level) || 1) + 1;
      unit.skillPoints = (Number(unit.skillPoints) || 0) + 1;
      adjustAffectionWithLog(unit, AFFECTION_RULES.inherit, '기억 계승의 혼란');
      // 레벨업이므로 아카데미 진급과 같은 만큼 공격·방어가 오른다 (최대 HP는 100 정규화 체계라 올리지 않는다).
      unit.atk = (Number(unit.atk ?? (unit.stats && unit.stats.atk)) || 40) + LEVEL_UP_GROWTH.atk;
      unit.def = (Number(unit.def ?? (unit.stats && unit.stats.def)) || 30) + LEVEL_UP_GROWTH.def;
      if (unit.stats && typeof unit.stats === 'object') {
        unit.stats.atk = unit.atk;
        unit.stats.def = unit.def;
      }

      addLog(`🧬 [기억 계승] ${unit.name} Lv.${unit.level} — 다른 시간선의 기억을 이어받았다. 공격 +${LEVEL_UP_GROWTH.atk} · 방어 +${LEVEL_UP_GROWTH.def} · 스킬 해금권 +1 (남은 잔영 ${materials.length - 1}장)`, 'gold');
      saveGameState(true);
      return { ok: true, level: unit.level };
    }
    window.absorbDuplicateCharacter = absorbDuplicateCharacter;

    // ------------------------------------------------------------------------
    // 잔향: 한 사람이 받아들일 수 있는 다른 시간선의 경험에는 한계가 있다.
    // 넘친 경험(트리를 다 열고도 남는 해금권, 그 뒤의 기억 계승)은 주인 없는 잔향이 되고,
    // 잔향 RESONANCE_PER_SKILL_POINT개로 해금권이 모자란 다른 캐릭터에게 해금권 1장을 줄 수 있다 (레벨은 오르지 않는다).
    // ------------------------------------------------------------------------
    const RESONANCE_PER_SKILL_POINT = 5;
    window.RESONANCE_PER_SKILL_POINT = RESONANCE_PER_SKILL_POINT;

    function getResonance() { return Math.max(0, Number(state.run && state.run.resonance) || 0); }
    window.getResonance = getResonance;

    function findOwnedUnit(unitId) {
      return (state.playerUnits || []).find(u => u.id === unitId && !u.isDead)
        || (state.reserveUnits || []).find(u => u.id === unitId) || null;
    }

    // 보유 해금권으로 남은 스킬을 전부 열 수 있는 상태
    function isSkillTreeSaturated(unit) {
      if (!window.SkillEngine) return false;
      return SkillEngine.getRemainingUnlocks(unit) <= (Number(unit.skillPoints) || 0);
    }
    window.isSkillTreeSaturated = isSkillTreeSaturated;

    function convertSurplusSkillPoints(unitId) {
      const unit = findOwnedUnit(unitId);
      if (!unit || !window.SkillEngine) return { ok: false, reason: '유닛을 찾을 수 없습니다.' };
      const surplus = SkillEngine.getSurplusSkillPoints(unit);
      if (!surplus) return { ok: false, reason: '스킬트리를 열고 남는 해금권이 없습니다.' };
      unit.skillPoints -= surplus;
      state.run.resonance = getResonance() + surplus;
      addLog(`🔔 [잔향] ${unit.name}의 남는 해금권 ${surplus}장이 잔향 ${surplus}개로 흩어졌다. (보유 ${state.run.resonance}개)`, 'gold');
      saveGameState(true);
      return { ok: true, amount: surplus };
    }
    window.convertSurplusSkillPoints = convertSurplusSkillPoints;

    function inheritResonance(unitId) {
      const unit = findOwnedUnit(unitId);
      if (!unit) return { ok: false, reason: '유닛을 찾을 수 없습니다.' };
      if (isSkillTreeSaturated(unit)) return { ok: false, reason: `${unit.name}은(는) 이미 남은 스킬을 다 열 해금권이 있습니다.` };
      const have = getResonance();
      if (have < RESONANCE_PER_SKILL_POINT) return { ok: false, reason: `잔향이 부족합니다. (필요 ${RESONANCE_PER_SKILL_POINT}개, 보유 ${have}개)` };
      state.run.resonance = have - RESONANCE_PER_SKILL_POINT;
      unit.skillPoints = (Number(unit.skillPoints) || 0) + 1;
      addLog(`🔔 [잔향 계승] ${unit.name}이(가) 주인 없는 잔향을 받아들였다. 스킬 해금권 +1 (남은 잔향 ${state.run.resonance}개)`, 'gold');
      saveGameState(true);
      return { ok: true };
    }
    window.inheritResonance = inheritResonance;

    // ------------------------------------------------------------------------
    // 포섭: 적 유닛은 캐릭터 레코드로 만들어지므로(buildEnemyPool) 포섭한 유닛도 같은 캐릭터로 연결한다.
    //   - 같은 캐릭터가 이미 출전 명단/예비에 살아 있으면 → 기억 계승 재료(characterCollection 사본) +1
    //   - 처음 얻는 캐릭터면 → 원본 레코드로 유닛을 만든다. 적일 때의 레벨을 유지하고,
    //     레벨 1에서 오른 만큼 스킬 해금권을 준다 (기억 계승 1회 = 레벨 +1 · 해금권 +1 과 같은 비율)
    // ------------------------------------------------------------------------
    // 구버전 포섭 유닛: 전투 포섭 "포섭된 X"(id cap_…), 설득 영입 "[포섭] X"(id recruited_…)
    const CAPTURED_NAME_PREFIX = /^(포섭된 |\[포섭\] )/;
    const isCapturedUnitId = (id) => /^(cap_|recruited_)/.test(String(id));

    function findCharacterRecord(charId, name) {
      const pool = getStoredCustomCharacters();
      return pool.find(c => c && String(c.id) === String(charId)) || (name ? pool.find(c => c && c.name === name) : null) || null;
    }

    // 캐릭터 id가 없는 구버전 유닛도 있으므로 이름이 같아도 같은 캐릭터로 본다.
    function findOwnedSameCharacter(charId, name, exceptUnit = null) {
      return [...(state.playerUnits || []), ...(state.reserveUnits || [])]
        .find(u => u && u !== exceptUnit && isUnitAlive(u) && (getCharacterId(u) === String(charId) || (name && u.name === name))) || null;
    }

    function addAbsorbMaterial(ownedUnit, source) {
      if (!Array.isArray(state.characterCollection)) state.characterCollection = [];
      state.characterCollection.push({
        instanceId: `${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        characterId: ownedUnit.sourceCharacterId || ownedUnit.id, // getAbsorbMaterials와 같은 키
        source,
        acquiredAt: new Date().toISOString()
      });
    }

    function capturedSkillPoints(level, base = 0) {
      return Math.max(0, Number(base) || 0) + Math.max(0, (Number(level) || 1) - 1);
    }

    // ------------------------------------------------------------------------
    // 전투 포섭: 적을 쓰러뜨리면 기본 포섭(무력 위압)으로 CAPTURE_BASE_CHANCE 확률, 초기 호감도 CAPTURE_BASE_AFFECTION.
    // 포섭 방침(지휘관 창에서 하나 선택)은 그 위에 붙는 보정이다.
    //   chanceBonus: 포섭 확률 가산(%p) / affectionBonus: 초기 호감도 가산 / lootMult: 포섭 실패 시 전리품 배율
    //   priceKey: 포섭 성공 시 지불하는 가격(getGamePrice) — 골드가 모자라면 방침 효과 없이 기본 포섭으로 판정
    //   noCapture: 포섭 판정을 하지 않는다
    // ------------------------------------------------------------------------
    const CAPTURE_BASE_CHANCE = 0.50;
    const CAPTURE_BASE_AFFECTION = 25;
    const CAPTURE_DOCTRINES = {
      NONE:    { id: 'NONE',    icon: '➖', name: '방침 없음', desc: '기본 포섭만 한다.', chanceBonus: 0, affectionBonus: 0, lootMult: 1 },
      BRIBE:   { id: 'BRIBE',   icon: '🪙', name: '금화 회유', desc: '위압에 금화를 얹어 계약을 맺는다. 포섭 성공 시 계약금을 지불한다.', chanceBonus: 0.05, affectionBonus: 20, lootMult: 1, priceKey: 'CAPTURE_BRIBE' },
      SINCERE: { id: 'SINCERE', icon: '🤝', name: '진심 설득', desc: '항복을 받기 전 설득부터 한다. 조금 덜 넘어오지만 마음을 열고 들어온다.', chanceBonus: -0.05, affectionBonus: 15, lootMult: 1 },
      LOOT:    { id: 'LOOT',    icon: '💰', name: '전리품 우선', desc: '포섭하지 않고 전리품을 챙긴다.', chanceBonus: 0, affectionBonus: 0, lootMult: 1.2, noCapture: true }
    };
    window.CAPTURE_DOCTRINES = CAPTURE_DOCTRINES;

    function getCaptureDoctrine() {
      const id = state && state.commander && state.commander.captureDoctrine;
      return CAPTURE_DOCTRINES[id] || CAPTURE_DOCTRINES.NONE;
    }

    function getCapturePrice(doctrine) {
      return doctrine.priceKey && typeof window.getGamePrice === 'function' ? window.getGamePrice(doctrine.priceKey) : 0;
    }

    // 방침 효과가 실제로 적용되는가 (계약금을 낼 골드가 있어야 한다)
    function isDoctrineActive(doctrine) {
      const price = getCapturePrice(doctrine);
      return !(price > 0 && (state.gold || 0) < price);
    }

    // 적 1기를 포섭할 확률 (0~0.95)
    function getCaptureChance(doctrine = getCaptureDoctrine()) {
      if (doctrine.noCapture) return 0;
      const bonus = isDoctrineActive(doctrine) ? doctrine.chanceBonus : 0;
      return Math.max(0, Math.min(0.95, CAPTURE_BASE_CHANCE + bonus));
    }
    window.getCaptureChance = getCaptureChance;

    function getCaptureAffection(doctrine = getCaptureDoctrine()) {
      const dominance = state.commander?.unlockedSkills?.StrategicDominance ? 25 : 0;
      const bonus = isDoctrineActive(doctrine) ? doctrine.affectionBonus : 0;
      return Math.min(100, CAPTURE_BASE_AFFECTION + bonus + dominance);
    }

    // 쓰러뜨린 적의 포섭 판정. 포섭(또는 기억 계승 재료 획득)하면 true.
    function tryCaptureEnemy(enemy, x, y) {
      const doctrine = getCaptureDoctrine();
      const chance = getCaptureChance(doctrine);
      if (!(chance > 0) || Math.random() >= chance) return false;
      const affection = getCaptureAffection(doctrine);
      const price = getCapturePrice(doctrine);
      if (price > 0 && isDoctrineActive(doctrine)) {
        state.gold -= price;
        addLog(`🪙 [금화 회유] ${enemy.name}에게 계약금 ${price}G 지불`, 'gold');
      }
      captureEnemyUnit(enemy, affection, x, y);
      return true;
    }

    // ------------------------------------------------------------------------
    // 포로: 쓰러진 아군은 보통 영구 사망이지만, 국가 특색에 따라 적에게 붙잡히기도 한다.
    //   확률 = 그 구역의 hostage (REGION_COMBAT). 포로를 잡는 국가(나루·루마·실바)에서만 일어나고, 그 외 국가는 항상 영구 사망.
    //   포로는 isDead 상태 그대로 출전 명단에 남고(전투·편성에서 빠진다) unit.captive에 몸값이 적힌다.
    //   몸값 = 기본가(CAPTIVE_RANSOM) × 레벨 보정 × 승급 보정. 전투 밖에서 골드를 내면 되찾는다.
    // ------------------------------------------------------------------------
    const CAPTIVE_RANSOM_PER_LEVEL = 0.20;  // 레벨 1을 넘는 레벨마다 +20%
    const CAPTIVE_RANSOM_PER_RANK = 0.25;   // 병과 승급 단계마다 +25%

    function getCaptiveRansom(unit) {
      const base = typeof window.getGamePrice === 'function' ? window.getGamePrice('CAPTIVE_RANSOM') : 300;
      const level = Math.max(1, Number(unit && unit.level) || 1);
      const rank = getCombatRank(unit);
      const cost = (base || 300) * (1 + (level - 1) * CAPTIVE_RANSOM_PER_LEVEL) * (1 + rank * CAPTIVE_RANSOM_PER_RANK);
      return Math.max(10, Math.round(cost / 10) * 10);
    }
    window.getCaptiveRansom = getCaptiveRansom;

    function getCaptives() {
      return (state.playerUnits || []).filter(u => u && u.isDead && u.captive);
    }
    window.getCaptives = getCaptives;

    /** 방금 쓰러진 아군을 포로로 만들지 판정한다. 붙잡혔으면 true (이미 isDead 처리된 유닛에 captive만 붙인다). */
    function tryCaptureAlly(unit, captor) {
      if (!unit || unit.owner === 'ENEMY') return false;
      const regionId = getCurrentRegionId();
      const chance = Math.min(0.95, getRegionEnemyProfile(regionId).hostage);
      if (!(chance > 0) || Math.random() >= chance) return false;
      const ransom = getCaptiveRansom(unit);
      unit.captive = { regionId: regionId || null, captor: (captor && captor.name) || '적군', ransom };
      addLog(`⛓️ [포로] ${unit.name}이(가) ${unit.captive.captor}에게 붙잡혔습니다! 전략맵 출전 편성에서 몸값 ${ransom}G를 내고 되찾을 수 있습니다.`, 'warning');
      window.UI?.showToast?.(`⛓️ ${unit.name} 포로로 붙잡힘 — 몸값 ${ransom}G`, 'warning');
      const adj = typeof getAdjutantUnit === 'function' ? getAdjutantUnit() : null;
      if (adj && adj.id !== unit.id) speakUnitLine(adj, 'captive_taken', 'warning', { target: unit.name, ransom });
      return true;
    }

    function payCaptiveRansom(unitId) {
      const unit = (state.playerUnits || []).find(u => u && u.id === unitId && u.isDead && u.captive);
      if (!unit) return false;
      const warn = msg => { addLog(msg, 'warning'); window.UI?.showToast?.(msg, 'warning'); return false; };
      if (state.currentBattle || state.isCombatActive) return warn('⚠️ 전투 중에는 몸값을 지불할 수 없습니다.');
      const cost = Number(unit.captive.ransom) || getCaptiveRansom(unit);
      if (state.gold < cost) return warn(`⚠️ 몸값이 부족합니다. (필요 ${cost}G / 보유 ${state.gold}G)`);
      state.gold -= cost;
      unit.captive = null;
      unit.isDead = false;
      unit.isInactivated = false;
      unit.hp = Math.max(1, Math.ceil((unit.maxHp || 100) * 0.5)); // 풀려난 직후라 반쯤 다친 상태
      if (unit.stats) unit.stats.hp = unit.hp;
      unit.ap = unit.baseAP || unit.ap || 2;
      addLog(`🔓 [몸값 지불] ${unit.name}을(를) 되찾았습니다! (-${cost}G)`, 'gold');
      saveGameState(true);
      renderAll();
      return true;
    }
    window.payCaptiveRansom = payCaptiveRansom;

    function setCaptureDoctrine(id) {
      if (!CAPTURE_DOCTRINES[id] || !state.commander) return;
      state.commander.captureDoctrine = id;
      addLog(`🤝 [포섭 방침] ${CAPTURE_DOCTRINES[id].icon} ${CAPTURE_DOCTRINES[id].name}`, 'system');
      renderCaptureDoctrinePanel();
      saveGameState(true);
    }
    window.setCaptureDoctrine = setCaptureDoctrine;

    function renderCaptureDoctrinePanel() {
      const el = document.getElementById('modal-capture-doctrine');
      if (!el) return;
      const current = getCaptureDoctrine();
      const pct = v => `${Math.round(v * 100)}%`;
      const signed = (v, unit = '') => `${v > 0 ? '+' : ''}${v}${unit}`;
      const baseAff = getCaptureAffection(CAPTURE_DOCTRINES.NONE);
      el.innerHTML = `
        <div class="cap-doc-base">
          <span class="cap-doc-icon">⚔️</span>
          <span class="cap-doc-main">
            <b>기본 포섭 · 무력 위압</b>
            <span class="cap-doc-desc">적을 쓰러뜨리면 항상 판정합니다. 포섭하지 못하면 전리품을 얻습니다.</span>
            <span class="cap-doc-tags"><span class="cap-doc-tag chance">포섭 ${pct(CAPTURE_BASE_CHANCE)}</span><span class="cap-doc-tag aff">호감도 ${baseAff}</span></span>
          </span>
        </div>
        <div class="cap-doc-head">
          <b>🤝 포섭 방침</b>
          <small>기본 포섭에 더하는 방침을 하나 고릅니다.</small>
        </div>
        <div class="cap-doc-list">${Object.values(CAPTURE_DOCTRINES).map(d => {
          const price = getCapturePrice(d);
          const short = price > 0 && (state.gold || 0) < price;
          const tags = d.noCapture
            ? `<span class="cap-doc-tag chance">포섭 안 함</span><span class="cap-doc-tag loot">전리품 ×${d.lootMult}</span>`
            : [
                d.chanceBonus ? `<span class="cap-doc-tag chance">포섭 ${signed(Math.round(d.chanceBonus * 100), '%p')} → ${pct(CAPTURE_BASE_CHANCE + d.chanceBonus)}</span>` : '',
                d.affectionBonus ? `<span class="cap-doc-tag aff">호감도 ${signed(d.affectionBonus)} → ${baseAff + d.affectionBonus}</span>` : '',
                price > 0 ? `<span class="cap-doc-tag cost${short ? ' short' : ''}">성공 시 ${price}G${short ? ' · 골드 부족 시 효과 없음' : ''}</span>` : ''
              ].join('');
          const on = d.id === current.id;
          return `
            <button type="button" class="cap-doc-card${on ? ' active' : ''}" data-capture-doctrine="${d.id}" aria-pressed="${on}">
              <span class="cap-doc-icon">${d.icon}</span>
              <span class="cap-doc-main">
                <b>${d.name}${on ? ' <em>사용 중</em>' : ''}</b>
                <span class="cap-doc-desc">${d.desc}</span>
                ${tags ? `<span class="cap-doc-tags">${tags}</span>` : ''}
              </span>
            </button>`;
        }).join('')}</div>`;
      el.querySelectorAll('[data-capture-doctrine]').forEach(btn => {
        btn.onclick = () => setCaptureDoctrine(btn.dataset.captureDoctrine);
      });
    }

    function captureEnemyUnit(enemy, initAffection, x, y) {
      const charId = getCharacterId(enemy);
      const record = findCharacterRecord(charId, enemy.name);
      const baseName = record ? record.name : enemy.name;

      const owned = findOwnedSameCharacter(record ? record.id : charId, baseName);
      if (owned) {
        addAbsorbMaterial(owned, 'capture');
        addLog(`🧬 [포섭 → 기억 계승 재료] ${baseName}은(는) 이미 부대에 있습니다. ${owned.name}의 기억 계승 재료 +1 (용병 명부에서 계승)`, 'capture');
        return null;
      }

      const level = Number(enemy.level) || 1;
      const id = 'cap_' + Date.now();
      let unit;
      if (record) {
        const alias = getHireAlias(record); // 전사한 캐릭터는 다른 이름의 사람으로 들어온다 (고용과 같은 규칙)
        unit = characterRecordToUnit(alias ? { ...record, name: alias } : record, { id, owner: 'PLAYER', x, y, level });
      } else {
        // DB 레코드가 없는 적(구버전 적 등): 적 유닛을 그대로 복제해 아군으로
        const clone = JSON.parse(JSON.stringify(enemy));
        unit = {
          ...clone,
          id, owner: 'PLAYER', x, y, level,
          sourceCharacterId: clone.sourceCharacterId || null,
          stats: { ...(clone.stats || {}), hp: clone.maxHp || 100, maxHp: clone.maxHp || 100, atk: clone.atk, def: clone.def, mobility: clone.baseAP || 2 },
          isDead: false, isInactivated: false, statuses: [], skillCooldowns: {}
        };
      }
      unit.hp = Math.max(1, Math.round((unit.maxHp || 100) * 0.7));
      if (unit.stats) unit.stats.hp = unit.hp;
      unit.ap = 0;
      unit.affection = initAffection;
      unit.favorability = initAffection;
      unit.skillPoints = capturedSkillPoints(level, record ? record.initialSkillPoints : 0);
      unit.skillUnlockMode = 'absorb';
      if (!unit.dialogues && window.DialogueLines) unit.dialogues = DialogueLines.randomDialogues(DialogueLines.toneOf(unit));
      state.playerUnits.push(unit);
      addLog(`🎉 [포섭 성공!] ${unit.name} Lv.${level}이(가) 아군으로 합류했습니다! (초기 호감도 ${initAffection}, 스킬 해금권 ${unit.skillPoints}장)`, 'capture');
      return unit;
    }
    window.captureEnemyUnit = captureEnemyUnit;

    // 포섭 유닛의 해금권 보정: 레벨 1에서 오른 만큼(이미 해금권으로 익힌 스킬 수 제외) 해금권을 갖게 한다.
    function topUpCapturedSkillPoints(u) {
      const tree = Array.isArray(u.skillTree) ? u.skillTree : [];
      const startIds = new Set(tree.filter(n => n && n.startsLearned).map(n => n.id));
      const spent = (Array.isArray(u.learnedSkills) ? u.learnedSkills : []).filter(id => !startIds.has(id)).length;
      const owed = Math.max(0, capturedSkillPoints(u.level) - spent);
      u.skillUnlockMode = 'absorb'; // 구버전 방식이면 SkillEngine이 해금권을 0으로 회수하므로 먼저 표시해 둔다
      if ((Number(u.skillPoints) || 0) >= owed) return false;
      u.skillPoints = owed;
      return true;
    }

    // 기본 3인 레코드가 풀에 없으면 기본값으로 만든다. 세션당 한 번만 시도한다
    // (저장 직후 동기화가 다시 들어와도 중복 저장하지 않도록).
    let starterSeedAttempted = false;
    function ensureStarterCharacterRecords() {
      if (starterSeedAttempted) return;
      starterSeedAttempted = true;
      STARTER_CHARACTERS.forEach(t => {
        if (findCharacterRecord(t.id)) return;
        saveCustomCharacterRecord(starterTemplateToRecord(t));
        console.log(`[캐릭터 풀] 기본 캐릭터 ${t.name} 레코드를 생성했습니다 (${t.id})`);
      });
    }

    // 원본 레코드에만 있는 꾸밈 정보(일러스트·얼굴 위치·대사)를 유닛에 채운다. 유닛에 이미 있는 값은 그대로 둔다.
    // 병과 공통 이미지가 박혀 있던 유닛은 고유 일러스트를 잃은 것이므로 원본 이미지로 되돌린다.
    function fillUnitFromSourceRecord(u) {
      const record = findCharacterRecord(u.sourceCharacterId, u.name);
      if (!record) return false;
      let changed = false;
      if ((!u.imageUrl || isClassImageUrl(u.imageUrl)) && record.imageUrl && !isClassImageUrl(record.imageUrl) && u.imageUrl !== record.imageUrl) {
        u.imageUrl = record.imageUrl;
        changed = true;
      }
      if (!u.portraitFocus && record.portraitFocus) { u.portraitFocus = JSON.parse(JSON.stringify(record.portraitFocus)); changed = true; }
      if (!u.dialogues && record.dialogues) { u.dialogues = JSON.parse(JSON.stringify(record.dialogues)); changed = true; }
      if (!u.dialogueTone && record.dialogueTone) { u.dialogueTone = record.dialogueTone; changed = true; }
      return changed;
    }

    // 예전 세이브의 기본 3인은 풀 레코드가 없어 캐릭터 id가 인스턴스 id('u1'~'u3')였다.
    // 원본 레코드(starter_*)와 연결하고, 캐릭터 id로 묶인 것들(부관, 지휘력, 잔영, 기억 계승 재료, 해금 목록)도 옮긴다.
    function migrateStarterUnits() {
      let changed = false;
      const legacyToStarter = Object.fromEntries(STARTER_CHARACTERS.map(t => [t.unitId, t.id]));
      [...(state.playerUnits || []), ...(state.reserveUnits || [])].forEach(u => {
        if (!u) return;
        if (!u.sourceCharacterId) {
          const t = STARTER_CHARACTERS.find(t => u.id === t.unitId || u.name === t.name);
          if (!t) return;
          u.sourceCharacterId = t.id;
          changed = true;
        }
        if (STARTER_CHARACTERS.some(t => t.id === u.sourceCharacterId) && fillUnitFromSourceRecord(u)) changed = true;
      });

      const remap = (holder) => {
        if (!holder || holder.characterId == null) return;
        const next = legacyToStarter[String(holder.characterId)];
        if (next) { holder.characterId = next; changed = true; }
      };
      const run = state.run;
      if (run) [run.adjutant, run.commandBonus, run.echo, run.lastStanding, run.loopReward].forEach(remap);
      (state.characterCollection || []).forEach(remap);
      if (state.player && Array.isArray(state.player.unlockedCharacters)) {
        const ids = state.player.unlockedCharacters.map(id => legacyToStarter[String(id)] || String(id));
        const deduped = [...new Set(ids)];
        if (deduped.join('|') !== state.player.unlockedCharacters.map(String).join('|')) {
          state.player.unlockedCharacters = deduped;
          changed = true;
        }
      }
      return changed;
    }

    // 구버전 세이브의 포섭 유닛 정리: 이름에서 접두어를 떼고, 원본 캐릭터와 연결하고, 해금권을 레벨에 맞춘다.
    // 같은 캐릭터가 이미 있으면 레벨이 낮은 쪽을 기억 계승 재료로 바꾼다 (전투 중에는 명단을 건드리지 않는다).
    function migrateCapturedUnits() {
      const lists = [state.playerUnits, state.reserveUnits].filter(Array.isArray);
      const captured = () => lists.flatMap(l => l.filter(u => u && isCapturedUnitId(u.id)));
      const run = state.run;
      let changed = false;

      // 1. 이름 접두어 제거
      captured().forEach(u => {
        if (typeof u.name !== 'string' || !CAPTURED_NAME_PREFIX.test(u.name)) return;
        const oldName = u.name;
        u.name = u.name.replace(CAPTURED_NAME_PREFIX, '');
        if (run && run.adjutant && run.adjutant.name === oldName) run.adjutant.name = u.name;
        changed = true;
      });

      // 2. 원본 캐릭터 레코드와 연결 (캐릭터 DB가 로드된 뒤에만 가능)
      captured().forEach(u => {
        if (u.sourceCharacterId) {
          if (fillUnitFromSourceRecord(u)) changed = true;
          return;
        }
        const record = findCharacterRecord(null, u.name);
        if (!record) return;
        const oldId = getCharacterId(u);
        const newId = String(record.id);
        u.sourceCharacterId = record.id;
        // 병과 기본 트리가 붙어 있던 유닛은 캐릭터 고유 스킬트리로 바꾼다 (익힌 스킬 중 새 트리에 있는 것만 유지)
        if (!u.skillTreeCustomized && Array.isArray(record.skillTree) && record.skillTree.length) {
          u.skillTree = JSON.parse(JSON.stringify(record.skillTree));
          u.skillTreeCustomized = !!record.skillTreeCustomized;
          const ids = new Set(u.skillTree.map(n => n.id));
          const learned = (u.learnedSkills || []).filter(id => ids.has(id));
          u.skillTree.forEach(n => { if (n.startsLearned && !learned.includes(n.id)) learned.push(n.id); });
          u.learnedSkills = learned;
        }
        if (!u.dialogues && record.dialogues) u.dialogues = JSON.parse(JSON.stringify(record.dialogues));
        if (!u.dialogueTone && record.dialogueTone) u.dialogueTone = record.dialogueTone;
        if ((!u.imageUrl || isClassImageUrl(u.imageUrl)) && record.imageUrl) u.imageUrl = record.imageUrl;
        // 캐릭터 id로 묶인 것들(부관, 지휘력 보정, 기억 계승 재료)을 새 id로 옮긴다
        if (run && run.adjutant && String(run.adjutant.characterId) === oldId) run.adjutant = { ...run.adjutant, characterId: newId, name: u.name };
        if (run && run.commandBonus && String(run.commandBonus.characterId) === oldId) run.commandBonus.characterId = newId;
        (state.characterCollection || []).forEach(e => { if (e && String(e.characterId) === oldId) e.characterId = newId; });
        changed = true;
      });

      // 2-1. 이미 연결된 유닛인데 재료가 유닛 id로 남아 있으면 캐릭터 id로 옮긴다
      captured().forEach(u => {
        if (!u.sourceCharacterId) return;
        (state.characterCollection || []).forEach(e => {
          if (e && String(e.characterId) === String(u.id)) { e.characterId = String(u.sourceCharacterId); changed = true; }
        });
      });

      // 3. 해금권 보정
      captured().forEach(u => { if (topUpCapturedSkillPoints(u)) changed = true; });

      // 4. 같은 캐릭터 중복 정리
      if (!isCharacterPoolLocked()) {
        captured().forEach(u => {
          if (!isUnitAlive(u) || !lists.some(l => l.includes(u))) return;
          const other = findOwnedSameCharacter(getCharacterId(u), u.name, u);
          if (!other) return;
          let keep = (Number(u.level) || 1) > (Number(other.level) || 1) ? u : other;
          let drop = keep === u ? other : u;
          // 부관은 남긴다 (부관 지정이 캐릭터 id로 묶여 있다)
          const adjutantId = run && run.adjutant ? String(run.adjutant.characterId) : null;
          if (adjutantId && getCharacterId(drop) === adjutantId && getCharacterId(keep) !== adjutantId) [keep, drop] = [drop, keep];
          const dropList = lists.find(l => l.includes(drop));
          dropList.splice(dropList.indexOf(drop), 1);
          if (state.strategy && Array.isArray(state.strategy.deploySelectedIds)) {
            state.strategy.deploySelectedIds = state.strategy.deploySelectedIds.filter(id => id !== drop.id);
          }
          if (selectedUnitId === drop.id) selectedUnitId = keep.id;
          addAbsorbMaterial(keep, 'capture');
          addLog(`🧬 [포섭 정리] 중복된 ${drop.name}(Lv.${drop.level || 1})을(를) ${keep.name}(Lv.${keep.level || 1})의 기억 계승 재료로 바꿨습니다.`, 'system');
          changed = true;
        });
      }
      return changed;
    }

    // ------------------------------------------------------------------------
    // 용병 명부 (캐릭터 풀): 용병 고용으로 얻은 캐릭터는 바로 출전 명단(playerUnits)에 들어가지 않고
    // 여기서 골라 편입한다.
    //   state.characterCollection — 아직 쓰지 않은 사본 (편입 1장 / 기억 계승 재료)
    //   state.playerUnits         — 출전 명단 (sourceCharacterId로 원본 캐릭터와 연결)
    //   state.reserveUnits        — 명단에서 뺀 유닛. 레벨/스킬을 그대로 보관했다가 다시 편입할 때 복귀한다.
    // ------------------------------------------------------------------------
    let poolFilter = { query: '', cls: 'ALL', status: 'ALL', sort: 'LEVEL' };

    function isCharacterPoolLocked() {
      return !!(state.isCombatActive || (state.currentBattle && state.currentBattle.status !== 'won'));
    }

    function getCharacterPoolEntries() {
      const records = getCharacterGachaPool();
      const reserve = Array.isArray(state.reserveUnits) ? state.reserveUnits : [];
      const map = new Map();
      const entryOf = (charId) => {
        const key = String(charId);
        if (!map.has(key)) {
          map.set(key, { id: key, record: records.find(c => String(c.id) === key) || null, copies: 0, alias: null, unit: null, reserve: null });
        }
        return map.get(key);
      };
      (state.characterCollection || []).forEach(e => {
        if (!e || e.characterId == null) return;
        const entry = entryOf(e.characterId);
        entry.copies++;
        if (e.alias && !entry.alias) entry.alias = e.alias; // 전사한 캐릭터의 사본: 편입하면 이 이름으로 들어온다
      });
      (state.playerUnits || []).forEach(u => { if (u && !u.isDead && u.sourceCharacterId) entryOf(u.sourceCharacterId).unit = u; });
      reserve.forEach(u => { if (u && u.sourceCharacterId) entryOf(u.sourceCharacterId).reserve = u; });
      return [...map.values()].filter(e => e.record || e.unit || e.reserve);
    }

    function enlistCharacterFromPool(charId) {
      if (isCharacterPoolLocked()) return { ok: false, reason: '전투 중에는 출전 명단을 바꿀 수 없습니다.' };
      const entry = getCharacterPoolEntries().find(e => e.id === String(charId));
      if (!entry) return { ok: false, reason: '캐릭터를 찾을 수 없습니다.' };
      if (entry.unit) return { ok: false, reason: '이미 출전 명단에 있습니다.' };

      let unit = entry.reserve;
      if (unit) {
        state.reserveUnits.splice(state.reserveUnits.indexOf(unit), 1);
      } else {
        if (!entry.record) return { ok: false, reason: '캐릭터 DB에서 원본을 찾을 수 없습니다.' };
        const isCopy = (e) => e && String(e.characterId) === entry.id;
        let copyIdx = state.characterCollection.findIndex(e => isCopy(e) && e.alias);
        if (copyIdx < 0) copyIdx = state.characterCollection.findIndex(isCopy);
        if (copyIdx < 0) return { ok: false, reason: '편입할 사본이 없습니다.' };
        const [copy] = state.characterCollection.splice(copyIdx, 1);
        // 전사한 캐릭터는 같은 사람으로 돌아오지 않는다 — 고용 때 정한 다른 이름(없으면 지금 새로 지은 이름)으로 편입
        const alias = copy.alias || getHireAlias(entry.record);
        unit = characterRecordToUnit(alias ? { ...entry.record, name: alias } : entry.record, {
          id: `merc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          owner: 'PLAYER', x: 0, y: 0
        });
      }
      state.playerUnits.push(unit);
      addLog(`📜 [용병 명부] ${unit.name}이(가) 출전 명단에 편입되었습니다.`, 'gold');
      saveGameState(true);
      return { ok: true, unit };
    }
    window.enlistCharacterFromPool = enlistCharacterFromPool;

    function dismissCharacterToPool(charId) {
      if (isCharacterPoolLocked()) return { ok: false, reason: '전투 중에는 출전 명단을 바꿀 수 없습니다.' };
      const entry = getCharacterPoolEntries().find(e => e.id === String(charId));
      if (!entry || !entry.unit) return { ok: false, reason: '출전 명단에 없는 캐릭터입니다.' };
      const unit = entry.unit;
      state.playerUnits.splice(state.playerUnits.indexOf(unit), 1);
      if (!Array.isArray(state.reserveUnits)) state.reserveUnits = [];
      state.reserveUnits.push(unit);
      if (state.strategy && Array.isArray(state.strategy.deploySelectedIds)) {
        state.strategy.deploySelectedIds = state.strategy.deploySelectedIds.filter(id => id !== unit.id);
      }
      if (selectedUnitId === unit.id) selectedUnitId = null;
      addLog(`📜 [용병 명부] ${unit.name}을(를) 출전 명단에서 제외했습니다. (레벨·스킬 보존)`, 'system');
      saveGameState(true);
      return { ok: true, unit };
    }
    window.dismissCharacterToPool = dismissCharacterToPool;

    function renderCharacterPool() {
      const listEl = document.getElementById('pool-list');
      if (!listEl) return;
      const all = getCharacterPoolEntries();
      const locked = isCharacterPoolLocked();
      const q = poolFilter.query.trim().toLowerCase();
      const clsOf = (e) => {
        const src = e.unit || e.reserve || e.record || {};
        return src.unitClass || src.classType || 'KNIGHT';
      };
      const levelOf = (e) => Number((e.unit || e.reserve || {}).level) || 0;
      const nameOf = (e) => String((e.unit || e.reserve || {}).name || e.alias || (e.record || {}).name || '');

      let rows = all.filter(e => {
        if (q && !nameOf(e).toLowerCase().includes(q)) return false;
        if (poolFilter.cls !== 'ALL' && clsOf(e) !== poolFilter.cls) return false;
        if (poolFilter.status === 'ROSTER' && !e.unit) return false;
        if (poolFilter.status === 'BENCH' && e.unit) return false;
        return true;
      });
      const sorters = {
        LEVEL: (a, b) => levelOf(b) - levelOf(a) || b.copies - a.copies || nameOf(a).localeCompare(nameOf(b)),
        COPIES: (a, b) => b.copies - a.copies || nameOf(a).localeCompare(nameOf(b)),
        NAME: (a, b) => nameOf(a).localeCompare(nameOf(b))
      };
      rows.sort(sorters[poolFilter.sort] || sorters.LEVEL);

      const summary = document.getElementById('pool-summary');
      if (summary) {
        const inRoster = all.filter(e => e.unit).length;
        summary.textContent = `보유 ${all.length}명 · 출전 명단 ${inRoster}명 · 대기 ${all.length - inRoster}명 · 🔔 잔향 ${getResonance()}개`;
      }
      const lockNote = document.getElementById('pool-lock-note');
      if (lockNote) lockNote.style.display = locked ? '' : 'none';

      if (!rows.length) {
        listEl.innerHTML = `<div class="gacha-empty">${all.length ? '조건에 맞는 용병이 없습니다.' : '아직 고용한 용병이 없습니다. 용병 고용에서 영입하세요.'}</div>`;
        return;
      }

      const esc = escapeGachaHtml;
      listEl.innerHTML = rows.map(e => {
        const owned = e.unit || e.reserve;
        const src = owned || e.record;
        const stats = owned ? { hp: owned.maxHp, atk: owned.atk, def: owned.def } : (e.record.stats || {});
        const status = e.unit ? '<span class="pool-tag roster">출전 명단</span>'
          : e.reserve ? '<span class="pool-tag bench">대기</span>'
          : '<span class="pool-tag new">미편입</span>';
        const canEnlist = !e.unit && (e.reserve || (e.copies > 0 && e.record));
        const actions = [];
        if (e.unit) actions.push(`<button type="button" class="pool-btn ghost" data-pool-dismiss="${esc(e.id)}" ${locked ? 'disabled' : ''}>명단 제외</button>`);
        else actions.push(`<button type="button" class="pool-btn primary" data-pool-enlist="${esc(e.id)}" ${canEnlist && !locked ? '' : 'disabled'}>${e.reserve ? '복귀' : '편입 (사본 1)'}</button>`);
        if (owned) actions.push(`<button type="button" class="pool-btn absorb" data-pool-absorb="${esc(e.id)}" ${e.copies > 0 ? '' : 'disabled'}>🧬 계승</button>`);
        return `
          <div class="pool-card ${e.unit ? 'in-roster' : ''}">
            <button type="button" class="gacha-card-image pool-portrait-btn" data-pool-view="${esc(e.id)}" title="캐릭터 창 열기">${getGachaAvatarHtml(src)}</button>
            <div class="pool-card-info">
              <div class="pool-card-name">${esc(nameOf(e) || '이름 없는 용병')} ${owned ? `<span class="pool-lv">Lv.${Number(owned.level) || 1}</span>` : ''}</div>
              <div class="gacha-card-class">${esc(getGachaClassName(src))} ${status}</div>
              <div class="gacha-card-stats">HP ${stats.hp || 100} · ATK ${stats.atk || 40} · DEF ${stats.def || 30} · 사본 ${e.copies}장</div>
            </div>
            <div class="pool-card-actions">${actions.join('')}</div>
          </div>`;
      }).join('');

      const after = (res) => {
        if (!res.ok) {
          addLog(`⚠️ ${res.reason}`, 'warning');
          if (typeof window.UI?.showToast === 'function') window.UI.showToast(res.reason, 'warning');
        }
        renderCharacterPool();
        renderStrategyView();
      };
      listEl.querySelectorAll('[data-pool-view]').forEach(b => { b.onclick = () => openPoolCharacterWindow(b.dataset.poolView); });
      listEl.querySelectorAll('[data-pool-enlist]').forEach(b => { b.onclick = () => after(enlistCharacterFromPool(b.dataset.poolEnlist)); });
      listEl.querySelectorAll('[data-pool-dismiss]').forEach(b => { b.onclick = () => after(dismissCharacterToPool(b.dataset.poolDismiss)); });
      listEl.querySelectorAll('[data-pool-absorb]').forEach(b => {
        b.onclick = () => {
          const entry = getCharacterPoolEntries().find(x => x.id === b.dataset.poolAbsorb);
          const owned = entry && (entry.unit || entry.reserve);
          const res = owned ? absorbDuplicateCharacter(owned.id) : { ok: false, reason: '편입된 적 없는 캐릭터는 기억을 계승할 수 없습니다.' };
          after(res);
          if (res.ok && !res.resonance) notifyUnitGrowth(owned, `${owned.name} 레벨업! Lv.${res.level}`, [`기억 계승 — 공격 +${LEVEL_UP_GROWTH.atk} · 방어 +${LEVEL_UP_GROWTH.def}`, '스킬 해금권 +1']);
          else if (res.ok && typeof window.UI?.showToast === 'function') window.UI.showToast(`🔔 잔향 +1 (보유 ${getResonance()}개)`, 'success');
        };
      });
    }

    // 용병 명부 사진 → 캐릭터 창. 미편입 캐릭터는 DB 원본으로 만든 미리 보기(isPreview)를 띄운다.
    function openPoolCharacterWindow(charId) {
      const entry = getCharacterPoolEntries().find(e => e.id === String(charId));
      if (!entry) return;
      let unit = entry.unit || entry.reserve;
      if (!unit && entry.record) {
        const record = entry.alias ? { ...entry.record, name: entry.alias } : entry.record;
        unit = characterRecordToUnit(record, { id: `preview_${entry.id}`, owner: 'PLAYER', fullHp: true });
        unit.isPreview = true;
      }
      if (!unit) return;
      const modal = document.getElementById('modal-character-pool');
      if (modal) modal.style.display = 'none';
      openFullShotOverlay(unit, { returnToPool: true });
    }
    window.openPoolCharacterWindow = openPoolCharacterWindow;

    async function openCharacterPool() {
      const modal = document.getElementById('modal-character-pool');
      if (!modal) return;
      modal.style.display = 'flex';
      const search = document.getElementById('pool-search');
      if (search) search.value = poolFilter.query;
      if (!getCharacterGachaPool().length && typeof window.getCharactersFromCloud === 'function') {
        const listEl = document.getElementById('pool-list');
        if (listEl) listEl.innerHTML = '<div class="gacha-empty">캐릭터 DB를 불러오는 중...</div>';
        try {
          const chars = await window.getCharactersFromCloud();
          if (Array.isArray(chars)) syncGlobalCharactersFromSupabase(chars);
        } catch (err) {
          console.error('Character pool load error:', err);
        }
      }
      renderCharacterPool();
    }
    window.openCharacterPool = openCharacterPool;

    function closeCharacterPool() {
      const modal = document.getElementById('modal-character-pool');
      if (modal) modal.style.display = 'none';
      if (state && state.currentView === 'CAMPAIGN') renderCampaignView();
    }
    window.closeCharacterPool = closeCharacterPool;

    function setCharacterPoolFilter(key, value) {
      poolFilter[key] = value;
      document.querySelectorAll(`[data-pool-filter="${key}"]`).forEach(el => {
        el.classList.toggle('active', el.dataset.value === value);
      });
      renderCharacterPool();
    }
    window.setCharacterPoolFilter = setCharacterPoolFilter;

    function spawnSavedCustomCharacter(charId) {
      const list = getStoredCustomCharacters();
      const target = list.find(c => c.id === charId);
      if (!target) return;

      saveHistorySnapshot();

      const newId = 'custom_' + Date.now();
      let spawnX = 3;
      let spawnY = 4;
      const occupied = state.playerUnits.some(u => !u.isDead && u.x === spawnX && u.y === spawnY);
      if (occupied) {
        const candidates = [{ x: 3, y: 5 }, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 2, y: 5 }];
        const empty = candidates.find(c => !state.playerUnits.some(u => !u.isDead && u.x === c.x && u.y === c.y));
        if (empty) { spawnX = empty.x; spawnY = empty.y; }
      }

      const copyChar = characterRecordToUnit(target, { id: newId, owner: 'PLAYER', x: spawnX, y: spawnY });

      state.playerUnits.push(copyChar);
      selectedUnitId = newId;
      saveGameState();
      renderAll();
      closeAllModals();
      openFullShotOverlay(copyChar);
      addLog(`✨ [보관함 소환] ${copyChar.name}이(가) 전장 (${spawnX}, ${spawnY})에 출격했습니다!`, 'gold');
    }

    // 보관함 캐릭터의 스킬트리 편집 (저장 시 클라우드 레코드와 로스터의 같은 캐릭터에 반영)
    function openCharacterSkillTreeEditor(charId) {
      const record = getStoredCustomCharacters().find(c => String(c.id) === String(charId)) || findCharacterById(charId);
      if (!record || !window.SkillEditor) return;
      let draft = JSON.parse(JSON.stringify(Array.isArray(record.skillTree) ? record.skillTree : []));
      document.getElementById('sk-char-tree-modal')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'sk-char-tree-modal';
      overlay.className = 'sk-modal-overlay';
      overlay.innerHTML = `
        <div class="sk-modal">
          <div class="sk-modal-head"><span>🌳 ${SkillEditor.esc(record.name)} — 스킬 · 스킬트리 편집</span><button class="btn-close" data-close>✕</button></div>
          <div class="sk-modal-body"><div data-builder></div></div>
          <div class="sk-modal-foot">
            <button class="btn-cheat" style="background:#64748b;" data-close>닫기</button>
            <button class="btn-cheat purple" data-save>💾 스킬트리 저장</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      SkillEditor.mountBuilder(overlay.querySelector('[data-builder]'), {
        getTree: () => draft,
        setTree: (t) => { draft = t; },
        getClassType: () => record.unitClass || record.classType || 'DEFAULT'
      });
      overlay.querySelector('[data-save]').onclick = () => {
        record.skillTree = JSON.parse(JSON.stringify(draft));
        record.skillTreeCustomized = true;
        if (getStoredCustomCharacters().includes(record)) saveCustomCharacterRecord(record);
        const ids = new Set(draft.map(n => n.id));
        (state.playerUnits || []).forEach(u => {
          if (String(u.id) !== String(record.id) && String(u.sourceCharacterId) !== String(record.id)) return;
          if (u !== record) u.skillTree = JSON.parse(JSON.stringify(draft));
          u.skillTreeCustomized = true;
          const learned = Array.isArray(u.learnedSkills) ? u.learnedSkills.filter(id => ids.has(id)) : [];
          draft.forEach(n => { if (n.startsLearned && !learned.includes(n.id)) learned.push(n.id); });
          u.learnedSkills = learned;
        });
        saveGameState(true);
        renderCustomCharactersList();
        updateFullShotOverlay();
        addLog(`🌳 [스킬트리 저장] ${record.name}: ${draft.length}개 노드`, 'gold');
        close();
      };
    }
    window.openCharacterSkillTreeEditor = openCharacterSkillTreeEditor;

    // 보관함 캐릭터의 이름 변경 (저장 시 클라우드 레코드와 전장의 같은 캐릭터에 반영)
    function openCharacterRenameEditor(charId) {
      const record = getStoredCustomCharacters().find(c => String(c.id) === String(charId)) || findCharacterById(charId);
      if (!record) return;
      document.getElementById('rename-char-modal')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'rename-char-modal';
      overlay.className = 'sk-modal-overlay';
      overlay.innerHTML = `
        <div class="sk-modal" style="max-width: 360px;">
          <div class="sk-modal-head"><span>✏️ 이름 변경</span><button class="btn-close" data-close>✕</button></div>
          <div class="sk-modal-body">
            <label class="dbg-form-label" for="rename-char-input">캐릭터 이름</label>
            <input type="text" id="rename-char-input" class="dbg-form-control" maxlength="30" placeholder="캐릭터명 입력" />
          </div>
          <div class="sk-modal-foot">
            <button class="btn-cheat" style="background:#64748b;" data-close>닫기</button>
            <button class="btn-cheat purple" data-save>💾 이름 저장</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#rename-char-input');
      input.value = record.name || '';
      const close = () => overlay.remove();
      overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      const save = () => {
        const newName = input.value.trim();
        if (!newName) { input.focus(); return; }
        const oldName = record.name;
        if (newName === oldName) { close(); return; }
        record.name = newName;
        if (getStoredCustomCharacters().includes(record)) saveCustomCharacterRecord(record);
        // 같은 캐릭터에서 나온 유닛 중 원래 이름을 쓰던 것만 바꾼다 (전사 후 다른 이름으로 고용된 경우는 유지)
        [...(state.playerUnits || []), ...(state.enemyUnits || [])].forEach(u => {
          if (String(u.id) !== String(record.id) && String(u.sourceCharacterId) !== String(record.id)) return;
          if (u !== record && u.name === oldName) u.name = newName;
        });
        saveGameState(true);
        renderAll();
        renderCustomCharactersList();
        updateFullShotOverlay();
        addLog(`✏️ [이름 변경] ${oldName} → ${newName}`, 'gold');
        close();
      };
      overlay.querySelector('[data-save]').onclick = save;
      input.onkeydown = (e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') close(); };
      input.focus();
      input.select();
    }
    window.openCharacterRenameEditor = openCharacterRenameEditor;

    // ------------------------------------------------------------------------
    // 일러스트 변경: 보관함에서 캐릭터 그림을 바꾸거나, 외부 그림을 내 저장소(Supabase Storage)로 옮긴다.
    // 저장하면 캐릭터 레코드와 그 캐릭터에서 나온 모든 유닛(출전·대기·적)의 그림이 함께 바뀐다.
    // ------------------------------------------------------------------------
    function isOwnStorageImageUrl(url) {
      const base = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || '';
      return !!url && !!base && String(url).startsWith(base);
    }
    function isExternalImageUrl(url) {
      return /^https?:\/\//.test(String(url || '')) && !isOwnStorageImageUrl(url);
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error('파일 읽기 실패'));
        r.readAsDataURL(blob);
      });
    }

    /** data URL 또는 외부 URL을 압축해 내 저장소에 올리고 영구 URL을 돌려준다. */
    async function storeIllustration(source, name) {
      let dataUrl = source;
      if (isExternalImageUrl(source)) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`원본 그림을 받지 못했습니다 (HTTP ${res.status})`);
        dataUrl = await blobToDataUrl(await res.blob());
      }
      if (!String(dataUrl).startsWith('data:image/')) throw new Error('이미지 파일이 아닙니다.');
      const compressed = await compressImageDataUrl(dataUrl, 640, 960, 0.85);
      const upload = window.uploadCharacterAvatar
        || (window.SupabaseBridge && window.SupabaseBridge.uploadCharacterImage);
      if (typeof upload !== 'function') throw new Error('저장소 업로드 기능을 찾을 수 없습니다.');
      const url = await upload(compressed, name || 'hero');
      if (!url) throw new Error('저장소 업로드에 실패했습니다.');
      return url;
    }

    /** 레코드와 그 캐릭터에서 나온 유닛들의 그림을 바꾼다. keepFocus: 같은 그림을 옮긴 경우 얼굴 위치 유지 */
    function applyCharacterIllustration(record, newUrl, { keepFocus = false } = {}) {
      const oldUrl = record.imageUrl || '';
      record.imageUrl = newUrl;
      if (!keepFocus) delete record.portraitFocus;
      brokenImageUrls.delete(newUrl);
      if (getStoredCustomCharacters().includes(record)) saveCustomCharacterRecord(record);
      [...(state.playerUnits || []), ...(state.reserveUnits || []), ...(state.enemyUnits || [])].forEach(u => {
        if (!u || u === record) return;
        if (String(u.id) !== String(record.id) && String(u.sourceCharacterId) !== String(record.id)) return;
        // 이 캐릭터의 그림을 쓰던 유닛만 바꾼다 (다른 그림을 따로 지정한 유닛은 그대로)
        if (u.imageUrl && u.imageUrl !== oldUrl && !isClassImageUrl(u.imageUrl)) return;
        u.imageUrl = newUrl;
        if (!keepFocus) delete u.portraitFocus;
      });
      saveGameState(true);
      renderAll();
      renderCustomCharactersList();
      if (document.getElementById('pool-list')) renderCharacterPool();
      if (typeof updateFullShotOverlay === 'function') updateFullShotOverlay();
    }

    function openCharacterIllustrationEditor(charId) {
      const record = getStoredCustomCharacters().find(c => String(c.id) === String(charId)) || findCharacterById(charId);
      if (!record) { addLog('⚠️ 캐릭터 원본을 찾을 수 없어 그림을 바꿀 수 없습니다.', 'warning'); return; }
      document.getElementById('illust-char-modal')?.remove();
      const cls = record.classType || record.unitClass;
      const current = record.imageUrl || '';
      let pending = null; // { source, keepFocus }
      const overlay = document.createElement('div');
      overlay.id = 'illust-char-modal';
      overlay.className = 'sk-modal-overlay';
      overlay.innerHTML = `
        <div class="sk-modal" style="max-width: 380px;">
          <div class="sk-modal-head"><span>🖼️ ${escapeGachaHtml(record.name || '')} 일러스트</span><button class="btn-close" data-close>✕</button></div>
          <div class="sk-modal-body">
            <div style="display:flex; gap:10px; align-items:flex-start;">
              <div style="width:96px; height:140px; border-radius:8px; background:#f1f5f9; border:1px solid #e2e8f0; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <img data-preview alt="" style="width:100%; height:100%; object-fit:cover; display:none;">
                <span data-preview-empty style="font-size:30px;">${escapeGachaHtml(record.avatar || '👤')}</span>
              </div>
              <div data-status style="font-size:11px; color:#475569; line-height:1.5;"></div>
            </div>
            <label class="dbg-form-label" for="illust-url-input" style="margin-top:10px;">이미지 주소 (URL)</label>
            <input type="url" id="illust-url-input" class="dbg-form-control" placeholder="https://..." />
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
              <label class="btn-cheat" style="background:#0284c7; cursor:pointer;">📁 파일 선택<input type="file" accept="image/*" data-file style="display:none;"></label>
              <button class="btn-cheat" style="background:#0d9488;" data-copy ${isExternalImageUrl(current) ? '' : 'disabled'} title="지금 그림을 내 저장소로 옮겨 외부 사이트가 막혀도 사라지지 않게 합니다">☁️ 지금 그림 보관</button>
              <button class="btn-cheat" style="background:#64748b;" data-clear>병과 기본 그림</button>
            </div>
          </div>
          <div class="sk-modal-foot">
            <button class="btn-cheat" style="background:#64748b;" data-close>닫기</button>
            <button class="btn-cheat purple" data-save>💾 저장</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const q = (sel) => overlay.querySelector(sel);
      const img = q('[data-preview]'), empty = q('[data-preview-empty]'), status = q('[data-status]'), urlInput = q('#illust-url-input');
      const showPreview = (src, note) => {
        const shown = src || pickLoadableImage(customClassImages[cls]);
        if (shown) {
          img.onerror = () => { img.style.display = 'none'; empty.style.display = ''; status.textContent = '⚠️ 이 이미지를 불러오지 못했습니다. 다른 그림을 지정하세요.'; };
          img.onload = () => { img.style.display = ''; empty.style.display = 'none'; };
          img.src = shown;
        } else { img.style.display = 'none'; empty.style.display = ''; }
        status.textContent = note;
      };
      const describeCurrent = () => !current ? '고유 그림이 없어 병과 기본 그림을 쓰고 있습니다.'
        : isImageUrlBroken(current) ? '⚠️ 지금 그림을 불러오지 못하고 있습니다. 새 그림을 지정하세요.'
        : isOwnStorageImageUrl(current) ? '내 저장소에 보관된 그림입니다.'
        : '외부 사이트 그림입니다. 그 사이트가 막히면 사라질 수 있어 "지금 그림 보관"을 권합니다.';
      urlInput.value = current.startsWith('data:') ? '' : current;
      showPreview(current, describeCurrent());

      urlInput.oninput = () => {
        const v = urlInput.value.trim();
        if (/^https?:\/\//.test(v)) { pending = { source: v, keepFocus: v === current }; showPreview(v, '저장하면 이 주소의 그림을 씁니다.'); }
      };
      q('[data-file]').onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageDataUrl(file, 640, 960, 0.85).then(dataUrl => {
          pending = { source: dataUrl, keepFocus: false };
          urlInput.value = '';
          showPreview(dataUrl, `선택한 파일: ${file.name} — 저장하면 내 저장소에 올립니다.`);
        });
      };
      q('[data-copy]').onclick = () => {
        pending = { source: current, keepFocus: true, copy: true };
        showPreview(current, '저장하면 지금 그림을 내 저장소로 옮깁니다 (그림은 같고 주소만 바뀝니다).');
      };
      q('[data-clear]').onclick = () => {
        pending = { source: '', keepFocus: false };
        urlInput.value = '';
        showPreview('', '저장하면 고유 그림을 지우고 병과 기본 그림을 씁니다.');
      };
      const close = () => overlay.remove();
      overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      q('[data-save]').onclick = async () => {
        if (!pending) { close(); return; }
        const btn = q('[data-save]');
        btn.disabled = true; btn.textContent = '⏳ 저장 중…';
        try {
          let url = pending.source;
          // 파일·보관 요청은 내 저장소에 올린다. URL 직접 입력은 그 주소를 그대로 쓴다.
          if (url && (url.startsWith('data:') || pending.copy)) url = await storeIllustration(url, record.name);
          applyCharacterIllustration(record, url, { keepFocus: !!pending.keepFocus });
          addLog(`🖼️ [일러스트] ${record.name}의 그림을 ${url ? (isOwnStorageImageUrl(url) ? '내 저장소 그림으로' : '새 주소로') : '병과 기본 그림으로'} 바꿨습니다.`, 'gold');
          close();
        } catch (err) {
          btn.disabled = false; btn.textContent = '💾 저장';
          status.textContent = `⚠️ ${err.message || err}`;
          addLog(`⚠️ [일러스트] ${record.name} 그림 저장 실패: ${err.message || err}`, 'warning');
        }
      };
    }
    window.openCharacterIllustrationEditor = openCharacterIllustrationEditor;

    /** 외부 사이트 그림을 쓰는 캐릭터를 모두 내 저장소로 옮긴다 (그림은 같고 주소만 바뀐다). */
    async function archiveExternalIllustrations() {
      const targets = getStoredCustomCharacters().filter(c => isExternalImageUrl(c.imageUrl) && !isImageUrlBroken(c.imageUrl));
      if (!targets.length) { addLog('☁️ 외부 사이트 그림을 쓰는 캐릭터가 없습니다.', 'system'); return { ok: 0, fail: 0 }; }
      addLog(`☁️ 외부 그림 ${targets.length}개를 내 저장소로 옮기는 중…`, 'system');
      let ok = 0, fail = 0;
      for (const c of targets) {
        try {
          const url = await storeIllustration(c.imageUrl, c.name);
          applyCharacterIllustration(c, url, { keepFocus: true });
          ok++;
        } catch (err) {
          fail++;
          console.warn('[일러스트 보관] 실패:', c.name, err);
        }
      }
      addLog(`☁️ 외부 그림 보관 완료: 성공 ${ok}개${fail ? ` · 실패 ${fail}개 (해당 캐릭터는 🖼️ 버튼으로 다시 지정하세요)` : ''}`, fail ? 'warning' : 'gold');
      return { ok, fail };
    }
    window.archiveExternalIllustrations = archiveExternalIllustrations;

    function deleteSavedCustomCharacter(charId) {
      customCharactersCloudCache = customCharactersCloudCache.filter(c => c.id !== charId);
      if (typeof window.deleteCharacterFromCloud === 'function') {
        window.deleteCharacterFromCloud(charId);
      }
      renderCustomCharactersList();
      addLog('🗑️ Supabase 클라우드 보관함에서 선택한 영웅이 영구 삭제되었습니다.', 'system');
    }

    // 보관함 캐릭터의 상황별 대사 편집 (저장 시 클라우드 레코드와 로스터의 같은 캐릭터에 반영)
    function openCharacterDialogueEditor(charId) {
      const record = getStoredCustomCharacters().find(c => String(c.id) === String(charId)) || findCharacterById(charId);
      if (!record || !window.DialogueLines) return;
      document.getElementById('dlg-char-modal')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'dlg-char-modal';
      overlay.className = 'sk-modal-overlay';
      overlay.innerHTML = `
        <div class="sk-modal">
          <div class="sk-modal-head"><span></span><button class="btn-close" data-close>✕</button></div>
          <div class="sk-modal-body"><div data-editor></div></div>
          <div class="sk-modal-foot">
            <button class="btn-cheat" style="background:#64748b;" data-close>닫기</button>
            <button class="btn-cheat purple" data-save>💾 대사 저장</button>
          </div>
        </div>`;
      overlay.querySelector('.sk-modal-head span').textContent = `💬 ${record.name} — 상황별 대사 편집`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      const tone = DialogueLines.toneOf(record);
      const editor = DialogueLines.mountEditor(overlay.querySelector('[data-editor]'), DialogueLines.fillMissing(record.dialogues, tone), tone);
      overlay.querySelector('[data-save]').onclick = () => {
        const dialogueTone = editor.getTone();
        const dialogues = DialogueLines.fillMissing(editor.getDialogues(), dialogueTone);
        record.dialogues = dialogues;
        record.dialogueTone = dialogueTone;
        if (getStoredCustomCharacters().includes(record)) saveCustomCharacterRecord(record);
        (state.playerUnits || []).forEach(u => {
          if (String(u.id) !== String(record.id) && String(u.sourceCharacterId) !== String(record.id)) return;
          u.dialogues = JSON.parse(JSON.stringify(dialogues));
          u.dialogueTone = dialogueTone;
        });
        saveGameState(true);
        addLog(`💬 [대사 저장] ${record.name}의 상황별 대사를 저장했습니다.`, 'gold');
        close();
      };
    }
    window.openCharacterDialogueEditor = openCharacterDialogueEditor;

    /* --------------------------------------------------------------------------
       초상화 얼굴 크롭 편집기 — 드래그로 위치, 휠/슬라이더로 확대.
       결과 { x, y, zoom }을 onSave로 넘긴다 (renderPortrait의 portraitFocus 형식).
       -------------------------------------------------------------------------- */
    const PORTRAIT_ZOOM_MIN = 1;
    const PORTRAIT_ZOOM_MAX = 5;

    function openPortraitCropEditor(char, onSave) {
      const url = (char?.imageUrl || customClassImages[char?.classType || char?.unitClass] || '').trim();
      if (!url) {
        addLog('🖼️ 일러스트가 없는 캐릭터는 얼굴 위치를 조정할 수 없습니다.', 'system');
        return;
      }
      document.getElementById('portrait-crop-modal')?.remove();

      let focus = getPortraitFocus(char);
      let ratio = 1.5; // 이미지 세로/가로 비율 — 로드 후 실제 값으로 갱신

      const overlay = document.createElement('div');
      overlay.id = 'portrait-crop-modal';
      overlay.className = 'sk-modal-overlay';
      overlay.innerHTML = `
        <div class="sk-modal pc-modal">
          <div class="sk-modal-head"><span></span><button class="btn-close" data-close>✕</button></div>
          <div class="sk-modal-body">
            <div class="pc-editor">
              <div class="pc-stage" data-stage><div class="pc-guide"></div></div>
              <div class="pc-side">
                <div class="pc-hint">드래그로 얼굴 위치를 옮기고, 휠이나 슬라이더로 확대합니다.</div>
                <label class="pc-zoom">🔍 확대
                  <input type="range" min="${PORTRAIT_ZOOM_MIN}" max="${PORTRAIT_ZOOM_MAX}" step="0.05" data-zoom />
                  <span data-zoom-val></span>
                </label>
                <div class="pc-previews">
                  <div class="pc-prev-item"><div class="pc-prev pc-prev-tile" data-prev></div><span>맵 타일</span></div>
                  <div class="pc-prev-item"><div class="pc-prev pc-prev-card" data-prev></div><span>선택 카드</span></div>
                  <div class="pc-prev-item"><div class="pc-prev pc-prev-roster" data-prev></div><span>명부</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="sk-modal-foot">
            <button class="btn-cheat" style="background:#64748b; margin-right:auto;" data-reset>↺ 기본값</button>
            <button class="btn-cheat" style="background:#64748b;" data-close>닫기</button>
            <button class="btn-cheat purple" data-save>💾 저장</button>
          </div>
        </div>`;
      overlay.querySelector('.sk-modal-head span').textContent = `🎯 ${char.name || '캐릭터'} — 초상화 얼굴 위치`;
      document.body.appendChild(overlay);

      const stage = overlay.querySelector('[data-stage]');
      const zoomInput = overlay.querySelector('[data-zoom]');
      const zoomVal = overlay.querySelector('[data-zoom-val]');
      const views = [stage, ...overlay.querySelectorAll('[data-prev]')];
      const cssUrl = url.replace(/["\\\n\r]/g, c => encodeURIComponent(c));
      views.forEach(v => { v.style.backgroundImage = `url("${cssUrl}")`; });

      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const paint = () => {
        views.forEach(v => {
          v.style.backgroundSize = `${focus.zoom * 100}% auto`;
          v.style.backgroundPosition = `${focus.x}% ${focus.y}%`;
        });
        zoomInput.value = focus.zoom;
        zoomVal.textContent = `${focus.zoom.toFixed(2)}x`;
      };
      paint();

      const img = new Image();
      img.onload = () => { if (img.naturalWidth) ratio = img.naturalHeight / img.naturalWidth; };
      img.src = url;

      // 드래그: background-position %는 (틀 크기 - 이미지 크기) 대비 비율이므로 픽셀 이동량을 그 비율로 환산
      let drag = null;
      stage.addEventListener('pointerdown', (e) => {
        drag = { px: e.clientX, py: e.clientY, x: focus.x, y: focus.y };
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const w = stage.clientWidth, h = stage.clientHeight;
        const imgW = focus.zoom * w, imgH = imgW * ratio;
        if (imgW > w) focus.x = clamp(drag.x - (e.clientX - drag.px) / (imgW - w) * 100, 0, 100);
        if (imgH > h) focus.y = clamp(drag.y - (e.clientY - drag.py) / (imgH - h) * 100, 0, 100);
        paint();
      });
      const endDrag = () => { drag = null; stage.classList.remove('dragging'); };
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);
      stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        focus.zoom = clamp(focus.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), PORTRAIT_ZOOM_MIN, PORTRAIT_ZOOM_MAX);
        paint();
      }, { passive: false });
      zoomInput.addEventListener('input', () => {
        focus.zoom = clamp(Number(zoomInput.value), PORTRAIT_ZOOM_MIN, PORTRAIT_ZOOM_MAX);
        paint();
      });

      const close = () => overlay.remove();
      overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      overlay.querySelector('[data-reset]').onclick = () => { focus = { ...DEFAULT_PORTRAIT_FOCUS }; paint(); };
      overlay.querySelector('[data-save]').onclick = () => {
        onSave({
          x: Math.round(focus.x * 10) / 10,
          y: Math.round(focus.y * 10) / 10,
          zoom: Math.round(focus.zoom * 100) / 100
        });
        close();
      };
    }

    // 보관함 캐릭터의 얼굴 위치 편집 (저장 시 클라우드 레코드와 전장의 같은 캐릭터에 반영)
    function openCharacterPortraitEditor(charId) {
      const record = getStoredCustomCharacters().find(c => String(c.id) === String(charId)) || findCharacterById(charId);
      if (!record) return;
      openPortraitCropEditor(record, (focus) => {
        record.portraitFocus = focus;
        if (getStoredCustomCharacters().includes(record)) saveCustomCharacterRecord(record);
        [...(state.playerUnits || []), ...(state.enemyUnits || [])].forEach(u => {
          if (String(u.id) !== String(record.id) && String(u.sourceCharacterId) !== String(record.id)) return;
          u.portraitFocus = { ...focus };
        });
        saveGameState(true);
        renderAll();
        renderCustomCharactersList();
        addLog(`🎯 [초상화] ${record.name}의 얼굴 위치를 저장했습니다.`, 'gold');
      });
    }
    window.openCharacterPortraitEditor = openCharacterPortraitEditor;

    // 보관함 캐릭터의 일러스트 교체 (DEV 목록의 얼굴 클릭). 저장 후 새 그림에 맞춰 얼굴 위치를 바로 잡게 한다.
    function changeCustomCharacterImage(charId) {
      const record = getStoredCustomCharacters().find(c => String(c.id) === String(charId)) || findCharacterById(charId);
      if (!record) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png, image/jpeg, image/webp';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          addLog('⚠️ 지원되지 않는 이미지 파일입니다. PNG, JPG, WebP 파일을 선택해주세요.', 'warning');
          return;
        }
        addLog(`⏳ ${record.name}의 일러스트를 최적화하는 중...`, 'system');
        const dataUrl = await compressImageDataUrl(file, 640, 960, 0.8);
        if (!dataUrl) return;
        let url = dataUrl;
        if (typeof window.uploadCharacterAvatar === 'function') {
          try {
            url = await window.uploadCharacterAvatar(dataUrl, record.name || record.id) || dataUrl;
          } catch (err) {
            console.warn('Character image upload failed, saving data URL:', err);
          }
        }
        record.imageUrl = url;
        delete record.portraitFocus; // 이전 그림 기준 얼굴 위치는 새 그림에 맞지 않는다
        if (getStoredCustomCharacters().includes(record)) saveCustomCharacterRecord(record);
        [...(state.playerUnits || []), ...(state.reserveUnits || []), ...(state.enemyUnits || [])].forEach(u => {
          if (!u || u === record) return;
          if (String(u.id) !== String(record.id) && String(u.sourceCharacterId) !== String(record.id)) return;
          u.imageUrl = url;
          delete u.portraitFocus;
        });
        saveGameState(true);
        renderAll();
        renderCustomCharactersList();
        updateFullShotOverlay();
        addLog(`🖼️ [일러스트 변경] ${record.name}의 일러스트를 교체했습니다.`, 'gold');
        openCharacterPortraitEditor(record.id);
      };
      input.click();
    }
    window.changeCustomCharacterImage = changeCustomCharacterImage;

    // 생성 폼: 아직 저장 전인 캐릭터의 얼굴 위치
    function openNewCharacterPortraitEditor() {
      const name = document.getElementById('create-char-name')?.value?.trim() || '새 캐릭터';
      const classType = document.getElementById('create-char-class')?.value || 'KNIGHT';
      openPortraitCropEditor(
        { name, classType, imageUrl: createCharImageDataUrl, portraitFocus: createCharPortraitFocus },
        (focus) => { createCharPortraitFocus = focus; }
      );
    }
    window.openNewCharacterPortraitEditor = openNewCharacterPortraitEditor;

    function initCustomCharCreationForm() {
      setupCustomCharDropzone();
      if (window.DialogueLines && !createCharDialogueEditor) {
        createCharDialogueEditor = DialogueLines.mountEditor(document.getElementById('create-char-dialogue-editor'));
      }
      renderCustomCharactersList();
      // Load initial character list from Supabase
      if (typeof window.getCharactersFromCloud === 'function') {
        window.getCharactersFromCloud().then(chars => {
          if (Array.isArray(chars) && chars.length > 0) {
            syncGlobalCharactersFromSupabase(chars);
          }
        });
      }
      // Real-time synchronization
      if (typeof window.subscribeCharacterList === 'function') {
        window.subscribeCharacterList((chars) => {
          syncGlobalCharactersFromSupabase(chars);
        });
      }
      if (typeof window.renderDevSkillTreeEditor === 'function') {
        window.renderDevSkillTreeEditor(null);
      } else if (typeof window.UI?.renderDevSkillTreeEditor === 'function') {
        window.UI.renderDevSkillTreeEditor(null);
      }
    }

    /* --------------------------------------------------------------------------
       Full-Shot Overlay UI Controller
       -------------------------------------------------------------------------- */
    let currentOverlayTargetUnit = null;

    function updateFullShotOverlay(targetUnit) {
      const overlay = document.getElementById('unit-fullshot-overlay');
      if (!overlay) return;

      const unit = targetUnit || currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) {
        if (overlay.classList.contains('active')) {
          closeFullShotOverlay();
        }
        return;
      }

      const stageEl = document.getElementById('fullshot-character-stage');
      const nameEl = document.getElementById('fullshot-name-text');
      const classTagEl = document.getElementById('fullshot-tag-class');
      const lvEl = document.getElementById('fullshot-badge-lv');

      const meta = CLASS_META[unit.classType] || { name: unit.classType, icon: unit.avatar, color: '#0284c7' };
      const customImg = unit.imageUrl || customClassImages[unit.classType];

      if (nameEl) nameEl.textContent = unit.name;
      if (classTagEl) classTagEl.innerHTML = `${meta.icon} ${meta.name.split(' ')[0]}`;
      if (lvEl) lvEl.textContent = `Lv.${unit.level}`;

      // Left Character Illustration Stage
      if (stageEl) {
        const displayImg = customImg || (typeof SAMPLE_CLASS_IMAGES !== 'undefined' ? SAMPLE_CLASS_IMAGES[unit.classType] : '');
        if (displayImg) {
          stageEl.innerHTML = `<img src="${displayImg}" class="fullshot-main-img" alt="${unit.name}" />`;
        } else {
          stageEl.innerHTML = '';
        }
      }

      // HP Capsule Gauge & Text
      const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
      const hpValEl = document.getElementById('fullshot-hp-val-text');
      const hpGauge = document.getElementById('fullshot-hp-gauge');
      const hpOverlay = document.getElementById('fullshot-hp-overlay-text');
      if (hpValEl) hpValEl.textContent = `${unit.hp} / ${unit.maxHp}`;
      if (hpGauge) {
        hpGauge.style.width = `${hpPct}%`;
        hpGauge.style.background = hpPct < 35 ? 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)' : 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
      }
      if (hpOverlay) hpOverlay.textContent = `HP ${unit.hp} / ${unit.maxHp} (${Math.round(hpPct)}%)`;

      // Affection Capsule Gauge & Text
      const affValEl = document.getElementById('fullshot-aff-val-text');
      const affGauge = document.getElementById('fullshot-aff-gauge');
      const affOverlay = document.getElementById('fullshot-aff-overlay-text');
      const affPct = Math.max(0, Math.min(100, unit.affection));
      const isAffDanger = unit.affection <= 30;

      if (affValEl) {
        affValEl.innerHTML = `${unit.affection} / 100 ${isAffDanger ? '<span style="color:#dc2626; font-size:9px;">(거부위험)</span>' : ''}`;
      }
      if (affGauge) {
        affGauge.style.width = `${affPct}%`;
        affGauge.style.background = isAffDanger ? 'linear-gradient(90deg, #b91c1c 0%, #ef4444 100%)' : 'linear-gradient(90deg, #ec4899 0%, #f472b6 100%)';
      }
      if (affOverlay) {
        affOverlay.textContent = `호감도 ${unit.affection} / 100 ${isAffDanger ? '⚠️ 복종 거부 위험' : '💖 유대 양호'}`;
      }

      // Pastel Stats Grid
      const atkEl = document.getElementById('fullshot-stat-atk');
      const defEl = document.getElementById('fullshot-stat-def');
      const apEl = document.getElementById('fullshot-stat-ap');
      const coordEl = document.getElementById('fullshot-stat-coord');

      if (atkEl) atkEl.textContent = unit.atk;
      if (defEl) defEl.innerHTML = formatDefense(unit);
      if (apEl) {
        apEl.innerHTML = `<span style="color: ${unit.ap > 0 ? '#0284c7' : '#ef4444'}; font-weight: 900;">${unit.ap}</span> / ${unit.baseAP}`;
      }
      if (coordEl) {
        if (unit.x !== undefined && unit.y !== undefined) {
          const curTile = getTile(unit.x, unit.y);
          const tileName = curTile ? curTile.name : '평지';
          coordEl.innerHTML = `(${unit.x}, ${unit.y}) <span style="font-size:9px; font-weight:700; opacity:0.85;">${tileName}</span>`;
        } else {
          coordEl.innerHTML = `<span style="font-size:10px; font-weight:800; color:#0284c7;">본대 대기</span>`;
        }
      }

      // 스킬 목록 (고유 스킬 + 스킬트리에서 습득한 스킬) 및 현재 상태이상
      renderFullshotSkillList(unit);
      renderFullshotGiftBox(unit);
      // 용병 명부에서 미리 보는 미편입 캐릭터는 스킬트리를 열 수 없다
      const treeActionBtn = document.querySelector('#unit-fullshot-overlay .fullshot-btn-action.skill');
      if (treeActionBtn) treeActionBtn.style.display = unit.isPreview ? 'none' : '';
    }

    // 캐릭터 창: 받은 선물 유물 + 선물하기 버튼
    function renderFullshotGiftBox(unit) {
      const box = document.getElementById('fullshot-gift-box');
      if (!box) return;
      const canGift = !unit.isPreview && getGiftableUnits().includes(unit);
      const received = Array.isArray(unit.giftRelics) ? unit.giftRelics : [];
      if (!canGift && !received.length) { box.innerHTML = ''; box.hidden = true; return; }
      const esc = escapeGachaHtml;
      const giftCount = getOwnedRelics().filter(r => r.kind === 'gift').length;
      const chips = received.map(r => {
        const rarity = RELIC_RARITY_META[r.rarity] || RELIC_RARITY_META.common;
        return `<span class="fs-gift-chip" style="--relic-color:${rarity.color}" title="${esc(describeRelicEffects(r))}">💎 ${esc(r.name)}</span>`;
      }).join('');
      box.hidden = false;
      box.innerHTML = `
        <div class="fs-skill-head">
          <span>🎁 받은 선물 ${received.length}개</span>
          ${canGift ? `<button class="btn-cheat purple" style="font-size: 8.5px; padding: 2px 6px;" data-gift-open="1" ${giftCount ? '' : 'disabled'}>유물 선물하기 (${giftCount})</button>` : ''}
        </div>
        ${chips ? `<div class="fs-gift-row">${chips}</div>` : '<div style="font-size:10px;color:#94a3b8;padding:2px 0;">아직 받은 선물이 없습니다.</div>'}`;
      const btn = box.querySelector('[data-gift-open]');
      if (btn) btn.onclick = () => openRelicGiftPicker({ unitId: unit.id });
    }

    /* --------------------------------------------------------------------------
       Skill Usage (skillEngine.js 연동: 스킬 목록 · 대상 선택 · 시전 연출)
       -------------------------------------------------------------------------- */
    function isTacticalBattleActive() {
      return !!(state.currentBattle && state.currentView === 'SECTOR_MAP');
    }

    function renderFullshotSkillList(unit) {
      const box = document.getElementById('fullshot-skill-card-container');
      if (!box || !unit || !window.SkillEngine) return;
      const esc = window.SkillEditor ? SkillEditor.esc : (v) => String(v);
      const iconOf = (sk, size) => window.SkillEditor ? SkillEditor.iconHtml(sk, size) : (sk.icon || '⚡');
      const skills = SkillEngine.getUnitSkills(unit);
      const isPlayer = unit.owner !== 'ENEMY' && !unit.isPreview;
      const inBattle = isTacticalBattleActive() && typeof unit.x === 'number';

      const statusChips = SkillEngine.getStatuses(unit).map(st => {
        const def = SkillEngine.EFFECTS[st.type] || {};
        const val = ['BUFF_ATK', 'BUFF_DEF', 'DEBUFF_ATK', 'DEBUFF_DEF', 'MARK'].includes(st.type) ? ` ${st.value}%` : (['SHIELD', 'DOT', 'REGEN'].includes(st.type) ? ` ${st.value}` : '');
        return `<span class="fs-status ${def.hostile ? 'bad' : ''}" title="${esc(st.source || '')}">${def.icon || '•'} ${esc((def.label || st.type).split(' ')[0])}${val} · ${st.turns}턴</span>`;
      }).join('');

      const rows = skills.map(sk => {
        let btn;
        if (sk.type === 'PASSIVE') btn = '<span class="fullshot-skill-type-pill passive">상시</span>';
        else if (!isPlayer) btn = `<span class="fullshot-skill-cost-pill">AP ${sk.costAP}</span>`;
        else if (!inBattle) btn = '<button class="fs-skill-btn" disabled>전투 중</button>';
        else {
          const check = SkillEngine.canCast(unit, sk);
          btn = check.ok
            ? `<button class="fs-skill-btn" data-skill-use="${esc(sk.id)}">사용 · AP ${sk.costAP}</button>`
            : `<button class="fs-skill-btn" disabled>${esc(check.reason)}</button>`;
        }
        return `
          <div class="fs-skill ${sk.type === 'PASSIVE' ? 'passive' : ''}" title="${esc(sk.description)}">
            <div class="fs-skill-icon">${iconOf(sk, 20)}</div>
            <div class="fs-skill-main">
              <div class="fs-skill-name">${sk.isSignature ? '🌟 ' : ''}${esc(sk.name)}${sk.type === 'ACTIVE' ? ` <span style="font-weight:700;color:#94a3b8;font-size:8.5px;">대기 ${sk.coolDown}</span>` : ''}</div>
              <div class="fs-skill-desc">${esc(sk.description)}</div>
            </div>
            ${btn}
          </div>`;
      }).join('');

      box.className = 'fullshot-skill-card-container has-skill';
      box.innerHTML = `
        <div class="fs-skill-head">
          <span>⚡ 스킬 ${skills.length}개${isPlayer ? ` · <span style="color:#d97706;">해금권 ${Number(unit.skillPoints) || 0}</span>` : ''}</span>
          ${isPlayer ? '<button class="btn-cheat purple" style="font-size: 8.5px; padding: 2px 6px;" data-skill-tree-open="1">🌳 스킬트리</button>' : ''}
        </div>
        ${statusChips ? `<div class="fs-status-row">${statusChips}</div>` : ''}
        <div class="fs-skill-list">${rows || '<div style="font-size:10px;color:#94a3b8;padding:4px 0;">습득한 스킬이 없습니다. 스킬트리에서 SP로 습득하세요.</div>'}</div>`;

      box.querySelectorAll('[data-skill-use]').forEach(b => { b.onclick = () => useUnitSkill(unit.id, b.dataset.skillUse); });
      const treeBtn = box.querySelector('[data-skill-tree-open]');
      if (treeBtn) treeBtn.onclick = () => onFullshotSkillClicked();
    }

    function findPlayerSkill(unitId, skillId) {
      const unit = state.playerUnits.find(u => u.id === unitId && !u.isDead) || null;
      const skill = unit && window.SkillEngine ? SkillEngine.getUnitSkills(unit).find(sk => sk.id === skillId) : null;
      return { unit, skill };
    }

    function useUnitSkill(unitId, skillId) {
      if (isEnemyTurnProcessing) return;
      const { unit, skill } = findPlayerSkill(unitId, skillId);
      if (!unit || !skill) return;
      if (!isTacticalBattleActive()) {
        addLog('⚠️ 스킬은 전술 전투 중에만 사용할 수 있습니다.', 'warning');
        return;
      }
      const check = SkillEngine.canCast(unit, skill);
      if (!check.ok) {
        addLog(`⚠️ [${skill.name}] 사용 불가: ${check.reason}`, 'warning');
        return;
      }
      const hostile = isHostileSkill(skill);
      if (hostile && unit.affection <= 30 && !state.commander.unlockedSkills.Berserk) {
        addLog(`❌ [스킬 거부!] ${unit.name}의 호감도가 ${unit.affection}으로 극히 낮아 위험한 스킬 명령을 거부합니다!`, 'danger');
        const line = pickUnitLine(unit, 'refuse_skill');
        const speech = { unit, imageUrl: getUnitIllustration(unit) };
        if (typeof window.UI?.triggerFearFX === 'function') window.UI.triggerFearFX(unit.id, line, undefined, speech);
        return;
      }
      if (skill.targeting.mode === 'SELF') {
        performSkillCast(unit, skill, unit.x, unit.y);
        return;
      }
      skillTargeting = { unitId, skillId };
      selectedUnitId = unitId;
      closeFullShotOverlay();
      renderSkillTargetingBanner(skill);
      renderAll();
      addLog(`🎯 [${skill.name}] 보라색 칸에서 대상을 선택하세요. (${SkillEngine.describeTargeting(skill)})`, 'system');
    }

    function castTargetedSkillAt(x, y) {
      const { unit, skill } = skillTargeting ? findPlayerSkill(skillTargeting.unitId, skillTargeting.skillId) : {};
      if (!unit || !skill) { cancelSkillTargeting(); return; }
      if (!SkillEngine.isValidTarget(unit, skill, x, y)) {
        addLog('⚠️ 지정할 수 없는 칸입니다. 보라색 칸을 선택하거나 상단의 취소를 누르세요.', 'warning');
        return;
      }
      performSkillCast(unit, skill, x, y);
    }

    // 적에게 해로운 효과가 하나라도 있는 스킬인가 (호감도가 낮으면 거부 대상이 되는 스킬)
    function isHostileSkill(skill) {
      return !!skill?.effects?.some(e => (SkillEngine.EFFECTS[e.type] || {}).hostile);
    }

    // 스킬 시전 대사: 호감도 구간마다 다른 상황 키·말풍선 색·출력 확률을 쓴다.
    // (명령 거부는 useUnitSkill 에서 이미 처리됐고, 여기는 실제로 시전된 뒤의 대사다.)
    const SKILL_CAST_LINE_TIERS = [
      { minAffection: 70,        situation: 'skill_cast_trust',     mood: 'brave',     chance: 0.60 },
      { minAffection: 50,        situation: 'skill_cast_normal',    mood: 'normal',    chance: 0.25 },
      { minAffection: -Infinity, situation: 'skill_cast_reluctant', mood: 'reluctant', chance: 0.70 }
    ];
    const SKILL_FORCED_LINE = { situation: 'skill_forced', mood: 'forced', chance: 1 };

    function speakSkillCastLine(unit, skill, res) {
      if (!unit || unit.isDead || unit.owner === 'ENEMY') return '';
      const affection = unit.affection ?? 50;
      // 광폭화로 거부를 뚫고 억지로 쓰는 공격 스킬은 항상 말한다
      const forced = isHostileSkill(skill) && affection <= 30 && !!state.commander?.unlockedSkills?.Berserk;
      const tier = forced ? SKILL_FORCED_LINE : SKILL_CAST_LINE_TIERS.find(t => affection >= t.minAffection);
      if (!tier || Math.random() >= tier.chance) return '';

      const targetName = (res?.results || []).find(r => r.unit && r.unit.owner === 'ENEMY')?.unit.name;
      // 풀샷 창이 이 유닛을 이미 크게 보여주고 있으면 일러스트는 겹치지 않게 말풍선만 띄운다
      const overlayShowsUnit = !!document.getElementById('unit-fullshot-overlay')?.classList.contains('active')
        && currentOverlayTargetUnit?.id === unit.id;
      return speakUnitLine(unit, tier.situation, tier.mood,
        { skill: skill.name, target: targetName || '적군' }, { hideIllust: overlayShowsUnit });
    }

    function performSkillCast(unit, skill, x, y) {
      if (!SkillEngine.isValidTarget(unit, skill, x, y)) return false;
      saveHistorySnapshot();
      const res = SkillEngine.cast(unit, skill, x, y);
      if (!res.ok) {
        addLog(`⚠️ [${skill.name}] ${res.reason}`, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(`${skill.name}: ${res.reason}`, 'warning');
        return false;
      }
      cancelSkillTargeting(true);
      if (typeof checkPartyWipeout === 'function') checkPartyWipeout();
      if (typeof window.checkTacticalVictory === 'function') window.checkTacticalVictory();
      renderAll();
      showSkillFloatTexts(res.results);
      updateFullShotOverlay();
      speakSkillCastLine(unit, skill, res);
      updateDebugInspector();
      saveGameState();
      return true;
    }

    function cancelSkillTargeting(silent) {
      const had = !!skillTargeting;
      skillTargeting = null;
      const banner = document.getElementById('skill-targeting-banner');
      if (banner) banner.remove();
      if (!silent && had) {
        addLog('↩️ 스킬 사용을 취소했습니다.', 'system');
        renderAll();
      }
    }

    function renderSkillTargetingBanner(skill) {
      let banner = document.getElementById('skill-targeting-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'skill-targeting-banner';
        banner.className = 'skill-targeting-banner';
        document.body.appendChild(banner);
      }
      const esc = window.SkillEditor ? SkillEditor.esc : (v) => String(v);
      banner.innerHTML = `
        <div>🎯 ${esc(skill.name)} — 대상 칸을 선택하세요<small>${esc(SkillEngine.describeTargeting(skill))}</small></div>
        <button type="button">취소</button>`;
      banner.querySelector('button').onclick = () => cancelSkillTargeting();
    }

    function previewSkillArea(caster, skill, x, y) {
      document.querySelectorAll('#grid-map .tile.skill-aoe').forEach(el => el.classList.remove('skill-aoe'));
      if (!caster || !skill || !window.SkillEngine) return;
      SkillEngine.getAffectedTiles(caster, skill, x, y).forEach(p => {
        const el = document.querySelector(`#grid-map .tile[data-x="${p.x}"][data-y="${p.y}"]`);
        if (el) el.classList.add('skill-aoe');
      });
    }

    function appendStatusIcons(avatarEl, units) {
      if (!window.SkillEngine) return;
      const icons = [];
      units.forEach(u => SkillEngine.getStatuses(u).forEach(st => {
        const icon = (SkillEngine.EFFECTS[st.type] || {}).icon;
        if (icon && !icons.includes(icon)) icons.push(icon);
      }));
      if (!icons.length) return;
      const el = document.createElement('div');
      el.className = 'unit-status-icons';
      el.textContent = icons.slice(0, 3).join('') + (icons.length > 3 ? '+' : '');
      avatarEl.appendChild(el);
    }

    function showSkillFloatTexts(results) {
      if (!Array.isArray(results)) return;
      const perTile = {};
      results.forEach(r => {
        const key = `${r.unit.x},${r.unit.y}`;
        const idx = perTile[key] = (perTile[key] || 0) + 1;
        const tileEl = document.querySelector(`#grid-map .tile[data-x="${r.unit.x}"][data-y="${r.unit.y}"]`);
        if (!tileEl) return;
        const span = document.createElement('span');
        span.className = 'skill-float-text';
        span.textContent = r.text;
        span.style.color = r.color || '#fff';
        span.style.top = `${10 + (idx - 1) * 22}%`;
        span.style.animationDelay = `${(idx - 1) * 0.12}s`;
        tileEl.appendChild(span);
        setTimeout(() => span.remove(), 1500);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && skillTargeting) cancelSkillTargeting();
    });

    // 하위호환: 예전 고유 스킬 버튼 (첫 번째 액티브 스킬을 사용한다)
    function executeCustomSkill(unit) {
      if (!unit || !window.SkillEngine) return;
      const skills = SkillEngine.getUnitSkills(unit);
      const sk = skills.find(x => x.isSignature && x.type === 'ACTIVE') || skills.find(x => x.type === 'ACTIVE');
      if (sk) useUnitSkill(unit.id, sk.id);
    }

    // 용병 명부에서 연 캐릭터 창이면, 닫을 때 명부로 돌아간다
    let fullshotReturnToPool = false;

    function openFullShotOverlay(targetUnit, opts = {}) {
      fullshotReturnToPool = !!opts.returnToPool;
      if (targetUnit && targetUnit.id) {
        // 대기·미편입 캐릭터는 전장 선택 대상이 아니다 (선택을 바꾸지 않는다)
        if (state.playerUnits.includes(targetUnit)) selectedUnitId = targetUnit.id;
        currentOverlayTargetUnit = targetUnit;
      } else {
        currentOverlayTargetUnit = getSelectedUnit();
      }
      const unit = currentOverlayTargetUnit;
      if (!unit || unit.isDead) return;
      const overlay = document.getElementById('unit-fullshot-overlay');
      if (overlay) {
        overlay.classList.add('active');
        updateFullShotOverlay(unit);
        // 다른 캐릭터를 열 때 이전 캐릭터의 스크롤 위치가 남지 않게 맨 위로
        overlay.querySelector('.fullshot-right-col')?.scrollTo(0, 0);
      }
    }

    function closeFullShotOverlay() {
      const overlay = document.getElementById('unit-fullshot-overlay');
      if (overlay) {
        overlay.classList.remove('active');
      }
      currentOverlayTargetUnit = null;
      if (fullshotReturnToPool) {
        fullshotReturnToPool = false;
        openCharacterPool();
      }
    }

    window.openFullShotOverlay = openFullShotOverlay;
    window.closeFullShotOverlay = closeFullShotOverlay;
    window.updateFullShotOverlay = updateFullShotOverlay;

    function onFullshotMoveClicked() {
      const unit = currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) return;
      if (state.currentView === 'STRATEGY' && state.currentBattle) {
        switchGameView('SECTOR_MAP');
      }
      if (unit.isInactivated) {
        addLog(`🚫 [이동 불가] ${unit.name}은(는) 유지비 미납으로 행동이 정지된 상태입니다.`, 'danger');
        return;
      }
      if (unit.ap <= 0) {
        addLog(`⚡ [AP 부족] ${unit.name}의 잔여 행동력(AP)이 부족합니다.`, 'warning');
        return;
      }
      addLog(`👟 [이동 대기] 지도 상의 초록색 타일을 터치하여 이동할 위치를 지정하세요.`, 'system');
      const mapEl = document.getElementById('grid-map');
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function onFullshotAttackClicked() {
      const unit = currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) return;
      if (state.currentView === 'STRATEGY' && state.currentBattle) {
        switchGameView('SECTOR_MAP');
      }
      if (unit.isInactivated) {
        addLog(`🚫 [공격 불가] ${unit.name}은(는) 유지비 미납으로 행동이 정지된 상태입니다.`, 'danger');
        return;
      }
      if (unit.ap <= 0) {
        addLog(`⚡ [AP 부족] ${unit.name}의 잔여 행동력(AP)이 부족합니다.`, 'warning');
        return;
      }
      const inRangeEnemies = getEnemiesInRange(unit);
      if (inRangeEnemies.length > 0) {
        const targetDefender = inRangeEnemies.find(e => e.id === cardInspectedEnemyId) ||
                               inRangeEnemies.find(e => e.id === debugInspectedEnemyId) ||
                               inRangeEnemies[0];
        addLog(`⚔️ [교전 명령] ${unit.name} -> ${targetDefender.name} 요격을 개시합니다!`, 'combat');
        executeCombat(unit, targetDefender);
      } else {
        addLog(`⚠️ [사거리 밖] 현재 사거리 내에 교전 가능한 적이 없습니다. 먼저 적 근처로 이동하세요.`, 'warning');
      }
    }

    function onFullshotSkillClicked() {
      const unit = currentOverlayTargetUnit || getSelectedUnit();
      if (!unit || unit.isDead) return;
      if (typeof window.renderPromotionMenu === 'function') {
        window.renderPromotionMenu(unit, { tab: 'skills' });
      } else if (typeof window.UI?.renderPromotionMenu === 'function') {
        window.UI.renderPromotionMenu(unit);
      } else if (unit.customSkill) {
        if (unit.customSkill.type === 'PASSIVE') {
          addLog(`🛡️ [패시브 고유 스킬] ${unit.name}의 [${unit.customSkill.name}]은(는) 상시 발동 패시브입니다! 교전 시 스탯/공식에 자동 반영됩니다.`, 'gold');
          return;
        }
        executeCustomSkill(unit);
      } else {
        openClassSkillModal(unit);
      }
    }

    function onFullshotDeselectClicked() {
      selectedUnitId = null;
      closeFullShotOverlay();
      currentInteractionMode = null;
      renderAll();
      addLog('ℹ️ [선택 해제] 유닛 선택을 해제하고 전장 맵을 확인합니다.', 'system');
    }

    /* --------------------------------------------------------------------------
       Admin Authentication & Debug Panel Controller Functions
       -------------------------------------------------------------------------- */
    let debugInspectedEnemyId = null;

    function openAdminAuthModal() {
      closeAllModals();
      const modal = document.getElementById('modal-admin-auth');
      const input = document.getElementById('input-admin-pwd');
      const errEl = document.getElementById('admin-pwd-error');
      if (modal) {
        modal.classList.add('open');
        if (input) {
          input.value = '';
          input.type = 'password';
          setTimeout(() => input.focus(), 150);
        }
        if (errEl) errEl.style.display = 'none';
      }
    }

    function closeAdminAuthModal() {
      const modal = document.getElementById('modal-admin-auth');
      if (modal) modal.classList.remove('open');
      const input = document.getElementById('input-admin-pwd');
      if (input) input.value = '';
      const errEl = document.getElementById('admin-pwd-error');
      if (errEl) errEl.style.display = 'none';
    }

    function submitAdminAuth() {
      const input = document.getElementById('input-admin-pwd');
      const errEl = document.getElementById('admin-pwd-error');
      const pwd = input ? input.value.trim() : '';

      if (pwd === '20250113') {
        closeAdminAuthModal();
        openDebugModal();
        addLog('🛡️ [관리자 인증 완료] 개발자 DEV 패널 접근 승인 완료', 'success');
      } else {
        if (errEl) {
          errEl.style.display = 'flex';
          errEl.textContent = '⚠️ 비밀번호가 일치하지 않습니다.';
        }
        if (input) {
          input.classList.add('shake-error');
          setTimeout(() => input.classList.remove('shake-error'), 450);
          input.select();
        }
        addLog('⚠️ [관리자 인증 실패] 비밀번호가 일치하지 않습니다.', 'danger');
      }
    }

    function setupTurnLongPress(element, isEndTurnBtn = false) {
      if (!element) return;
      let timer = null;
      let isLongPressed = false;

      const startHold = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isLongPressed = false;
        element.classList.add('holding');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          isLongPressed = true;
          element.classList.remove('holding');
          if (navigator.vibrate) {
            try { navigator.vibrate([40, 60, 40]); } catch (_) {}
          }
          openAdminAuthModal();
        }, 3000);
      };

      const cancelHold = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        element.classList.remove('holding');
      };

      element.addEventListener('pointerdown', startHold);
      element.addEventListener('pointerup', (e) => {
        if (isLongPressed) {
          e.preventDefault();
          e.stopPropagation();
        }
        cancelHold();
      });
      element.addEventListener('pointerleave', cancelHold);
      element.addEventListener('pointercancel', cancelHold);

      if (isEndTurnBtn) {
        const origOnClick = element.onclick;
        element.onclick = (e) => {
          if (isLongPressed) {
            e.preventDefault();
            e.stopPropagation();
            isLongPressed = false;
            return;
          }
          if (origOnClick) origOnClick.call(element, e);
        };
      } else {
        element.addEventListener('click', () => {
          if (!isLongPressed) {
            addLog('💡 [안내] Turn 버튼을 3초간 길게 누르면 관리자 DEV 패널에 진입할 수 있습니다.', 'system');
          }
        });
      }
    }

    // DEV 패널은 관리자 계정만 연다. 관리자는 서버가 정한다 (supabase-economy.sql: slg_admins · slg_admin_emails).
    // 서버 경제에 연결되지 않은 상태에서는 계정을 확인할 수 없으므로 로컬 개발(localhost)에서만 연다.
    function isAdminAccount() {
      if (window.ServerEconomy && window.ServerEconomy.enabled) return !!window.ServerEconomy.isAdmin;
      return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    }
    window.isAdminAccount = isAdminAccount;

    function openDebugModal(preferredTab = 'create-char') {
      if (!isAdminAccount()) {
        const msg = window.ServerEconomy && window.ServerEconomy.status === 'starting'
          ? '⏳ 서버에 연결하는 중입니다. 잠시 후 다시 시도하세요.'
          : '🔒 관리자 계정으로 로그인해야 DEV 패널을 열 수 있습니다.';
        addLog(msg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return;
      }
      const modal = document.getElementById('modal-debug');
      if (modal) {
        modal.classList.add('open');
        syncDebugInputsFromState();
        updateDebugInspector();
        switchDebugTab(preferredTab);
      }
    }

    function switchDebugTab(tabName) {
      ['create-char', 'images', 'units', 'balance', 'econ', 'cheats', ...Object.keys(DEV_DATA_EDITORS)].forEach(t => {
        const btn = document.getElementById(`tab-btn-dbg-${t}`);
        const page = document.getElementById(`tab-content-dbg-${t}`);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (page) page.style.display = (t === tabName) ? 'block' : 'none';
      });
      if (tabName === 'create-char') {
        initCustomCharCreationForm();
      } else if (tabName === 'images') {
        renderDebugImageManager();
      } else if (DEV_DATA_EDITORS[tabName]) {
        mountDevDataEditor(tabName);
      }
      updateDebugInspector();
    }

    // DEV 데이터 에디터(보상 풀/유물/아이템): 탭을 처음 열 때만 모듈을 import()한다 → 일반 플레이 초기 로딩에 영향 없음.
    // 에디터 모듈은 게임 state를 모르고, 여기서도 state를 넘기지 않는다 (DOM 컨테이너만 넘김).
    const DEV_DATA_EDITORS = {
      'reward-pools': { module: './editors/rewardPoolEditor.js', rootId: 'dev-reward-pool-editor-root' },
      'relics': { module: './editors/relicEditor.js', rootId: 'dev-relic-editor-root' },
      'items': { module: './editors/itemEditor.js', rootId: 'dev-item-editor-root' }
    };

    async function mountDevDataEditor(tabName) {
      const spec = DEV_DATA_EDITORS[tabName];
      const root = spec && document.getElementById(spec.rootId);
      if (!root) return;
      try {
        const mod = await import(spec.module);
        await mod.mount(root);
      } catch (err) {
        console.error(`[DEV 에디터] ${tabName} 로드 실패`, err);
        root.textContent = `❌ 에디터를 불러오지 못했습니다: ${err && err.message ? err.message : err}`;
      }
    }

    function selectDebugClass(classType) {
      currentDebugClass = classType;
      ['KNIGHT', 'MAGE', 'ARCHER', 'MELEE', 'FIREARM'].forEach(c => {
        const btn = document.getElementById(`class-btn-${c}`);
        if (btn) btn.classList.toggle('active', c === classType);
      });
      syncDebugInputsFromState();
      updateDebugInspector();
    }

    function onDebugStatChange(statKey, val) {
      const numVal = parseInt(val, 10);
      if (isNaN(numVal)) return;

      // Update current class parameters in debugParams
      if (debugParams.unitClassStats[currentDebugClass]) {
        debugParams.unitClassStats[currentDebugClass][statKey] = numVal;
      }

      // Update slider and number box in UI
      const idKey = statKey === 'baseAP' ? 'ap' : (statKey === 'affection' ? 'aff' : statKey);
      const slider = document.getElementById(`slider-dbg-${idKey}`);
      const numInput = document.getElementById(`num-dbg-${idKey}`);
      const lbl = document.getElementById(`lbl-dbg-${idKey}`);
      if (slider) slider.value = numVal;
      if (numInput) numInput.value = numVal;
      if (lbl) lbl.textContent = numVal;

      // Immediately propagate to all active units in playerUnits matching this class
      state.playerUnits.forEach(u => {
        if (u.classType === currentDebugClass) {
          u[statKey] = numVal;
          if (statKey === 'hp') u.maxHp = Math.max(u.maxHp, numVal);
          if (statKey === 'baseAP') u.ap = Math.min(u.ap, numVal);
        }
      });

      renderAll();
      updateDebugInspector();
    }

    function onDebugBalanceChange(paramKey, val) {
      const floatVal = parseFloat(val);
      if (isNaN(floatVal)) return;

      if (paramKey === 'tileDefBonusMultiplier') {
        debugParams.tileDefBonusMultiplier = floatVal / 100.0;
        const lbl = document.getElementById('lbl-dbg-tiledef');
        if (lbl) lbl.textContent = `${floatVal}%`;
        const slider = document.getElementById('slider-dbg-tiledef');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-tiledef');
        if (num) num.value = floatVal;
      } else if (paramKey === 'collateralDamageMultiplier') {
        debugParams.collateralDamageMultiplier = floatVal / 100.0;
        const lbl = document.getElementById('lbl-dbg-splash');
        if (lbl) lbl.textContent = `${floatVal}%`;
        const slider = document.getElementById('slider-dbg-splash');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-splash');
        if (num) num.value = floatVal;
      } else if (paramKey === 'winChanceAttackerWeight') {
        debugParams.winChanceAttackerWeight = floatVal;
        const lbl = document.getElementById('lbl-dbg-watk');
        if (lbl) lbl.textContent = `${floatVal.toFixed(1)}x`;
        const slider = document.getElementById('slider-dbg-watk');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-watk');
        if (num) num.value = floatVal;
      } else if (paramKey === 'winChanceDefenderWeight') {
        debugParams.winChanceDefenderWeight = floatVal;
        const lbl = document.getElementById('lbl-dbg-wdef');
        if (lbl) lbl.textContent = `${floatVal.toFixed(1)}x`;
        const slider = document.getElementById('slider-dbg-wdef');
        if (slider) slider.value = floatVal;
        const num = document.getElementById('num-dbg-wdef');
        if (num) num.value = floatVal;
      }

      updateDebugInspector();
    }

    function onDebugResourceChange(resKey, val) {
      const intVal = parseInt(val, 10);
      if (isNaN(intVal)) return;

      if (resKey === 'gold') {
        Wallet.devAdjust(Math.max(0, intVal) - (Number(state.gold) || 0));
        const lbl = document.getElementById('lbl-dbg-gold');
        if (lbl) lbl.textContent = `${state.gold}G`;
        const slider = document.getElementById('slider-dbg-gold');
        if (slider) slider.value = state.gold;
        const num = document.getElementById('num-dbg-gold');
        if (num) num.value = state.gold;
      } else if (resKey === 'rewinders') {
        state.rewinders = Math.max(0, intVal);
        const lbl = document.getElementById('lbl-dbg-rewind');
        if (lbl) lbl.textContent = `${state.rewinders}개`;
        const slider = document.getElementById('slider-dbg-rewind');
        if (slider) slider.value = state.rewinders;
        const num = document.getElementById('num-dbg-rewind');
        if (num) num.value = state.rewinders;
      } else if (resKey === 'sp') {
        state.commander.skillPoints = Math.max(0, intVal);
        const lbl = document.getElementById('lbl-dbg-sp');
        if (lbl) lbl.textContent = `${state.commander.skillPoints} SP`;
        const slider = document.getElementById('slider-dbg-sp');
        if (slider) slider.value = state.commander.skillPoints;
        const num = document.getElementById('num-dbg-sp');
        if (num) num.value = state.commander.skillPoints;
      }

      renderAll();
    }

    function setForcedBattleResult(mode) {
      debugParams.forcedBattleResult = mode;
      ['NONE', 'WIN', 'LOSE'].forEach(m => {
        const btn = document.getElementById(`btn-force-${m}`);
        if (btn) {
          btn.classList.toggle('active',
            (m === 'NONE' && mode === 'NONE') ||
            (m === 'WIN' && mode === 'FORCE_WIN') ||
            (m === 'LOSE' && mode === 'FORCE_LOSE')
          );
        }
      });
      updateDebugInspector();
    }

    function updateDebugInspector() {
      const atkUnit = getSelectedUnit();
      let defUnit = state.enemyUnits.find(e => !e.isDead && e.id === debugInspectedEnemyId);
      if (!defUnit) {
        defUnit = state.enemyUnits.find(e => !e.isDead);
      }

      const atkNameEl = document.getElementById('dbg-inspect-atk-name');
      const atkValEl = document.getElementById('dbg-inspect-atk-val');
      const defNameEl = document.getElementById('dbg-inspect-def-name');
      const defValEl = document.getElementById('dbg-inspect-def-val');
      const winPctEl = document.getElementById('dbg-inspect-win-pct');
      const winBarEl = document.getElementById('dbg-inspect-win-bar');
      const notesEl = document.getElementById('dbg-inspect-notes');

      if (!atkNameEl) return;

      if (!atkUnit) {
        atkNameEl.textContent = '선택 유닛 없음';
        atkValEl.textContent = '0.0';
      } else {
        atkNameEl.textContent = `${atkUnit.name} (${atkUnit.classType})`;
        atkValEl.textContent = `${atkUnit.atk.toFixed(1)}`;
      }

      if (!defUnit) {
        defNameEl.textContent = '생존 적군 없음';
        defValEl.textContent = '0.0';
        winPctEl.textContent = '100.0%';
        winBarEl.style.width = '100%';
        if (notesEl) notesEl.textContent = '현재 전장에 생존한 적군이 없습니다.';
        return;
      }

      defNameEl.textContent = `${defUnit.name} (${defUnit.classType})`;

      const odds = atkUnit ? getCombatOdds(atkUnit, defUnit) : null;
      if (odds) {
        defValEl.textContent = `${odds.finalDef.toFixed(1)}${odds.tileDefBonus > 0 ? ` (+${(odds.tileDefBonus*100).toFixed(0)}%)` : ''}`;
        let pctStr = `${odds.winPercent}%`;
        if (debugParams.forcedBattleResult === 'FORCE_WIN') {
          pctStr = '100% (치트: 무조건 승리)';
        } else if (debugParams.forcedBattleResult === 'FORCE_LOSE') {
          pctStr = '0% (치트: 무조건 패배)';
        }
        winPctEl.textContent = pctStr;
        winBarEl.style.width = `${Math.min(100, Math.max(0, odds.P * 100))}%`;
        if (notesEl) {
          const wAtk = debugParams.winChanceAttackerWeight ?? 1.0;
          const wDef = debugParams.winChanceDefenderWeight ?? 1.0;
          notesEl.textContent = `공식: P = (${odds.finalAtk.toFixed(1)}*${wAtk.toFixed(1)}) / [ (${odds.finalAtk.toFixed(1)}*${wAtk.toFixed(1)}) + (${odds.finalDef.toFixed(1)}*${wDef.toFixed(1)}) ] = ${odds.winPercent}%${odds.isDangerAffection ? ' [호감도 거부위험]' : ''}`;
        }
      }
    }

    function syncDebugInputsFromState() {
      // 1. Current Class stats
      const curStats = debugParams.unitClassStats[currentDebugClass] || { atk: 40, def: 30, baseAP: 2, affection: 60, hp: 80 };
      const atkInput = document.getElementById('slider-dbg-atk');
      if (atkInput) {
        document.getElementById('slider-dbg-atk').value = curStats.atk;
        document.getElementById('num-dbg-atk').value = curStats.atk;
        document.getElementById('lbl-dbg-atk').textContent = curStats.atk;

        document.getElementById('slider-dbg-ap').value = curStats.baseAP;
        document.getElementById('num-dbg-ap').value = curStats.baseAP;
        document.getElementById('lbl-dbg-ap').textContent = curStats.baseAP;

        document.getElementById('slider-dbg-aff').value = curStats.affection;
        document.getElementById('num-dbg-aff').value = curStats.affection;
        document.getElementById('lbl-dbg-aff').textContent = curStats.affection;

        document.getElementById('slider-dbg-def').value = curStats.def;
        document.getElementById('num-dbg-def').value = curStats.def;
        document.getElementById('lbl-dbg-def').textContent = curStats.def;

        document.getElementById('slider-dbg-hp').value = curStats.hp;
        document.getElementById('num-dbg-hp').value = curStats.hp;
        document.getElementById('lbl-dbg-hp').textContent = curStats.hp;
      }

      // 2. Currencies
      const goldEl = document.getElementById('slider-dbg-gold');
      if (goldEl) {
        goldEl.value = state.gold;
        document.getElementById('num-dbg-gold').value = state.gold;
        document.getElementById('lbl-dbg-gold').textContent = `${state.gold}G`;

        document.getElementById('slider-dbg-rewind').value = state.rewinders;
        document.getElementById('num-dbg-rewind').value = state.rewinders;
        document.getElementById('lbl-dbg-rewind').textContent = `${state.rewinders}개`;

        document.getElementById('slider-dbg-sp').value = state.commander.skillPoints;
        document.getElementById('num-dbg-sp').value = state.commander.skillPoints;
        document.getElementById('lbl-dbg-sp').textContent = `${state.commander.skillPoints} SP`;
      }
    }

    /* --------------------------------------------------------------------------
       Cheat Actions Implementation
       -------------------------------------------------------------------------- */
    function cheatSpawnUnit() {
      const team = document.getElementById('sel-spawn-team').value;
      const classType = document.getElementById('sel-spawn-class').value;
      const { width: mapW, height: mapH } = getBattleSize();
      const x = Math.max(0, Math.min(mapW - 1, parseInt(document.getElementById('num-spawn-x').value, 10) || 0));
      const y = Math.max(0, Math.min(mapH - 1, parseInt(document.getElementById('num-spawn-y').value, 10) || 0));

      saveHistorySnapshot();

      const unitId = (team === 'PLAYER' ? 'p_' : 'e_') + Date.now();
      const preset = debugParams.unitClassStats[classType] || { atk: 40, def: 25, baseAP: 2, affection: 70, hp: 80 };
      
      const avatarMap = {
        KNIGHT: '🐴',
        MAGE: '🔮',
        ARCHER: '🏹',
        MELEE: '⚔️',
        FIREARM: '💥'
      };
      const namePrefix = team === 'PLAYER' ? '소환된 ' : '적군 ';

      const newUnit = {
        id: unitId,
        name: namePrefix + classType,
        classType: classType,
        avatar: avatarMap[classType] || '👤',
        level: 1,
        hp: preset.hp,
        maxHp: preset.hp,
        atk: preset.atk,
        def: preset.def,
        baseAP: preset.baseAP,
        ap: preset.baseAP,
        affection: team === 'PLAYER' ? preset.affection : 0,
        upkeep: team === 'PLAYER' ? 10 : 0,
        x: x,
        y: y,
        isInactivated: false,
        isDead: false,
        promotions: { combatRank: 0 }
      };

      if (team === 'PLAYER') {
        state.playerUnits.push(newUnit);
        selectedUnitId = unitId;
        const totalStacked = state.playerUnits.filter(u => !u.isDead && u.x === x && u.y === y).length;
        if (totalStacked > 1) {
          addLog(`✨ [디버그 치트] 아군 유닛 ${newUnit.name}을(를) (${x}, ${y})에 생성 (해당 타일 아군 총 ${totalStacked}기 중첩 배치)!`, 'gold');
        } else {
          addLog(`✨ [디버그 치트] 아군 유닛 ${newUnit.name}을(를) (${x}, ${y}) 좌표에 즉시 생성했습니다!`, 'gold');
        }
      } else {
        state.enemyUnits.push(newUnit);
        const totalStacked = state.enemyUnits.filter(u => !u.isDead && u.x === x && u.y === y).length;
        if (totalStacked > 1) {
          addLog(`⚡ [디버그 치트] 적군 유닛 ${newUnit.name}을(를) (${x}, ${y})에 생성 (해당 타일 적군 총 ${totalStacked}기 중첩 배치)!`, 'warning');
        } else {
          addLog(`⚡ [디버그 치트] 적군 유닛 ${newUnit.name}을(를) (${x}, ${y}) 좌표에 즉시 생성했습니다!`, 'warning');
        }
      }

      renderAll();
      updateDebugInspector();
    }

    function cheatAddGold(amount) {
      saveHistorySnapshot();
      Wallet.devAdjust(amount);
      addLog(`💰 [디버그 치트] 골드 +${amount}G 지급! (현재: ${state.gold}G)`, 'gold');
      renderAll();
      syncDebugInputsFromState();
    }

    function cheatAddRewinder(amount) {
      saveHistorySnapshot();
      state.rewinders = Math.min(10, state.rewinders + amount);
      addLog(`⏳ [디버그 치트] 리와인더 +${amount} 충전! (현재: ${state.rewinders}개)`, 'gold');
      renderAll();
      syncDebugInputsFromState();
    }

    function cheatSetAffection(val) {
      const unit = getSelectedUnit();
      if (!unit) {
        addLog('⚠️ 선택된 아군 유닛이 없습니다.', 'warning');
        return;
      }
      saveHistorySnapshot();
      unit.affection = val;
      addLog(`💖 [디버그 치트] ${unit.name}의 호감도를 ${val}으로 설정했습니다.`, 'gold');
      renderAll();
    }

    function cheatSetAllAffection(val) {
      saveHistorySnapshot();
      state.playerUnits.forEach(u => {
        if (!u.isDead) u.affection = val;
      });
      addLog(`🌟 [디버그 치트] 모든 생존 아군 유닛의 호감도를 ${val}으로 설정했습니다!`, 'gold');
      renderAll();
    }

    function cheatDeleteSelectedUnit() {
      const unit = getSelectedUnit();
      if (!unit) {
        addLog('⚠️ 선택된 아군 유닛이 없습니다.', 'warning');
        return;
      }
      saveHistorySnapshot();
      unit.isDead = true;
      addLog(`💀 [디버그 치트] 선택된 유닛 ${unit.name}을(를) 영구 제거(Permadeath) 처리했습니다.`, 'danger');
      
      const aliveUnit = state.playerUnits.find(u => !u.isDead);
      if (aliveUnit) selectedUnitId = aliveUnit.id;
      
      renderAll();
      updateDebugInspector();
    }

    function cheatUnlockAllSkills() {
      saveHistorySnapshot();
      Object.keys(COMMANDER_SKILLS_DATA).forEach(k => {
        state.commander.unlockedSkills[k] = true;
      });
      addLog(`⭐ [디버그 치트] 지휘관의 모든 패시브 스킬 8종을 즉시 해금했습니다!`, 'gold');
      renderAll();
      updateDebugInspector();
    }

    function cheatLevelUpCommander() {
      saveHistorySnapshot();
      state.commander.level += 1;
      const cheatSp = state.commander.level % 3 === 0 ? 1 : 0;
      state.commander.skillPoints += cheatSp;
      addLog(`👑 [디버그 치트] 지휘관 레벨업! Lv.${state.commander.level} (SP +${cheatSp} 지급 · 통솔력 ${getLeadership()}부대)`, 'gold');
      renderAll();
      syncDebugInputsFromState();
    }

    function cheatRecoverAllAP() {
      saveHistorySnapshot();
      state.playerUnits.forEach(u => {
        if (!u.isDead) {
          u.ap = u.baseAP;
          u.isInactivated = false;
        }
      });
      addLog(`⚡ [디버그 치트] 모든 아군 유닛의 행동력(AP)을 완전히 충전했습니다!`, 'gold');
      renderAll();
    }

    function cheatHealAllUnits() {
      saveHistorySnapshot();
      state.playerUnits.forEach(u => {
        if (!u.isDead) {
          u.hp = u.maxHp;
        }
      });
      addLog(`🩸 [디버그 치트] 모든 아군 유닛의 체력을 100% 회복했습니다!`, 'gold');
      renderAll();
    }

    function cheatResetAllDefaults() {
      saveHistorySnapshot();
      debugParams.unitClassStats = {
        KNIGHT: { atk: 48, def: 38, baseAP: 3, affection: 85, hp: 100 },
        MELEE: { atk: 35, def: 30, baseAP: 2, affection: 40, hp: 85 },
        ARCHER: { atk: 42, def: 20, baseAP: 2, affection: 28, hp: 70 },
        MAGE: { atk: 52, def: 22, baseAP: 2, affection: 60, hp: 65 },
        FIREARM: { atk: 58, def: 25, baseAP: 2, affection: 45, hp: 75 }
      };
      debugParams.tileDefBonusMultiplier = 1.0;
      debugParams.collateralDamageMultiplier = 0.30;
      debugParams.winChanceAttackerWeight = 1.0;
      debugParams.winChanceDefenderWeight = 1.0;
      debugParams.forcedBattleResult = 'NONE';

      onDebugBalanceChange('tileDefBonusMultiplier', 100);
      onDebugBalanceChange('collateralDamageMultiplier', 30);
      onDebugBalanceChange('winChanceAttackerWeight', 1.0);
      onDebugBalanceChange('winChanceDefenderWeight', 1.0);
      setForcedBattleResult('NONE');
      syncDebugInputsFromState();

      addLog(`🔄 [디버그 치트] 모든 밸런스 및 유닛 파라미터가 초기값으로 리셋되었습니다.`, 'gold');
      renderAll();
      updateDebugInspector();
    }

    /* --------------------------------------------------------------------------
       Initialization & Button Binding
       -------------------------------------------------------------------------- */
    function init() {
      // 0. 모든 활성 및 대기 유닛 체력 100-Point 정규화 자동 실행
      normalizeAllUnitsHP(state);

      // 턴 종료 버튼
      const btnEndTurn = document.getElementById('btn-end-turn');
      if (btnEndTurn) btnEndTurn.onclick = executeEndTurn;

      // 리와인더 버튼
      const btnRewind = document.getElementById('btn-rewind');
      if (btnRewind) btnRewind.onclick = executeRewind;

      // 스킬 모달 오픈
      const btnOpenSkills = document.getElementById('btn-open-skills');
      if (btnOpenSkills) btnOpenSkills.onclick = openSkillsModal;

      // 오프라인 수비 시뮬레이션 모달 오픈
      const btnOpenDefense = document.getElementById('btn-open-defense-modal');
      if (btnOpenDefense) {
        btnOpenDefense.onclick = () => {
          const modalDef = document.getElementById('modal-defense');
          if (modalDef) modalDef.classList.add('open');
        };
      }

      // Turn 버튼 3초 이상 누를 시 관리자 DEV 패널 인증 진입 (Turn 배지 및 턴 종료 버튼 모두 지원)
      const uiTurnEl = document.getElementById('ui-turn');
      if (uiTurnEl) setupTurnLongPress(uiTurnEl, false);
      if (btnEndTurn) setupTurnLongPress(btnEndTurn, true);

      // 관리자 비밀번호 엔터키 및 비밀번호 표시 토글
      const adminPwdInput = document.getElementById('input-admin-pwd');
      if (adminPwdInput) {
        adminPwdInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitAdminAuth();
          }
        });
      }
      const btnTogglePwd = document.getElementById('btn-toggle-admin-pwd');
      if (btnTogglePwd && adminPwdInput) {
        btnTogglePwd.onclick = () => {
          if (adminPwdInput.type === 'password') {
            adminPwdInput.type = 'text';
            btnTogglePwd.textContent = '🙈';
          } else {
            adminPwdInput.type = 'password';
            btnTogglePwd.textContent = '👁️';
          }
        };
      }

      // 헤더 DEV 패널 버튼
      const btnHeaderDev = document.getElementById('btn-header-dev');
      if (btnHeaderDev) {
        btnHeaderDev.onclick = () => {
          openDebugModal('create-char');
        };
      }

      // 플레이어 네임 클릭 시 병과특기(특수스킬) 진입
      const cardNameWrap = document.getElementById('card-name-wrap');
      if (cardNameWrap) {
        cardNameWrap.onclick = () => openClassSkillModal();
      }
      // 유닛 카드 아바타 클릭 시 풀샷 오버레이 오픈
      const cardAvatarWrap = document.getElementById('card-avatar-wrap');
      if (cardAvatarWrap) {
        cardAvatarWrap.onclick = () => openFullShotOverlay();
      }

      // 하단 카드 영역 클릭 시 풀샷 오버레이 오픈 (버튼 클릭 제외)
      const unitCard = document.getElementById('selected-unit-card');
      if (unitCard) {
        unitCard.addEventListener('click', (e) => {
          if (!e.target.closest('button') && selectedUnitId) {
            openFullShotOverlay();
          }
        });
      }

      // Supabase Supabase & Auth 자동 연동 리스너 설정 (Zero LocalStorage)
      window.onSupabaseUserReady = function(user) {
        if (!user || !user.uid) return;
        try {
          console.log("🔥 [Supabase Ready] Supabase 연동 활성화:", user.uid);
          if (state && state.guest) {
            state.guest.supabaseUid = user.uid;
          }
          const guestIdEl = document.getElementById('ui-guest-id');
          if (guestIdEl) {
            guestIdEl.textContent = `FB_${user.uid.substring(0, 5)}`;
            guestIdEl.title = `Supabase 게스트 UID: ${user.uid}`;
          }
          addLog(`🔥 [Supabase 연동 완료] 게스트(UID: ${user.uid.substring(0, 8)}...) 및 DB/Storage 실시간 동기화 활성화!`, 'gold');

          if (typeof window.loadGameStateFromCloud === 'function') {
            // 클라우드 세이브를 다 읽기 전에는 저장하지 않는다. (예전에는 불러오기와 동시에 초기 상태를 저장해서,
            // 아무 행동 없이 두 번 새로고침하면 진행이 초기 상태로 덮어써질 수 있었다.)
            cloudLoadPending = true;
            window.loadGameStateFromCloud().then(data => {
              cloudLoadPending = false;
              if (data) {
                loadGameState(data);
                addLog(`☁️ [클라우드 복원] 이전 게임 진행 상태가 Supabase에서 복원되었습니다. (Turn ${state.turn})`, 'system');
              }
              // 로그인 계정은 지휘관 이름을 직접 정한다. (한 번 정하면 nameSet 으로 기억)
              if (state.commander && !state.commander.nameSet) promptCommanderName(true);
              saveGameState(true);
              if (window.ServerEconomy) window.ServerEconomy.start(); // 로그인 계정이면 서버 경제에 연결 (골드 · 지분 · 대출 · 경매)
            }).catch(e => {
              cloudLoadPending = false;
              console.warn(e);
              if (window.ServerEconomy) window.ServerEconomy.start(); // 세이브를 못 읽어도 서버 경제는 연결한다
            });
          }
          if (typeof window.getCharactersFromCloud === 'function') {
            window.getCharactersFromCloud().then(chars => {
              if (Array.isArray(chars) && chars.length > 0) {
                syncGlobalCharactersFromSupabase(chars);
              }
            }).catch(e => console.warn(e));
          }
          if (typeof window.subscribeCharacterList === 'function') {
            try {
              window.subscribeCharacterList((chars) => {
                syncGlobalCharactersFromSupabase(chars);
              });
            } catch (e) {
              console.warn(e);
            }
          }

          // (제거됨) 예전에는 기본 8x10 맵을 Supabase 'maps/default_map'에 올렸다.
          // 전술 맵은 tacticalMap 템플릿(에디터 산출물)만이 원본이므로 더 이상 기본맵을 동기화하지 않는다.
          // 첫 저장은 위의 불러오기가 끝난 뒤에 한다.

          applyStoredCustomImages();
        } catch (err) {
          console.warn('onSupabaseUserReady error:', err);
        }
      };

      // 이미 Supabase가 준비되어 있는 경우 즉시 동기화
      if (window.SupabaseBridge && window.SupabaseBridge.isReady && window.SupabaseBridge.currentUser) {
        window.onSupabaseUserReady(window.SupabaseBridge.currentUser);
      }

      // 저장된 커스텀 캐릭터 이미지 복원 및 DEV 패널 초기화
      applyStoredCustomImages();
      renderDebugImageManager();
      initCustomCharCreationForm();

      // 상단 지휘관 네임 클릭 시에도 스킬 메뉴 진입 지원
      const cmdName = document.getElementById('ui-cmd-name');
      if (cmdName) {
        cmdName.style.cursor = 'pointer';
        cmdName.title = '지휘관 패시브 스킬 메뉴 열기';
        cmdName.onclick = openSkillsModal;
      }

      // 플로팅 배너 닫기
      const btnCloseBanner = document.getElementById('btn-close-banner');
      if (btnCloseBanner) {
        btnCloseBanner.onclick = () => {
          const banner = document.getElementById('floating-banner');
          if (banner) banner.style.display = 'none';
        };
      }

      // 전략 메인 화면 -> 작전 개시 (출격 시뮬레이션 모달 오픈)
      const btnOpenDeploy = document.getElementById('btn-open-deploy-modal');
      if (btnOpenDeploy) {
        btnOpenDeploy.onclick = openSectorDeployModal;
      }

      // 섹터 맵 필드 -> 전략 월드맵 복귀 버튼
      const btnReturnToStrat = document.getElementById('btn-return-to-strategy');
      if (btnReturnToStrat) {
        btnReturnToStrat.onclick = () => switchGameView('STRATEGY');
      }

      // 출격 시뮬레이션 모달 내 전술 전개 시작 버튼
      const btnLaunchSim = document.getElementById('btn-launch-deploy-sim');
      if (btnLaunchSim) {
        btnLaunchSim.onclick = launchSectorOperation;
      }

      // 월드 섹터 탐색 롱프레스는 civ4-editor.js (EditorAuth)에서 안전한 인앱 모달로 전담 관리됨
      // 초기 스냅샷 보관 및 렌더링
      saveHistorySnapshot();
      renderAll();
      syncDebugInputsFromState();
      updateDebugInspector();
    }

    // Window Exports
    window.checkCommandRefusal = checkCommandRefusal;
    window.executeAttack = executeAttack;
    window.applyPromotion = applyPromotion;
    window.getCombatRank = getCombatRank;
    window.getPromotionEffectSummary = getPromotionEffectSummary;
    window.getUnitMoveCost = getUnitMoveCost;
    window.applyMedicHealing = applyMedicHealing;
    Object.assign(window, {
      getRelicStatFor, applyRelicBattleStart, applyRelicRegen, applyRelicVictoryRewards, removeRelicBattleBonuses,
      scaleIncomeWithRelics, applyExchangeDamage, absorbShield, grantRelic, ensureRewardDataLoaded
    });
    window.awardPromotionXp = awardPromotionXp;
    window.calculateCombatModifiers = calculateCombatModifiers;
    window.addSkillToTree = addSkillToTree;
    window.updateSkillImage = updateSkillImage;
    window.getCharacterSkillTree = getCharacterSkillTree;
    window.syncGlobalCharactersFromSupabase = syncGlobalCharactersFromSupabase;

    // Window Load
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    /* --------------------------------------------------------------------------
       Promotion Level-Up & Commander Synergy System (Civ4-inspired)
       -------------------------------------------------------------------------- */
    const PROMOTION_XP_TABLE = {
      1: 1,
      2: 2,
      3: 5,
      4: 10,
      5: 17
    };
    window.PROMOTION_XP_TABLE = PROMOTION_XP_TABLE;

    // 병과 경험치 획득량 (전술 전투에서만 획득)
    const PROMOTION_XP_GAIN = {
      victory: 2,       // 승리 기본
      underdog: 1,      // 승률 50% 미만에서 승리 시 추가
      longshot: 1,      // 승률 25% 미만에서 승리 시 추가 (underdog과 중첩)
      retreat: 1        // 패배했지만 퇴각 확률로 살아남음
    };
    window.PROMOTION_XP_GAIN = PROMOTION_XP_GAIN;

    function getPromotionXpCost(level) {
      return PROMOTION_XP_TABLE[level] || (level * 3);
    }
    window.getPromotionXpCost = getPromotionXpCost;

    function getVictoryXp(winChance) {
      let xp = PROMOTION_XP_GAIN.victory;
      if (winChance < 0.50) xp += PROMOTION_XP_GAIN.underdog;
      if (winChance < 0.25) xp += PROMOTION_XP_GAIN.longshot;
      return xp;
    }

    // 소수점 아래를 확률로 올린다 (1.3 → 30% 확률로 2). 작은 정수에 배율을 걸어도 평균이 정확히 맞는다.
    function roundStochastic(value) {
      const base = Math.floor(value);
      return base + (Math.random() < value - base ? 1 : 0);
    }

    const LEADERSHIP_XP_BONUS = 0.3; // 지휘관 패시브 "지휘관의 통솔": 아군 병과 경험치 +30%

    function awardPromotionXp(unit, amount, reason) {
      if (!unit || unit.isDead || !(amount > 0)) return;
      const isPlayer = unit.owner === 'PLAYER' || !unit.owner;
      let gained = amount;
      if (isPlayer && state.commander?.unlockedSkills?.CommanderLeadership) {
        gained = roundStochastic(amount * (1 + LEADERSHIP_XP_BONUS));
      }
      // 유물 경험치 획득(%): 지휘관 유물 + 이 캐릭터가 받은 선물 유물
      if (isPlayer) {
        const relicMult = getRelicExpMultiplier(unit);
        if (relicMult !== 1) gained = roundStochastic(gained * relicMult);
      }
      unit.xp = (unit.xp || 0) + gained;
      if (isPlayer) {
        const bonusText = gained !== amount ? ` (보너스 ${gained > amount ? '+' : ''}${gained - amount})` : '';
        addLog(`🎖️ [병과 경험치] ${unit.name} ${reason}: +${gained} XP${bonusText} (보유 ${unit.xp} XP)`, 'gold');
        // 경험치를 받을 때마다 승급할 수 있는 상태면 안내 (같은 유닛 창이 열려 있으면 내용만 갱신)
        const affordable = getAffordablePromotions(unit);
        if (affordable.length) {
          window.UI?.showGrowthNotice?.({
            key: `promo-${unit.id}`, icon: '🎖️', title: `${unit.name} 승급 가능!`,
            lines: [
              `병과 경험치 ${unit.xp} XP — 승급할 수 있습니다.`,
              `가능: ${affordable.slice(0, 3).map(p => p.name).join(', ')}${affordable.length > 3 ? ` 외 ${affordable.length - 3}개` : ''}`,
              '승급 창에서 승급을 고르고, 스킬트리 탭에서 스킬도 확인하세요.'
            ],
            actionLabel: '🎖️ 승급하러 가기', replace: true,
            onAction: () => window.UI?.renderPromotionMenu?.(unit)
          });
        }
      }
    }

    // 지금 XP로 바로 습득할 수 있는 승급 목록 (병과 제한 · 선행 조건 · 보유 여부 반영)
    function getAffordablePromotions(unit) {
      const data = window.PROMOTION_DATA || {};
      const owned = getUnitPromotionIds(unit);
      const unitClass = unit.classType || unit.class || 'MELEE';
      const xp = unit.xp || 0;
      return Object.values(data).filter(p =>
        !owned.includes(p.id)
        && (typeof window.isPromotionAllowed !== 'function' || window.isPromotionAllowed(unitClass, p.category))
        && (!Array.isArray(p.prereqs) || p.prereqs.every(id => owned.includes(id)))
        && xp >= getPromotionXpCost(p.level)
      );
    }

    function applyPromotion(unit, promotionId) {
      if (!unit || unit.isDead) {
        console.warn('[applyPromotion] Invalid or dead unit.');
        return false;
      }

      const promoData = window.PROMOTION_DATA ? window.PROMOTION_DATA[promotionId] : null;
      if (!promoData) {
        addLog(`❌ [승급 실패] 존재하지 않는 승급 ID입니다: ${promotionId}`, 'warning');
        return false;
      }

      if (!unit.promotions) {
        unit.promotions = [];
      } else if (!Array.isArray(unit.promotions)) {
        const legacyArr = [];
        if (unit.promotions.combatRank) {
          // 4단계를 넘는 아카데미 진급 단계도 잃지 않도록 unit.combatRank에 보존한다.
          unit.combatRank = Math.max(unit.combatRank || 0, Number(unit.promotions.combatRank) || 0);
          for (let i = 1; i <= Math.min(unit.promotions.combatRank, 4); i++) {
            legacyArr.push(`combat_${i}`);
          }
        }
        unit.promotions = legacyArr;
      }

      if (unit.promotions.includes(promotionId)) {
        addLog(`⚠️ [승급 불가] ${unit.name}은(는) 이미 [${promoData.name}]을(를) 습득했습니다.`, 'warning');
        return false;
      }

      const unitClass = unit.classType || unit.class || 'MELEE';
      if (typeof window.isPromotionAllowed === 'function') {
        const allowed = window.isPromotionAllowed(unitClass, promoData.category);
        if (!allowed) {
          addLog(`🚫 [병과 제한] ${unit.name}(${unitClass}) 병과는 [${promoData.category}] 계열 승급을 습득할 수 없습니다!`, 'danger');
          return false;
        }
      }

      if (Array.isArray(promoData.prereqs) && promoData.prereqs.length > 0) {
        const hasAllPrereqs = promoData.prereqs.every((reqId) => unit.promotions.includes(reqId));
        if (!hasAllPrereqs) {
          const missingNames = promoData.prereqs
            .filter((reqId) => !unit.promotions.includes(reqId))
            .map((reqId) => window.PROMOTION_DATA[reqId]?.name || reqId)
            .join(', ');
          addLog(`🔒 [선행 조건 미달] [${missingNames}] 습득 후 승급할 수 있습니다.`, 'warning');
          return false;
        }
      }

      const requiredXP = getPromotionXpCost(promoData.level);
      const currentXP = unit.xp || 0;
      if (currentXP < requiredXP) {
        addLog(`⚡ [XP 부족] [${promoData.name}] 승급에는 ${requiredXP} XP가 필요합니다. (현재 XP: ${currentXP})`, 'warning');
        return false;
      }

      unit.xp = currentXP - requiredXP;
      unit.promotions.push(promotionId);

      if (promoData.category === 'Combat') {
        unit.combatRank = Math.max(unit.combatRank || 0, promoData.level);
      }

      // Instant Heal Effect: 50% Max HP recovery
      const maxHp = unit.maxHp || 100;
      const healAmount = Math.round(maxHp * 0.50);
      const oldHp = unit.hp;
      unit.hp = Math.min(maxHp, unit.hp + healAmount);
      const actualHealed = unit.hp - oldHp;

      addLog(
        `⭐ [승급 완료] ${unit.name} -> [${promoData.name}] 습득! (${promoData.effects.description}) ` +
        `💚 즉시 응급 치료: HP +${actualHealed} 회복! (${unit.hp}/${maxHp}) [소모 XP: ${requiredXP}]`,
        'gold'
      );

      renderAll();

      return true;
    }

    function getUnitPromotionIds(unit) {
      if (!unit || !unit.promotions) return [];
      if (Array.isArray(unit.promotions)) return unit.promotions;
      const res = [];
      if (unit.promotions.combatRank) {
        for (let i = 1; i <= Math.min(unit.promotions.combatRank, 4); i++) {
          res.push(`combat_${i}`);
        }
      }
      return res;
    }

    // 병과 승급 단계(전투 I~IV). 옛 형식({combatRank}) · 새 형식(승급 ID 배열 + unit.combatRank) 모두 읽는다.
    function getCombatRank(unit) {
      if (!unit) return 0;
      const promos = unit.promotions;
      if (promos && !Array.isArray(promos)) return Math.max(0, Number(promos.combatRank) || 0);
      let rank = Math.max(0, Number(unit.combatRank) || 0);
      if (Array.isArray(promos)) {
        promos.forEach((id) => {
          const m = /^combat_(\d+)$/.exec(String(id));
          if (m) rank = Math.max(rank, Number(m[1]));
        });
      }
      return rank;
    }

    // 승급 효과 합계. 같은 계열 승급(전투 I→II…)은 값이 누적 표기라 합산하지 않고 가장 높은 값만 쓴다.
    const PROMOTION_EFFECT_KEYS = [
      'cityAtkBonus', 'cityDefBonus', 'hillDefBonus', 'forestDefBonus',
      'firstStrikes', 'counterBonus', 'retreatChance',
      'movementHillBonus', 'movementForestBonus',
      'healSelfPercent', 'healAdjacentPercent', 'healRange'
    ];
    function getPromotionEffectSummary(unit) {
      const summary = { atkPercent: getCombatRank(unit) * 0.10 };
      PROMOTION_EFFECT_KEYS.forEach((k) => { summary[k] = 0; });
      const promoDataMap = window.PROMOTION_DATA || {};
      getUnitPromotionIds(unit).forEach((id) => {
        const effects = promoDataMap[id] && promoDataMap[id].effects;
        if (!effects) return;
        if (Number(effects.atkPercent) > summary.atkPercent) summary.atkPercent = Number(effects.atkPercent);
        PROMOTION_EFFECT_KEYS.forEach((k) => {
          if (Number(effects[k]) > summary[k]) summary[k] = Number(effects[k]);
        });
      });
      return summary;
    }

    // 승급 효과가 참조하는 타일 분류 (도시/거점 · 언덕/산악 · 숲)
    function getPromotionTileFlags(tile) {
      const tileType = String((tile && (tile.terrain || tile.type)) || 'plain').toLowerCase();
      const tileStructure = String((tile && tile.structure) || '').toLowerCase();
      return {
        tileType,
        isCityTile: ['city', 'village'].includes(tileStructure) || ['city', 'base', 'headquarters', 'castle'].includes(tileType),
        isHillTile: ['hill', 'mountain'].includes(tileType),
        isForestTile: ['forest', 'jungle'].includes(tileType) || tileStructure === 'tree'
      };
    }

    // 유닛이 이 타일에 들어갈 때 드는 AP. 게릴라 II(언덕/산악) · 삼림 전문 II(숲)는 1 줄여 준다 (최소 1).
    function getUnitMoveCost(unit, tile) {
      const base = MapSchema.getTileMoveCost(tile);
      if (base <= 1 || !unit) return base;
      const promo = getPromotionEffectSummary(unit);
      const flags = getPromotionTileFlags(tile);
      let reduction = 0;
      if (flags.isHillTile) reduction = Math.max(reduction, promo.movementHillBonus);
      if (flags.isForestTile) reduction = Math.max(reduction, promo.movementForestBonus);
      return Math.max(1, base - reduction);
    }

    // 턴 종료 시 의무병 승급 회복: 본인은 healSelfPercent, 같은 타일·사거리 안 아군은 healAdjacentPercent (최대 HP 기준).
    // 한 유닛이 여러 의무병 범위에 들어가도 가장 큰 회복 하나만 받는다.
    function applyMedicHealing() {
      const living = state.playerUnits.filter(u => !u.isDead);
      const heals = new Map();
      living.forEach((medic) => {
        const promo = getPromotionEffectSummary(medic);
        if (!(promo.healSelfPercent > 0) && !(promo.healAdjacentPercent > 0)) return;
        const range = Math.max(1, promo.healRange);
        living.forEach((ally) => {
          let pct = 0;
          if (ally === medic) pct = promo.healSelfPercent;
          else if (Math.abs(ally.x - medic.x) + Math.abs(ally.y - medic.y) <= range) pct = promo.healAdjacentPercent;
          if (pct > 0 && pct > (heals.get(ally)?.pct || 0)) heals.set(ally, { pct, medic });
        });
      });
      heals.forEach(({ pct, medic }, unit) => {
        const maxHp = Number(unit.maxHp) > 0 ? Number(unit.maxHp) : 100;
        const before = unit.hp;
        unit.hp = Math.min(maxHp, before + Math.max(1, Math.round(maxHp * pct)));
        if (unit.stats) unit.stats.hp = unit.hp;
        if (unit.hp > before) {
          addLog(`🩹 [의무병 회복] ${unit === medic ? `${unit.name} 자가 치료` : `${medic.name} → ${unit.name}`}: HP +${unit.hp - before} (${unit.hp}/${maxHp})`, 'success');
        }
      });
    }

    function calculateCombatModifiers(attacker, defender, commanderSkills) {
      const skills = commanderSkills || state?.commander?.unlockedSkills || {};

      const attackerPromos = getUnitPromotionIds(attacker);
      const defenderPromos = getUnitPromotionIds(defender);

      const targetTile = defender ? getTile(defender.x, defender.y) : null;
      const { tileType, isCityTile, isHillTile, isForestTile } = getPromotionTileFlags(targetTile);

      // 같은 계열 승급은 누적 표기 값이라 합산하지 않고 최댓값만 쓴다 (getPromotionEffectSummary).
      const atkPromo = getPromotionEffectSummary(attacker);
      const defPromo = getPromotionEffectSummary(defender);

      let attackerAtkMultiplier = 1.0 + atkPromo.atkPercent + (isCityTile ? atkPromo.cityAtkBonus : 0);
      let attackerFirstStrikes = atkPromo.firstStrikes;
      let attackerRetreatChance = atkPromo.retreatChance;

      let defenderDefMultiplier = 1.0
        + (isCityTile ? defPromo.cityDefBonus : 0)
        + (isHillTile ? defPromo.hillDefBonus : 0)
        + (isForestTile ? defPromo.forestDefBonus : 0);
      let defenderFirstStrikes = defPromo.firstStrikes;
      let defenderCounterBonus = defPromo.counterBonus;
      let defenderRetreatChance = defPromo.retreatChance;

      if (defender.isGuarding || defender.stance === 'GUARD') {
        defenderDefMultiplier += (defender.guardBonusDef || 0.30);
      }

      const effectiveAtk = calculateEffectiveStrength(attacker, 'atk');
      const effectiveDef = calculateEffectiveStrength(defender, 'def');
      const calculatedAtk = effectiveAtk * attackerAtkMultiplier;
      const calculatedDef = effectiveDef * defenderDefMultiplier;

      // 수비 측 승률: 실제 전투 승률 공식(getCombatOdds)과 같은 값을 쓴다
      const oddsNow = getCombatOdds(attacker, defender);
      const totalPower = calculatedAtk + calculatedDef;
      const defenderWinChance = oddsNow ? 1 - oddsNow.P : (totalPower > 0 ? (calculatedDef / totalPower) : 0.5);
      const defenderIsPlayer = isPlayerSideUnit(defender);

      const activeSynergies = [];
      let defenderRetreatHpRecovery = 0.0;

      // Synergy 1: Defender's Leader
      const hasDefendersLeader = !!(skills.DefendersLeader || skills.defendersLeader || skills["Defender's Leader"]);
      if (defenderIsPlayer && hasDefendersLeader && defenderWinChance < 0.50) {
        defenderFirstStrikes = Math.max(defenderFirstStrikes, 2);
        defenderCounterBonus += 0.20;
        activeSynergies.push({
          id: 'DefendersLeader_Drill2',
          name: "지휘관 패시브: 수비의 리더",
          desc: "수세 상황(승률 < 50%)에서 임시 [제식 훈련 II(선제 타격 2회)] 효과 발동!"
        });
      }

      // Synergy 2: Tactical Retreat
      const hasTacticalRetreat = !!(skills.TacticalRetreat || skills.tacticalRetreat || skills["Tactical Retreat"]);
      if (defenderIsPlayer && hasTacticalRetreat && defenderWinChance < 0.30) {
        defenderRetreatChance = Math.min(1.0, defenderRetreatChance + 0.20);
        defenderRetreatHpRecovery = 0.50;
        activeSynergies.push({
          id: 'TacticalRetreat_FlankingBonus',
          name: "지휘관 패시브: 전략적 후퇴",
          desc: "절대적 위기(승률 < 30%)에서 [후퇴 확률 +20%] 및 생존 시 [HP 50% 즉시 회복] 효과 부여!"
        });
      }

      return {
        attacker: {
          rawAtk: attacker.atk,
          finalAtk: calculatedAtk,
          multiplier: attackerAtkMultiplier,
          firstStrikes: attackerFirstStrikes,
          retreatChance: attackerRetreatChance,
          promotions: attackerPromos
        },
        defender: {
          rawDef: defender.def,
          finalDef: calculatedDef,
          multiplier: defenderDefMultiplier,
          firstStrikes: defenderFirstStrikes,
          counterBonus: defenderCounterBonus,
          retreatChance: defenderRetreatChance,
          retreatHpRecovery: defenderRetreatHpRecovery,
          winChance: defenderWinChance,
          promotions: defenderPromos
        },
        environment: {
          tileType,
          isCityTile,
          isHillTile,
          isForestTile
        },
        synergies: activeSynergies
      };
    }

    /* --------------------------------------------------------------------------
       Character Skill Tree & Custom Skill Image Management Module
       -------------------------------------------------------------------------- */

    /**
     * Helper to find a character unit by ID from player or enemy roster
     */
    function findCharacterById(characterId) {
      if (!characterId) return null;
      const allUnits = [...(state.playerUnits || []), ...(state.enemyUnits || [])];
      return allUnits.find(u => String(u.id) === String(characterId)) || null;
    }

    /**
     * Retrieves the complete skillTree array for a character.
     * Automatically initializes with DEFAULT_SKILL_TREE_TEMPLATE if none exists.
     *
     * @param {string|number} characterId
     * @returns {Array<Object>} Skill tree nodes array
     */
    function getCharacterSkillTree(characterId) {
      const unit = findCharacterById(characterId);
      if (!unit) return [];

      if (!Array.isArray(unit.skillTree)) {
        // Initialize with default template if available
        const defaultTemplate = window.DEFAULT_SKILL_TREE_TEMPLATE || [];
        unit.skillTree = JSON.parse(JSON.stringify(defaultTemplate));
      }

      return unit.skillTree;
    }

    /**
     * Appends a new skill node to the character's skill tree.
     *
     * @param {string|number} characterId - Target character/unit ID
     * @param {Object} skillData - Skill data definition object
     * @returns {Object|null} Newly created skill node or null on failure
     */
    function addSkillToTree(characterId, skillData) {
      const unit = findCharacterById(characterId);
      if (!unit) {
        console.warn(`[addSkillToTree] Character not found with ID: ${characterId}`);
        return null;
      }

      if (!Array.isArray(unit.skillTree)) {
        unit.skillTree = [];
      }

      // Use helper or sanitize skill node
      const createNodeFn = window.createSkillTreeNode || function(s) {
        return {
          id: s.id || `skill_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: s.name || '신규 스킬',
          tier: Number(s.tier) || 1,
          prerequisites: Array.isArray(s.prerequisites) ? s.prerequisites : [],
          imageUrl: s.imageUrl || '',
          type: (String(s.type).toUpperCase() === 'PASSIVE') ? 'PASSIVE' : 'ACTIVE',
          costAP: Number(s.costAP) >= 0 ? Number(s.costAP) : 1,
          coolDown: Number(s.coolDown) >= 0 ? Number(s.coolDown) : 1,
          effectValue: Number(s.effectValue) || 15,
          targetType: s.targetType || 'SINGLE_TARGET',
          description: s.description || '스킬 효과'
        };
      };

      const newSkill = createNodeFn(skillData);
      if (!newSkill) return null;

      // Duplicate ID prevention
      const existingIdx = unit.skillTree.findIndex(s => s.id === newSkill.id);
      if (existingIdx >= 0) {
        unit.skillTree[existingIdx] = newSkill;
      } else {
        unit.skillTree.push(newSkill);
      }

      // Save state to LocalStorage and optional Supabase
      saveGameState();

      addLog(`✨ [스킬트리 추가] ${unit.name}에게 새로운 스킬 [${newSkill.name}] (Tier ${newSkill.tier}) 트리가 등록되었습니다.`, 'gold');

      // Refresh UI if selected
      if (state.selectedUnit?.id === unit.id) {
        renderUnitCard(unit);
        updateFullShotOverlay();
      }

      return newSkill;
    }

    /**
     * Updates the specific skill's imageUrl (Supabase Storage 공개 URL) and saves to Supabase.
     *
     * @param {string|number} characterId - Target character/unit ID
     * @param {string} skillId - Target skill node ID
     * @param {string} base64Image - Base64 data URL image string
     * @returns {boolean} True if successfully updated, false otherwise
     */
    function updateSkillImage(characterId, skillId, base64Image) {
      const unit = findCharacterById(characterId);
      if (!unit) {
        console.warn(`[updateSkillImage] Character not found: ${characterId}`);
        return false;
      }

      if (!Array.isArray(unit.skillTree)) {
        getCharacterSkillTree(characterId);
      }

      const targetSkill = unit.skillTree.find(s => s.id === skillId);
      if (!targetSkill) {
        // Also check if it's the unit's active customSkill
        if (unit.customSkill && unit.customSkill.id === skillId) {
          unit.customSkill.imageUrl = base64Image;
        } else {
          console.warn(`[updateSkillImage] Skill not found: ${skillId}`);
          return false;
        }
      } else {
        targetSkill.imageUrl = base64Image;
        // Sync with active customSkill if matching
        if (unit.customSkill && unit.customSkill.id === skillId) {
          unit.customSkill.imageUrl = base64Image;
        }
      }

      // Cloud storage upload for Base64 image
      if (base64Image && base64Image.startsWith('data:') && typeof window.uploadSkillIcon === 'function') {
        window.uploadSkillIcon(base64Image, targetSkill ? targetSkill.name : 'skill').then(downloadUrl => {
          if (targetSkill) targetSkill.imageUrl = downloadUrl;
          if (unit.customSkill && unit.customSkill.id === skillId) {
            unit.customSkill.imageUrl = downloadUrl;
          }
          if (typeof window.saveSkillToCloud === 'function' && targetSkill) {
            window.saveSkillToCloud(targetSkill);
          }
          saveGameState(true);
        }).catch(err => {
          console.warn("Skill icon storage upload error:", err);
          saveGameState(true);
        });
      } else {
        if (typeof window.saveSkillToCloud === 'function' && targetSkill) {
          window.saveSkillToCloud(targetSkill);
        }
        saveGameState(true);
      }

      addLog(`🖼️ [스킬 이미지 변경] ${unit.name}의 [${targetSkill ? targetSkill.name : '스킬'}] 아이콘 이미지가 갱신되었습니다.`, 'system');

      // Re-render UI components if currently selected
      if (state.selectedUnit?.id === unit.id) {
        updateFullShotOverlay();
        renderUnitCard(unit);
      }

      return true;
    }

    /* ============================================================================
       1. TOTAL DEFEAT (ALL UNITS DEAD) STATE GUARD SYSTEM
       ============================================================================ */

    /**
     * Checks if all active units in the player's roster/stack are defeated (HP <= 0 or isDead).
     * If party wipeout is detected, activates 1-hour inactivation status on player state
     * and invokes window.UI.showDefeatModal().
     *
     * @returns {boolean} True if party wipeout occurred, false otherwise.
     */
    let wipeoutTimer = null;
    function isDeployedForceWiped() {
      if (!state || !state.currentBattle || state.currentBattle.status !== 'active') return false;
      const deployedIds = Array.isArray(state.currentDeployedUnitIds) && state.currentDeployedUnitIds.length
        ? state.currentDeployedUnitIds : (state.playerUnits || []).map(u => u.id);
      const onField = (state.playerUnits || []).filter(u => deployedIds.includes(u.id) && u.x >= 0 && u.y >= 0);
      return onField.filter(isUnitAlive).length === 0;
    }

    /**
     * 2차: 출전 부대가 전멸하면 전투를 패배로 끝낸다. 실제 처리는 다음 틱에 finishEncounter()가 한다
     * (적 턴 루프나 스킬 처리 도중에 전투 상태를 지우지 않도록). 생존 유닛/골드에 따른
     * 사망회귀·긴급 모집 판정은 finishEncounter() → resolveRunSurvival()이 맡는다.
     */
    function checkPartyWipeout() {
      const battle = state && state.currentBattle;
      if (battle && battle.status === 'active') {
        const ids = Array.isArray(state.currentDeployedUnitIds) && state.currentDeployedUnitIds.length ? state.currentDeployedUnitIds : (state.playerUnits || []).map(u => u.id);
        const aliveNow = (state.playerUnits || []).filter(u => ids.includes(u.id) && u.x >= 0 && isUnitAlive(u));
        if (aliveNow.length) battle.lastAliveIds = aliveNow.map(u => u.id); // 최후의 기억: 전멸 직전 생존자
      }
      if (!isDeployedForceWiped()) return false;
      if (wipeoutTimer) return true;
      const tryFinish = () => {
        wipeoutTimer = null;
        if (!isDeployedForceWiped()) return;
        if (isEnemyTurnProcessing) { wipeoutTimer = setTimeout(tryFinish, 200); return; }
        addLog('💀 [부대 전멸] 출전한 아군이 모두 쓰러졌습니다.', 'danger');
        const b = state.currentBattle;
        const lastId = b && Array.isArray(b.lastAliveIds) ? b.lastAliveIds[b.lastAliveIds.length - 1] : null;
        const last = lastId ? state.playerUnits.find(u => u.id === lastId) : null;
        state.run.lastStanding = last ? { characterId: getCharacterId(last), name: last.name } : null;
        state.run.lastDeath = b ? { nodeId: b.nodeId, battleSeed: b.seed } : null;
        finishEncounter({ victory: false, reason: 'wipeout' });
      };
      wipeoutTimer = setTimeout(tryFinish, 0);
      return true;
    }

    // LEGACY: 1시간 정비 상태로 묶던 예전 전멸 처리. 사망회귀 도입으로 호출하지 않는다 (1차 검증 후 삭제 예정).
    function legacyCheckPartyWipeoutHourLockout() {
      if (!state || !Array.isArray(state.playerUnits)) return false;

      const livingUnits = state.playerUnits.filter(u => !u.isDead && (typeof u.hp === 'number' ? u.hp > 0 : true));

      if (livingUnits.length === 0) {
        const now = Date.now();
        const oneHourMs = 60 * 60 * 1000; // 1시간 (3600초)

        // 1-hour inactivation timer/status on player state
        state.isWipedOut = true;
        state.wipeoutTimestamp = now;
        state.wipeoutUntil = now + oneHourMs;
        state.inactivated = true;

        // Sync individual unit states
        state.playerUnits.forEach(u => {
          u.isDead = true;
          u.hp = 0;
          u.isInactivated = true;
          u.inactivatedUntil = state.wipeoutUntil;
        });

        addLog(`💀 [부대 전멸 (Party Wipeout)] 아군 모든 부대가 쓰러졌습니다! 지휘권이 1시간 동안 전선 정비(비활성화) 상태로 전환됩니다.`, 'danger');
        addLog(`⏳ 복구 가능 시각: ${new Date(state.wipeoutUntil).toLocaleTimeString()} (리와인더로 즉시 회귀 가능)`, 'warning');

        saveGameState();
        renderAll();

        // Invoke window.UI.showDefeatModal()
        if (typeof window.UI?.showDefeatModal === 'function') {
          window.UI.showDefeatModal({
            wipeoutUntil: state.wipeoutUntil,
            remainingMs: oneHourMs,
            message: '전선 부대가 전멸하여 1시간 동안 부대 정비 상태에 돌입합니다.'
          });
        }

        return true;
      }

      return false;
    }

    // Default UI Fallback for Defeat Modal if not initialized by UI module
    if (!window.UI) {
      window.UI = {};
    }
    if (typeof window.UI.showDefeatModal !== 'function') {
      window.UI.showDefeatModal = function (defeatInfo) {
        let modal = document.getElementById('modal-party-defeat');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'modal-party-defeat';
          modal.className = 'modal-backdrop active';
          modal.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';
          document.body.appendChild(modal);
        } else {
          modal.style.display = 'flex';
          modal.classList.add('active');
        }

        const wipeoutUntil = defeatInfo?.wipeoutUntil || (Date.now() + 3600000);

        function formatRemaining() {
          const remaining = Math.max(0, wipeoutUntil - Date.now());
          const mins = Math.floor(remaining / 60000);
          const secs = Math.floor((remaining % 60000) / 1000);
          return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        modal.innerHTML = `
          <div class="modal-window" style="background: #0f172a; border: 2px solid #ef4444; box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.45); border-radius: 18px; padding: 24px; max-width: 420px; width: 92%; color: #f8fafc; text-align: center;">
            <div style="font-size: 46px; margin-bottom: 8px;">💀</div>
            <h2 style="font-size: 19px; font-weight: 900; color: #f87171; margin-bottom: 6px; letter-spacing: -0.5px;">아군 부대 전멸 (PARTY WIPEOUT)</h2>
            <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">
              전선의 모든 지휘 부대가 치명상을 입고 쓰러졌습니다.<br/>
              야전 부대 재정비 및 치료를 위해 <strong style="color: #fbbf24;">1시간 동안 전장 출격이 제한</strong>됩니다.
            </p>

            <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 12px; margin-bottom: 18px;">
              <div style="font-size: 10px; color: #fca5a5; font-weight: 700; text-transform: uppercase;">정비 완료까지 남은 시간</div>
              <div id="defeat-timer-countdown" style="font-size: 26px; font-weight: 900; color: #f87171; font-family: monospace; letter-spacing: 2px; margin-top: 4px;">
                ${formatRemaining()}
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-defeat-rewind" style="width: 100%; padding: 11px; background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); color: #ffffff; border: none; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);">
                <span>⏳ 직전 턴으로 시간 되돌리기 (리와인더)</span>
              </button>
              <button id="btn-defeat-emergency-retreat" style="width: 100%; padding: 10px; background: #334155; color: #cbd5e1; border: 1px solid #475569; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">
                <span>🏰 안전지대(마을/도시)로 응급 퇴각</span>
              </button>
            </div>
          </div>
        `;

        const intervalId = setInterval(() => {
          const timerEl = document.getElementById('defeat-timer-countdown');
          if (timerEl) {
            timerEl.textContent = formatRemaining();
            if (Date.now() >= wipeoutUntil) {
              clearInterval(intervalId);
              state.isWipedOut = false;
              state.inactivated = false;
              saveGameState();
            }
          } else {
            clearInterval(intervalId);
          }
        }, 1000);

        const btnRewind = document.getElementById('btn-defeat-rewind');
        if (btnRewind) {
          btnRewind.onclick = () => {
            clearInterval(intervalId);
            modal.style.display = 'none';
            modal.classList.remove('active');
            if (typeof window.rewindLastTurn === 'function') {
              window.rewindLastTurn();
            }
          };
        }

        const btnRetreat = document.getElementById('btn-defeat-emergency-retreat');
        if (btnRetreat) {
          btnRetreat.onclick = () => {
            clearInterval(intervalId);
            modal.style.display = 'none';
            modal.classList.remove('active');
            const activeTiles = getBattleTiles();
            const safeTile = activeTiles.find(t => t && (t.isSafe || t.isCity || t.type === 'city' || t.type === 'village')) || { x: 1, y: 1, name: '평화로운 마을' };
            const safeTownName = safeTile?.name || '평화로운 마을';
            if (state.playerUnits && state.playerUnits.length > 0) {
              const commanderUnit = state.playerUnits[0];
              commanderUnit.isDead = false;
              commanderUnit.hp = Math.round((commanderUnit.maxHp || 100) * 0.35);
              commanderUnit.x = typeof safeTile?.x === 'number' ? safeTile.x : 1;
              commanderUnit.y = typeof safeTile?.y === 'number' ? safeTile.y : 1;
              commanderUnit.isInactivated = false;
              commanderUnit.inactivatedUntil = null;
              state.isWipedOut = false;
              state.inactivated = false;
              addLog(`🏥 [응급 후송] ${safeTownName} 안전지대로 응급 퇴각하여 ${commanderUnit.name}이(가) 회복되었습니다.`, 'gold');
              saveGameState();
              renderAll();
            }
          };
        }
      };
    }

    /* ============================================================================
       2. UNIVERSAL TACTICAL MAP VICTORY CHECK & REWARD CALCULATION SYSTEM
       ============================================================================ */

    /**
     * Resets tactical battle state for a new engagement or dynamically generated map.
     */
    function resetTacticalBattleState() {
      if (state) state.isCombatActive = true;
      victoryProcessed = false;
      defeatedEnemyCount = 0;
      window.victoryProcessed = false;
      window.defeatedEnemyCount = 0;
    }

    /**
     * Victory Condition Guard: Automatically checks remaining enemy units on the active tactical map.
     * If remaining enemy count == 0 and victory has not yet been processed for the current battle:
     *   - Marks battle state as won (battleActive = false)
     *   - Executes victory reward calculations (window.calculateTacticalVictoryRewards())
     *
     * @returns {boolean} True if victory was triggered and processed, false otherwise.
     */
    function checkTacticalVictory() {
      if (!state) return false;

      // Count remaining enemy units/monsters on the active map grid
      const enemyList = Array.isArray(state.enemyUnits) ? state.enemyUnits : [];
      const remainingEnemies = enemyList.filter(e => !e.isDead && (typeof e.hp === 'number' ? e.hp > 0 : true));
      const remainingEnemyCount = remainingEnemies.length;

      // If remaining enemy count == 0 and victory has not yet been processed for current battle
      if (remainingEnemyCount === 0 && !victoryProcessed && !window.victoryProcessed && state && state.isCombatActive) {
        // Mark battle state as won on single source of truth
        state.isCombatActive = false;
        victoryProcessed = true;
        window.victoryProcessed = true;

        addLog(`🏆 [전술 전장 승리!] 작전 구역의 모든 적군 부대가 완전히 섬멸되었습니다!`, 'gold');

        // Execute victory reward calculations
        const rewardData = (typeof window.calculateTacticalVictoryRewards === 'function')
          ? window.calculateTacticalVictoryRewards()
          : calculateTacticalVictoryRewards();

        return true;
      }

      return false;
    }

    /**
     * Reward Calculation:
     * - Track defeatedEnemyCount: Total number of enemies/monsters defeated during this tactical battle.
     * - Gold Reward (100% Probability): goldEarned = defeatedEnemyCount * 100. Add goldEarned to window.playerState.gold.
     * - Rewinder Item Reward (50% Probability): Roll Math.random() < 0.5. If true, grant +1 'Rewinder' item (window.playerState.rewinders += 1).
     * - Package result object: { gold: goldEarned, rewinderGranted: boolean, defeatedCount: defeatedEnemyCount }.
     * - Calls window.UI.showVictoryModal(rewardData) immediately.
     *
     * @returns {{ gold: number, rewinderGranted: boolean, defeatedCount: number }}
     */
    function calculateTacticalVictoryRewards() {
      // 1. Determine total defeated enemy count during this tactical battle
      let count = (typeof window.defeatedEnemyCount === 'number' && window.defeatedEnemyCount > 0)
        ? window.defeatedEnemyCount
        : (defeatedEnemyCount > 0 ? defeatedEnemyCount : 0);

      // Fallback check against dead units in enemyUnits if count was not incremented
      if (count <= 0 && state && Array.isArray(state.enemyUnits)) {
        const deadUnits = state.enemyUnits.filter(e => e.isDead || (typeof e.hp === 'number' && e.hp <= 0));
        count = deadUnits.length;
      }
      if (count <= 0) {
        count = 1; // Fallback guarantee for cleared tactical encounter
      }

      const totalDefeatedCount = count;

      // 2~4. 12단계: 보상의 기준은 전투 진입 시 seed로 정해 둔 state.currentBattle.rewards다.
      //      여기서는 "무엇을 받게 되는지"만 계산해 보여 주고, 실제 지급은 finishEncounter()가
      //      전략맵 복귀 시 딱 한 번 수행한다 (승리 모달을 여러 번 띄워도 이중 지급되지 않는다).
      const battle = state && state.currentBattle;
      const battleRewards = battle && Array.isArray(battle.rewards) ? battle.rewards : null;
      if (!battleRewards) console.warn('[Victory] state.currentBattle.rewards가 없어 표시용 기본값을 사용합니다.');
      const goldEarned = battleRewards
        ? battleRewards.filter(r => r && r.type === 'gold').reduce((sum, r) => sum + scaleIncomeWithRelics(Number(r.amount) || 0), 0)
        : scaleIncomeWithRelics(totalDefeatedCount * 100);
      const rewinderGranted = battleRewards
        ? battleRewards.some(r => r && r.type === 'rewinder' && Number(r.amount) > 0)
        : false;

      const rewardData = {
        gold: goldEarned,
        rewinderGranted: rewinderGranted,
        defeatedCount: totalDefeatedCount
      };
      if (battle) {
        battle.status = 'won';
        battle.result = { ...rewardData };
      }

      addLog(`✨ [전투 승리 전리품] 적군 ${totalDefeatedCount}기 격퇴 보상: +${goldEarned}G${rewinderGranted ? ' · ⏳ 시공간 리와인더 +1개' : ''} (전략맵 복귀 시 지급)`, 'gold');

      // 5. Trigger UI: Call window.UI.showVictoryModal(rewardData) immediately upon victory calculation
      if (window.UI && typeof window.UI.showVictoryModal === 'function') {
        window.UI.showVictoryModal(rewardData);
      } else if (typeof window.showVictoryModal === 'function') {
        window.showVictoryModal(rewardData);
      }

      saveGameState();
      renderAll();

      return rewardData;
    }

    // Modal UI Implementation for Victory
    if (!window.UI) {
      window.UI = {};
    }

    if (typeof window.UI.showVictoryModal !== 'function') {
      window.UI.showVictoryModal = function (rewardData) {
        let modal = document.getElementById('modal-tactical-victory');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'modal-tactical-victory';
          document.body.appendChild(modal);
        }

        modal.className = 'modal-backdrop modal-victory-overlay active';
        modal.style.display = 'flex';

        const gold = rewardData?.gold ?? 0;
        const rewinderGranted = !!rewardData?.rewinderGranted;
        const defeatedCount = rewardData?.defeatedCount ?? 0;
        const curGold = window.playerState?.gold ?? (state?.gold ?? 0);
        const curRewinders = window.playerState?.rewinders ?? (state?.rewinders ?? 0);

        modal.innerHTML = `
          <div class="modal-window victory-modal-window">
            
            <div class="victory-trophy-icon">🏆</div>
            
            <h2 class="victory-title">전술 전장 승리!</h2>
            <div class="victory-subtitle">TACTICAL VICTORY & REWARDS</div>
            
            <p style="font-size: 12.5px; color: #cbd5e1; line-height: 1.5; margin-bottom: 18px;">
              작전 지역의 모든 적군 부대를 완전히 소탕하고<br/>
              <strong style="color: #fef08a;">전술적 승리</strong>를 쟁취했습니다!
            </p>

            <!-- Rewards Box -->
            <div class="victory-reward-card">
              
              <!-- Defeated Count -->
              <div class="victory-reward-row">
                <span class="victory-reward-label">
                  <span>⚔️</span> 격퇴한 적군 수
                </span>
                <span class="victory-reward-val victory-defeated-counter">${defeatedCount}기 소탕</span>
              </div>

              <!-- Gold Reward (100%) -->
              <div class="victory-reward-row">
                <span class="victory-reward-label">
                  <span>💰</span> 국고 승리 전리품
                </span>
                <span class="victory-reward-val victory-gold-text">+${gold} Gold <span class="victory-gold-badge">${defeatedCount} × 100G</span></span>
              </div>

              <!-- Rewinder Item Reward (50% Chance) -->
              <div class="victory-reward-row">
                <span class="victory-reward-label">
                  <span>⏳</span> 시간 회귀의 모래시계
                </span>
                ${rewinderGranted 
                  ? `<span class="victory-rewinder-highlight">✨ Rewinder Item Obtained (+1)</span>`
                  : `<span class="victory-rewinder-none">Rewinder Item: None (50% Chance)</span>`
                }
              </div>
            </div>

            <!-- Current Resources Status Bar -->
            <div class="victory-status-bar">
              <span>보유 국고: <strong class="victory-gold-text" style="font-size: 13px;">${curGold} G</strong></span>
              <span style="color: #475569;">|</span>
              <span>보유 리와인더: <strong style="color: #00ffff; font-weight: 900;">${curRewinders} 개</strong></span>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-victory-to-strategy" class="victory-action-btn">
                <span>🏛️ Return to Map / Proceed (전략 사령부 복귀)</span>
              </button>
              <button id="btn-victory-keep-exploring" class="victory-action-btn secondary">
                <span>🗺️ 현재 전장 잔류 (주변 수색)</span>
              </button>
            </div>
          </div>
        `;

        const btnToStrat = document.getElementById('btn-victory-to-strategy');
        if (btnToStrat) {
          btnToStrat.onclick = () => {
            modal.style.display = 'none';
            modal.classList.remove('active');
            if (typeof window.completeTacticalStage === 'function') {
              window.completeTacticalStage(true);
            } else if (typeof window.switchGameView === 'function') {
              window.switchGameView('STRATEGY');
            }
          };
        }

        const btnKeep = document.getElementById('btn-victory-keep-exploring');
        if (btnKeep) {
          btnKeep.onclick = () => {
            modal.style.display = 'none';
            modal.classList.remove('active');
          };
        }
      };
    }
    window.showVictoryModal = window.UI.showVictoryModal;

    const VictorySystem = {
      checkTacticalVictory,
      calculateTacticalVictoryRewards,
      resetTacticalBattleState
    };
    window.VictorySystem = VictorySystem;

    /* ============================================================================
       3. WILD UNIT PERSUASION & RECRUITMENT SYSTEM (recruitmentSystem)
       ============================================================================ */

    /**
     * Calculates success probability for persuading a wild/enemy unit.
     *
     * @param {Object} targetUnit - Target enemy or wild unit.
     * @param {string|Object} [affinityItemUsed] - Optional affinity/bribery item used.
     * @returns {number} Probability between 0.05 and 0.95.
     */
    function calculatePersuadeChance(targetUnit, affinityItemUsed) {
      if (!targetUnit) return 0;

      let baseRate = 0.35; // 35% 기본 확률

      // 1. 대상 유닛 잔여 HP 비율 보정 (체력이 낮을수록 설득에 굴복하기 쉬움)
      const maxHp = targetUnit.maxHp || 100;
      const hpRatio = (targetUnit.hp || 0) / maxHp;

      if (hpRatio <= 0.25) {
        baseRate += 0.30; // HP 25% 이하: +30% 보너스
      } else if (hpRatio <= 0.50) {
        baseRate += 0.15; // HP 50% 이하: +15% 보너스
      } else if (hpRatio >= 0.85) {
        baseRate -= 0.15; // 거의 만피: -15% 페널티
      }

      // 2. 호감도 및 지휘관 친밀도 보정
      const affinity = targetUnit.favorability || targetUnit.affection || 50;
      baseRate += (affinity - 50) / 200; // 호감도 100일 시 +25%

      // 지휘관 패시브 스킬 (전술적 위압감 / StrategicDominance)
      if (state.commander?.unlockedSkills?.StrategicDominance) {
        baseRate += 0.20;
      }

      // 3. 아이템 사용 효과
      if (affinityItemUsed) {
        const itemKey = (typeof affinityItemUsed === 'string' ? affinityItemUsed : affinityItemUsed.id || '').toLowerCase();
        if (itemKey.includes('treaty') || itemKey.includes('contract')) {
          baseRate += 0.40; // 평화 조약 / 용병 계약서: +40%
        } else if (itemKey.includes('gem') || itemKey.includes('bribe') || itemKey.includes('gold')) {
          baseRate += 0.30; // 보석 / 뇌물: +30%
        } else if (itemKey.includes('meat') || itemKey.includes('food') || itemKey.includes('ration')) {
          baseRate += 0.25; // 특급 고기 / 군량: +25%
        } else {
          baseRate += 0.20; // 기타 아이템: +20%
        }
      }

      // 5% ~ 95% 범위 클램핑
      return Math.min(0.95, Math.max(0.05, baseRate));
    }

    /**
     * Attempts to persuade and recruit a wild unit to the player's roster.
     *
     * @param {Object} targetUnit - Target unit to persuade.
     * @param {string|Object} [affinityItemUsed] - Optional affinity item.
     * @returns {Object} Result object { success: boolean, action?: string, unit?: Object, message: string }
     */
    function attemptPersuadeWildUnit(targetUnit, affinityItemUsed) {
      if (!targetUnit) {
        return { success: false, message: '유효하지 않은 대상 유닛입니다.' };
      }

      if (targetUnit.owner === 'PLAYER' || targetUnit.isPlayer) {
        return { success: false, message: '이미 아군에 소속된 부대입니다.' };
      }

      const successRate = calculatePersuadeChance(targetUnit, affinityItemUsed);
      const roll = Math.random();
      const isSuccess = roll <= successRate;
      const ratePct = Math.round(successRate * 100);

      if (isSuccess) {
        // --------------------------------------------------------------------
        // 성공 (Success): 플레이어 로스터로 영입 및 상태 초기화
        // --------------------------------------------------------------------
        const originalName = targetUnit.name || '야생 유닛';

        // 적군 목록에서 제거
        const enemyIdx = state.enemyUnits.findIndex(e => e.id === targetUnit.id);
        if (enemyIdx !== -1) {
          state.enemyUnits.splice(enemyIdx, 1);
        }

        // 전투 포섭과 같은 규칙: 원본 캐릭터로 연결, 레벨만큼 해금권, 이미 있는 캐릭터면 기억 계승 재료
        const recruitAffection = Math.max(Number(targetUnit.affection) || 50, 70);
        const recruited = captureEnemyUnit(targetUnit, recruitAffection, targetUnit.x, targetUnit.y);
        if (recruited) {
          recruited.hp = Math.max(recruited.hp, Math.round((recruited.maxHp || 100) * 0.75));
          if (recruited.stats) recruited.stats.hp = recruited.hp;
          recruited.ap = recruited.baseAP || 2;
        }

        const logMsg = `🤝 [야생 유닛 영입 성공!] (성공률 ${ratePct}%) ${originalName}을(를) 설득하여 아군 부대로 정식 영입했습니다!`;
        addLog(logMsg, 'gold');

        if (typeof window.UI?.showToast === 'function') {
          window.UI.showToast(logMsg, 'success');
        }

        renderAll();
        saveGameState();

        return {
          success: true,
          unit: recruited || targetUnit,
          successRate: ratePct,
          message: `${originalName} 부대를 아군으로 영입했습니다!`
        };
      } else {
        // --------------------------------------------------------------------
        // 실패 (Failure): 도주 (60%) 또는 분노 반격 (40%)
        // --------------------------------------------------------------------
        const isCounterAttack = Math.random() < 0.40;

        if (isCounterAttack) {
          // 분노 반격: 인접 또는 현재 활성 유닛에게 기습 반격 피해
          const livingPlayers = state.playerUnits.filter(u => !u.isDead);
          const adjPlayer = livingPlayers.find(p => Math.abs(p.x - targetUnit.x) <= 1 && Math.abs(p.y - targetUnit.y) <= 1) || state.selectedUnit || livingPlayers[0];

          let counterDamage = 0;
          if (adjPlayer) {
            counterDamage = Math.max(12, Math.round((targetUnit.atk || 35) * 0.45));
            adjPlayer.hp = Math.max(0, adjPlayer.hp - counterDamage);
            if (adjPlayer.hp <= 0) {
              adjPlayer.isDead = true;
              addLog(`💀 [치명상 전사] ${adjPlayer.name}이(가) ${targetUnit.name}의 기습 반격에 쓰러졌습니다!`, 'danger');
              checkPartyWipeout();
            }
          }

          const logMsg = `💥 [포섭 실패 - 적군 반격!] (성공률 ${ratePct}%) ${targetUnit.name}이(가) 격분하여 반격해왔습니다!` + (adjPlayer ? ` (${adjPlayer.name} -${counterDamage} HP)` : '');
          addLog(logMsg, 'danger');

          if (typeof window.UI?.showToast === 'function') {
            window.UI.showToast(logMsg, 'error');
          }

          renderAll();
          saveGameState();

          return {
            success: false,
            action: 'COUNTER_ATTACK',
            successRate: ratePct,
            damage: counterDamage,
            message: `${targetUnit.name}이(가) 설득을 거부하고 반격했습니다!`
          };
        } else {
          // 도주: 전장에서 이탈
          targetUnit.isDead = true;
          const enemyIdx = state.enemyUnits.findIndex(e => e.id === targetUnit.id);
          if (enemyIdx !== -1) {
            state.enemyUnits.splice(enemyIdx, 1);
          }

          const logMsg = `💨 [포섭 실패 - 적군 도주] (성공률 ${ratePct}%) ${targetUnit.name}이(가) 경계심을 품고 전장에서 도주했습니다!`;
          addLog(logMsg, 'warning');

          if (typeof window.UI?.showToast === 'function') {
            window.UI.showToast(logMsg, 'warning');
          }

          renderAll();
          saveGameState();

          return {
            success: false,
            action: 'FLED',
            successRate: ratePct,
            message: `${targetUnit.name}이(가) 설득을 거부하고 도주했습니다.`
          };
        }
      }
    }

    const recruitmentSystem = {
      calculatePersuadeChance,
      attemptPersuadeWildUnit
    };

    /* ============================================================================
       3. SAFE ZONE (TOWN/CITY) UNIT SHOP SYSTEM (unitShopSystem)
       ============================================================================ */

    /**
     * Checks if the player has an active unit on or adjacent to a Safe Zone (Town/City) tile.
     *
     * @returns {Object|null} Safe tile object if adjacent/on, null otherwise.
     */
    function isPlayerAtSafeZone() {
      if (!state || getBattleTiles().length === 0) return null;

      const livingUnits = (state.playerUnits || []).filter(u => !u.isDead);
      if (livingUnits.length === 0) return null;

      for (const unit of livingUnits) {
        // 1. 현재 주둔 중인 타일 확인
        const currentTile = getTile(unit.x, unit.y);
        if (currentTile && (currentTile.isSafe || currentTile.isCity || currentTile.type === 'city' || currentTile.type === 'village')) {
          return currentTile;
        }

        // 2. 인접한 타일 (거리 1 이내) 확인
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighbor = getTile(unit.x + dx, unit.y + dy);
            if (neighbor && (neighbor.isSafe || neighbor.isCity || neighbor.type === 'city' || neighbor.type === 'village')) {
              return neighbor;
            }
          }
        }
      }

      return null;
    }

    /**
     * Returns town level based on tile type and coordinates.
     *
     * @param {Object} tile - Tile object
     * @returns {number} Town level (1: Village, 2: City, 3: Royal Capital)
     */
    function getTownLevel(tile) {
      if (!tile) return 1;
      if (tile.name?.includes('에테르니아') || (tile.x >= 3 && tile.x <= 4 && tile.y >= 4 && tile.y <= 5)) {
        return 3; // 왕도 에테르니아: Level 3
      }
      if (tile.isCity || tile.type === 'city') {
        return 2; // 일반 도시: Level 2
      }
      return 1; // 마을: Level 1
    }

    /**
     * Purchases a unit from the safe zone town shop catalog and spawns it into player roster.
     *
     * @param {string|null} townId - Optional identifier or tile coordinate string
     * @param {string} unitCatalogId - Catalog unit template ID
     * @returns {Object} Result { success: boolean, unit?: Object, remainingGold: number, message: string }
     */
    function buyUnitAtTown(townId, unitCatalogId) {
      const safeTile = isPlayerAtSafeZone();
      if (!safeTile) {
        const errorMsg = '⚠️ 유닛을 고용하려면 아군 부대가 안전지대(마을 또는 도시)에 위치하거나 인접해야 합니다!';
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      const catalog = window.TOWN_UNIT_SHOP_CATALOG || [];
      const template = catalog.find(item => item.id === unitCatalogId);
      if (!template) {
        const errorMsg = `❌ 존재하지 않는 유닛 템플릿입니다: ${unitCatalogId}`;
        addLog(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      const unitCost = scaleShopGold(template.cost); // 기준가 × 물가 × 유물 할인
      const townLevel = getTownLevel(safeTile);
      const safeTownName = safeTile?.name || '안전 거점';
      if (townLevel < template.reqTownLevel) {
        const errorMsg = `🔒 이 유닛은 거점 레벨 ${template.reqTownLevel} 이상에서만 고용할 수 있습니다. (현재 ${safeTownName}: Lv.${townLevel})`;
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      if (state.gold < unitCost) {
        const errorMsg = `💰 골드가 부족합니다! (필요: ${unitCost}G, 보유: ${state.gold}G)`;
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      // 지휘관 통솔력 제한 확인
      const activeCount = (state.playerUnits || []).filter(u => !u.isDead).length;
      const maxLeadership = getLeadership();
      if (activeCount >= maxLeadership) {
        const errorMsg = `⚠️ 최대 통솔력 한도(${maxLeadership}부대)에 도달하여 추가 유닛을 편성할 수 없습니다!`;
        addLog(errorMsg, 'warning');
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(errorMsg, 'warning');
        return { success: false, message: errorMsg, remainingGold: state.gold };
      }

      // 골드 차감
      state.gold -= unitCost;

      // 안전지대 타일 좌표에 유닛 스폰
      const spawnX = safeTile.x;
      const spawnY = safeTile.y;

      const newUnitId = `hired_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const newUnit = {
        id: newUnitId,
        owner: 'PLAYER',
        isPlayer: true,
        name: template.name,
        classType: template.classType,
        unitClass: template.classType,
        avatar: template.avatar || '🛡️',
        level: 1,
        exp: 0,
        hp: template.stats.hp,
        maxHp: template.stats.maxHp,
        atk: template.stats.atk,
        def: template.stats.def,
        ap: template.stats.mobility || 2,
        baseAP: template.stats.mobility || 2,
        mobility: template.stats.mobility || 2,
        range: (template.classType === 'ARCHER' || template.classType === 'FIREARM') ? 2 : 1,
        affection: 80,
        favorability: 80,
        promotions: [],
        skillTree: [],
        x: spawnX,
        y: spawnY,
        isDead: false,
        isInactivated: false,
        inactivatedUntil: null,
        upkeep: template.upkeep || 10,
        description: template.description
      };

      state.playerUnits.push(newUnit);
      const hiredTownName = safeTile?.name || safeTownName || '안전 거점';
      const successMsg = `🛒 [안전지대 유닛 고용] [${hiredTownName}]에서 신규 부대 [${newUnit.name}]을(를) 고용했습니다! (-${unitCost}G, 잔여: ${state.gold}G)`;
      addLog(successMsg, 'gold');

      if (typeof window.UI?.showToast === 'function') {
        window.UI.showToast(successMsg, 'success');
      }

      renderAll();
      saveGameState();

      return {
        success: true,
        unit: newUnit,
        remainingGold: state.gold,
        message: successMsg
      };
    }

    const unitShopSystem = {
      TOWN_UNIT_SHOP_CATALOG: window.TOWN_UNIT_SHOP_CATALOG || [],
      isPlayerAtSafeZone,
      getTownLevel,
      buyUnitAtTown
    };

    // ============================================================================
    // Global Window Attachments (Dependency & Scope Safeguard)
    // ============================================================================
    window.checkPartyWipeout = checkPartyWipeout;
    window.checkTacticalVictory = checkTacticalVictory;
    window.calculateTacticalVictoryRewards = calculateTacticalVictoryRewards;
    window.resetTacticalBattleState = resetTacticalBattleState;
    window.VictorySystem = VictorySystem;
    window.attemptPersuadeWildUnit = attemptPersuadeWildUnit;
    window.recruitmentSystem = recruitmentSystem;
    window.buyUnitAtTown = buyUnitAtTown;
    window.unitShopSystem = unitShopSystem;
    window.TOWN_UNIT_SHOP_CATALOG = window.TOWN_UNIT_SHOP_CATALOG || unitShopSystem.TOWN_UNIT_SHOP_CATALOG;

    // ============================================================================
    // Global GameEngine & Combat Math Attachments (Dependency & Scope Safeguard)
    // ============================================================================
    window.normalizeAllUnitsHP = normalizeAllUnitsHP;
    window.calculateEffectiveStrength = calculateEffectiveStrength;
    window.calculateRoundCombatDamage = calculateRoundCombatDamage;
    window.getCombatOdds = getCombatOdds;
    window.executeCombat = executeCombat;

    window.GameEngine = window.GameEngine || {};
    window.GameEngine.normalizeAllUnitsHP = normalizeAllUnitsHP;
    window.GameEngine.calculateEffectiveStrength = calculateEffectiveStrength;
    window.GameEngine.calculateRoundCombatDamage = calculateRoundCombatDamage;
    window.GameEngine.getCombatOdds = getCombatOdds;
    window.GameEngine.executeCombat = executeCombat;
    window.GameEngine.calculateCombatModifiers = calculateCombatModifiers;
    window.GameEngine.getState = () => (typeof state !== 'undefined' ? state : null);
    window.GameEngine.getTiles = () => getBattleTiles();

    // 다른 <script>(ui.js/civ4-editor.js 등)가 호출할 수 있도록 전역 렌더링 진입점을 명시적으로 노출한다.
    window.renderGrid = renderGrid;
    window.renderHeaderAndCard = renderHeaderAndCard;
    window.updateFullShotOverlay = updateFullShotOverlay;

    // ============================================================================
    // Navigation Flow & Combat Cleanup Logic
    // ============================================================================

    /**
     * 1-A. Temporary Tactical Pause Menu Trigger
     * Freezes tactical timers/animations, marks isCombatPaused = true, switches view
     * to STRATEGY_MENU_OVERLAY, and displays UI pause overlay.
     */
    function openTacticalPauseMenu() {
      const isCombat = !!(state && state.isCombatActive);

      if (!isCombat) {
        console.warn('[openTacticalPauseMenu] Tactical combat is not currently active.');
        return;
      }

      // 1. Freeze tactical timer/animations (isCombatPaused = true)
      window.isCombatPaused = true;
      if (state) state.isCombatPaused = true;
      if (window.playerState) window.playerState.isCombatPaused = true;
      if (window.gameState) window.gameState.isCombatPaused = true;

      // 2. Set currentView = GAME_VIEWS.STRATEGY_MENU_OVERLAY
      const views = window.GAME_VIEWS || { WORLD_STRATEGY: 'WORLD_STRATEGY', SECTOR_FIELD: 'SECTOR_FIELD', STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY' };
      const overlayView = views.STRATEGY_MENU_OVERLAY;
      if (state) state.currentView = overlayView;
      if (window.playerState) window.playerState.currentView = overlayView;
      if (window.gameState) window.gameState.currentView = overlayView;

      // 3. Snapshot active battle data safely into savedTacticalState
      const activeSectorId = (state && (state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector)) || 'A-1';
      const tacticalSnapshot = (typeof window.snapshotTacticalState === 'function')
        ? window.snapshotTacticalState(
            activeSectorId,
            state?.turn || 1,
            state?.playerUnits || [],
            state?.enemyUnits || [],
            getBattleTiles()
          )
        : {
            sectorId: activeSectorId,
            turn: state?.turn || 1,
            playerUnits: JSON.parse(JSON.stringify(state?.playerUnits || [])),
            enemyUnits: JSON.parse(JSON.stringify(state?.enemyUnits || [])),
            savedAt: new Date().toISOString()
          };

      if (state) state.savedTacticalState = tacticalSnapshot;
      if (window.playerState) window.playerState.savedTacticalState = tacticalSnapshot;
      if (window.gameState) window.gameState.savedTacticalState = tacticalSnapshot;

      addLog(`⏸️ [전술 일시 정지] 전투가 일시 정지되었습니다. 전략 메뉴 오버레이를 표시합니다.`, 'system');

      // 4. Call window.UI.showPauseOverlay()
      if (window.UI && typeof window.UI.showPauseOverlay === 'function') {
        window.UI.showPauseOverlay();
      }
    }

    /**
     * 1-B. Resume Tactical Combat
     * Restores currentView to SECTOR_FIELD, unfreezes timer (isCombatPaused = false),
     * closes the pause overlay, and restores tactical interaction smoothly.
     */
    function resumeTacticalCombat() {
      // 1. Restore currentView = GAME_VIEWS.SECTOR_FIELD
      const views = window.GAME_VIEWS || { WORLD_STRATEGY: 'WORLD_STRATEGY', SECTOR_FIELD: 'SECTOR_FIELD', STRATEGY_MENU_OVERLAY: 'STRATEGY_MENU_OVERLAY' };
      const fieldView = views.SECTOR_FIELD;
      if (state) state.currentView = fieldView;
      if (window.playerState) window.playerState.currentView = fieldView;
      if (window.gameState) window.gameState.currentView = fieldView;

      // 2. Unfreeze timer (isCombatPaused = false)
      window.isCombatPaused = false;
      if (state) state.isCombatPaused = false;
      if (window.playerState) window.playerState.isCombatPaused = false;
      if (window.gameState) window.gameState.isCombatPaused = false;

      // 3. Hide pause overlay
      if (window.UI && typeof window.UI.hidePauseOverlay === 'function') {
        window.UI.hidePauseOverlay();
      }

      // 4. Resume tactical grid interaction seamlessly
      const viewStrat = document.getElementById('view-strategy-main');
      const viewSector = document.getElementById('view-sector-field');
      if (viewStrat) viewStrat.classList.remove('active');
      if (viewSector) viewSector.classList.add('active');

      renderGrid();
      renderHeaderAndCard();
      updateFullShotOverlay();

      addLog(`▶️ [전투 재개] 전술 전장(8x14 그리드) 상호작용이 재개되었습니다.`, 'combat');
    }

    // ========================================================================
    // 2차: 사망회귀 (Return by Death) · 긴급 모집 · 지휘력 보정
    // ========================================================================
    //   finishEncounter() 끝에서만 판정한다:
    //     생존 유닛(출전 명단 + 예비) 0 AND 골드 0          → returnByDeath()
    //     생존 유닛 0 AND 골드 > 0                           → openEmergencyRecruit()
    //       └ 골드가 EMERGENCY_RECRUIT_COST 미만이라 아무도 못 뽑으면 안내 후 골드 0 → returnByDeath()
    //   상점 구매 등으로 골드가 0이 되는 것은 회귀를 일으키지 않는다.

    // 같은 캐릭터인지 판단하는 id (인스턴스 id가 아니라 원본 캐릭터 id)
    function getCharacterId(unit) {
      if (!unit) return '';
      return String(unit.characterId || unit.sourceCharacterId || unit.catalogId || unit.id || '');
    }

    function isUnitAlive(u) {
      return !!u && !u.isDead && (typeof u.hp === 'number' ? u.hp > 0 : true);
    }

    function getAliveRunUnits() {
      return [...(state.playerUnits || []), ...(state.reserveUnits || [])].filter(isUnitAlive);
    }

    /**
     * 지휘력 보정(방어 +N). 이번 런의 run.commandBonus 대상 캐릭터에게만, 아군에게만 적용된다.
     * 방어력 계산은 calculateEffectiveStrength(unit,'def')가 이 값을 더하는 한 곳뿐이다.
     */
    function getCommandBonusDef(unit) {
      const bonus = state && state.run && state.run.commandBonus;
      if (!bonus || !unit || unit.owner !== 'PLAYER') return 0;
      return getCharacterId(unit) === String(bonus.characterId) ? (Number(bonus.def) || 0) : 0;
    }
    window.getCommandBonusDef = getCommandBonusDef;

    function getBaseDef(unit) {
      if (!unit) return 0;
      if (typeof unit.def === 'number') return unit.def;
      if (unit.stats && typeof unit.stats.def === 'number') return unit.stats.def;
      return 0;
    }

    // 표시용: "39 (+1 지휘)" — 전투에 실제로 쓰이는 값(기본 + 보정)과 보정분
    function formatDefense(unit) {
      const bonus = getCommandBonusDef(unit);
      const base = getBaseDef(unit);
      return bonus ? `${base + bonus} <span class="cmd-bonus-tag" title="지휘력 보정 (이번 런 한정)">(+${bonus} 지휘)</span>` : `${base}`;
    }
    window.formatDefense = formatDefense;

    function syncUnlockedCharacters() {
      if (!state || !state.player) return;
      const set = new Set((state.player.unlockedCharacters || []).map(String));
      [...(state.playerUnits || []), ...(state.reserveUnits || [])].forEach(u => { const id = getCharacterId(u); if (id) set.add(id); });
      (state.characterCollection || []).forEach(e => { if (e && e.characterId != null) set.add(String(e.characterId)); });
      state.player.unlockedCharacters = [...set];
    }

    // 회귀해도 남는 기억: 이번 런에서 방문한 노드(완료 + 도전했던 노드)를 seed별로 병합한다.
    function rememberCurrentRun() {
      const run = state.run;
      if (!run || !state.player) return;
      const mem = state.player.memories || (state.player.memories = { visitedNodesBySeed: {} });
      if (!mem.visitedNodesBySeed) mem.visitedNodesBySeed = {};
      const seen = new Set(mem.visitedNodesBySeed[run.seed] || []);
      (run.completedNodes || []).forEach(id => seen.add(id));
      (run.encounters || []).forEach(e => { if (e && e.nodeId) seen.add(e.nodeId); });
      if (run.currentNodeId) seen.add(run.currentNodeId);
      mem.visitedNodesBySeed[run.seed] = [...seen];
      if (run.lastDeath) mem.deathBattle = { runSeed: run.seed, nodeId: run.lastDeath.nodeId, battleSeed: run.lastDeath.battleSeed, loop: state.player.loopCount };
    }

    function isRememberedNode(run, nodeId) {
      const list = state.player && state.player.memories && state.player.memories.visitedNodesBySeed
        ? state.player.memories.visitedNodesBySeed[run.seed] : null;
      return Array.isArray(list) && list.includes(nodeId);
    }

    // 긴급 모집/사망회귀 진행 중에는 전략맵 이동(노드 진입·출격)을 막는다.
    function isRunBlocked() {
      const run = state && state.run;
      return !!(run && (run.emergencyRecruit || run.returnPending));
    }
    function reportRunBlocked() {
      const msg = state.run && state.run.returnPending
        ? '⏳ 사망회귀가 진행 중입니다. 지휘력 보정 대상을 먼저 고르세요.'
        : '⚠️ 부대가 전멸했습니다. 긴급 모집으로 최소 1명을 모집해야 이동할 수 있습니다.';
      addLog(msg, 'warning');
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
      return false;
    }

    // ---- 긴급 모집 ---------------------------------------------------------
    // 용병 고용과 같은 풀(Supabase characters)에서 무작위로 1명씩 뽑아 바로 출전 명단에 넣는다 (1회 EMERGENCY_RECRUIT_COST).
    // 쓰러진 대원을 되살리지 않는다. 전사한 캐릭터가 뽑히면 이름만 다른 사람(makeMercAlias)으로 합류한다.
    function getMinRecruitCost() {
      return getEmergencyRecruitCost();
    }
    window.getMinRecruitCost = getMinRecruitCost;

    // 이번 긴급 모집에서 이미 뽑아 살아 있는 캐릭터는 다시 뽑지 않는다 (같은 캐릭터 유닛이 둘이 되지 않게).
    function getEmergencyRecruitPool() {
      const aliveIds = new Set(getAliveRunUnits().map(getCharacterId));
      return getCharacterGachaPool().filter(c => !aliveIds.has(String(c.id)));
    }

    /** 긴급 모집 1회: EMERGENCY_RECRUIT_COST를 내고 무작위 용병 1명이 합류한다. */
    function emergencyRecruit() {
      const run = state.run;
      if (!run || !run.emergencyRecruit) return { ok: false, reason: '긴급 모집 중이 아닙니다.' };
      const cost = getEmergencyRecruitCost();
      if (state.gold < cost) return { ok: false, reason: `골드가 부족합니다 (필요 ${cost}G)` };
      const pool = getEmergencyRecruitPool();
      if (!pool.length) return { ok: false, reason: '더 모집할 수 있는 용병이 없습니다.' };

      const record = pool[Math.floor(Math.random() * pool.length)];
      const alias = getHireAlias(record);
      const unit = characterRecordToUnit(alias ? { ...record, name: alias } : record, {
        id: `merc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        owner: 'PLAYER', x: 0, y: 0
      });
      state.gold -= cost;
      state.playerUnits.push(unit);
      normalizeAllUnitsHP(state);
      run.emergencyRecruitCount = (run.emergencyRecruitCount || 0) + 1;
      const bonus = getCommandBonusDef(unit);
      addLog(`🆘 [긴급 모집] ${unit.name} 합류 (-${cost}G, 잔여 ${state.gold}G)${bonus ? ` · 지휘력 보정 방어 +${bonus} 적용` : ''}`, 'gold');
      saveGameState(true);
      return { ok: true, unit, cost, alias };
    }
    window.emergencyRecruit = emergencyRecruit;

    function closeEmergencyRecruit() {
      const run = state.run;
      if (!run || !run.emergencyRecruit) return true;
      if (getAliveRunUnits().length === 0) return false; // 1명 이상 모집해야 닫을 수 있다
      run.emergencyRecruit = false;
      run.emergencyRecruitCount = 0;
      document.getElementById('modal-emergency-recruit')?.remove();
      if (state.strategy) state.strategy.deploySelectedIds = null; // 편성은 새 대원 기준으로 다시 잡는다
      addLog('🚩 [긴급 모집 완료] 재편성한 부대로 작전을 이어갑니다.', 'gold');
      goToStrategyMap();
      saveGameState(true);
      return true;
    }
    window.closeEmergencyRecruit = closeEmergencyRecruit;

    function rbdModal(id, borderColor) {
      document.getElementById(id)?.remove();
      const overlay = document.createElement('div');
      overlay.id = id;
      overlay.className = 'rbd-overlay';
      const card = document.createElement('div');
      card.className = 'rbd-card';
      card.style.borderColor = borderColor;
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      return { overlay, card };
    }

    // "더 이상 싸울 수 없다" — 확인을 누르면 resolve
    function showCannotFightNotice(gold, minCost) {
      return new Promise(resolve => {
        const { overlay, card } = rbdModal('modal-cannot-fight', '#ef4444');
        card.innerHTML = `
          <div class="rbd-icon">🕯️</div>
          <h2 class="rbd-title" style="color:#f87171;">더 이상 싸울 수 없다</h2>
          <p class="rbd-text">남은 골드 ${gold}G로는 아무도 모집할 수 없습니다. (최소 ${minCost}G)<br/>남은 골드를 모두 잃고, 처음으로 돌아갑니다.</p>
          <button type="button" class="rbd-btn rbd-btn-danger" id="btn-cannot-fight-ok">받아들인다</button>`;
        card.querySelector('#btn-cannot-fight-ok').onclick = () => { overlay.remove(); resolve(); };
      });
    }

    /**
     * 전멸했지만 골드가 남아 있을 때의 모집 화면. 1명 이상 모집해야 닫힌다(전략맵 이동 불가).
     * 1회 EMERGENCY_RECRUIT_COST로 무작위 용병 1명을 뽑는다.
     * 아무도 모집할 수 없으면(0 < 골드 < 모집비) 안내 후 골드를 0으로 만들고 사망회귀한다.
     */
    async function openEmergencyRecruit() {
      const run = state.run;
      if (!run) return;
      run.emergencyRecruit = true;
      saveGameState(true);

      const cost = getMinRecruitCost();
      const recruitedSoFar = () => getAliveRunUnits().length > 0;

      if (state.gold < cost && !recruitedSoFar()) {
        // 회귀 판정 지점 (긴급 모집 화면)
        await showCannotFightNotice(state.gold, cost);
        setGoldRaw(0);
        run.emergencyRecruit = false;
        saveGameState(true);
        return returnByDeath();
      }

      const { card } = rbdModal('modal-emergency-recruit', '#f59e0b');
      const esc = escapeGachaHtml;
      const clsLabel = (u) => { const c = u.classType || u.unitClass; return CLASS_META[c]?.name || c || ''; };
      let poolError = '';
      let lastDraw = null; // { unit, alias, originalName }

      const loadPool = async () => {
        card.innerHTML = `<div class="rbd-icon">🆘</div><h2 class="rbd-title" style="color:#fbbf24;">긴급 모집</h2><p class="rbd-text">용병 명단을 불러오는 중...</p>`;
        try {
          poolError = (await ensureCharacterGachaPool()).length ? '' : '모집할 수 있는 용병이 없습니다. DEV에서 캐릭터를 먼저 등록해주세요.';
        } catch (err) {
          console.error('Emergency recruit pool load error:', err);
          poolError = '용병 명단을 불러오지 못했습니다.';
        }
        render();
      };

      const render = () => {
        const hasRecruited = recruitedSoFar();
        const recruits = getAliveRunUnits();
        const canDraw = !poolError && state.gold >= cost && getEmergencyRecruitPool().length > 0;
        const drawHtml = lastDraw ? `
          <div class="rbd-row rbd-draw-result">
            <span class="rbd-row-avatar">${getGachaAvatarHtml(lastDraw.unit)}</span>
            <span class="rbd-row-main"><b>${esc(lastDraw.unit.name)}</b><small>${esc(clsLabel(lastDraw.unit))} · 방어 ${formatDefense(lastDraw.unit)}${lastDraw.alias ? ` · 전사한 ${esc(lastDraw.originalName)}와(과) 닮은 다른 용병` : ''}</small></span>
          </div>` : '';
        card.innerHTML = `
          <div class="rbd-icon">🆘</div>
          <h2 class="rbd-title" style="color:#fbbf24;">긴급 모집</h2>
          <p class="rbd-text">부대가 전멸했습니다. 남은 골드로 1명 이상 모집해야 작전을 이어갈 수 있습니다.<br/>1회 ${cost}G · 무작위 용병 1명이 바로 출전 명단에 합류합니다.</p>
          <div class="rbd-gold">보유 골드 <b>${state.gold}G</b> · 모집 <b>${run.emergencyRecruitCount || 0}</b>명</div>
          ${poolError ? `<p class="rbd-text" style="color:#f87171;">${esc(poolError)}</p>` : ''}
          ${drawHtml}
          ${recruits.length ? `<div class="rbd-list">${recruits.map(u => `
            <div class="rbd-row">
              <span class="rbd-row-avatar">${getGachaAvatarHtml(u)}</span>
              <span class="rbd-row-main"><b>${esc(u.name)}</b><small>${esc(clsLabel(u))} · Lv.${u.level || 1} · 방어 ${formatDefense(u)}</small></span>
            </div>`).join('')}
          </div>` : ''}
          ${poolError
            ? `<button type="button" class="rbd-btn" id="btn-emergency-retry">다시 불러오기</button>`
            : `<button type="button" class="rbd-btn" id="btn-emergency-draw" ${canDraw ? '' : 'disabled'}>🎲 무작위 모집 (${cost}G)</button>`}
          <button type="button" class="rbd-btn" id="btn-emergency-done" ${hasRecruited ? '' : 'disabled'}>${hasRecruited ? '모집 완료 — 전략맵으로' : '1명 이상 모집해야 합니다'}</button>`;
        const drawBtn = card.querySelector('#btn-emergency-draw');
        if (drawBtn) drawBtn.onclick = () => {
          const res = emergencyRecruit();
          if (res.ok) {
            lastDraw = { unit: res.unit, alias: res.alias, originalName: (getCharacterGachaPool().find(c => String(c.id) === getCharacterId(res.unit)) || {}).name || '' };
          } else if (typeof window.UI?.showToast === 'function') {
            window.UI.showToast(res.reason, 'warning');
          }
          render();
        };
        const retryBtn = card.querySelector('#btn-emergency-retry');
        if (retryBtn) retryBtn.onclick = () => loadPool();
        card.querySelector('#btn-emergency-done').onclick = () => closeEmergencyRecruit();
      };
      await loadPool();
    }
    window.openEmergencyRecruit = openEmergencyRecruit;

    // ---- 사망회귀 -----------------------------------------------------------
    async function playReturnByDeathEffect() {
      if (!window.ReturnByDeathFX || typeof window.ReturnByDeathFX.play !== 'function') return;
      try {
        await window.ReturnByDeathFX.play({ muted: !!(state.player && state.player.settings && state.player.settings.muted) });
      } catch (e) {
        console.warn('[ReturnByDeath] 연출 실패 — 건너뜁니다.', e);
      }
    }

    // 저장은 gameState 문서 하나에 player와 run이 함께 들어간다 (Supabase 왕복 1회).
    async function savePlayer() { saveGameState(true); }
    async function saveRun() { saveGameState(true); }

    // ---- 작전지도 (구역) -----------------------------------------------------
    // 지도 형태와 인접 관계는 campaignRegions.js(고정), 회차별 구역 상태는 run.campaign (회귀 시 함께 초기화).
    // 구역에 들어가면 그 구역의 노드 그래프를 새로 만들고, 보스를 격파하면 구역 확보 → 작전지도로 돌아온다.
    function getCurrentRegionId(run = state && state.run) {
      return (run && run.campaign && run.campaign.currentRegionId) || null;
    }
    window.getCurrentRegionId = getCurrentRegionId;

    // 전투가 없을 때 있어야 할 화면: 구역 작전 중이면 전략맵, 아니면 작전지도.
    function getIdleView() {
      return getCurrentRegionId() ? 'STRATEGY' : 'CAMPAIGN';
    }

    // 구역 노드 그래프. 구역마다 같은 섹터(WORLD_SECTORS)로 만들기 때문에 노드 id 앞에 구역 id를 붙여
    // 예지 기억·전장 seed·도전 횟수(전부 노드 id 기준)가 구역끼리 섞이지 않게 한다.
    function createRegionNodeGraph(run, regionId) {
      const seed = `${run.seed}|region|${regionId}`;
      const mapState = RunEngine.generateRunMap(seed, WORLD_SECTORS);
      const rename = id => `${regionId}-${id}`;
      mapState.nodes.forEach(n => { n.id = rename(n.id); n.next = n.next.map(rename); n.regionId = regionId; });
      mapState.layers = mapState.layers.map(layer => layer.map(rename));
      return { seed, mapState };
    }

    async function enterRegion(regionId) {
      const run = state && state.run;
      const campaign = run && run.campaign;
      const region = typeof REGIONS !== 'undefined' ? REGIONS[regionId] : null;
      if (!campaign || !region || !campaign.regions[regionId]) return false;
      if (isRunBlocked()) { reportRunBlocked(); return false; }
      const warn = msg => { addLog(msg, 'warning'); window.UI?.showToast?.(msg, 'warning'); return false; };
      const current = getCurrentRegionId(run);
      if (current === regionId) { goToStrategyMap(); return true; }
      if (current) return warn(`⚠️ ${REGIONS[current].title.ko} 작전이 진행 중입니다. 먼저 구역을 확보하세요.`);
      if (campaign.regions[regionId].status !== 'available') return warn('🔒 아직 진입할 수 없는 구역입니다.');
      if (!getAdjutantUnit(run)) return warn('🎖️ 먼저 부관을 임명하세요.');

      await ensureWorldSectorsLoaded();
      const { seed, mapState } = createRegionNodeGraph(run, regionId);
      run.mapState = mapState;
      run.completedNodes = [];
      run.currentNodeId = null;
      run.status = 'active';
      campaign.currentRegionId = regionId;
      campaign.regions[regionId].nodeGraphSeed = seed;
      campaign.lastSecured = null;
      state.selectedNodeId = null;
      ensureNodeSelection();
      addLog(`🗺️ [작전지도] ${region.title.ko} 진입 — 위협도 ${region.threat}, 노드 ${mapState.nodes.length}개`, 'gold');
      saveGameState(true);
      goToStrategyMap();
      return true;
    }
    window.enterRegion = enterRegion;

    // 지금 작전 중인 구역을 확보한다 (finishEncounter에서 보스 격파 시). 구역 작전이 아니면 null.
    function secureCurrentRegion() {
      const run = state.run;
      const regionId = getCurrentRegionId(run);
      if (!regionId) return null;
      const unlocked = secureRegion(run.campaign, regionId);
      if (window.NationShares) window.NationShares.onRegionSecured(regionId); // 점령 → 지분 구매권
      const final = regionId === CAMPAIGN_MAP.finalRegionId;
      run.campaign.currentRegionId = null;
      run.campaign.lastSecured = { regionId, unlocked, final }; // 작전지도 브리핑이 한 번 읽고 지운다
      if (final) run.campaign.cleared = true;
      else run.status = 'active'; // 다음 구역으로 이어지는 런
      return { regionId, unlocked, final };
    }

    // 부관 유닛. 임명하지 않았거나 전사했으면 null.
    // 같은 캐릭터 id를 가진 유닛이 여럿일 수 있으므로(전사 후 다른 이름으로 재고용) 임명한 유닛 id로 찾는다.
    // unitId가 없는 예전 세이브는 캐릭터 id가 같은 "살아 있는" 유닛을 부관으로 본다.
    function getAdjutantUnit(run = state && state.run) {
      const a = run && run.adjutant;
      if (!a) return null;
      const units = [...(run.party || []), ...(run.reserve || [])];
      if (a.unitId) {
        const unit = units.find(u => String(u.id) === String(a.unitId));
        return unit && !unit.isDead ? unit : null;
      }
      return units.find(u => !u.isDead && getCharacterId(u) === String(a.characterId)) || null;
    }
    window.getAdjutantUnit = getAdjutantUnit;

    // 부관 호감도: 임명하면 오르고, 해임(교체 포함)하면 그 두 배로 떨어진다. 부관이 전사한 경우는 해임이 아니다.
    const ADJUTANT_AFFECTION_GAIN = 10;
    const ADJUTANT_AFFECTION_LOSS = ADJUTANT_AFFECTION_GAIN * 2;

    // 받침이 있으면 첫 번째, 없으면 두 번째 조사 (롤랑을 / 발터를)
    function withJosa(word, withFinal, withoutFinal) {
      const text = String(word);
      const code = text.charCodeAt(text.length - 1) - 0xac00;
      return text + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : withoutFinal);
    }

    // getUnitAffection은 아래 유물 보상 구역에 하나만 둔다 (기본값 규칙: affection → favorability → 50).

    // 전투 코드는 affection, 캐릭터 레코드는 favorability를 읽으므로 둘을 같이 바꾼다.
    function changeUnitAffection(unit, delta) {
      const next = Math.max(0, Math.min(100, getUnitAffection(unit) + delta));
      unit.affection = next;
      unit.favorability = next;
      return next;
    }

    // 호감도 변동 규칙 (소폭): 전투 승리 +, 승률 50% 이하 전투 −, 퇴각 −, 기억 계승 −, 담보 −
    const AFFECTION_RULES = { lowOddsWin: -2, retreat: -2, inherit: -2, pledge: -5, lowOddsThreshold: 0.5, trustThreshold: 50 };

    function adjustAffectionWithLog(unit, delta, label) {
      if (!unit || !delta) return;
      const before = getUnitAffection(unit);
      const after = changeUnitAffection(unit, delta);
      if (after !== before) addLog(`${delta > 0 ? '💗' : '💔'} [호감도] ${unit.name} ${label} ${delta > 0 ? '+' : ''}${after - before} (${before} → ${after})`, delta > 0 ? 'success' : 'warning');
    }

    // 퇴각으로 전투를 마치면 출전했던 생존 캐릭터의 호감도가 소폭 떨어진다.
    // (승리 시 호감도는 교전 단위로 이미 처리된다 — 교전 승률 P 기준)
    function applyRetreatAffection() {
      const deployed = Array.isArray(state.currentDeployedUnitIds) ? state.currentDeployedUnitIds : [];
      (state.playerUnits || [])
        .filter(u => deployed.includes(u.id) && !u.isDead && !u.captive && (u.hp === undefined || u.hp > 0))
        .forEach(u => adjustAffectionWithLog(u, AFFECTION_RULES.retreat, '퇴각'));
    }

    // 담보로 잡힌 캐릭터의 반응: 호감도가 오르지 않고 깎이며, 대사 창으로 불만 또는 신뢰를 말한다.
    function reactToPledge(unit) {
      if (!unit) return;
      const trusting = getUnitAffection(unit) >= AFFECTION_RULES.trustThreshold;
      speakUnitLine(unit, trusting ? 'pledge_trust' : 'pledge_distrust', trusting ? 'brave' : 'refuse');
      adjustAffectionWithLog(unit, AFFECTION_RULES.pledge, '담보로 잡힘');
    }
    window.reactToPledge = reactToPledge;

    // 전투 중에는 부관을 바꿀 수 없다 (지휘력 보정이 전투 도중 옮겨 가지 않도록).
    function isAdjutantChangeLocked() {
      return !!(state.isCombatActive || (state.currentBattle && state.currentBattle.status === 'active'));
    }

    function applyAdjutantDismissal(run, prev) {
      const before = getUnitAffection(prev);
      const after = changeUnitAffection(prev, -ADJUTANT_AFFECTION_LOSS);
      addLog(`💔 [부관 해임] ${prev.name} — 호감도 -${ADJUTANT_AFFECTION_LOSS} (${before} → ${after})`, 'danger');
      run.adjutant = null;
      if (run.loopReward && run.loopReward.type === 'command') run.commandBonus = null;
    }

    // 부관 임명. 살아 있는 부관이 있으면 교체로 처리한다 (기존 부관 호감도 -LOSS). 새 부관은 호감도 +GAIN.
    // 지휘력 카드를 골랐다면 방어 보정이 새 부관에게 간다.
    function appointAdjutant(unitId) {
      const run = state && state.run;
      const unit = run && (run.party || []).find(u => u.id === unitId && !u.isDead);
      if (!unit) return false;
      if (isAdjutantChangeLocked()) {
        const msg = '⚔️ 전투 중에는 부관을 바꿀 수 없습니다.';
        addLog(msg, 'warning');
        window.UI?.showToast?.(msg, 'warning');
        return false;
      }
      const prev = getAdjutantUnit(run);
      if (prev && prev.id === unit.id) return true;
      if (prev) applyAdjutantDismissal(run, prev);

      const characterId = getCharacterId(unit);
      run.adjutant = { characterId, unitId: unit.id, name: unit.name };
      if (run.loopReward && run.loopReward.type === 'command') {
        run.commandBonus = { characterId, def: Number(run.loopReward.def) || 1 };
      }
      const before = getUnitAffection(unit);
      const after = changeUnitAffection(unit, ADJUTANT_AFFECTION_GAIN);
      const bonusText = run.commandBonus && run.commandBonus.characterId === characterId ? ' · 지휘력: 방어력 +1' : '';
      addLog(`🎖️ [부관 임명] ${unit.name} — 호감도 +${ADJUTANT_AFFECTION_GAIN} (${before} → ${after})${bonusText}`, 'gold');
      speakUnitLine(unit, 'adjutant_appointed', 'adjutant');
      saveGameState(true);
      return true;
    }
    window.appointAdjutant = appointAdjutant;

    function dismissAdjutant() {
      const run = state && state.run;
      const prev = getAdjutantUnit(run);
      if (!prev || isAdjutantChangeLocked()) return false;
      applyAdjutantDismissal(run, prev);
      saveGameState(true);
      return true;
    }
    window.dismissAdjutant = dismissAdjutant;

    // 경고창 (확인/취소). resolve(true)면 진행.
    function confirmWarning({ title, html, okLabel }) {
      return new Promise(resolve => {
        const { card } = rbdModal('modal-adjutant-warning', '#dc2626');
        card.innerHTML = `
          <div class="rbd-icon">⚠️</div>
          <h2 class="rbd-title" style="color:#fca5a5;">${title}</h2>
          <p class="rbd-text">${html}</p>
          <div class="adj-warn-actions">
            <button type="button" class="rbd-btn" data-warn-cancel>취소</button>
            <button type="button" class="rbd-btn rbd-btn-danger" data-warn-ok>${okLabel}</button>
          </div>`;
        const close = ok => { document.getElementById('modal-adjutant-warning')?.remove(); resolve(ok); };
        card.querySelector('[data-warn-cancel]').onclick = () => close(false);
        card.querySelector('[data-warn-ok]').onclick = () => close(true);
      });
    }

    // 부관 교체/해임 요청 (경고창 → 확인 시 실행). 부관이 없을 때의 임명은 경고 없이 바로 한다.
    async function requestAdjutantChange(unitId) {
      const run = state && state.run;
      const prev = getAdjutantUnit(run);
      const next = unitId ? (run.party || []).find(u => u.id === unitId && !u.isDead) : null;
      if (isAdjutantChangeLocked()) { window.UI?.showToast?.('⚔️ 전투 중에는 부관을 바꿀 수 없습니다.', 'warning'); return false; }
      const name = u => escapeGachaHtml(u.name);
      const nameObj = u => `<b>${escapeGachaHtml(u.name)}</b>${withJosa(u.name, '을', '를').slice(u.name.length)}`;
      const drop = u => `${getUnitAffection(u)} → <b style="color:#fca5a5;">${Math.max(0, getUnitAffection(u) - ADJUTANT_AFFECTION_LOSS)}</b>`;
      const gain = u => `${getUnitAffection(u)} → <b class="rbd-up">${Math.min(100, getUnitAffection(u) + ADJUTANT_AFFECTION_GAIN)}</b>`;
      const commandNote = run.loopReward && run.loopReward.type === 'command';

      let ok = true;
      if (prev && next) {
        ok = await confirmWarning({
          title: '부관 교체',
          html: `부관 ${nameObj(prev)} 해임하고 ${nameObj(next)} 임명합니다.<br/><br/>
            💔 ${name(prev)} 호감도 -${ADJUTANT_AFFECTION_LOSS} (${drop(prev)})<br/>
            🎖️ ${name(next)} 호감도 +${ADJUTANT_AFFECTION_GAIN} (${gain(next)})
            ${commandNote ? '<br/>🛡️ 지휘력 보정도 새 부관에게 옮겨 갑니다.' : ''}
            <br/><br/>해임당한 부관은 지휘관을 원망합니다. 호감도가 30 이하로 떨어지면 명령을 거부할 수 있습니다.`,
          okLabel: '교체'
        });
      } else if (prev && !next) {
        ok = await confirmWarning({
          title: '부관 해임',
          html: `부관 ${nameObj(prev)} 해임합니다.<br/><br/>
            💔 호감도 -${ADJUTANT_AFFECTION_LOSS} (${drop(prev)})
            ${commandNote ? '<br/>🛡️ 지휘력 보정(방어 +1)도 사라집니다.' : ''}
            <br/><br/>부관 자리는 공석이 되며, 새 부관을 임명하기 전에는 새 구역 작전을 시작할 수 없습니다.`,
          okLabel: '해임'
        });
      }
      if (!ok) return false;
      const done = next ? appointAdjutant(next.id) : dismissAdjutant();
      if (done) {
        renderAdjutantPanel();
        renderAll();
      }
      return done;
    }
    window.requestAdjutantChange = requestAdjutantChange;

    // 지휘관 창(지휘관 이름 클릭)의 부관 임명 패널
    function renderAdjutantPanel() {
      const el = document.getElementById('modal-adjutant-panel');
      const run = state && state.run;
      if (!el || !run) return;
      const adj = getAdjutantUnit(run);
      const locked = isAdjutantChangeLocked();
      const affBar = u => {
        const v = getUnitAffection(u);
        const tone = v <= 30 ? 'low' : v >= 70 ? 'high' : 'mid';
        return `<span class="adj-aff adj-aff-${tone}" title="호감도 ${v}"><span class="adj-aff-fill" style="width:${v}%"></span></span><span class="adj-aff-num">💗 ${v}</span>`;
      };
      const candidates = (run.party || []).filter(u => !u.isDead && (!adj || u.id !== adj.id));
      el.innerHTML = `
        <div class="adj-panel-head">
          <b>🎖️ 부관</b>
          <small>임명 시 호감도 +${ADJUTANT_AFFECTION_GAIN} · 해임·교체 시 -${ADJUTANT_AFFECTION_LOSS}</small>
        </div>
        ${adj ? `
          <div class="adj-current">
            <span class="adj-portrait">${renderPortrait(adj, { emojiSize: '22px' })}</span>
            <span class="adj-main"><b>${escapeGachaHtml(adj.name)}</b><span class="adj-meta">${escapeGachaHtml(getClassLabel(adj.classType))} · Lv.${adj.level || 1}${run.commandBonus && run.commandBonus.characterId === getCharacterId(adj) ? ' · 🛡️ 방어 +1' : ''}</span><span class="adj-aff-row">${affBar(adj)}</span></span>
            <button type="button" class="adj-btn danger" data-adj-dismiss ${locked ? 'disabled' : ''}>해임</button>
          </div>` : `<div class="adj-empty">부관이 공석입니다. 아래에서 임명하세요.</div>`}
        ${locked ? '<div class="adj-locked">⚔️ 전투 중에는 부관을 바꿀 수 없습니다.</div>' : ''}
        <div class="adj-list">${candidates.map(u => `
          <div class="adj-row">
            <span class="adj-portrait">${renderPortrait(u, { emojiSize: '18px' })}</span>
            <span class="adj-main"><b>${escapeGachaHtml(u.name)}</b><span class="adj-aff-row">${affBar(u)}</span></span>
            <button type="button" class="adj-btn" data-adj-appoint="${escapeGachaHtml(u.id)}" ${locked ? 'disabled' : ''}>${adj ? '교체' : '임명'}</button>
          </div>`).join('') || '<div class="adj-empty">임명할 수 있는 대원이 없습니다.</div>'}
        </div>`;
      el.querySelector('[data-adj-dismiss]')?.addEventListener('click', () => requestAdjutantChange(null));
      el.querySelectorAll('[data-adj-appoint]').forEach(btn => {
        btn.addEventListener('click', () => requestAdjutantChange(btn.dataset.adjAppoint));
      });
    }
    window.renderAdjutantPanel = renderAdjutantPanel;

    function goToCampaignMap() {
      state.currentView = 'CAMPAIGN';
      [window.playerState, window.gameState].forEach(o => { if (o) o.currentView = 'CAMPAIGN'; });
      switchGameView('CAMPAIGN');
      renderAll();
    }
    window.goToCampaignMap = goToCampaignMap;

    // 작전지도 화면은 campaignMap.js가 그린다 (game.js보다 늦게 로드되므로 없으면 건너뛴다).
    function renderCampaignView() {
      mountSharedHeader('view-campaign-map');
      renderStrategyHeader();
      if (window.CampaignMapView) window.CampaignMapView.render();
    }

    function goToStrategyMap() {
      state.currentView = 'STRATEGY';
      [window.playerState, window.gameState].forEach(o => { if (o) o.currentView = 'STRATEGY'; });
      switchGameView('STRATEGY');
      renderAll();
    }

    let returnByDeathRunning = false;
    /**
     * 사망회귀: 같은 seed의 세계를 처음부터 반복한다.
     * loopCount/기억은 player(영구)에, 파티·골드·노드 진행은 createInitialRun()으로 초기화된다.
     * 연출 중 새로고침해도 run.returnPending이 남아 있어 횟수가 두 번 오르지 않고 선택 화면부터 이어진다.
     */
    async function returnByDeath() {
      if (returnByDeathRunning) return;
      returnByDeathRunning = true;
      try {
        const run = state.run;
        if (!run.returnPending) {
          state.player.loopCount = (Number(state.player.loopCount) || 0) + 1;
          rememberCurrentRun();
          run.returnPending = true;
          run.emergencyRecruit = false;
          run.status = 'lost';
          addLog(`🔁 [사망회귀] 모든 것을 잃었다… 눈을 뜨자 처음 그 자리다. (회귀 ${state.player.loopCount}회)`, 'danger');
          saveGameState(true);
          await playReturnByDeathEffect();
        }
        const seed = run.seed; // 같은 세계를 반복
        const reward = await openLoopRewardSelect(seed);
        const echo = run.lastStanding || null;
        if (window.NationShares) await window.NationShares.onReturnByDeath(); // 국가 지분도 회귀와 함께 사라진다
        if (window.FedSystem) window.FedSystem.onReturnByDeath(); // 대출은 이 런과 함께 사라진다
        if (window.ServerEconomy) await window.ServerEconomy.onReturnByDeath(state.player.loopCount); // 서버: 골드·지분·대출 초기화
        state.run = createInitialRun(seed, reward);
        if (window.Wallet) window.Wallet.afterRunCreated(); // 비상금 카드의 골드는 서버가 회차당 한 번만 인정한다
        // 최후의 기억: 전멸 직전 마지막 생존자가 새 시작 파티에 있으면 다음 런 첫 전투에서 행동 +1
        if (echo && state.run.party.some(u => getCharacterId(u) === String(echo.characterId))) {
          state.run.echo = { characterId: String(echo.characterId), name: echo.name, used: false };
        }
        state.encounterSeq = 0;
        state.turn = 1;
        state.currentBattle = null;
        state.enemyUnits = [];
        state.selectedNodeId = null;
        state.isWipedOut = false;
        state.inactivated = false;
        if (state.strategy) {
          state.strategy.deploySelectedIds = null;
          state.strategy.deployKnownIds = [];
        }
        normalizeAllUnitsHP(state);
        selectedUnitId = (state.playerUnits[0] && state.playerUnits[0].id) || 'u1';
        historyStack = [];
        ensureNodeSelection();
        const card = LOOP_REWARD_CARDS[reward.type];
        if (reward.type === 'command') {
          addLog('🛡️ [지휘력] 이번 런에서 임명하는 부관이 방어력 +1을 얻습니다.', 'gold');
        } else {
          addLog(`${card.icon} [${card.name}] ${card.desc} (이번 런 한정)`, 'gold');
        }
        if (state.run.echo) addLog(`🕯️ [최후의 기억] ${state.run.echo.name}이(가) 마지막 순간을 기억한다. 첫 전투 첫 턴에 한 번 더 움직인다.`, 'gold');
        await savePlayer();
        await saveRun();
        goToCampaignMap();
      } finally {
        returnByDeathRunning = false;
      }
    }
    window.returnByDeath = returnByDeath;

    /** 전투 종료 시 생존/골드로 회귀·긴급 모집을 판정한다. finishEncounter()의 마지막 단계. */
    function resolveRunSurvival() {
      if (getAliveRunUnits().length > 0) return 'alive';
      if (Number(state.gold) <= 0) {
        setGoldRaw(0);
        returnByDeath();
        return 'returnByDeath';
      }
      openEmergencyRecruit();
      return 'emergencyRecruit';
    }

    // 새로고침 직후: 중단된 회귀/긴급 모집을 이어서 연다.
    function resumePendingRunFlow() {
      const run = state && state.run;
      if (!run || state.currentBattle) return;
      if (run.returnPending) returnByDeath();
      else if (run.emergencyRecruit) openEmergencyRecruit();
    }
    window.resumePendingRunFlow = resumePendingRunFlow;

    function renderLoopCounter() {
      let el = document.getElementById('loop-counter');
      const count = Number(state && state.player && state.player.loopCount) || 0;
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.id = 'loop-counter';
        el.className = 'loop-counter';
        el.onclick = openBattleLogHistory;
        document.body.appendChild(el);
      }
      el.textContent = `🔁 회귀 ${count}회`;
      el.title = `사망회귀 ${count}회 · 눌러서 지난 전투 로그 보기`;
    }

    function openBattleLogHistory() {
      document.getElementById('battle-log-history')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'battle-log-history';
      overlay.className = 'log-history-overlay';
      overlay.innerHTML = `
        <div class="log-history-card">
          <div class="log-history-head"><span>📜 지난 전투 로그 (${logHistory.length})</span><button type="button" data-close>✕</button></div>
          <div class="log-history-body"></div>
        </div>`;
      const body = overlay.querySelector('.log-history-body');
      if (!logHistory.length) body.textContent = '기록된 로그가 없습니다.';
      logHistory.forEach(({ msg, type }) => {
        const div = document.createElement('div');
        div.className = `log-line log-${type}`;
        div.textContent = msg;
        body.appendChild(div);
      });
      document.body.appendChild(overlay);
      body.scrollTop = body.scrollHeight;
      const close = () => overlay.remove();
      overlay.querySelector('[data-close]').onclick = close;
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
    }

    // ========================================================================
    // 회귀 보상 (설정과 맞물리는 보상 + 회귀 카드)
    // ========================================================================
    //   자동 (회귀 1회 이상이면 항상):
    //     예지   — 같은 seed의 이전 런에서 방문한 노드는 들어가기 전에 적 구성/보상이 보인다.
    //     기시감 — 지난 런에서 전멸한 바로 그 전투(같은 노드·같은 전장 seed)에 다시 들어가면 적 배치를 보고 아군 배치를 고른다.
    //     최후의 기억 — 전멸 직전 마지막까지 살아남은 캐릭터가 다음 런 첫 전투 첫 턴에 행동을 한 번 더 한다.
    //   회귀 카드 (회귀할 때마다 3장 중 1장, 이번 런 한정, 누적 없음):
    //     지휘력 / 예지(노드 2개 미리 보기) / 비상금(시작 골드 +100) / 기시감(첫 엘리트 전투 배치 자유)
    //   예지가 거짓말을 하지 않도록, 각 노드의 "이번 런 첫 도전" 전장 seed는 런 seed에서 결정된다
    //   (같은 세계 = 같은 전장). 같은 런에서 다시 도전하면 예전처럼 새 seed로 새 전장이 열린다.

    const LOOP_REWARD_CARDS = {
      command:   { id: 'command',   icon: '🛡️', name: '지휘력', desc: '이번 런 부관의 방어 +1' },
      foresight: { id: 'foresight', icon: '🔮', name: '예지',   desc: '노드 2개의 적 구성과 보상을 미리 본다' },
      stash:     { id: 'stash',     icon: '💰', name: '비상금', desc: '시작 골드 +100' },
      dejavu:    { id: 'dejavu',    icon: '👁️', name: '기시감', desc: '첫 엘리트 전투에서 아군 배치를 직접 고른다' }
    };
    const STASH_GOLD = 100;
    const FORESIGHT_CHARGES = 2;

    // 회귀 카드 3장: (런 seed, 회귀 횟수)로 결정 — 선택 화면에서 새로고침해도 같은 3장이 나온다.
    function drawLoopRewardCards(runSeed, loopCount) {
      const ids = Object.keys(LOOP_REWARD_CARDS);
      const rng = SeedEngine.createRNG(`${runSeed}|loop-cards|${loopCount}`);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      return ids.slice(0, 3).map(id => LOOP_REWARD_CARDS[id]);
    }

    // createInitialRun()이 부른다: 고른 카드를 새 런에 반영한다.
    function applyLoopRewardToRun(run, reward) {
      run.loopReward = reward ? { ...reward } : null;
      run.commandBonus = null;
      run.foresight = null;
      run.dejavuEliteFree = false;
      if (!reward) return run;
      if (reward.type === 'command') {
        // 예전 세이브의 카드는 대상이 정해져 있다. 새 카드는 부관을 임명할 때 대상이 정해진다.
        if (reward.characterId != null) run.commandBonus = { characterId: String(reward.characterId), def: Number(reward.def) || 1 };
      } else if (reward.type === 'foresight') {
        run.foresight = { charges: FORESIGHT_CHARGES, revealed: [] };
      } else if (reward.type === 'stash') {
        run.gold += STASH_GOLD;
      } else if (reward.type === 'dejavu') {
        run.dejavuEliteFree = true;
      }
      return run;
    }

    function getDeathMemory(run, nodeId) {
      const d = state.player && state.player.memories && state.player.memories.deathBattle;
      if (!d || !run || d.runSeed !== run.seed) return null;
      return nodeId == null || d.nodeId === nodeId ? d : null;
    }

    function getNodeAttempts(run, nodeId) {
      return (run && run.nodeAttempts && run.nodeAttempts[nodeId]) || 0;
    }

    /** 이번 런에서 이 노드에 처음 들어갈 때의 전장 seed. 이미 도전한 노드면 null(새 seed). */
    function getPlannedBattleSeed(run, node) {
      if (!run || !node || getNodeAttempts(run, node.id) > 0) return null;
      const death = getDeathMemory(run, node.id);
      if (death && death.battleSeed) return death.battleSeed;
      const rng = SeedEngine.createRNG(`${run.seed}|${node.id}|battle`);
      return `${node.sectorId}-${100000 + Math.floor(rng() * 900000)}`;
    }

    // 예지로 내용을 볼 수 있는 노드인가: 이전 런의 기억 또는 이번 런의 예지 카드
    function isForeseenNode(run, nodeId) {
      if (isRememberedNode(run, nodeId)) return 'memory';
      if (run && run.foresight && Array.isArray(run.foresight.revealed) && run.foresight.revealed.includes(nodeId)) return 'card';
      return null;
    }

    function useForesightCharge(nodeId) {
      const run = state.run;
      if (!run || !run.foresight || run.foresight.charges <= 0) return false;
      if (isForeseenNode(run, nodeId)) return false;
      run.foresight.charges -= 1;
      run.foresight.revealed.push(nodeId);
      addLog(`🔮 [예지] ${nodeId}의 앞날을 미리 보았다. (남은 예지 ${run.foresight.charges})`, 'gold');
      saveGameState(true);
      renderStrategyView();
      return true;
    }
    window.useForesightCharge = useForesightCharge;

    /**
     * 노드 내용 미리 보기. 실제 전투와 같은 함수(템플릿 → 캐릭터 풀 → generateBattleMap → 보상)로 만들되
     * 게임 state는 건드리지 않는다.
     * @returns {Promise<{kind:string, enemies?:Array, rewards?:Array, title?:string, text?:string, offers?:Array, retry?:boolean, error?:string}>}
     */
    const nodePreviewCache = new Map();
    async function previewNode(node) {
      const run = state.run;
      if (node.type === 'event') {
        const ev = RunEngine.rollEvent(run, node);
        return { kind: 'event', title: ev.title, text: ev.text };
      }
      if (node.type === 'shop') {
        const offers = RunEngine.getShopOffers(run, node) || [];
        return { kind: 'shop', offers };
      }
      const seed = getPlannedBattleSeed(run, node);
      if (!seed) return { kind: 'battle', retry: true };
      const key = `${run.seed}|${node.id}|${seed}`;
      if (nodePreviewCache.has(key)) return nodePreviewCache.get(key);
      const sector = WORLD_SECTORS[node.sectorId] || { id: node.sectorId };
      const templateId = node.mapTemplateId || sector.mapTemplateId || sector.defaultTemplateId || MapSchema.resolveDefaultTemplateId(node.sectorId);
      try {
        const template = await loadTacticalMapTemplate(templateId);
        await ensureCharacterPoolLoaded();
        const map = window.generateBattleMap(template, seed, { enemyPool: buildEnemyPool(sector, node.type, node.regionId), enemyCount: getEnemyCountRange(node), sectorId: node.sectorId });
        if (!map) throw new Error('전장 생성 실패');
        const enemies = (map.enemies || []).map(e => ({ name: e.name, avatar: e.avatar || '👤', cls: e.classType || e.unitClass, level: e.level || 1, power: calculateUnitPower(e) }));
        const rewards = MapSchema.generateEncounterRewards(seed, { enemyCount: enemies.length, type: node.type });
        const res = { kind: 'battle', seed, enemies, rewards };
        nodePreviewCache.set(key, res);
        return res;
      } catch (err) {
        return { kind: 'battle', error: err?.message || String(err) };
      }
    }
    window.previewNode = previewNode;

    function describeRewards(rewards) {
      return (rewards || []).map(r => r.type === 'gold' ? `${scaleIncomeWithRelics(r.amount)}G` : r.type === 'rewinder' ? `리와인더 ${r.amount}` : `${r.type} ${r.amount}`).join(' · ') || '없음';
    }

    // 전략맵 상세 패널: 선택한 노드의 예지/기시감 정보와 예지 카드 사용 버튼
    let foresightRenderToken = 0;
    function renderNodeForesight(node) {
      const box = document.getElementById('strat-sector-detail-box');
      if (!box) return;
      let panel = document.getElementById('strat-node-foresight');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'strat-node-foresight';
        panel.className = 'strat-foresight';
        box.appendChild(panel);
      }
      const run = state.run;
      if (!node || !run) { panel.hidden = true; return; }
      const how = isForeseenNode(run, node.id);
      const death = getDeathMemory(run, node.id);
      const charges = run.foresight ? run.foresight.charges : 0;
      // 대사는 실제 기억(이전 런)에서만. 예지 카드로 본 노드는 처음 가는 곳이다.
      const line = (how === 'memory' || death) ? getLoopLine(death ? 'deathNode' : 'rememberedNode', node.id) : '';
      const head = [];
      if (death && getNodeAttempts(run, node.id) === 0) head.push(`<div class="strat-foresight-death">☠️ 지난 생에서 여기서 쓰러졌다 — <b>기시감</b>: 적 배치를 보고 아군 배치를 고를 수 있다</div>`);
      if (!how) {
        panel.hidden = !(charges > 0 || head.length);
        panel.innerHTML = head.join('') + (charges > 0
          ? `<button type="button" class="strat-foresight-btn" onclick="useForesightCharge('${node.id}')">🔮 예지 사용 — 이 노드 미리 보기 (남은 ${charges})</button>`
          : '');
        return;
      }
      panel.hidden = false;
      panel.innerHTML = head.join('') + `<div class="strat-foresight-title">${how === 'memory' ? '💭 기억나는 장소' : '🔮 예지'}</div>`
        + (line ? `<div class="strat-foresight-line">${line}</div>` : '')
        + `<div class="strat-foresight-body">불러오는 중…</div>`;
      const token = ++foresightRenderToken;
      previewNode(node).then(p => {
        if (token !== foresightRenderToken) return; // 그 사이 다른 노드를 골랐다
        const body = panel.querySelector('.strat-foresight-body');
        if (!body) return;
        if (p.error) { body.textContent = `미리 보기 실패: ${p.error}`; return; }
        if (p.kind === 'event') { body.innerHTML = `<b>${p.title}</b><br/>${p.text || ''}`; return; }
        if (p.kind === 'shop') { body.innerHTML = p.offers.length ? p.offers.map(o => `${o.label || o.name || o.id} (${o.cost}G)`).join('<br/>') : '판매 물품 없음'; return; }
        if (p.retry) { body.textContent = '이미 한 번 들어갔던 전장이다. 다시 들어가면 전장이 달라져 앞을 볼 수 없다.'; return; }
        body.innerHTML = `<div>적 ${p.enemies.length}명: ${p.enemies.map(e => `${e.avatar} ${e.name} Lv.${e.level}`).join(', ') || '없음'}</div><div>보상: ${describeRewards(p.rewards)}</div>`;
      });
    }

    // ---- 기시감: 아군 배치 단계 ----------------------------------------------
    function isDeployableTile(tile) {
      if (!tile) return false;
      const terrain = String(tile.terrain || tile.type || 'plain');
      const spec = (typeof MapEditorController !== 'undefined' && MapEditorController.TERRAIN_SPECS) ? MapEditorController.TERRAIN_SPECS[terrain] : null;
      if (spec && spec.passable === false) return false;
      if (['sea', 'water', 'mountain'].includes(terrain)) return false;
      const { height } = getBattleSize();
      if (tile.y < Math.floor(height / 2)) return false; // 아군 진영(아래쪽 절반)
      return !(state.enemyUnits || []).some(e => !e.isDead && e.x === tile.x && e.y === tile.y);
    }

    function getDeployPhase() {
      const b = state && state.currentBattle;
      return b && b.deployPhase && b.deployPhase.active ? b.deployPhase : null;
    }

    function startDeployPhase(battle, reason) {
      const ids = (state.playerUnits || []).filter(u => u.isDeployed && isUnitAlive(u)).map(u => u.id);
      if (!ids.length) return;
      battle.deployPhase = { active: true, reason, unitIds: ids, selectedId: ids[0] };
      const why = reason === 'death' ? '지난 생에 쓰러진 바로 그 전장이다' : '처음 보는 엘리트인데… 어디서 본 듯하다';
      addLog(`👁️ [기시감] ${why}. 적 배치를 보고 아군 위치를 고르세요.`, 'gold');
    }

    function handleDeployClick(tile) {
      const phase = getDeployPhase();
      if (!phase) return false;
      const own = (state.playerUnits || []).find(u => phase.unitIds.includes(u.id) && u.x === tile.x && u.y === tile.y);
      if (own && own.id !== phase.selectedId) { phase.selectedId = own.id; renderAll(); return true; }
      if (!isDeployableTile(tile)) {
        addLog('🚫 [기시감] 아군 진영(아래쪽 절반)의 비어 있는 땅에만 배치할 수 있습니다.', 'warning');
        return true;
      }
      const unit = state.playerUnits.find(u => u.id === phase.selectedId);
      if (!unit) return true;
      if (own && own !== unit) { own.x = unit.x; own.y = unit.y; } // 같은 칸의 아군과 자리 교환
      unit.x = tile.x;
      unit.y = tile.y;
      const idx = phase.unitIds.indexOf(unit.id);
      phase.selectedId = phase.unitIds[(idx + 1) % phase.unitIds.length];
      renderAll();
      return true;
    }

    function finishDeployPhase() {
      const phase = getDeployPhase();
      if (!phase) return;
      phase.active = false;
      document.getElementById('deploy-phase-banner')?.remove();
      addLog('⚔️ [기시감] 배치 완료. 이번에는 다르게 간다.', 'gold');
      renderAll();
      saveGameState(true);
    }
    window.finishDeployPhase = finishDeployPhase;

    function selectDeployUnit(id) {
      const phase = getDeployPhase();
      if (phase && phase.unitIds.includes(id)) { phase.selectedId = id; renderAll(); }
    }
    window.selectDeployUnit = selectDeployUnit;

    // renderGrid() 직후: 배치 가능한 칸 표시
    function decorateDeployPhase(mapEl) {
      const phase = getDeployPhase();
      if (!phase || !mapEl) return;
      [...mapEl.children].forEach(el => {
        const x = Number(el.dataset.x), y = Number(el.dataset.y);
        if (Number.isNaN(x) || Number.isNaN(y)) return;
        if (isDeployableTile(getTile(x, y))) el.classList.add('deploy-valid');
        const sel = state.playerUnits.find(u => u.id === phase.selectedId);
        if (sel && sel.x === x && sel.y === y) el.classList.add('deploy-selected');
      });
    }

    function renderDeployBanner() {
      const phase = state && state.currentView !== 'STRATEGY' ? getDeployPhase() : null;
      let el = document.getElementById('deploy-phase-banner');
      if (!phase) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.id = 'deploy-phase-banner';
        el.className = 'deploy-banner';
        document.body.appendChild(el);
      }
      const units = state.playerUnits.filter(u => phase.unitIds.includes(u.id));
      el.innerHTML = `
        <div class="deploy-banner-title">👁️ 기시감 — 적 배치를 보고 아군 위치를 고르세요</div>
        <div class="deploy-banner-units">${units.map(u => `<button type="button" class="deploy-chip${u.id === phase.selectedId ? ' is-selected' : ''}" onclick="selectDeployUnit('${u.id}')">${u.avatar || '👤'} ${u.name}</button>`).join('')}</div>
        <div class="deploy-banner-hint">대원을 고른 뒤 아래쪽 절반의 빈 칸을 누르세요.</div>
        <button type="button" class="deploy-banner-done" onclick="finishDeployPhase()">배치 완료</button>`;
    }

    // ---- 최후의 기억 ---------------------------------------------------------------
    function applyEchoAtBattleStart() {
      const run = state.run;
      if (!run || !run.echo || run.echo.used) return;
      run.echo.used = true; // 다음 런 "첫 전투" 한 번뿐
      const unit = (state.playerUnits || []).find(u => u.isDeployed && isUnitAlive(u) && getCharacterId(u) === String(run.echo.characterId));
      if (!unit) {
        addLog(`🕯️ [최후의 기억] ${run.echo.name}의 기억이 희미해졌다… (첫 전투에 출전하지 않았다)`, 'system');
        return;
      }
      const base = Number(unit.baseAP) || 2;
      unit.ap = base * 2;
      unit.echoActive = true;
      addLog(`💀 [최후의 기억] "죽음을 기억해." — ${unit.name}, 첫 턴 행동 한 번 더 (AP ${unit.ap})`, 'capture');
      showLoopLine(unit, '…이번엔 내가 먼저 움직인다.');
    }

    // ---- 회귀 횟수에 따라 바뀌는 대사 ---------------------------------------------
    const LOOP_LINES = {
      battleStart: [
        ['적이다. 대열을 갖춰라!', '시작하자. 다들 준비됐지?'],
        ['…이 장면, 어디서 본 것 같은데.', '이상하네. 저 깃발, 처음 보는 게 아닌 것 같아.'],
        ['또 이 바람 냄새야. 왜 다들 처음 보는 얼굴이지?', '저 녀석, 오른쪽으로 돌아 들어올 거야. …내가 그걸 어떻게 알지?'],
        ['몇 번째인지 이제 세지도 않아. 이번엔… 끝까지 가자.', '괜찮아. 어떻게 끝나는지 알아. 그러니까 바꿀 수도 있어.']
      ],
      rememberedNode: [
        [''],
        ['이 길… 와 본 적 있어.'],
        ['여기서 무슨 일이 있었는지, 손이 먼저 기억해.'],
        ['이 길 끝에 뭐가 있는지 알아. 몇 번이고 봤으니까.']
      ],
      deathNode: [
        [''],
        ['…여기야. 여기서 다 끝났었어.'],
        ['여기서 몇 번이나 쓰러졌지. 이번엔 다르게 서자.'],
        ['이 전장의 끝을 알아. 그러니 처음부터 다시 짠다.']
      ]
    };
    function getLoopTier() {
      const n = Number(state && state.player && state.player.loopCount) || 0;
      return n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3;
    }
    function getLoopLine(context, salt = '') {
      const pool = (LOOP_LINES[context] || [])[getLoopTier()] || [];
      if (!pool.length) return '';
      const rng = SeedEngine.createRNG(`${context}|${salt}|${state.player ? state.player.loopCount : 0}`);
      return pool[Math.floor(rng() * pool.length)];
    }

    // 대사는 차례대로 하나씩 보여 준다 (최후의 기억 대사와 전투 시작 대사가 겹치지 않게).
    const loopLineQueue = [];
    let loopLineBusy = false;
    function showLoopLine(unit, text) {
      if (!text) return;
      loopLineQueue.push({ unit, text });
      if (!loopLineBusy) playNextLoopLine();
    }
    function playNextLoopLine() {
      const next = loopLineQueue.shift();
      if (!next) { loopLineBusy = false; return; }
      loopLineBusy = true;
      const { unit, text } = next;
      addLog(`💬 ${unit ? unit.name : ''}: "${text}"`, 'system');
      let el = document.getElementById('loop-line');
      if (!el) {
        el = document.createElement('div');
        el.id = 'loop-line';
        el.className = 'loop-line';
        document.body.appendChild(el);
      }
      el.innerHTML = `${unit ? `<b>${unit.avatar || ''} ${unit.name}</b>` : ''}<span>“${text}”</span>`;
      el.classList.remove('is-visible');
      void el.offsetWidth;
      el.classList.add('is-visible');
      setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(playNextLoopLine, 350);
      }, 3200);
    }

    function speakBattleStartLine(battle) {
      const deployed = (state.playerUnits || []).filter(u => u.isDeployed && isUnitAlive(u));
      if (!deployed.length) return;
      const rng = SeedEngine.createRNG(`${battle.seed}|speaker`);
      const speaker = deployed[Math.floor(rng() * deployed.length)];
      showLoopLine(speaker, getLoopLine('battleStart', battle.seed));
    }

    // ---- 회귀 카드 선택 화면 -------------------------------------------------
    function openLoopRewardSelect(runSeed) {
      return new Promise(resolve => {
        const cards = drawLoopRewardCards(runSeed, state.player.loopCount);
        const { card } = rbdModal('modal-loop-reward', '#a78bfa');
        card.innerHTML = `
          <div class="rbd-icon">🔁</div>
          <h2 class="rbd-title" style="color:#c4b5fd;">회귀의 대가</h2>
          <p class="rbd-text">회귀 ${state.player.loopCount}회차. 무엇을 가지고 돌아갈지 하나만 고르세요.<br/>모두 <b>이번 런 한정</b>입니다. 다시 회귀하면 사라집니다.</p>
          <div class="rbd-cards">${cards.map(c => `
            <button type="button" class="rbd-reward-card" data-card="${c.id}">
              <span class="rbd-reward-icon">${c.icon}</span>
              <b>${c.name}</b>
              <small>${c.desc}</small>
            </button>`).join('')}
          </div>`;
        card.querySelectorAll('[data-card]').forEach(btn => {
          btn.onclick = async () => {
            const type = btn.dataset.card;
            document.getElementById('modal-loop-reward')?.remove();
            if (type === 'command') {
              resolve({ type, def: 1 }); // 대상은 작전지도에서 임명하는 부관 (appointAdjutant)
            } else {
              resolve({ type });
            }
          };
        });
      });
    }
    window.openLoopRewardSelect = openLoopRewardSelect;

    // ------------------------------------------------------------------------
    // 유물: 전투에서 이기면 DB 보상 풀(rewardPools)을 굴려 나온 유물을 얻는다.
    //   일반 전투 `${섹터}-battle`, 정예 `${섹터}-elite` → 나온 유물을 바로 지급
    //   보스 `${섹터}-boss-relic` → 후보 3개 중 1개 선택 (run.pendingRelicChoice — 새로고침해도 남는다)
    //   골드는 기존 전투 보상(battle.rewards)이 주고, 아이템은 아직 쓰는 곳이 없어 이 풀에서는 버린다.
    //   보유 유물은 run.relics에 이름·효과까지 스냅샷으로 남긴다 (DB가 바뀌어도 그대로, 회귀하면 사라진다).
    // ------------------------------------------------------------------------
    const RELIC_POOL_SUFFIX = { battle: 'battle', elite: 'elite', boss: 'boss-relic' };
    // giftAffection: 선물 유물을 주면 유물 효과와 별개로 등급에 따라 무조건 오르는 호감도
    const RELIC_RARITY_META = {
      common: { label: '일반', color: '#64748b', giftAffection: 5 },
      rare: { label: '희귀', color: '#0284c7', giftAffection: 10 },
      epic: { label: '영웅', color: '#9333ea', giftAffection: 15 },
      legendary: { label: '전설', color: '#d97706', giftAffection: 25 }
    };
    /** 선물 유물의 등급별 호감도 보너스. 등급을 모르면 일반으로 본다 (카드 색/라벨과 같은 규칙). */
    function getGiftAffectionBonus(relic) {
      return (RELIC_RARITY_META[relic && relic.rarity] || RELIC_RARITY_META.common).giftAffection;
    }
    /** 현재 호감도. 값이 없으면 다른 화면/전투 공식과 같은 기본값(favorability → 50)을 쓴다. */
    function getUnitAffection(u) {
      if (Number.isFinite(Number(u && u.affection)) && u.affection !== null && u.affection !== '') return Number(u.affection);
      if (Number.isFinite(Number(u && u.favorability)) && u.favorability !== null && u.favorability !== '') return Number(u.favorability);
      return 50;
    }
    let rewardDataCache = null;   // { relics: Map<id, relic>, pools: Map<id, pool> }
    let rewardDataPromise = null;

    function ensureRewardDataLoaded() {
      if (rewardDataCache) return Promise.resolve(rewardDataCache);
      if (!rewardDataPromise) {
        rewardDataPromise = (async () => {
          if (!window.RewardEngine) await import('./rewardEngine.js');
          if (!window.SlgStore) throw new Error('SlgStore가 아직 준비되지 않았습니다.');
          const [relics, pools] = await Promise.all([window.SlgStore.list('relics'), window.SlgStore.list('rewardPools')]);
          rewardDataCache = {
            relics: new Map((relics || []).map(r => [String(r.id), RewardEngine.normalizeRelic(r)])),
            pools: new Map((pools || []).map(pl => [String(pl.id), pl]))
          };
          return rewardDataCache;
        })().catch(err => {
          rewardDataPromise = null; // 다음에 다시 시도
          console.warn('[유물] 보상 데이터 로드 실패:', err);
          return null;
        });
      }
      return rewardDataPromise;
    }

    function getOwnedRelics() {
      return state && state.run && Array.isArray(state.run.relics) ? state.run.relics : [];
    }

    // ---- 지휘관 유물 장착 (최대 COMMANDER_RELIC_SLOTS개) ----------------------
    function getEquippedRelicIds() {
      const run = state && state.run;
      if (!run) return [];
      if (!Array.isArray(run.equippedRelics)) run.equippedRelics = [];
      return run.equippedRelics;
    }

    /** 장착 순서대로. 이미 없는 유물을 가리키는 id는 건너뛴다. */
    function getEquippedCommanderRelics() {
      const owned = getOwnedRelics();
      return getEquippedRelicIds()
        .map(id => owned.find(r => r.instanceId === id && r.kind === 'commander'))
        .filter(Boolean)
        .slice(0, COMMANDER_RELIC_SLOTS);
    }

    function isRelicEquipped(relic) {
      return !!relic && getEquippedCommanderRelics().includes(relic);
    }

    function setRelicEquipped(instanceId, equip) {
      const fail = (msg) => {
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return false;
      };
      if (isCharacterPoolLocked()) return fail('전투 중에는 유물 장착을 바꿀 수 없습니다.');
      const relic = getOwnedRelics().find(r => r.instanceId === instanceId);
      if (!relic || relic.kind !== 'commander') return fail('장착할 수 있는 지휘관 유물이 아닙니다.');
      const before = getLeadership();
      // 없어진 유물 id는 이참에 정리한다
      state.run.equippedRelics = getEquippedCommanderRelics().map(r => r.instanceId);
      const ids = state.run.equippedRelics;
      if (equip) {
        if (ids.includes(instanceId)) return true;
        if (ids.length >= COMMANDER_RELIC_SLOTS) return fail(`지휘관 유물은 ${COMMANDER_RELIC_SLOTS}개까지만 장착할 수 있습니다. 먼저 하나를 해제하세요.`);
        ids.push(instanceId);
      } else {
        const idx = ids.indexOf(instanceId);
        if (idx < 0) return true;
        ids.splice(idx, 1);
      }
      const after = getLeadership();
      addLog(`💎 [유물 ${equip ? '장착' : '해제'}] ${relic.name}${after !== before ? ` · 통솔력 ${before} → ${after}부대` : ''}`, equip ? 'gold' : 'system');
      saveGameState(true);
      renderCommanderRelics();
      renderAll();
      return true;
    }
    window.setRelicEquipped = setRelicEquipped;

    // ---- 선물 유물: 캐릭터에게 주면 그 캐릭터의 능력치가 영구히 오른다 (런이 끝나면 캐릭터와 함께 사라진다) ----
    // 바로 능력치에 더하는 효과. 크리티컬·회피·재생 같은 나머지는 캐릭터가 유물을 들고 있는 동안 전투에서 적용된다 (getRelicStatFor).
    const GIFT_RELIC_APPLIERS = {
      atk: (u, v) => { u.atk = Math.max(1, (Number(u.atk) || 0) + v); },
      def: (u, v) => { u.def = Math.max(0, (Number(u.def) || 0) + v); },
      hp: (u, v) => {
        u.maxHp = Math.max(1, (Number(u.maxHp) || 0) + v);
        u.hp = Math.max(1, Math.min(u.maxHp, (Number(u.hp) || 0) + Math.max(0, v)));
      },
      ap: (u, v) => { u.baseAP = Math.max(1, (Number(u.baseAP) || 0) + v); u.ap = Math.max(0, (Number(u.ap) || 0) + v); },
      mobility: (u, v) => { u.baseAP = Math.max(1, (Number(u.baseAP) || 0) + v); u.ap = Math.max(0, (Number(u.ap) || 0) + v); },
      affection: (u, v) => {
        u.affection = Math.max(0, Math.min(100, getUnitAffection(u) + v));
        u.favorability = u.affection;
      }
    };

    // 지휘관 유물에서 실제로 적용되는 효과 (통솔력 · 능력치 · 전투/턴/보상 효과 전부)
    function isCommanderRelicStatApplied(stat) {
      return LEADERSHIP_RELIC_STATS.includes(stat) || RELIC_PASSIVE_STATS.includes(stat)
        || RELIC_ARMY_STATS.includes(stat) || RELIC_GLOBAL_STATS.includes(stat);
    }

    function isGiftEffectApplied(fx) {
      return !!(fx && GIFT_RELIC_APPLIERS[fx.stat]);
    }

    /** 선물을 받을 수 있는 캐릭터: 출전 명단 + 대기 (살아 있는 아군) */
    function getGiftableUnits() {
      return [...(state.playerUnits || []), ...(Array.isArray(state.reserveUnits) ? state.reserveUnits : [])]
        .filter(u => u && !u.isDead && u.owner !== 'ENEMY');
    }

    function giftRelicToUnit(instanceId, unitId) {
      const fail = (msg) => {
        if (typeof window.UI?.showToast === 'function') window.UI.showToast(msg, 'warning');
        return false;
      };
      const relics = getOwnedRelics();
      const idx = relics.findIndex(r => r.instanceId === instanceId);
      const relic = relics[idx];
      if (!relic || relic.kind !== 'gift') return fail('선물할 수 있는 유물이 아닙니다.');
      const unit = getGiftableUnits().find(u => u.id === unitId);
      if (!unit) return fail('선물을 받을 캐릭터를 찾을 수 없습니다.');
      relics.splice(idx, 1);
      const applied = [];
      const affectionBefore = getUnitAffection(unit);
      // 1) 등급별 호감도 보너스: 어떤 선물 유물이든 받으면 오른다
      const bonus = getGiftAffectionBonus(relic);
      GIFT_RELIC_APPLIERS.affection(unit, bonus);
      applied.push(`호감도 +${bonus} (${(RELIC_RARITY_META[relic.rarity] || RELIC_RARITY_META.common).label} 선물)`);
      // 2) 유물 자체 효과 (affection 효과가 있으면 보너스에 더해진다)
      (relic.effects || []).forEach(fx => {
        const value = Number(fx && fx.value) || 0;
        const apply = fx && GIFT_RELIC_APPLIERS[fx.stat];
        if (fx && RELIC_PASSIVE_STATS.includes(fx.stat) && value) applied.push(`${relicStatText(fx)} (전투에서 적용)`);
        if (!apply || !value) return;
        apply(unit, value);
        applied.push(relicStatText(fx));
      });
      applied.push(`호감도 ${affectionBefore} → ${unit.affection}`);
      if (!Array.isArray(unit.giftRelics)) unit.giftRelics = [];
      unit.giftRelics.push({ ...relic, giftedAt: new Date().toISOString() });
      addLog(`🎁 [유물 선물] ${unit.name}에게 ${relic.name}을(를) 선물했습니다 — ${applied.join(', ') || '적용된 능력치 없음'}`, 'success');
      if (typeof window.UI?.showToast === 'function') window.UI.showToast(`🎁 ${unit.name}에게 ${relic.name} 선물`, 'success');
      saveGameState(true);
      renderCommanderRelics();
      renderAll();
      if (currentOverlayTargetUnit === unit) updateFullShotOverlay(unit);
      return true;
    }
    window.giftRelicToUnit = giftRelicToUnit;

    /**
     * 선물 고르기 창.
     *   { relicInstanceId } → 이 유물을 받을 캐릭터를 고른다 (지휘관 창 → 선물 유물)
     *   { unitId }          → 이 캐릭터에게 줄 선물 유물을 고른다 (캐릭터 창)
     */
    function openRelicGiftPicker(opts = {}) {
      closeRelicGiftPicker();
      const esc = escapeGachaHtml;
      const relic = opts.relicInstanceId ? getOwnedRelics().find(r => r.instanceId === opts.relicInstanceId) : null;
      const unit = opts.unitId ? getGiftableUnits().find(u => u.id === opts.unitId) : null;
      if (!relic && !unit) return;
      let title, body;
      if (relic) {
        const units = getGiftableUnits();
        title = `🎁 ${esc(relic.name)} — 누구에게 선물할까요?`;
        body = units.length ? units.map(u => `
          <button type="button" class="relic-gift-unit" data-gift-unit="${esc(u.id)}">
            <span class="relic-gift-portrait">${getGachaAvatarHtml(u)}</span>
            <span class="relic-gift-unit-info">
              <b>${esc(u.name)} <small>Lv.${Number(u.level) || 1}</small></b>
              <small>${esc(getGachaClassName(u))} · ATK ${u.atk} · DEF ${u.def} · HP ${u.maxHp} · 호감 ${u.affection ?? 50}${(u.giftRelics || []).length ? ` · 받은 선물 ${u.giftRelics.length}` : ''}</small>
            </span>
          </button>`).join('') : '<div class="adj-empty">선물을 받을 수 있는 캐릭터가 없습니다.</div>';
        body = `<div class="relic-gift-preview">${esc(describeRelicEffects(relic))}</div><div class="relic-gift-list">${body}</div>`;
      } else {
        const gifts = getOwnedRelics().filter(r => r.kind === 'gift');
        title = `🎁 ${esc(unit.name)}에게 줄 선물`;
        body = gifts.length
          ? `<div class="relic-grid">${gifts.map(r => relicCardHtml(r, { button: `<button type="button" class="relic-pick-btn gift" data-gift-relic="${esc(r.instanceId)}">선물하기</button>` })).join('')}</div>`
          : '<div class="adj-empty">보관 중인 선물 유물이 없습니다. 전투 보상으로 얻을 수 있습니다.</div>';
      }
      const overlay = document.createElement('div');
      overlay.id = 'modal-relic-gift';
      overlay.className = 'relic-choice-overlay';
      overlay.innerHTML = `
        <div class="relic-choice-window" role="dialog" aria-label="유물 선물">
          <div class="relic-choice-title">${title}</div>
          <div class="relic-choice-sub">선물한 유물은 돌려받을 수 없습니다. 능력치는 바로 오릅니다.</div>
          ${body}
          <button type="button" class="relic-pick-btn ghost relic-gift-cancel">닫기</button>
        </div>`;
      overlay.onclick = (e) => { if (e.target === overlay) closeRelicGiftPicker(); };
      overlay.querySelector('.relic-gift-cancel').onclick = closeRelicGiftPicker;
      overlay.querySelectorAll('[data-gift-unit]').forEach(b => {
        b.onclick = () => { if (giftRelicToUnit(relic.instanceId, b.dataset.giftUnit)) closeRelicGiftPicker(); };
      });
      overlay.querySelectorAll('[data-gift-relic]').forEach(b => {
        b.onclick = () => { if (giftRelicToUnit(b.dataset.giftRelic, unit.id)) closeRelicGiftPicker(); };
      });
      document.body.appendChild(overlay);
      // 효과 이름표(RewardEngine)가 아직 없으면 불러온 뒤 다시 그린다
      if (!window.RewardEngine) ensureRewardDataLoaded().then(data => { if (data && window.RewardEngine && document.getElementById('modal-relic-gift')) openRelicGiftPicker(opts); });
    }
    window.openRelicGiftPicker = openRelicGiftPicker;

    function closeRelicGiftPicker() {
      document.getElementById('modal-relic-gift')?.remove();
    }
    window.closeRelicGiftPicker = closeRelicGiftPicker;

    function grantRelic(relicId, source) {
      const def = rewardDataCache && rewardDataCache.relics.get(String(relicId));
      if (!def || !state.run) return null;
      if (!Array.isArray(state.run.relics)) state.run.relics = [];
      const leadershipBefore = getLeadership();
      const entry = {
        instanceId: `relic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        id: String(def.id),
        name: def.name,
        kind: def.kind,
        rarity: def.rarity,
        description: def.description || '',
        ...(def.imageUrl ? { imageUrl: def.imageUrl } : {}),
        effects: JSON.parse(JSON.stringify(def.effects || [])),
        source: source || null,
        acquiredAt: new Date().toISOString()
      };
      state.run.relics.push(entry);
      // 지휘관 유물의 시공간 리와인더(rewinder): 얻는 즉시 한 번만 리와인더를 채워 준다
      const rewinderGain = entry.kind === 'commander' ? Math.round(sumRelicEffects([entry], 'rewinder')) : 0;
      if (rewinderGain > 0) {
        state.rewinders = (Number(state.rewinders) || 0) + rewinderGain;
        entry.rewinderGranted = rewinderGain;
        addLog(`⏳ [유물] ${entry.name}: 리와인더 +${rewinderGain}개 (보유 ${state.rewinders})`, 'gold');
      }
      // 지휘관 유물은 빈 슬롯이 있으면 바로 장착한다
      if (entry.kind === 'commander' && getEquippedCommanderRelics().length < COMMANDER_RELIC_SLOTS) {
        state.run.equippedRelics = [...getEquippedCommanderRelics().map(r => r.instanceId), entry.instanceId];
      }
      const rarity = RELIC_RARITY_META[entry.rarity] || RELIC_RARITY_META.common;
      const leadershipAfter = getLeadership();
      const leadershipText = leadershipAfter !== leadershipBefore ? ` · 통솔력 ${leadershipBefore} → ${leadershipAfter}부대` : '';
      addLog(`💎 [유물 획득] [${rarity.label}] ${entry.name} — ${describeRelicEffects(entry)}${leadershipText}`, 'gold');
      return entry;
    }

    // 전투 승리 보상 유물. finishEncounter가 부른다 (데이터 로드를 기다려야 하므로 비동기).
    async function awardBattleRelics(battle, node) {
      const suffix = RELIC_POOL_SUFFIX[node && node.type];
      if (!suffix || !battle) return;
      const data = await ensureRewardDataLoaded();
      if (!data) return;
      const pool = data.pools.get(`${battle.sectorId}-${suffix}`);
      if (!pool) { console.warn(`[유물] 보상 풀 ${battle.sectorId}-${suffix}이 없어 유물을 주지 않습니다.`); return; }
      let results;
      try {
        // 같은 전투(seed)는 항상 같은 결과. 이미 가진 지휘관 유물은 RewardEngine이 후보에서 뺀다.
        results = RewardEngine.rollRewardPool(pool, SeedEngine.createRNG(`${battle.seed}|relics`), {
          pools: data.pools,
          ownedCommanderRelicIds: getOwnedRelics().filter(r => r.kind === 'commander').map(r => r.id)
        });
      } catch (err) {
        console.warn('[유물] 보상 풀 뽑기 실패:', err);
        return;
      }
      const relicIds = results.filter(r => r.type === 'relic' && data.relics.has(String(r.id))).map(r => String(r.id));
      if (!relicIds.length) return;
      const source = { nodeId: battle.nodeId, sectorId: battle.sectorId, type: node.type };
      if (node.type === 'boss') {
        state.run.pendingRelicChoice = { ...source, options: relicIds };
        saveGameState(true);
        openRelicChoiceModal();
        return;
      }
      const granted = relicIds.map(id => grantRelic(id, source)).filter(Boolean);
      if (granted.length && typeof window.UI?.showToast === 'function') {
        window.UI.showToast(`💎 유물 획득: ${granted.map(r => r.name).join(', ')}`, 'success');
      }
      saveGameState(true);
      renderAll();
    }

    function relicStatText(fx) {
      const label = (window.RewardEngine && RewardEngine.RELIC_STAT_LABELS[fx.stat]) || fx.stat;
      const name = label.replace(/\s*\(.*\)\s*$/, '');
      // 단위는 이름표 괄호 안에서만 읽는다 ('턴 시작 HP 회복 (+)'의 '턴'은 단위가 아니다)
      const hint = (label.match(/\(([^)]*)\)\s*$/) || [])[1] || '';
      const unit = ['%p', '%', '칸', '턴', '개'].find(u => hint.includes(u)) || '';
      const value = Number(fx.value) || 0;
      return `${name} ${value > 0 ? '+' : ''}${value}${unit}`;
    }

    function describeRelicEffects(relic) {
      const parts = (relic.effects || []).map(relicStatText);
      if (relic.kind === 'gift') parts.unshift(`호감도 +${getGiftAffectionBonus(relic)} (선물 보너스)`);
      return parts.join(', ') || '효과 없음';
    }

    function relicCardHtml(relic, opts = {}) {
      const rarity = RELIC_RARITY_META[relic.rarity] || RELIC_RARITY_META.common;
      const kindLabel = relic.kind === 'gift' ? '선물' : '지휘관';
      const effects = (relic.effects || []).map(fx => {
        // 지휘관 유물: 장착 중인 통솔력 효과만 적용 / 선물 유물: 선물하면 바로 오르는 능력치인지 표시
        const works = relic.kind === 'gift' ? (isGiftEffectApplied(fx) || RELIC_PASSIVE_STATS.includes(fx.stat)) : isCommanderRelicStatApplied(fx.stat);
        const active = relic.kind === 'commander' && works && opts.equipped;
        const tag = active ? ' <b>적용 중</b>' : (works ? '' : ' <small>준비 중</small>');
        return `<li class="relic-fx${active ? ' active' : ''}">${escapeGachaHtml(relicStatText(fx))}${tag}</li>`;
      }).join('');
      const giftBonus = relic.kind === 'gift'
        ? `<li class="relic-fx">호감도 +${getGiftAffectionBonus(relic)} <small>선물 보너스</small></li>` : '';
      return `
        <div class="relic-card${opts.equipped ? ' equipped' : ''}" style="--relic-color:${rarity.color}">
          <div class="relic-card-head">
            <span class="relic-icon">${relic.imageUrl ? `<img src="${escapeGachaHtml(relic.imageUrl)}" alt="">` : '💎'}</span>
            <span class="relic-title"><b>${escapeGachaHtml(relic.name)}</b><small>${rarity.label} · ${kindLabel} 유물</small></span>
          </div>
          ${relic.description ? `<div class="relic-desc">${escapeGachaHtml(relic.description)}</div>` : ''}
          <ul class="relic-fx-list">${giftBonus}${effects}</ul>
          ${opts.button || ''}
        </div>`;
    }

    // 보스 유물 3택1
    function openRelicChoiceModal(retries = 3) {
      const pending = state.run && state.run.pendingRelicChoice;
      if (!pending || !Array.isArray(pending.options) || !pending.options.length) return;
      ensureRewardDataLoaded().then(data => {
        // 불러오기 직후에는 Supabase가 아직 준비 중일 수 있다 → 잠시 뒤 다시 시도
        if (!data) { if (retries > 0) setTimeout(() => openRelicChoiceModal(retries - 1), 2000); return; }
        if (state.run.pendingRelicChoice !== pending) return;
        document.getElementById('modal-relic-choice')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'modal-relic-choice';
        overlay.className = 'relic-choice-overlay';
        const cards = pending.options.map((id, i) => {
          const relic = data.relics.get(String(id));
          if (!relic) return '';
          return relicCardHtml(relic, { button: `<button type="button" class="relic-pick-btn" data-relic-index="${i}">이 유물 선택</button>` });
        }).join('');
        overlay.innerHTML = `
          <div class="relic-choice-window" role="dialog" aria-label="보스 유물 선택">
            <div class="relic-choice-title">👑 보스 격파 — 유물 1개를 고르세요</div>
            <div class="relic-choice-sub">고르지 않은 유물은 사라집니다.</div>
            <div class="relic-choice-grid">${cards}</div>
          </div>`;
        overlay.querySelectorAll('.relic-pick-btn').forEach(btn => {
          btn.onclick = () => chooseRelicReward(Number(btn.dataset.relicIndex));
        });
        document.body.appendChild(overlay);
      });
    }
    window.openRelicChoiceModal = openRelicChoiceModal;

    function chooseRelicReward(index) {
      const pending = state.run && state.run.pendingRelicChoice;
      if (!pending) return;
      const relicId = pending.options[index];
      if (relicId == null) return;
      state.run.pendingRelicChoice = null;
      const { options, ...source } = pending;
      const relic = grantRelic(relicId, source);
      document.getElementById('modal-relic-choice')?.remove();
      if (relic && typeof window.UI?.showToast === 'function') window.UI.showToast(`💎 유물 획득: ${relic.name}`, 'success');
      saveGameState(true);
      renderAll();
    }
    window.chooseRelicReward = chooseRelicReward;

    /**
     * 12단계: 전투 결과 처리의 단일 진입점.
     *
     *   전투 종료 → 보상 지급 → 플레이어 상태 저장 → 노드 완료 처리 → 다음 노드 해금 → 전략맵 복귀
     *
     * 승리/후퇴/패배 어느 경로로 끝나든(승리 모달 버튼, 전술적 후퇴, 유지비 파산, 전략맵 복귀 버튼)
     * 전부 이 함수 하나를 지난다. 진행 중인 전투가 없으면 아무 일도 하지 않는다(중복 호출 안전).
     *
     * 판정 규칙:
     *   - 이미 승리 처리(currentBattle.status === 'won')된 전투는 나중에 어떤 경로로 나가든 "승리"다.
     *     (승리 후 "계속 탐색"하다가 일시정지 메뉴의 후퇴로 나가도 노드는 완료된다.)
     *   - 승리가 아니면 노드는 완료되지 않는다. 같은 노드에 다시 도전할 수 있다 (새 seed로 새 전장).
     *
     * @param {{victory?:boolean, retreated?:boolean, reason?:string}} [result]
     * @returns {{victory:boolean, reason:string, casualties:Array, rewards:Array, unlockedNodes:string[], runWon:boolean, encounterId:string, nodeId:string}|null}
     */
    function finishEncounter(result = {}) {
      const battle = state && state.currentBattle;
      if (!battle) {
        console.warn('[finishEncounter] 진행 중인 전투가 없어 무시합니다.');
        return null;
      }
      const run = state.run;
      const node = RunEngine.getNode(run, battle.nodeId);
      const victory = battle.status === 'won' ? true : !!result.victory;
      const reason = result.reason || (victory ? 'victory' : (result.retreated ? 'retreat' : 'defeat'));

      // 1) 전투 종료: 단일 진실 공급원 state.isCombatActive 종료 (getter로 연결된 곳 동시 반영)
      state.isCombatActive = false;
      state.isCombatPaused = false;
      state.savedTacticalState = null;
      window.isCombatPaused = false;
      [window.playerState, window.gameState].forEach(o => {
        if (o) { o.isCombatPaused = false; o.savedTacticalState = null; }
      });

      // 2) 사상자: 이번 전투에 출전했다가 쓰러진 영웅 (유닛 자체의 isDead 상태는 전투 중 이미 반영되어 있다)
      const deployed = Array.isArray(state.currentDeployedUnitIds) ? state.currentDeployedUnitIds : [];
      const casualties = (state.playerUnits || [])
        .filter(u => deployed.includes(u.id) && (u.isDead || (typeof u.hp === 'number' && u.hp <= 0)))
        .map(u => ({ id: u.id, name: u.name, captive: !!u.captive }));

      // 2-1) 스킬: 전투 중 상태이상/쿨다운 초기화 (스킬 해금권은 기억 계승으로만 얻는다)
      cancelSkillTargeting(true);
      // 유물: 승리하면 전투 후 회복·승리 SP·호감도, 끝나면 전투 동안 얹은 이동력 보정을 걷는다
      if (victory) applyRelicVictoryRewards();
      if (!victory && reason === 'retreat') applyRetreatAffection();
      removeRelicBattleBonuses();
      (state.playerUnits || []).forEach(u => {
        if (window.SkillEngine) SkillEngine.resetBattleState(u);
      });

      // 3) 보상 지급 (승리 시에만, 전투 진입 때 seed로 정해 둔 battle.rewards 그대로)
      const rewards = victory ? (battle.rewards || []).map(r => ({ ...r })) : [];
      // 골드는 전투 하나당 한 번만 청구한다 (서버가 같은 전투 id 로 두 번 받지 못하게 막는다)
      const goldReward = rewards.filter(r => r.type === 'gold').reduce((sum, r) => sum + scaleIncomeWithRelics(Number(r.amount) || 0), 0);
      if (goldReward > 0) Wallet.earn('earn_reward', goldReward, `${Number(state.player && state.player.loopCount) || 0}:${battle.id}`);
      rewards.forEach(r => {
        if (r.type === 'rewinder') state.rewinders += Number(r.amount) || 0;
      });

      // 4) 노드 완료 처리 + 다음 노드 해금
      let unlockedNodes = [];
      let runWon = false;
      let secured = null;
      if (victory && node) {
        const res = RunEngine.completeNode(run, node.id);
        if (res.ok) {
          unlockedNodes = res.unlockedNodes;
          runWon = res.runWon;
          // 구역 작전 중이면 보스 격파 = 구역 확보. 최종 구역이 아니면 런은 계속된다.
          if (runWon) secured = secureCurrentRegion();
        } else {
          console.warn('[finishEncounter] 노드 완료 실패:', res.reason);
        }
      }
      RunEngine.recordEncounter(run, battle, victory, { reason, casualties: casualties.map(c => c.id), rewards });

      // 5) 전투 인스턴스 정리: 결과는 run.encounters에 요약으로 남고, 맵/적 데이터는 버린다.
      battle.status = victory ? 'won' : 'lost';
      const finished = {
        victory,
        reason,
        casualties,
        rewards,
        unlockedNodes,
        runWon,
        encounterId: battle.id,
        nodeId: battle.nodeId
      };
      state.currentBattle = null;
      state.enemyUnits = [];
      historyStack = [];
      state.selectedNodeId = null;
      ensureNodeSelection();

      // 6) 로그
      const secLabel = `${battle.sectorId}`;
      if (victory) {
        const rewardText = rewards.map(r => r.type === 'gold' ? `+${scaleIncomeWithRelics(r.amount)}G` : r.type === 'rewinder' ? `리와인더 +${r.amount}` : `${r.type} +${r.amount}`).join(', ');
        addLog(`🚩 [작전 완수] ${battle.nodeId} (${secLabel}) 클리어 — 보상: ${rewardText || '없음'} · 다음 노드: ${unlockedNodes.join(', ') || '없음'}`, 'gold');
        if (casualties.length) addLog(`🕯️ [사상자] ${casualties.map(c => c.name).join(', ')}`, 'warning');
        if (secured) {
          const name = REGIONS[secured.regionId].title.ko;
          const opened = secured.unlocked.map(id => getRegionName(id)).join(', ');
          addLog(secured.final
            ? `🏆 [작전 완수] 최종 구역 ${name}을(를) 확보했습니다! 대륙 평정.`
            : `🏴 [구역 확보] ${name} — 새로 열린 구역: ${opened || '없음'}`, 'gold');
          if (typeof window.UI?.showToast === 'function') window.UI.showToast(secured.final ? '🏆 대륙 평정!' : `🏴 ${name} 확보!`, 'success');
        } else if (runWon) {
          addLog(`🏆 [런 클리어] 보스를 격파했습니다! (seed ${run.seed})`, 'gold');
          if (typeof window.UI?.showToast === 'function') window.UI.showToast('🏆 런 클리어! 보스를 격파했습니다.', 'success');
        }
      } else if (reason === 'retreat') {
        addLog(`🏳️ [전술 후퇴] ${battle.nodeId} (${secLabel}) 전장에서 이탈했습니다. 노드는 완료되지 않았습니다.`, 'warning');
      } else {
        addLog(`💀 [작전 실패] ${battle.nodeId} (${secLabel}) — ${reason}. 노드는 완료되지 않았습니다.`, 'danger');
      }

      // 7) 열려 있는 전투 관련 오버레이(일시정지/승리 모달) 정리 후 전략맵 복귀 + 플레이어 상태 저장
      if (window.UI && typeof window.UI.hidePauseOverlay === 'function') window.UI.hidePauseOverlay();
      const victoryModalEl = document.getElementById('modal-tactical-victory');
      if (victoryModalEl) { victoryModalEl.style.display = 'none'; victoryModalEl.classList.remove('active'); }
      const nextView = getIdleView();
      state.currentView = nextView;
      [window.playerState, window.gameState].forEach(o => { if (o) o.currentView = nextView; });
      switchGameView(nextView);
      saveGameState();
      // 7-1) 유물 보상 (보상 데이터를 불러온 뒤 지급하므로 비동기 — 보스는 3택1 창이 뜬다)
      if (victory && node) awardBattleRelics(battle, node);
      // 8) 2차: 생존 유닛 0이면 골드에 따라 사망회귀 / 긴급 모집 (회귀 판정은 여기와 긴급 모집 화면에서만 한다)
      finished.survival = resolveRunSurvival();
      return finished;
    }
    window.finishEncounter = finishEncounter;

    /**
     * 하위호환 래퍼: 승리 모달 버튼 / 후퇴 핸들러가 부르던 이름. 실제 처리는 finishEncounter()가 한다.
     * @param {boolean} [isVictory=true]
     */
    function completeTacticalStage(isVictory = true) {
      return finishEncounter({ victory: !!isVictory, retreated: !isVictory });
    }

    /**
     * 3. Tactical Retreat Handler
     * Handles player retreating mid-battle. Clears active battle flags,
     * triggers retreat notification, and invokes window.completeTacticalStage(false).
     */
    function executeTacticalRetreat() {
      // 1. Clear active battle flags on single source of truth
      if (state) {
        state.isCombatActive = false;
        state.isCombatPaused = false;
        state.savedTacticalState = null;
      }

      window.isCombatPaused = false;

      if (!window.playerState) {
        window.playerState = {};
      }
      window.playerState.isCombatPaused = false;
      window.playerState.savedTacticalState = null;

      if (window.gameState) {
        window.gameState.isCombatPaused = false;
        window.gameState.savedTacticalState = null;
      }

      // 2. Trigger minor retreat notification / status update
      const activeSectorId = (state && (state.selectedSectorId || (state.strategy && state.strategy.selectedSectorId) || state.currentSector)) || 'A-1';
      const retreatMsg = `🏳️ [전술적 후퇴] 섹터 [${activeSectorId}] 전장에서 안전하게 퇴각하여 전략 사령부로 복귀합니다.`;
      addLog(retreatMsg, 'warning');

      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(retreatMsg, 'warning');
      }

      // 3. Invokes window.completeTacticalStage(false) to return player directly to WORLD_STRATEGY
      if (typeof window.completeTacticalStage === 'function') {
        window.completeTacticalStage(false);
      } else {
        completeTacticalStage(false);
      }
    }

    // ============================================================================
    // UI Pause Overlay & World Strategy View Renderer Bindings
    // ============================================================================
    if (!window.UI) {
      window.UI = {};
    }

    if (typeof window.UI.showPauseOverlay !== 'function') {
      window.UI.showPauseOverlay = function () {
        let modal = document.getElementById('modal-tactical-pause');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'modal-tactical-pause';
          document.body.appendChild(modal);
        }

        modal.className = 'modal-backdrop modal-pause-overlay active';
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';

        const battle = state && state.currentBattle;
        const secId = (battle && battle.sectorId) || '?';
        const curSec = { id: secId, name: (battle && battle.sectorName) || '전술 작전 구역' };
        const turnNum = (state && state.turn) || 1;
        const livingPlayers = (state && state.playerUnits) ? state.playerUnits.filter(u => !u.isDead).length : 0;
        const livingEnemies = (state && state.enemyUnits) ? state.enemyUnits.filter(u => !u.isDead).length : 0;

        modal.innerHTML = `
          <div class="modal-window pause-modal-window" style="max-width: 400px; text-align: center; border-top: 3px solid #38bdf8; background: #0f172a; border-radius: 14px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.7);">
            <div style="font-size: 38px; margin-bottom: 6px;">⏸️</div>
            <h2 style="font-size: 18px; font-weight: 900; color: #f8fafc; margin: 0 0 4px 0;">전술 전투 일시 정지</h2>
            <div style="font-size: 11px; font-weight: 700; color: #38bdf8; letter-spacing: 1px; margin-bottom: 14px;">TACTICAL COMBAT PAUSED</div>

            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; border-radius: 10px; padding: 12px; margin-bottom: 16px; text-align: left; font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">📍 작전 구역:</span>
                <strong style="color: #f1f5f9;">[${curSec.id}] ${curSec.name}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">⏳ 진행 턴수:</span>
                <strong style="color: #38bdf8;">Turn ${turnNum}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">🛡️ 아군 잔존 부대:</span>
                <strong style="color: #22c55e;">${livingPlayers}기 생존</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">👾 적군 잔존 병력:</span>
                <strong style="color: #ef4444;">${livingEnemies}기 대치 중</strong>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-pause-resume" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: 1.5px solid #38bdf8; border-radius: 10px; font-size: 13px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>▶️ 전투 재개 (Resume Combat)</span>
              </button>
              <button id="btn-pause-retreat" style="width: 100%; padding: 10px; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid #ef4444; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>🏳️ 전술적 후퇴 (Tactical Retreat)</span>
              </button>
            </div>
          </div>
        `;

        const btnResume = document.getElementById('btn-pause-resume');
        if (btnResume) {
          btnResume.onclick = () => {
            if (typeof window.resumeTacticalCombat === 'function') {
              window.resumeTacticalCombat();
            }
          };
        }

        const btnRetreat = document.getElementById('btn-pause-retreat');
        if (btnRetreat) {
          btnRetreat.onclick = () => {
            if (confirm('전술 전장에서 후퇴하시겠습니까? (현재 전투 상태는 종료되고 전략 사령부로 복귀합니다.)')) {
              if (typeof window.executeTacticalRetreat === 'function') {
                window.executeTacticalRetreat();
              } else if (typeof window.completeTacticalStage === 'function') {
                window.completeTacticalStage(false);
              }
            }
          };
        }
      };
    }

    if (typeof window.UI.hidePauseOverlay !== 'function') {
      window.UI.hidePauseOverlay = function () {
        const modal = document.getElementById('modal-tactical-pause');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
      };
    }

    if (typeof window.UI.renderWorldStrategyView !== 'function') {
      window.UI.renderWorldStrategyView = function () {
        if (typeof switchGameView === 'function') {
          switchGameView('STRATEGY');
        }
        if (typeof renderStrategyView === 'function') {
          renderStrategyView();
        }
      };
    }

    // ============================================================================
    // Global Navigation & Combat Lifecycle Attachments
    // ============================================================================
    window.openTacticalPauseMenu = openTacticalPauseMenu;
    window.resumeTacticalCombat = resumeTacticalCombat;
    window.completeTacticalStage = completeTacticalStage;
    window.executeTacticalRetreat = executeTacticalRetreat;
    window.showPauseOverlay = window.UI.showPauseOverlay;
    window.hidePauseOverlay = window.UI.hidePauseOverlay;
    window.renderWorldStrategyView = window.UI.renderWorldStrategyView;

