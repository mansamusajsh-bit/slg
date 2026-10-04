/**
 * runEngine.js — 11~13단계: 로그라이크 런(Run) / 노드 그래프 / 전투 결과 반영
 * ==========================================================================
 *
 * 역할 분리 (이 파일이 지키는 규칙):
 *   - 노드(Node)는 { id, type, sectorId, next } 만 가진다. 타일/적/맵 데이터는 절대 들고 있지 않다.
 *     전술 맵은 전투에 "진입하는 순간" enterEncounter()가 sectorId → 템플릿 → seed → BattleMap 순으로 만든다.
 *   - 이 파일은 게임 state / DOM 을 모른다. 전부 순수 함수라서 Node.js 에서도 그대로 테스트된다.
 *     (state 갱신, 골드 지급, 화면 전환은 game.js 의 finishEncounter()가 맡는다.)
 *   - 같은 (runSeed, sectors) 는 항상 같은 노드 그래프를 만든다 (SeedEngine RNG 사용, Math.random 금지).
 *
 * 데이터 구조
 *
 *   Node = { id:"A-1-003", type:"battle"|"elite"|"event"|"shop"|"boss", sectorId:"A-1", next:["A-2-005", ...] }
 *
 *   RoguelikeRun = {
 *     id, seed, status: "active"|"won"|"lost",
 *     currentNodeId,              // 마지막으로 완료한 노드 (아직 없으면 null)
 *     completedNodes: [nodeId],
 *     mapState: { layers:[[nodeId]], nodes:[Node] },
 *     encounters: [ {encounterId,nodeId,sectorId,type,seed,templateId,victory,finishedAt} ]  // 끝난 전투 요약
 *   }
 *
 * 노드 해금 규칙 (Slay-the-Spire 방식):
 *   - 아직 아무 노드도 완료하지 않았다면 → 첫 층(layer 0) 노드가 열려 있다.
 *   - 그 외에는 → currentNode.next 중 아직 완료하지 않은 노드만 열려 있다.
 *   (같은 층의 다른 갈래는 자동으로 닫힌다 — 경로 선택이 의미를 갖는다.)
 *
 * 노출: window.RunEngine
 */
