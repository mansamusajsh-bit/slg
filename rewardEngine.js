/**
 * rewardEngine.js — 보상 풀(RewardPool) / 유물(Relic) / 아이템(Item) 데이터 구조, 검증, 뽑기
 *
 * 순수 로직 모듈이다. DOM, 게임 state, DB를 모른다. (runEngine.js와 같은 규칙)
 *   - 뽑기는 Math.random()을 쓰지 않는다. 호출자가 넘긴 rng(SeedEngine.createRNG(seed))만 쓴다.
 *   - 에디터(editors/*.js)와 이후 finishEncounter()/Encounter 생성이 같은 함수를 그대로 호출한다.
 *
 * 데이터 구조 (Supabase slg_records, collection_name 별)
 *   rewardPools/{id}: { id, name, rolls, allowDuplicates, entries: RewardEntry[] }
 *     RewardEntry:
 *       { type:'gold',    min, max, weight }
 *       { type:'item',    id | pool, weight }
 *       { type:'relic',   kind:'commander'|'gift', id | pool, weight }
 *       { type:'recruit', id | pool, weight }            // id = characters 컬렉션의 캐릭터 id
 *     - id(특정 대상)와 pool(하위 풀에서 1번 다시 뽑기) 중 정확히 하나만 쓴다.
 *     - 하위 풀의 entry는 모두 부모 entry와 같은 type(relic이면 같은 kind)이어야 한다.
 *   relics/{id}: { id, name, kind:'commander'|'gift', rarity, description, imageUrl?, effects:[{ scope, stat, value }] }
 *     - gift는 scope가 항상 'self'. commander는 'army' | 'battle' | 'run'.
 *   items/{id}:  { id, name, description, category?, rarity?, imageUrl? }   (category: ITEM_CATEGORIES)
 *
 * 노출: window.RewardEngine (브라우저), 전역 RewardEngine (node vm 테스트)
 */
