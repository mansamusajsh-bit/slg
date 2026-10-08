"""서버 권위 아이템(리와인더 · 유물)의 클라이언트 연결: 스텁 서버로 호출 · 반영 · 우회 차단을 확인한다."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

TEMPLATE_JS = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12},{x:4,y:12}], enemy: [{x:3,y:1}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [
    { id:'e1', name:'고블린', owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', x:3, y:1, hp:50, maxHp:50, atk:30, def:20, baseAP:2, ap:2 }
  ];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}
"""

# 전투 중인 아군 유닛 하나를 한 칸 위로 옮긴다 (빈 칸 기준).
MOVE_JS = """
(uid) => {
  const u = state.playerUnits.find(x => x.id === uid);
  const ty = u.y - 1;
  executeMove(u, u.x, ty);
  return { x: u.x, y: u.y, ap: u.ap };
}
"""

POS_JS = "(uid) => { const u = state.playerUnits.find(x => x.id === uid); return { x: u.x, y: u.y, ap: u.ap, turn: state.turn, rew: state.rewinders }; }"


# 서버 스텁: slg_* 아이템 RPC 를 흉내 낸다 (실제 SQL 은 tests/verify_items.mjs 가 검증). 호출 기록은 window.__calls.
SERVER_STUB = r"""
(mode) => {
  window.__calls = [];
  const S = window.__srv = { rewinders: 3, relics: [], pending: null, claimed: {}, seq: 1 };
  const items = () => ({ rewinders: S.rewinders, holdMax: 10, migrated: true, pending: S.pending,
    relics: JSON.parse(JSON.stringify(S.relics)) });
  window.__items = items;
  window.ServerEconomy = {
    enabled: true, status: 'ready', get itemsActive() { return true; }, snapshot: { player: { nameSet: true, name: '테스터', gold: 0 }, items: items() },
    async call(fn, args) {
      window.__calls.push([fn, JSON.parse(JSON.stringify(args || {}))]);
      if (S.mode === 'network') return { ok: false, network: true, error: 'fetch failed' };
      let res;
      if (fn === 'slg_rewinder_use') res = S.rewinders > 0 ? (S.rewinders--, { ok: true, rewinders: S.rewinders }) : { ok: false, error: 'none', rewinders: 0 };
      else if (fn === 'slg_rewinder_buy') res = S.rewinders >= 10 ? { ok: false, error: 'full' } : (S.rewinders++, { ok: true, rewinders: S.rewinders, cost: 125 });
      else if (fn === 'slg_relic_equip') {
        const r = S.relics.find(x => x.instanceId === args.p_instance);
        if (!r) res = { ok: false, error: 'not_found' };
        else if (args.p_equip && S.relics.filter(x => x.equipped).length >= 3) res = { ok: false, error: 'slots_full' };
        else { r.equipped = !!args.p_equip; res = { ok: true }; }
      } else if (fn === 'slg_relic_gift') {
        const i = S.relics.findIndex(x => x.instanceId === args.p_instance && x.kind === 'gift');
        if (i < 0) res = { ok: false, error: 'not_found' };
        else { const r = S.relics.splice(i, 1)[0]; res = { ok: true, relic: r }; }
      } else if (fn === 'slg_encounter_start') res = { ok: true, status: 'active' };
      else if (fn === 'slg_encounter_claim') {
        if (S.claimed[args.p_ref] === 'done') res = { ok: true, dup: true, gold: 500, rewinders: 0, relics: [] };
        else if (S.bossRef === args.p_ref && S.pending && args.p_choice == null) res = { ok: true, needChoice: true, options: S.pending.options, gold: 6000, rewinders: 1 };
        else if (S.bossRef === args.p_ref && S.pending) {
          const id = S.pending.options[args.p_choice];
          if (id == null) res = { ok: false, error: 'bad_choice' };
          else { S.relics.push({ instanceId: 'r' + (S.seq++), id, name: '보스유물 ' + id, kind: 'commander', rarity: 'epic', effects: [], equipped: true }); S.pending = null; S.claimed[args.p_ref] = 'done'; res = { ok: true, gold: 6000, rewinders: 1, relics: ['r' + (S.seq - 1)] }; }
        } else { S.claimed[args.p_ref] = 'done'; S.rewinders = Math.min(10, S.rewinders + 1); res = { ok: true, gold: 500, rewinders: 1, relics: [] }; }
      } else res = { ok: false, error: 'unknown' };
      if (res && res.ok) res.items = items();
      if (res && res.items) { window.ServerEconomy.snapshot.items = res.items; window.onServerItems(res.items); }
      return res;
    },
    serverNow() { return Date.now(); }, sync() { return Promise.resolve(null); }
  };
  S.mode = mode || 'ok';
}
"""