(function (global) {
  'use strict';

  const BATTLE_TYPES = ['battle', 'elite', 'boss'];
  const NODE_TYPES = ['battle', 'elite', 'event', 'shop', 'boss'];
  const DIFFICULTY_RANK = { EASY: 0, NORMAL: 1, HARD: 2, NIGHTMARE: 3 };

  // 층 구성: 시작(1) → 분기 → … → 보스(1). 각 숫자는 그 층의 노드 수.
  const DEFAULT_LAYER_SIZES = [1, 3, 3, 3, 3, 2, 1];

  const NODE_META = {
    battle: { icon: '⚔️', label: '전투' },
    elite: { icon: '💀', label: '정예' },
    event: { icon: '❓', label: '이벤트' },
    shop: { icon: '🛒', label: '상점' },
    boss: { icon: '👑', label: '보스' }
  };

  function isBattleType(type) {
    return BATTLE_TYPES.includes(type);
  }

  function rngFor(seed, salt) {
    if (!global.SeedEngine) throw new Error('[RunEngine] SeedEngine이 필요합니다 (seedEngine.js를 먼저 로드하세요).');
    return global.SeedEngine.createRNG(`${seed}|${salt}`);
  }

  function rangeInt(rng, min, max) {
    if (max <= min) return min;
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  // ==========================================================================
  // 1. 그래프 생성
  // ==========================================================================

  /**
   * 난이도 순(EASY → NIGHTMARE)으로 섹터 id를 정렬한다. 난이도가 같으면 id 순(안정 정렬).
   * 에디터로 만든 커스텀 섹터도 난이도 필드만 있으면 그대로 섞여 들어간다.
   */
  function sortSectorIds(sectors) {
    const ids = Object.keys(sectors || {});
    return ids.sort((a, b) => {
      const ra = DIFFICULTY_RANK[String(sectors[a] && sectors[a].difficulty).toUpperCase()];
      const rb = DIFFICULTY_RANK[String(sectors[b] && sectors[b].difficulty).toUpperCase()];
      const da = ra === undefined ? 1 : ra;
      const db = rb === undefined ? 1 : rb;
      return da - db || (a < b ? -1 : a > b ? 1 : 0);
    });
  }

  /** 층 번호 → 그 층에서 쓸 섹터 id. 앞 층은 쉬운 섹터, 마지막 층(보스)은 가장 어려운 섹터. */
  function sectorForLayer(orderedIds, layerIndex, layerCount) {
    if (orderedIds.length === 0) return null;
    if (layerIndex === layerCount - 1) return orderedIds[orderedIds.length - 1];
    const ratio = layerCount <= 2 ? 0 : layerIndex / (layerCount - 1);
    const idx = Math.min(orderedIds.length - 1, Math.floor(ratio * orderedIds.length));
    return orderedIds[idx];
  }

  /** 섹터의 encounterPool 중 노드 타입으로 쓸 수 있는 것만 골라 한 개 뽑는다. */
  function pickNodeType(rng, sector, layerIndex, layerCount) {
    if (layerIndex === 0) return 'battle';                 // 시작 노드는 항상 전투
    if (layerIndex === layerCount - 1) return 'boss';      // 마지막 층은 항상 보스
    const pool = (sector && Array.isArray(sector.encounterPool) ? sector.encounterPool : [])
      .filter((t) => NODE_TYPES.includes(t) && t !== 'boss');
    const base = pool.length ? pool : ['battle', 'battle', 'event'];
    // 모든 섹터 풀에 상점/정예가 있는 건 아니므로, 중반 이후 층에서는 정예/상점이 나올 여지를 열어 둔다.
    const extra = [];
    if (layerIndex >= 2) extra.push('shop');
    if (layerIndex >= 3) extra.push('elite');
    const all = base.concat(extra);
    return all[Math.floor(rng() * all.length)];
  }

  /**
   * 노드 그래프를 만든다. 같은 (seed, sectors, layerSizes)는 항상 같은 결과.
   *
   * 배치 규칙: 첫 층은 전투, 마지막 층은 보스, 중간 층은 섹터의 encounterPool에서 뽑되 정예/상점은 한 층에 최대 1개.
   *
   * 연결 규칙: 층 i의 모든 노드는 층 i+1의 노드 1~2개로 이어지고,
   *            층 i+1의 모든 노드는 최소 한 개의 들어오는 간선을 가진다 (고립 노드 없음 = 항상 보스까지 도달 가능).
   *
   * @param {string} seed
   * @param {Object} sectors - WORLD_SECTORS 형태 { "A-1": {id,difficulty,encounterPool,...} }
   * @param {{layerSizes?:number[]}} [options]
   * @returns {{layers:string[][], nodes:Object[]}}
   */
  function generateRunMap(seed, sectors, options = {}) {
    const orderedIds = sortSectorIds(sectors);
    if (orderedIds.length === 0) throw new Error('[RunEngine] 섹터가 하나도 없어 런 맵을 만들 수 없습니다.');

    const layerSizes = Array.isArray(options.layerSizes) && options.layerSizes.length >= 2
      ? options.layerSizes.map((n) => Math.max(1, Math.floor(n)))
      : DEFAULT_LAYER_SIZES.slice();
    const layerCount = layerSizes.length;
    const rng = rngFor(seed, 'runmap');

    const nodes = [];
    const layers = [];
    let counter = 0;

    layerSizes.forEach((size, li) => {
      const sectorId = sectorForLayer(orderedIds, li, layerCount);
      const sector = sectors[sectorId];
      const layer = [];
      for (let i = 0; i < size; i++) {
        counter += 1;
        const id = `${sectorId}-${String(counter).padStart(3, '0')}`;
        nodes.push({ id, type: pickNodeType(rng, sector, li, layerCount), sectorId, next: [] });
        layer.push(id);
      }
      // 한 층에 정예/상점이 몰리면 선택의 의미가 없어지므로 종류별로 최대 1개만 둔다 (나머지는 일반 전투).
      ['elite', 'shop'].forEach((special) => {
        let seen = false;
        layer.forEach((id) => {
          const node = nodes.find((n) => n.id === id);
          if (node.type !== special) return;
          if (seen) node.type = 'battle';
          seen = true;
        });
      });
      layers.push(layer);
    });

    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    for (let li = 0; li < layerCount - 1; li++) {
      const cur = layers[li];
      const nxt = layers[li + 1];
      const hasIncoming = new Set();

      cur.forEach((id, idx) => {
        // 위치가 비슷한 노드끼리 이어지게 해서 선이 심하게 교차하지 않도록 한다.
        const center = cur.length === 1 ? (nxt.length - 1) / 2 : (idx / (cur.length - 1)) * (nxt.length - 1);
        const primary = Math.max(0, Math.min(nxt.length - 1, Math.round(center)));
        const targets = new Set([nxt[primary]]);
        if (nxt.length > 1 && rng() < 0.5) {
          const neighbor = Math.max(0, Math.min(nxt.length - 1, primary + (rng() < 0.5 ? -1 : 1)));
          targets.add(nxt[neighbor]);
        }
        byId[id].next = Array.from(targets);
        byId[id].next.forEach((t) => hasIncoming.add(t));
      });

      // 들어오는 간선이 없는 노드는 가장 가까운 윗층 노드에서 이어 준다.
      nxt.forEach((id, j) => {
        if (hasIncoming.has(id)) return;
        const srcIdx = cur.length === 1 ? 0 : Math.max(0, Math.min(cur.length - 1, Math.round((j / Math.max(1, nxt.length - 1)) * (cur.length - 1))));
        const src = byId[cur[srcIdx]];
        if (!src.next.includes(id)) src.next.push(id);
        hasIncoming.add(id);
      });
    }

    return { layers, nodes };
  }

  // ==========================================================================
  // 2. Run 생성 / 조회
  // ==========================================================================

  /**
   * 새 런. seed를 주지 않으면 새로 뽑는다 (이 경우에만 Math.random 사용 — SeedEngine.generateRandomSeed).
   * @returns {Object} RoguelikeRun
   */
  function createRun(sectors, seed = null, options = {}) {
    const runSeed = seed != null && String(seed) !== '' ? String(seed) : global.SeedEngine.generateRandomSeed('RUN');
    const mapState = generateRunMap(runSeed, sectors, options);
    return {
      id: `run-${runSeed}`,
      seed: runSeed,
      status: 'active',
      currentNodeId: null,
      completedNodes: [],
      mapState,
      encounters: []
    };
  }

  function getNode(run, nodeId) {
    if (!run || !run.mapState || !Array.isArray(run.mapState.nodes)) return null;
    const id = String(nodeId);
    return run.mapState.nodes.find((n) => n.id === id) || null;
  }

  /** 지금 들어갈 수 있는(해금된) 노드 목록. 런이 끝났으면 빈 배열. */
  function getAvailableNodes(run) {
    if (!run || run.status !== 'active' || !run.mapState) return [];
    const done = new Set(run.completedNodes || []);
    if (!run.currentNodeId) {
      return (run.mapState.layers[0] || []).map((id) => getNode(run, id)).filter((n) => n && !done.has(n.id));
    }
    const cur = getNode(run, run.currentNodeId);
    if (!cur) return [];
    return cur.next.map((id) => getNode(run, id)).filter((n) => n && !done.has(n.id));
  }

  function isNodeAvailable(run, nodeId) {
    return getAvailableNodes(run).some((n) => n.id === String(nodeId));
  }

  /** 'completed' | 'available' | 'locked' */
  function getNodeStatus(run, nodeId) {
    if (run && (run.completedNodes || []).includes(String(nodeId))) return 'completed';
    return isNodeAvailable(run, nodeId) ? 'available' : 'locked';
  }

  // ==========================================================================
  // 3. 전투/노드 결과 반영 (순수 함수 — run 객체만 바꾼다)
  // ==========================================================================

  /**
   * 노드를 완료 처리한다: completedNodes / currentNodeId 갱신, 보스면 런 승리.
   * @returns {{ok:boolean, reason?:string, unlockedNodes:string[], runWon:boolean}}
   */
  function completeNode(run, nodeId) {
    const node = getNode(run, nodeId);
    if (!node) return { ok: false, reason: `노드 '${nodeId}'를 찾을 수 없습니다.`, unlockedNodes: [], runWon: false };
    if (run.status !== 'active') return { ok: false, reason: `런이 이미 종료되었습니다 (${run.status}).`, unlockedNodes: [], runWon: false };
    if (run.completedNodes.includes(node.id)) return { ok: false, reason: '이미 완료한 노드입니다.', unlockedNodes: [], runWon: false };
    if (!isNodeAvailable(run, node.id)) return { ok: false, reason: `노드 '${node.id}'는 아직 해금되지 않았습니다.`, unlockedNodes: [], runWon: false };

    run.completedNodes.push(node.id);
    run.currentNodeId = node.id;

    let runWon = false;
    if (node.type === 'boss' || node.next.length === 0) {
      run.status = 'won';
      runWon = true;
    }
    return { ok: true, unlockedNodes: getAvailableNodes(run).map((n) => n.id), runWon };
  }

  /** 끝난 전투의 요약을 run.encounters에 남긴다 (맵/타일은 저장하지 않는다). */
  function recordEncounter(run, battle, victory, extra = {}) {
    const entry = {
      encounterId: battle.id,
      nodeId: battle.nodeId,
      sectorId: battle.sectorId,
      type: battle.type,
      seed: battle.seed,
      templateId: battle.templateId,
      victory: !!victory,
      finishedAt: new Date().toISOString(),
      ...extra
    };
    run.encounters.push(entry);
    return entry;
  }

  /** run 구조 검증 (세이브 로드 직후 사용). */
  function validateRun(run) {
    const errors = [];
    if (!run || typeof run !== 'object') return { valid: false, errors: ['run 객체가 아닙니다.'] };
    if (!run.seed) errors.push('seed 누락');
    if (!['active', 'won', 'lost'].includes(run.status)) errors.push('status 값 오류');
    if (!Array.isArray(run.completedNodes)) errors.push('completedNodes가 배열이 아닙니다.');
    if (!Array.isArray(run.encounters)) errors.push('encounters가 배열이 아닙니다.');
    const ms = run.mapState;
    if (!ms || !Array.isArray(ms.nodes) || !Array.isArray(ms.layers) || ms.nodes.length === 0) {
      errors.push('mapState(nodes/layers)가 비어 있습니다.');
    } else {
      const ids = new Set(ms.nodes.map((n) => n.id));
      ms.nodes.forEach((n) => {
        if (!n.id || !n.type || !n.sectorId) errors.push(`노드 필드 누락: ${JSON.stringify(n)}`);
        if ('tiles' in n || 'map' in n) errors.push(`노드 '${n.id}'가 전술 데이터를 들고 있습니다.`);
        (n.next || []).forEach((t) => { if (!ids.has(t)) errors.push(`노드 '${n.id}'의 next '${t}'가 존재하지 않습니다.`); });
      });
      (run.completedNodes || []).forEach((id) => { if (!ids.has(id)) errors.push(`completedNodes의 '${id}'가 존재하지 않습니다.`); });
      if (run.currentNodeId && !ids.has(run.currentNodeId)) errors.push('currentNodeId가 존재하지 않습니다.');
    }
    return { valid: errors.length === 0, errors };
  }

  // ==========================================================================
  // 4. 이벤트 / 상점 (전투가 없는 노드) — seed로 결정되는 결과
  // ==========================================================================

  /**
   * 이벤트 노드의 결과를 (run.seed, node.id)로 결정한다. 같은 노드는 항상 같은 이벤트.
   * 적용(골드 지급 등)은 game.js가 하고, 여기서는 "무슨 일이 일어나는지"만 돌려준다.
   * @returns {{id:string, title:string, text:string, effects:Array<{type:string, amount:number}>}}
   */
  function rollEvent(run, node) {
    const rng = rngFor(run.seed, `event|${node.id}`);
    const roll = rng();
    const gold = rangeInt(rng, 100, 250);
    if (roll < 0.4) {
      return { id: 'supply_cache', title: '버려진 보급 창고', text: `방치된 보급 창고에서 군자금 ${gold}G를 발견했다.`, effects: [{ type: 'gold', amount: gold }] };
    }
    if (roll < 0.75) {
      return { id: 'field_camp', title: '야전 진료소', text: '근처 주민들이 야전 진료소를 열어 주었다. 생존한 모든 영웅의 체력이 회복된다.', effects: [{ type: 'heal_all', amount: 1 }] };
    }
    return { id: 'time_fragment', title: '시간의 파편', text: '전장 한켠에서 시공간 리와인더 파편을 주웠다.', effects: [{ type: 'rewinder', amount: 1 }] };
  }

  /** 상점 노드의 판매 목록. 가격은 고정, 순서/구성은 seed로 결정 (지금은 2종이라 구성만 고정). */
  function getShopOffers(/* run, node */) {
    return [
      { id: 'rewinder', label: '⏳ 시공간 리와인더 1개', cost: 150, effects: [{ type: 'rewinder', amount: 1 }] },
      { id: 'heal_all', label: '💊 전원 체력 회복', cost: 120, effects: [{ type: 'heal_all', amount: 1 }] }
    ];
  }

  global.RunEngine = {
    NODE_TYPES,
    NODE_META,
    DEFAULT_LAYER_SIZES,
    isBattleType,
    sortSectorIds,
    generateRunMap,
    createRun,
    getNode,
    getAvailableNodes,
    isNodeAvailable,
    getNodeStatus,
    completeNode,
    recordEncounter,
    validateRun,
    rollEvent,
    getShopOffers
  };
})(typeof window !== 'undefined' ? window : globalThis);