(function (global) {
  'use strict';

  const COLLECTIONS = Object.freeze({
    rewardPools: 'rewardPools',
    relics: 'relics',
    items: 'items',
    characters: 'characters'
  });

  const ENTRY_TYPES = Object.freeze(['gold', 'item', 'relic', 'recruit']);
  const RELIC_KINDS = Object.freeze(['commander', 'gift']);
  const RELIC_RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary']);
  const RELIC_SCOPES = Object.freeze({
    gift: Object.freeze(['self']),
    commander: Object.freeze(['army', 'battle', 'run'])
  });
  // 유물 효과 어휘. 값의 의미(단위)는 RELIC_STAT_LABELS에 적는다.
  // 게임에서의 적용 (game.js):
  //  - 지휘관 유물(장착한 것만): 통솔력(leadership/deploySlots), 군 전체 atk/def, 전투 중 ap/mobility, hp(= 전투 시작 보호막),
  //    critRate/evasion/lifesteal/counterDmg/terrainDef/range/regen/shield/firstTurnAp/healAfterBattle/skillCooldown/expGain/spGain,
  //    goldGain/shopDiscount/affection(승리 시)/rewinder(획득 시 1회)
  //  - 선물 유물: atk/def/hp/ap/mobility/affection은 선물할 때 능력치에 더하고, 나머지는 받은 캐릭터가 전투에서 적용한다.
  //    (goldGain/shopDiscount/rewinder/leadership/deploySlots는 군 전체 효과라 선물 유물에서는 쓰이지 않는다)
  const RELIC_STAT_LABELS = Object.freeze({
    atk: '공격력 (+)', def: '방어력 (+)', hp: '최대 HP (+)', mobility: '이동력 (+)', ap: '행동력 AP (+)',
    critRate: '치명타율 (%p)', evasion: '회피율 (%p)', lifesteal: '흡혈 (피해의 %)', counterDmg: '반격 피해 (%)',
    terrainDef: '지형 방어 보너스 (%p)', range: '사거리 (+칸)', regen: '턴 시작 HP 회복 (+)', shield: '전투 시작 보호막 (+)',
    firstTurnAp: '첫 턴 추가 AP (+)', healAfterBattle: '전투 후 HP 회복 (최대 HP의 %)', skillCooldown: '스킬 재사용 대기 (턴, 음수=감소)',
    goldGain: '골드 획득 (%)', expGain: '경험치 획득 (%)', spGain: '승리 시 SP (+)', affection: '호감도 (+)',
    shopDiscount: '상점 할인 (%)', leadership: '통솔력 (+출전 인원)', rewinder: '시공간 리와인더 (+개)', deploySlots: '출전 슬롯 (+, 통솔력과 같음)'
  });
  const RELIC_STATS = Object.freeze(Object.keys(RELIC_STAT_LABELS));
  const ITEM_CATEGORIES = Object.freeze({
    consumable: '소모품', material: '강화 재료', gift: '선물(호감도)', book: '교본(SP)', key: '열쇠·특수'
  });

  // 레코드 id = slg_records.record_id. 영문/숫자/_/- 만 허용한다.
  const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

  const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
  const isInt = (v) => isFiniteNumber(v) && Math.floor(v) === v;
  const hasValue = (v) => v !== undefined && v !== null && v !== '';

  /** 배열/객체/Map 어떤 형태로 와도 id → 레코드 Map으로 맞춘다. */
  function toMap(source) {
    if (!source) return new Map();
    if (source instanceof Map) return source;
    if (Array.isArray(source)) return new Map(source.filter(x => x && hasValue(x.id)).map(x => [String(x.id), x]));
    return new Map(Object.entries(source));
  }

  /** 이미지는 업로드된 URL(http/https)만 저장한다. base64(data:)는 DB를 무겁게 하므로 받지 않는다. */
  function validateImageUrl(r, url) {
    if (!hasValue(url)) return;
    if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) {
      r.error(null, 'imageUrl', '이미지는 http(s) URL이어야 합니다. 파일은 업로드 버튼으로 올리세요.');
    }
  }

  function validateId(id, label = 'id') {
    if (!hasValue(id)) return `${label}가 비어 있습니다.`;
    if (!ID_PATTERN.test(String(id))) return `${label} "${id}"는 영문/숫자/_/- 만 쓸 수 있습니다 (최대 64자).`;
    return null;
  }

  // ==========================================================================
  // 1. 정규화 (에디터 입력값 → 저장 형태)
  // ==========================================================================

  /** entry를 type에 맞는 필드만 남긴 형태로 만든다. 값 보정(기본값 채우기)은 하지 않는다. */
  function normalizeEntry(raw) {
    const e = raw || {};
    const out = { type: e.type, weight: e.weight };
    if (e.type === 'gold') {
      out.min = e.min;
      out.max = e.max;
      return out;
    }
    if (e.type === 'relic') out.kind = e.kind;
    if (hasValue(e.pool)) out.pool = e.pool;
    else out.id = e.id;
    return out;
  }

  function normalizeRewardPool(raw) {
    const p = raw || {};
    return {
      id: p.id,
      name: p.name,
      rolls: p.rolls,
      allowDuplicates: p.allowDuplicates,
      entries: Array.isArray(p.entries) ? p.entries.map(normalizeEntry) : p.entries
    };
  }

  // 출격 AP가 없어지면서 지휘 AP 효과(commanderAP)는 통솔력(leadership)이 됐다. 예전 레코드도 같은 효과로 읽는다.
  const LEGACY_RELIC_STATS = Object.freeze({ commanderAP: 'leadership' });

  function normalizeRelic(raw) {
    const r = raw || {};
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      rarity: r.rarity,
      description: r.description ?? '',
      ...(hasValue(r.imageUrl) ? { imageUrl: r.imageUrl } : {}),
      effects: Array.isArray(r.effects)
        ? r.effects.map(fx => ({ scope: fx?.scope, stat: LEGACY_RELIC_STATS[fx?.stat] || fx?.stat, value: fx?.value }))
        : r.effects
    };
  }

  function normalizeItem(raw) {
    const it = raw || {};
    const out = { id: it.id, name: it.name, description: it.description ?? '' };
    // category/rarity는 선택 항목 (예전에 만든 아이템에는 없을 수 있음)
    if (hasValue(it.category)) out.category = it.category;
    if (hasValue(it.rarity)) out.rarity = it.rarity;
    if (hasValue(it.imageUrl)) out.imageUrl = it.imageUrl;
    return out;
  }

  // ==========================================================================
  // 2. 검증
  //    결과: { valid, errors: [{ entryIndex, field, message }], warnings: [...] }
  //    entryIndex가 null이면 풀 전체에 대한 오류다.
  // ==========================================================================

  function makeReport() {
    const errors = [];
    const warnings = [];
    return {
      errors,
      warnings,
      error(entryIndex, field, message) { errors.push({ entryIndex, field, message }); },
      warn(entryIndex, field, message) { warnings.push({ entryIndex, field, message }); },
      done() { return { valid: errors.length === 0, errors, warnings }; }
    };
  }

  /**
   * 풀 참조 그래프에서 순환을 찾는다. pools에는 편집 중인 풀이 최신 상태로 들어 있어야 한다.
   * @returns {string[]|null} 순환 경로 (예: ['A', 'B', 'A']) 또는 null
   */
  function findPoolCycle(startId, pools) {
    const map = toMap(pools);
    const visiting = new Set();
    const done = new Set();
    const path = [];
    function dfs(id) {
      if (visiting.has(id)) return [...path.slice(path.indexOf(id)), id];
      if (done.has(id)) return null;
      const pool = map.get(id);
      if (!pool) return null; // 없는 풀은 순환이 아니라 '존재하지 않는 참조' 오류로 따로 잡는다.
      visiting.add(id);
      path.push(id);
      for (const entry of (Array.isArray(pool.entries) ? pool.entries : [])) {
        if (entry && hasValue(entry.pool)) {
          const found = dfs(String(entry.pool));
          if (found) return found;
        }
      }
      path.pop();
      visiting.delete(id);
      done.add(id);
      return null;
    }
    return dfs(String(startId));
  }

  /** 하위 풀이 부모 entry의 type(relic이면 kind)과 맞는지 */
  function subPoolMismatch(parentEntry, subPool) {
    const entries = Array.isArray(subPool?.entries) ? subPool.entries : [];
    const bad = entries.find(se => !se || se.type !== parentEntry.type
      || (parentEntry.type === 'relic' && se.kind !== parentEntry.kind));
    if (!bad) return null;
    const want = parentEntry.type === 'relic' ? `relic(${parentEntry.kind})` : parentEntry.type;
    const got = bad?.type === 'relic' ? `relic(${bad.kind})` : String(bad?.type);
    return `하위 풀 "${subPool.id}"에 ${want}가 아닌 항목(${got})이 있습니다.`;
  }

  /**
   * @param {object} pool 편집 중인 풀
   * @param {{pools?, relics?, items?, characters?}} catalog 실제 데이터 목록 (배열/객체/Map)
   *        pools에는 저장된 풀 목록을 넘기면 된다. 편집 중인 풀은 자동으로 최신값으로 덮어쓴다.
   */
  function validateRewardPool(pool, catalog = {}) {
    const r = makeReport();
    const p = pool || {};

    const idErr = validateId(p.id, '풀 id');
    if (idErr) r.error(null, 'id', idErr);
    if (!hasValue(p.name) || !String(p.name).trim()) r.error(null, 'name', '이름이 비어 있습니다.');
    if (!isInt(p.rolls) || p.rolls < 1) r.error(null, 'rolls', `rolls는 1 이상의 정수여야 합니다. (현재: ${p.rolls})`);
    if (typeof p.allowDuplicates !== 'boolean') r.error(null, 'allowDuplicates', 'allowDuplicates는 true/false여야 합니다.');

    const entries = Array.isArray(p.entries) ? p.entries : null;
    if (!entries || entries.length === 0) {
      r.error(null, 'entries', 'entries가 비어 있습니다. 항목을 1개 이상 추가하세요.');
      return r.done();
    }

    const pools = new Map(toMap(catalog.pools));
    if (hasValue(p.id)) pools.set(String(p.id), p);
    const relics = toMap(catalog.relics);
    const items = toMap(catalog.items);
    const characters = toMap(catalog.characters);

    entries.forEach((e, i) => {
      if (!e || typeof e !== 'object') { r.error(i, 'type', '항목이 비어 있습니다.'); return; }
      if (!ENTRY_TYPES.includes(e.type)) { r.error(i, 'type', `알 수 없는 type "${e.type}"`); return; }
      if (!isFiniteNumber(e.weight) || e.weight <= 0) r.error(i, 'weight', `weight는 0보다 큰 숫자여야 합니다. (현재: ${e.weight})`);

      if (e.type === 'gold') {
        if (!isInt(e.min) || e.min < 0) r.error(i, 'min', `min은 0 이상의 정수여야 합니다. (현재: ${e.min})`);
        if (!isInt(e.max) || e.max < 0) r.error(i, 'max', `max는 0 이상의 정수여야 합니다. (현재: ${e.max})`);
        if (isInt(e.min) && isInt(e.max) && e.min > e.max) r.error(i, 'max', `min(${e.min})이 max(${e.max})보다 큽니다.`);
        if (hasValue(e.id) || hasValue(e.pool)) r.error(i, 'id', 'gold 항목에는 id/pool을 쓸 수 없습니다.');
        return;
      }

      if (e.type === 'relic' && !RELIC_KINDS.includes(e.kind)) r.error(i, 'kind', `relic kind는 commander 또는 gift여야 합니다. (현재: ${e.kind})`);

      const hasId = hasValue(e.id);
      const hasPool = hasValue(e.pool);
      if (hasId === hasPool) {
        r.error(i, hasId ? 'pool' : 'id', 'id(특정 대상)와 pool(하위 풀) 중 정확히 하나만 선택해야 합니다.');
        return;
      }

      if (hasPool) {
        const sub = pools.get(String(e.pool));
        if (!sub) { r.error(i, 'pool', `존재하지 않는 풀 "${e.pool}"을 참조합니다.`); return; }
        if (String(e.pool) === String(p.id)) { r.error(i, 'pool', '자기 자신을 하위 풀로 참조할 수 없습니다.'); return; }
        const mismatch = subPoolMismatch(e, sub);
        if (mismatch) r.error(i, 'pool', mismatch);
        return;
      }

      const id = String(e.id);
      if (e.type === 'item' && !items.has(id)) r.error(i, 'id', `존재하지 않는 아이템 "${id}"`);
      if (e.type === 'recruit' && !characters.has(id)) r.error(i, 'id', `존재하지 않는 캐릭터 "${id}"`);
      if (e.type === 'relic') {
        const relic = relics.get(id);
        if (!relic) r.error(i, 'id', `존재하지 않는 유물 "${id}"`);
        else if (relic.kind !== e.kind) r.error(i, 'id', `유물 "${id}"의 kind는 ${relic.kind}인데 entry kind는 ${e.kind}입니다.`);
      }
    });

    if (hasValue(p.id)) {
      const cycle = findPoolCycle(String(p.id), pools);
      if (cycle) {
        const idx = entries.findIndex(e => e && String(e.pool) === cycle[1]);
        r.error(idx >= 0 ? idx : null, 'pool', `순환 참조: ${cycle.join(' → ')}`);
      }
    }

    // 경고(저장은 막지 않음): 중복 금지인데 뽑기 횟수가 항목 수보다 많음
    if (p.allowDuplicates === false && isInt(p.rolls) && p.rolls > entries.length) {
      r.warn(null, 'rolls', `중복 금지 상태에서 rolls(${p.rolls})가 항목 수(${entries.length})보다 많아 일부 뽑기는 빈 결과가 됩니다.`);
    }
    return r.done();
  }

  function validateRelic(relic) {
    const r = makeReport();
    const x = relic || {};
    const idErr = validateId(x.id, '유물 id');
    if (idErr) r.error(null, 'id', idErr);
    if (!hasValue(x.name) || !String(x.name).trim()) r.error(null, 'name', '이름이 비어 있습니다.');
    if (!RELIC_KINDS.includes(x.kind)) r.error(null, 'kind', `kind는 commander 또는 gift여야 합니다. (현재: ${x.kind})`);
    if (!RELIC_RARITIES.includes(x.rarity)) r.error(null, 'rarity', `rarity는 ${RELIC_RARITIES.join('/')} 중 하나여야 합니다. (현재: ${x.rarity})`);
    if (x.description != null && typeof x.description !== 'string') r.error(null, 'description', '설명은 문자열이어야 합니다.');
    validateImageUrl(r, x.imageUrl);
    if (!Array.isArray(x.effects) || x.effects.length === 0) {
      r.error(null, 'effects', '효과(effects)를 1개 이상 추가하세요.');
      return r.done();
    }
    const scopes = RELIC_SCOPES[x.kind] || [];
    x.effects.forEach((fx, i) => {
      if (!fx || typeof fx !== 'object') { r.error(i, 'scope', '효과가 비어 있습니다.'); return; }
      if (!scopes.includes(fx.scope)) r.error(i, 'scope', `${x.kind} 유물의 scope는 ${scopes.join('/') || '(kind 먼저 선택)'} 중 하나여야 합니다. (현재: ${fx.scope})`);
      if (!RELIC_STATS.includes(fx.stat)) r.error(i, 'stat', `알 수 없는 stat "${fx.stat}"`);
      if (!isFiniteNumber(fx.value) || fx.value === 0) r.error(i, 'value', `value는 0이 아닌 숫자여야 합니다. (현재: ${fx.value})`);
    });
    return r.done();
  }

  function validateItem(item) {
    const r = makeReport();
    const x = item || {};
    const idErr = validateId(x.id, '아이템 id');
    if (idErr) r.error(null, 'id', idErr);
    if (!hasValue(x.name) || !String(x.name).trim()) r.error(null, 'name', '이름이 비어 있습니다.');
    if (x.description != null && typeof x.description !== 'string') r.error(null, 'description', '설명은 문자열이어야 합니다.');
    if (hasValue(x.category) && !ITEM_CATEGORIES[x.category]) r.error(null, 'category', `알 수 없는 분류 "${x.category}"`);
    if (hasValue(x.rarity) && !RELIC_RARITIES.includes(x.rarity)) r.error(null, 'rarity', `rarity는 ${RELIC_RARITIES.join('/')} 중 하나여야 합니다.`);
    validateImageUrl(r, x.imageUrl);
    return r.done();
  }

  /**
   * 어떤 레코드를 참조하는 풀 목록 (삭제 전 확인용).
   * @param {'pool'|'relic'|'item'|'recruit'} refType
   * @returns {Array<{poolId:string, entryIndex:number}>}
   */
  function findReferences(refType, refId, pools) {
    const out = [];
    for (const pool of toMap(pools).values()) {
      (Array.isArray(pool?.entries) ? pool.entries : []).forEach((e, i) => {
        if (!e) return;
        const hit = refType === 'pool'
          ? String(e.pool) === String(refId)
          : (e.type === refType && hasValue(e.id) && String(e.id) === String(refId));
        if (hit) out.push({ poolId: String(pool.id), entryIndex: i });
      });
    }
    return out;
  }

  // ==========================================================================
  // 3. 뽑기 (순수 함수)
  // ==========================================================================

  function toRngFn(rng) {
    if (typeof rng === 'function') return rng;
    if (rng && typeof rng.next === 'function') return () => rng.next();
    throw new Error('rollRewardPool: rng는 0~1 난수를 돌려주는 함수(SeedEngine.createRNG(seed))여야 합니다.');
  }

  /** 결과 보상의 고유 키. 중복 판정과 시뮬레이션 집계에 쓴다. */
  function rewardKey(reward) {
    if (!reward) return '';
    if (reward.type === 'gold') return 'gold';
    if (reward.type === 'relic') return `relic:${reward.kind}:${reward.id}`;
    return `${reward.type}:${reward.id}`;
  }

  /**
   * 보상 풀을 굴린다.
   *
   * @param {object} pool RewardPool
   * @param {function():number} rng 0~1 난수 함수. 반드시 seed 기반이어야 한다.
   * @param {object} [context]
   * @param {object|Array|Map} [context.pools] 하위 풀(pool 참조)을 찾을 풀 목록. 참조가 있는데 없으면 throw.
   * @param {string[]} [context.ownedCommanderRelicIds] 이미 보유한 지휘관 유물 id. 후보에서 제외한다.
   * @returns {Array<{type:string, amount?:number, id?:string, kind?:string, entryIndex:number, viaPool?:string[]}>}
   *   후보가 모두 제외되어 더 뽑을 수 없으면 rolls보다 적은 수가 나올 수 있다.
   *
   * 규칙
   *   - rolls번 뽑는다. 매번 남은 후보의 weight 합계로 1개를 고른다.
   *   - allowDuplicates=false: 같은 entry를 두 번 고르지 않고, 같은 보상(같은 유물/아이템/캐릭터)도 두 번 나오지 않는다.
   *   - pool entry는 하위 풀에서 1번 더 뽑는다 (하위 풀의 rolls는 무시). 하위 풀도 같은 제외 규칙을 따른다.
   *   - 보유한 지휘관 유물은 항상 제외한다.
   *   - 난수 소비: 뽑기 1회당 1번(+ pool 단계마다 1번, gold는 금액 결정에 1번 더).
   */
  function rollRewardPool(pool, rng, context = {}) {
    const next = toRngFn(rng);
    if (!pool || !Array.isArray(pool.entries)) throw new Error('rollRewardPool: 올바른 보상 풀이 아닙니다.');
    const rolls = Number(pool.rolls);
    if (!isInt(rolls) || rolls < 1) throw new Error(`rollRewardPool: 풀 "${pool.id}"의 rolls가 올바르지 않습니다.`);

    const pools = toMap(context.pools);
    const owned = new Set((context.ownedCommanderRelicIds || []).map(String));
    const allowDup = pool.allowDuplicates === true;
    const usedEntries = new Set();
    const usedKeys = new Set();

    const getSubPool = (id, chain) => {
      if (chain.includes(String(id))) throw new Error(`rollRewardPool: 순환 참조 ${[...chain, id].join(' → ')}`);
      const sub = pools.get(String(id));
      if (!sub) throw new Error(`rollRewardPool: 하위 풀 "${id}"을 찾을 수 없습니다. context.pools에 넣어 주세요.`);
      return sub;
    };

    // entry 하나가 지금 결과를 낼 수 있는지 (pool이면 하위 풀에 후보가 남아 있는지)
    function leafAvailable(e) {
      if (e.type === 'gold') return allowDup || !usedKeys.has('gold');
      if (e.type === 'relic' && e.kind === 'commander' && owned.has(String(e.id))) return false;
      return allowDup || !usedKeys.has(rewardKey({ type: e.type, kind: e.kind, id: String(e.id) }));
    }
    function entryAvailable(e, chain) {
      if (!e || !(Number(e.weight) > 0)) return false;
      if (!hasValue(e.pool)) return leafAvailable(e);
      const sub = getSubPool(e.pool, chain);
      const subChain = [...chain, String(e.pool)];
      return sub.entries.some(se => entryAvailable(se, subChain));
    }

    function pick(candidates) {
      const total = candidates.reduce((s, c) => s + Number(c.entry.weight), 0);
      let r = next() * total;
      for (const c of candidates) {
        r -= Number(c.entry.weight);
        if (r < 0) return c;
      }
      return candidates[candidates.length - 1];
    }

    function resolve(e, chain) {
      if (hasValue(e.pool)) {
        const sub = getSubPool(e.pool, chain);
        const subChain = [...chain, String(e.pool)];
        const candidates = sub.entries
          .map((entry, index) => ({ entry, index }))
          .filter(c => entryAvailable(c.entry, subChain));
        const chosen = pick(candidates);
        const res = resolve(chosen.entry, subChain);
        res.viaPool = [String(e.pool), ...(res.viaPool || [])];
        return res;
      }
      if (e.type === 'gold') {
        const min = Number(e.min), max = Number(e.max);
        return { type: 'gold', amount: min + Math.floor(next() * (max - min + 1)) };
      }
      if (e.type === 'relic') return { type: 'relic', kind: e.kind, id: String(e.id) };
      return { type: e.type, id: String(e.id) };
    }

    const rootChain = [String(pool.id)];
    const results = [];
    for (let n = 0; n < rolls; n++) {
      const candidates = pool.entries
        .map((entry, index) => ({ entry, index }))
        .filter(c => (allowDup || !usedEntries.has(c.index)) && entryAvailable(c.entry, rootChain));
      if (candidates.length === 0) break;
      const chosen = pick(candidates);
      const reward = resolve(chosen.entry, rootChain);
      reward.entryIndex = chosen.index;
      usedEntries.add(chosen.index);
      usedKeys.add(rewardKey(reward));
      results.push(reward);
    }
    return results;
  }

  /**
   * 같은 rng로 rollRewardPool을 times번 돌려 분포를 집계한다. (에디터 시뮬레이션 패널용, 순수 함수)
   * @returns {{ times, totalRewards, emptyRolls, rows: Array<{key, type, id?, kind?, count, perRun, share, goldTotal?}> }}
   */
  function simulateRewardPool(pool, rng, times, context = {}) {
    const next = toRngFn(rng);
    const n = Math.max(0, Math.floor(Number(times) || 0));
    const rows = new Map();
    let totalRewards = 0;
    let emptyRolls = 0;
    const expected = Number(pool?.rolls) || 0;
    for (let i = 0; i < n; i++) {
      const res = rollRewardPool(pool, next, context);
      if (res.length < expected) emptyRolls += expected - res.length;
      for (const reward of res) {
        const key = rewardKey(reward);
        let row = rows.get(key);
        if (!row) {
          row = { key, type: reward.type, id: reward.id, kind: reward.kind, count: 0 };
          if (reward.type === 'gold') { row.goldTotal = 0; row.goldMin = Infinity; row.goldMax = -Infinity; }
          rows.set(key, row);
        }
        row.count++;
        if (reward.type === 'gold') {
          row.goldTotal += reward.amount;
          row.goldMin = Math.min(row.goldMin, reward.amount);
          row.goldMax = Math.max(row.goldMax, reward.amount);
        }
        totalRewards++;
      }
    }
    const list = [...rows.values()]
      .map(row => ({ ...row, perRun: n ? row.count / n : 0, share: totalRewards ? row.count / totalRewards : 0 }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return { times: n, totalRewards, emptyRolls, rows: list };
  }

  /** 각 entry의 1회 뽑기 기준 확률(%) — weight 합계 기준. weight가 잘못된 항목은 0으로 본다. */
  function entryProbabilities(entries) {
    const weights = (Array.isArray(entries) ? entries : []).map(e => (isFiniteNumber(e?.weight) && e.weight > 0 ? e.weight : 0));
    const total = weights.reduce((s, w) => s + w, 0);
    return weights.map(w => (total > 0 ? (w / total) * 100 : 0));
  }

  const RewardEngine = {
    COLLECTIONS,
    ENTRY_TYPES,
    RELIC_KINDS,
    RELIC_RARITIES,
    RELIC_SCOPES,
    RELIC_STATS,
    RELIC_STAT_LABELS,
    ITEM_CATEGORIES,
    RARITIES: RELIC_RARITIES,
    ID_PATTERN,
    normalizeEntry,
    normalizeRewardPool,
    normalizeRelic,
    normalizeItem,
    validateRewardPool,
    validateRelic,
    validateItem,
    findPoolCycle,
    findReferences,
    rollRewardPool,
    simulateRewardPool,
    entryProbabilities,
    rewardKey
  };

  global.RewardEngine = RewardEngine;
})(typeof window !== 'undefined' ? window : globalThis);
