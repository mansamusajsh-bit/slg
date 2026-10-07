"""속박(ROOT): 걸린 유닛은 일반 이동 · 교전 승리 후 전진 · 부대 동시 이동 · 적 AI 이동 어디로도 스스로 움직이지 못하는지 검증."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

TEMPLATE_JS = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12},{x:4,y:12}], enemy: [{x:3,y:2}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [{ id:'e1', name:'고블린', owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', x:3, y:2, hp:50, maxHp:50, atk:30, def:20, baseAP:2, ap:2 }];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}"""

SETUP_JS = """() => {
  window.mkP = (id, x, y, extra) => Object.assign({ id, name:id, owner:'PLAYER', classType:'KNIGHT', unitClass:'KNIGHT', level:1, hp:100, maxHp:100, atk:40, def:30, ap:2, baseAP:2, x, y, affection:80, promotions:{combatRank:0}, isDead:false, isDeployed:true, statuses:[] }, extra||{});
  window.mkE = (id, x, y, extra) => Object.assign({ id, name:id, owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', level:1, hp:50, maxHp:50, atk:30, def:20, ap:2, baseAP:2, x, y, isDead:false, statuses:[], enemySkillsPrepared:true, skillTree:[], learnedSkills:[] }, extra||{});
  window.root = (u) => { u.statuses = [{ type:'ROOT', value:0, turns:2, casterId:null, source:'시험' }]; return u; };
  window.reset = (players, enemies) => {
    state.playerUnits = players; state.enemyUnits = enemies;
    selectedUnitId = null; skillTargeting = null; state.stackMoveEnabled = true;
    renderAll();
  };
  window.pos = (u) => [u.x, u.y];
}"""

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    assert enter_region(page)
    for t in ('A-1','A-2','B-1'): page.evaluate(TEMPLATE_JS,t)
    page.evaluate("() => { state.run.mapState.nodes.forEach(n => { if (n.type==='event'||n.type==='shop') n.type='battle'; }); }")
    start=page.evaluate("state.run.mapState.layers[0][0]")
    page.evaluate("(id)=>selectNode(id)", start)
    page.click('#btn-open-deploy-modal'); page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main'); page.wait_for_timeout(700)
    c.ok(page.evaluate("state.playerUnits.length")>0, '전투 진입')
    errors.clear()
    page.evaluate(SETUP_JS)

    print('\n=== 아군 일반 이동 ===')
    r = page.evaluate("""() => {
      const p = root(mkP('P', 4, 8)); reset([p], [mkE('E', 0, 0)]);
      selectedUnitId = 'P'; renderAll();
      const moveTiles = document.querySelectorAll('.tile.move-target').length;
      executeMove(p, 4, 7);
      return { moveTiles, pos: pos(p), ap: p.ap };
    }""")
    c.ok(r['moveTiles']==0, f"속박된 유닛은 이동 칸(초록)이 표시되지 않음: {r['moveTiles']}")
    c.ok(r['pos']==[4,8] and r['ap']==2, f"executeMove 해도 제자리 · AP 그대로: {r}")

    print('\n=== 부대 동시 이동: 속박된 부대원만 남는다 ===')
    r = page.evaluate("""() => {
      const a = mkP('A', 4, 8), b = root(mkP('B', 4, 8)), c2 = mkP('C', 4, 8);
      reset([a, b, c2], [mkE('E', 0, 0)]);
      executeMove(a, 4, 7);
      return { a: pos(a), b: pos(b), c: pos(c2), alert: document.getElementById('modal-stack-alert')?.classList.contains('active') || false };
    }""")
    c.ok(r['a']==[4,7] and r['c']==[4,7], f"속박 안 된 부대원은 함께 이동: {r}")
    c.ok(r['b']==[4,8], f"속박된 부대원은 제자리: {r}")
    c.ok(not r['alert'], 'AP 부족 경고창이 뜨지 않음')

    print('\n=== 아군이 교전에서 이겨도 속박이면 전진하지 않는다 ===')
    r = page.evaluate("""() => {
      const p = root(mkP('P', 4, 8, { atk: 9999, def: 9999 }));
      const e = mkE('E', 4, 7, { atk: 1, def: 1, hp: 5 });
      reset([p], [e]);
      executeCombat(p, e);
      return { dead: e.isDead, pos: pos(p) };
    }""")
    c.ok(r['dead'], '적 격파')
    c.ok(r['pos']==[4,8], f"격파 후에도 제자리: {r['pos']}")

    r = page.evaluate("""() => {
      const p = mkP('P', 4, 8, { atk: 9999, def: 9999 });
      const e = mkE('E', 4, 7, { atk: 1, def: 1, hp: 5 });
      reset([p], [e]);
      executeCombat(p, e);
      return { dead: e.isDead, pos: pos(p) };
    }""")
    c.ok(r['dead'] and r['pos']==[4,7], f"(대조) 속박이 없으면 전진 점령: {r}")

    print('\n=== 적 턴: 속박된 적은 움직이지도, 이긴 뒤 전진하지도 않는다 ===')
    r = page.evaluate("""async () => {
      const p = mkP('P', 4, 10);
      const e = root(mkE('E', 4, 6));
      reset([p], [e]);
      await executeEnemyDecision(e); await executeEnemyDecision(e);
      return { pos: pos(e) };
    }""")
    c.ok(r['pos']==[4,6], f"멀리 있는 아군에게 다가가지 못함: {r}")

    r = page.evaluate("""async () => {
      const p = mkP('P', 4, 7, { atk: 1, def: 1, hp: 5, maxHp: 5 });
      const e = root(mkE('E', 4, 6, { atk: 9999, def: 9999 }));
      reset([p], [e]);
      executeCombat(e, p);
      return { pdead: p.isDead, pos: pos(e) };
    }""")
    c.ok(r['pdead'], '인접 아군은 공격 가능 (속박은 공격을 막지 않음)')
    c.ok(r['pos']==[4,6], f"아군을 쓰러뜨려도 전진하지 않음: {r['pos']}")

    print('\n=== 속박 스킬(속박 화살)이 실제로 걸리고 지속시간 동안 유지 ===')
    r = page.evaluate("""async () => {
      const p = mkP('P', 4, 10);
      const e = mkE('E', 4, 8, { hp: 200, maxHp: 200 });
      reset([p], [e]);
      state.__enemyPhase = false; // 아군 턴에 시전
      const skill = SkillEngine.fromPreset('binding_arrow');
      const res = SkillEngine.cast(p, skill, 4, 8);
      const rootedNow = !SkillEngine.canMove(e);
      SkillEngine.startSideTurn('ENEMY'); e.ap = 2;
      await executeEnemyDecision(e); await executeEnemyDecision(e);
      const afterTurn1 = pos(e);
      SkillEngine.endRound();
      const rootedRound2 = !SkillEngine.canMove(e);
      SkillEngine.endRound();
      return { ok: res.ok, rootedNow, afterTurn1, rootedRound2, rootedRound3: !SkillEngine.canMove(e) };
    }""")
    c.ok(r['ok'] and r['rootedNow'], f"속박 화살 → 즉시 속박: {r}")
    c.ok(r['afterTurn1']==[4,8], f"적 턴에 아군에게 다가가지 못하고 제자리: {r['afterTurn1']}")
    c.ok(r['rootedRound2'], '지속 2턴 → 다음 라운드에도 속박')
    c.ok(not r['rootedRound3'], '2라운드 뒤 해제')

    c.ok(not [e for e in errors if 'PAGEERROR' in e], 'JS 오류 없음 ' + str([e for e in errors if 'PAGEERROR' in e][:3]))
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