srv = start_server()
c = Check()
with sync_playwright() as pw:
    browser, page, errors = new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    for sid in ('A-1', 'A-2', 'B-1'):
        page.evaluate(TEMPLATE_JS, sid)
    # 게임은 작전지도에서 시작한다. 부관 임명 창은 자동으로 뜨지 않고, 부관 없이 진입을 누르면 열린다.
    c.ok(page.evaluate("state.currentView") == 'CAMPAIGN' and not page.evaluate("!!document.getElementById('modal-adjutant')"), '시작 시 부관 임명 창이 자동으로 뜨지 않는다')
    page.click('[data-region="liona"]'); page.wait_for_timeout(200)
    page.click('[data-cmp-launch]'); page.wait_for_timeout(200)
    c.ok(page.evaluate("!!document.getElementById('modal-adjutant')"), '부관 없이 작전 개시 → 부관 임명 창이 열린다')
    page.click('#modal-adjutant [data-unit] >> nth=0'); page.wait_for_timeout(200)
    c.ok(page.evaluate("!!(state.run.adjutant && state.run.adjutant.unitId)") and not page.evaluate("!!document.getElementById('modal-adjutant')"), '부관 임명 후 창이 닫힌다')
    page.click('[data-region="liona"]'); page.wait_for_timeout(200)
    page.click('[data-cmp-launch]'); page.wait_for_timeout(800)
    c.ok(page.evaluate("state.currentView") == 'STRATEGY', '구역 진입 → 전략맵')
    page.evaluate("() => { state.run.mapState.nodes.forEach(n => { if (n.type==='event'||n.type==='shop') n.type='battle'; }); }")
    start = page.evaluate("state.run.mapState.layers[0][0]")
    page.evaluate("(id)=>selectNode(id)", start)
    page.click('#btn-open-deploy-modal')
    page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main')
    page.wait_for_timeout(700)
    if page.evaluate("!!getDeployPhase()"):
        page.evaluate("finishDeployPhase()"); page.wait_for_timeout(200)
    page.evaluate("() => { state.rewinders = 5; state.stackMoveEnabled = false; }")
    uid = page.evaluate("state.playerUnits.find(u => u.isDeployed && !u.isDead).id")
    c.ok(uid is not None and page.evaluate("state.turn") == 1, f'전투 시작 (유닛 {uid}, 1턴)')

    page.evaluate("() => { state.stackMoveEnabled = false; }")
    uid = page.evaluate("state.playerUnits.find(u => u.isDeployed && !u.isDead).id")
    c.ok(uid is not None and page.evaluate("state.turn") == 1, f'전투 시작 (유닛 {uid}, 1턴)')

    print('\n=== 서버 값이 원본: 개발자 도구로 고쳐도 동기화 때 되돌아온다 ===')
    page.evaluate(SERVER_STUB, 'ok')
    page.evaluate("() => { state.rewinders = 99; state.run.relics = [{ instanceId: 'fake1', id: 'x', name: '가짜', kind: 'commander', rarity: 'legendary', effects: [{ scope: 'run', stat: 'goldGain', value: 100 }] }]; }")
    page.evaluate("() => window.onServerItems(window.__items())")
    c.ok(page.evaluate("state.rewinders") == 3 and page.evaluate("state.run.relics.length") == 0, '로컬에서 만든 리와인더(99)·가짜 유물은 서버 값(3개·유물 없음)으로 덮어쓴다')
    c.ok(page.evaluate("grantRelic('anything', { type: 'cheat' })") is None and page.evaluate("state.run.relics.length") == 0, '서버 모드에서는 클라이언트가 유물을 만들 수 없다 (grantRelic 거절)')
    page.evaluate("() => { window.__srv.relics = [{ instanceId: 'r1', id: 'c1', name: '지휘관 유물', kind: 'commander', rarity: 'rare', effects: [], equipped: true }, { instanceId: 'r2', id: 'g1', name: '선물 유물', kind: 'gift', rarity: 'rare', effects: [{ scope: 'self', stat: 'def', value: 2 }], equipped: false }, { instanceId: 'r3', id: 'c2', name: '유물2', kind: 'commander', rarity: 'common', effects: [], equipped: false }]; window.onServerItems(window.__items()); }")
    c.ok(page.evaluate("state.run.relics.map(r => r.instanceId)") == ['r1', 'r2', 'r3'] and page.evaluate("state.run.equippedRelics") == ['r1'], '서버가 알려 준 유물 · 장착 상태가 그대로 반영된다')

    print('\n=== 리와인더: 서버가 차감해야 되돌린다 ===')
    p0 = page.evaluate(POS_JS, uid)
    page.evaluate(MOVE_JS, uid)
    page.evaluate("executeRewind()"); page.wait_for_timeout(300)
    r = page.evaluate(POS_JS, uid)
    c.ok(r['y'] == p0['y'] and r['rew'] == 2, f"서버가 승인 → 되돌림, 서버 보유 3 → {r['rew']}")
    c.ok([x[0] for x in page.evaluate("window.__calls")].count('slg_rewinder_use') == 1, '서버에 slg_rewinder_use 를 불렀다')
    page.evaluate("() => { window.__srv.rewinders = 0; window.__srv.mode = 'ok'; state.rewinders = 5; }")   # 로컬만 5개로 조작 (서버는 0)
    page.evaluate(MOVE_JS, uid)
    page.evaluate("executeRewind()"); page.wait_for_timeout(300)
    r2 = page.evaluate(POS_JS, uid)
    c.ok(r2['y'] != p0['y'] and r2['rew'] == 0, f"로컬에 5개가 있어도 서버가 0개면 되돌리지 못한다 (y {r2['y']}, 보유 {r2['rew']} ← 서버 값)")
    page.evaluate("() => { window.__srv.rewinders = 2; window.__srv.mode = 'network'; window.onServerItems(window.__items()); }")
    page.evaluate("executeRewind()"); page.wait_for_timeout(300)
    r3 = page.evaluate(POS_JS, uid)
    c.ok(r3['y'] == r2['y'] and r3['rew'] == 2, '서버와 통신이 안 되면 되돌리지 않고 리와인더도 줄지 않는다')
    page.evaluate("() => { window.__srv.mode = 'ok'; }")

    print('\n=== 구매 · 장착 · 선물 ===')
    page.evaluate("() => { state.isCombatActive = false; window.__battle = state.currentBattle; state.currentBattle = null; }")   # 전투 중에는 장착을 바꿀 수 없다
    page.evaluate("() => { window.ensureRewardDataLoaded = async () => ({ relics: new Map([['c11', { id: 'c11', name: 'A', kind: 'commander', rarity: 'rare', effects: [] }], ['c12', { id: 'c12', name: 'B', kind: 'commander', rarity: 'rare', effects: [] }], ['c13', { id: 'c13', name: 'C', kind: 'commander', rarity: 'epic', effects: [] }], ['c21', { id: 'c21', name: 'D', kind: 'commander', rarity: 'rare', effects: [] }], ['c22', { id: 'c22', name: 'E', kind: 'commander', rarity: 'rare', effects: [] }]]), pools: new Map() }); }")
    page.evaluate("() => { state.gold = 1000; }")
    page.evaluate("buyVillageItem('REWIND', 120, 0)"); page.wait_for_timeout(300)
    c.ok(page.evaluate("state.rewinders") == 3 and ('slg_rewinder_buy', {'p_src': 'village'}) == tuple(page.evaluate("window.__calls.filter(x => x[0] === 'slg_rewinder_buy')[0]")), '마을 구매는 서버 함수로 (가격은 서버가 정한다), 보유는 서버 값')
    page.evaluate("() => { window.__srv.rewinders = 10; window.onServerItems(window.__items()); }")
    page.evaluate("buyVillageItem('REWIND', 120, 0)"); page.wait_for_timeout(300)
    c.ok(page.evaluate("state.rewinders") == 10, '가득 차면 서버가 거절 (10개 유지)')
    page.evaluate("() => setRelicEquipped('r3', true)"); page.wait_for_timeout(300)
    c.ok(page.evaluate("state.run.equippedRelics") == ['r1', 'r3'], '장착은 서버가 승인한 뒤 반영된다')
    page.evaluate("() => { window.__srv.relics.push({ instanceId: 'r9', id: 'c9', name: '넷째', kind: 'commander', rarity: 'common', effects: [], equipped: false }); window.__srv.relics.push({ instanceId: 'r8', id: 'c8', name: '셋째', kind: 'commander', rarity: 'common', effects: [], equipped: true }); window.onServerItems(window.__items()); }")
    page.evaluate("() => setRelicEquipped('r9', true)"); page.wait_for_timeout(300)
    c.ok('r9' not in page.evaluate("state.run.equippedRelics"), '슬롯이 가득 차면 서버가 거절 → 장착되지 않는다')
    ally = page.evaluate("state.playerUnits.find(u => !u.isDead).id")
    before = page.evaluate("(id) => { const u = state.playerUnits.find(x => x.id === id); return u.def; }", ally)
    page.evaluate("([i, u]) => giftRelicToUnit(i, u)", ['r2', ally]); page.wait_for_timeout(400)
    after = page.evaluate("(id) => { const u = state.playerUnits.find(x => x.id === id); return u.def; }", ally)
    c.ok(after == before + 2 and 'r2' not in page.evaluate("state.run.relics.map(r => r.instanceId)"), f'선물: 서버가 유물을 소비한 뒤에만 능력치가 오른다 (방어 {before} → {after})')
    page.evaluate("([i, u]) => giftRelicToUnit(i, u)", ['r2', ally]); page.wait_for_timeout(300)
    c.ok(page.evaluate("(id) => state.playerUnits.find(x => x.id === id).def", ally) == after, '이미 쓴 유물을 다시 선물해도 능력치는 오르지 않는다')

    page.evaluate("() => { state.currentBattle = window.__battle; state.isCombatActive = true; }")
    print('\n=== 전투 보상: 서버가 수령을 확정한 값만 ===')
    page.evaluate("() => { state.gold = 100; window.__calls.length = 0; }")
    battle = "{ id: 'enc-77', nodeId: 'A-1-005', sectorId: 'A-1', type: 'battle', enemies: [{}, {}, {}] }"
    g0 = page.evaluate("state.gold")
    page.evaluate(f"() => claimBattleReward({battle})"); page.wait_for_timeout(500)
    claims = page.evaluate("window.__calls.filter(x => x[0] === 'slg_encounter_claim')")
    c.ok(len(claims) == 1 and claims[0][1] == {'p_ref': 'enc-77'}, '수령은 서버 함수 하나로')
    c.ok(page.evaluate("state.gold") == g0 + page.evaluate("scaleIncomeWithRelics(500)"), f"골드는 서버가 정한 기준액(500) 기준으로만 받는다: {page.evaluate('state.gold')}")
    page.evaluate(f"() => claimBattleReward({battle})"); page.wait_for_timeout(300)
    c.ok(page.evaluate("window.__calls.filter(x => x[0] === 'slg_encounter_claim')").__len__() == 1, '같은 전투를 다시 수령하려 해도 서버에 한 번만 간다')
    # 전투 id 는 회차마다 1부터 다시 센다 → 사망회귀 뒤 같은 페이지에서 같은 id 의 새 전투도 서버에 수령을 보내야 한다
    page.evaluate("() => { state.player.loopCount = (state.player.loopCount || 0) + 1; window.__srv.claimed = {}; }")
    page.evaluate(f"() => claimBattleReward({battle})"); page.wait_for_timeout(500)
    c.ok(page.evaluate("window.__calls.filter(x => x[0] === 'slg_encounter_claim')").__len__() == 2, '다음 회차의 같은 id 전투는 지난 회차 결과를 쓰지 않고 서버에 다시 수령한다')
    page.evaluate("() => { state.player.loopCount -= 1; }")
    page.evaluate("() => { window.__srv.claimed = {}; }")
    g1 = page.evaluate("state.gold")
    page.evaluate("() => { state.run.paidRefs = state.run.paidRefs || []; }")
    # 연결 실패 → 대기열 → 연결되면 지급
    page.evaluate("() => { window.__srv.mode = 'network'; }")
    page.evaluate("() => claimBattleReward({ id: 'enc-78', nodeId: 'A-1-006', sectorId: 'A-1', type: 'elite', enemies: [{}] })"); page.wait_for_timeout(400)
    c.ok(page.evaluate("state.run.pendingClaims.map(x => x.ref)") == ['enc-78'] and page.evaluate("state.gold") == g1, '통신 실패: 골드는 지급되지 않고, 수령 대기열(세이브에 저장)에 남는다')
    page.evaluate("() => { window.__srv.mode = 'ok'; window.onServerItems(window.__items()); }"); page.wait_for_timeout(600)
    c.ok(page.evaluate("state.run.pendingClaims.length") == 0 and page.evaluate("state.gold") == g1 + page.evaluate("scaleIncomeWithRelics(500)"), '연결이 돌아오면 대기 중인 보상을 서버에서 수령해 지급한다 (한 번만)')

    print('\n=== 보스: 서버가 후보를 정하고, 고른 번호만 지급 ===')
    page.evaluate("() => { const S = window.__srv; S.bossRef = 'enc-boss'; S.pending = { ref: 'enc-boss', nodeId: 'A-1-boss', sectorId: 'A-1', type: 'boss', options: ['c11', 'c12', 'c13'] }; }")
    page.evaluate("() => claimBattleReward({ id: 'enc-boss', nodeId: 'A-1-boss', sectorId: 'A-1', type: 'boss', enemies: [{}, {}] })"); page.wait_for_timeout(600)
    c.ok(page.evaluate("state.run.pendingRelicChoice && state.run.pendingRelicChoice.options") == ['c11', 'c12', 'c13'], '후보 3개는 서버가 정한 것이다 (pendingRelicChoice)')
    c.ok(page.evaluate("state.run.relics.every(r => !r.id.startsWith('c1') || r.id === 'c1')") , '고르기 전에는 후보 유물이 지급되지 않는다')
    page.evaluate("() => chooseRelicReward(2)"); page.wait_for_timeout(500)
    c.ok(page.evaluate("state.run.relics.some(r => r.id === 'c13')") and page.evaluate("state.run.pendingRelicChoice") is None, '고른 번호(2)의 유물만 받고, 선택 대기가 끝난다')
    ch = page.evaluate("window.__calls.filter(x => x[0] === 'slg_encounter_claim' && x[1].p_choice != null")[0] if False else None
    c.ok(any(x[1].get('p_choice') == 2 for x in page.evaluate("window.__calls.filter(x => x[0] === 'slg_encounter_claim')")), '고른 번호를 서버에 보냈다')

    print('\n=== 이벤트 노드 · 새로고침 시 선택 대기 복원 ===')
    page.evaluate("() => { const S = window.__srv; S.pending = { ref: 'enc-b2', nodeId: 'x', sectorId: 'A-1', type: 'boss', options: ['c21', 'c22'] }; window.onServerItems(window.__items()); }"); page.wait_for_timeout(500)
    c.ok(page.evaluate("!!document.getElementById('modal-relic-choice')"), '서버에 선택 대기가 남아 있으면 (새로고침 후에도) 선택 창이 다시 열린다')
    c.ok(page.evaluate("state.rewinders") == page.evaluate("window.__srv.rewinders"), '리와인더 표시는 서버 값')
    errs = [e for e in errors if 'TacticalEngineError' not in e]   # 전투 중 장착 잠금을 피하려고 잠깐 전투를 비운 구간에서만 난다
    c.ok(errs == [], '콘솔/페이지 오류 없음 ' + str(errs[:3]))
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건')
sys.exit(1 if c.fail else 0)
