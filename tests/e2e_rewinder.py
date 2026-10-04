"""리와인더: 행동 1회가 아니라 '턴 단위'로 되돌리는지 확인한다."""
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

    print('\n=== 같은 턴의 여러 행동을 한 번에 되돌린다 ===')
    p0 = page.evaluate(POS_JS, uid)
    page.evaluate(MOVE_JS, uid)
    p1 = page.evaluate(MOVE_JS, uid)
    c.ok(p1['y'] == p0['y'] - 2, f"1턴에 두 번 이동: y {p0['y']} → {p1['y']}")
    c.ok(page.evaluate("historyStack.length") == 1, '한 턴 안의 행동은 체크포인트 1개만 남긴다')
    page.evaluate("executeRewind()")
    r = page.evaluate(POS_JS, uid)
    c.ok((r['x'], r['y'], r['ap']) == (p0['x'], p0['y'], p0['ap']), f"리와인드 → 1턴 시작 위치/AP로 복원 ({r['y']}, AP {r['ap']})")
    c.ok(r['turn'] == 1 and r['rew'] == 4, f"턴 1 유지, 리와인더 5 → {r['rew']}")

    print('\n=== 이번 턴에 행동했다면 이번 턴 시작으로 ===')
    t1_moved = page.evaluate(MOVE_JS, uid)
    page.evaluate("executeEndTurn()"); page.wait_for_function("state.turn === 2 && !isEnemyTurnProcessing", timeout=15000)
    t2_start = page.evaluate(POS_JS, uid)
    c.ok(t2_start['y'] == t1_moved['y'] and t2_start['turn'] == 2, f"턴 종료 → 2턴 (y {t2_start['y']})")
    page.evaluate(MOVE_JS, uid)
    page.evaluate("executeRewind()")
    r = page.evaluate(POS_JS, uid)
    c.ok(r['turn'] == 2 and (r['y'], r['ap']) == (t2_start['y'], t2_start['ap']), f"2턴 중 리와인드 → 2턴 시작 상태 (y {r['y']}, AP {r['ap']})")
    c.ok(r['rew'] == 3, f"리와인더 → {r['rew']}")

    print('\n=== 이번 턴에 아직 아무것도 안 했다면 직전 턴 시작으로 ===')
    page.evaluate("executeRewind()")
    r = page.evaluate(POS_JS, uid)
    c.ok(r['turn'] == 1 and (r['x'], r['y'], r['ap']) == (p0['x'], p0['y'], p0['ap']), f"행동 없이 리와인드 → 1턴 시작 상태 (턴 {r['turn']}, y {r['y']})")
    c.ok(r['rew'] == 2, f"리와인더 → {r['rew']}")

    print('\n=== 되돌릴 기록이 없으면 소모하지 않는다 ===')
    page.evaluate("executeRewind()")
    r = page.evaluate(POS_JS, uid)
    c.ok(r['turn'] == 1 and r['rew'] == 2, '기록 없음 → 리와인더 소모 없음')
    c.ok(errors == [], '콘솔/페이지 오류 없음 ' + str(errors[:3]))
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건')
sys.exit(1 if c.fail else 0)
