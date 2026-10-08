"""미편성 영웅(전장 밖 -1,-1): 적 AI 공격 · 적 스킬 · 지속 회복 · 유지비 어디에도 끌려 들어가지 않는지 검증.
(구석 (0,0) 의 사거리 2 적이 (-1,-1) 에 모여 있던 미편성 영웅을 공격하고, 그 영웅이 반격해 적을 포섭하던 버그)"""
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
  window.bench = (id) => mkP(id, -1, -1, { isDeployed:false, hp:40, statuses:[{ type:'REGEN', value:10, turns:3, casterId:null, source:'시험' }] });
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

    print('\n=== 구석의 적이 전장 밖 미편성 영웅을 노리지 않는다 ===')
    r=page.evaluate("""async () => {
      // (0,0) 에서 (-1,-1) 까지 거리 2 → 사거리 2 적(미라 장궁)이면 예전에는 공격 대상이 됐다. 전투가 확률이라 여러 번 돌린다.
      const orig = NationRules.getAttackRangeBonus;
      NationRules.getAttackRangeBonus = (u) => (u && u.owner === 'ENEMY' ? 1 : 0);
      const touched = []; let players = 0;
      try {
        for (let i = 0; i < 12; i++) {
          const p = mkP('p1', 5, 11), b1 = bench('b1'), b2 = bench('b2');
          const e = mkE('e1', 0, 0, { classType:'ARCHER', unitClass:'ARCHER' });
          state.playerUnits = [p, b1, b2]; state.enemyUnits = [e];
          state.currentDeployedUnitIds = ['p1'];
          await executeEnemyDecision(e); await executeEnemyDecision(e);
          [b1, b2].forEach(b => { if (b.hp !== 40 || b.isDead) touched.push([i, b.id, b.hp, b.isDead]); });
          players = Math.max(players, state.playerUnits.length);
        }
      } finally { NationRules.getAttackRangeBonus = orig; }
      return { touched, players };
    }""")
    c.ok(r['touched']==[], f"미편성 영웅은 공격받지 않음: {r['touched'][:4]}")
    c.ok(r['players']==3, f"포섭으로 아군이 늘지 않음: {r['players']}")

    print('\n=== 스킬 엔진: 대상 · 지속 회복 ===')
    r=page.evaluate("""() => {
      const p = mkP('p1', 5, 11), b1 = bench('b1');
      state.playerUnits = [p, b1]; state.enemyUnits = [mkE('e1', 0, 0)];
      SkillEngine.startSideTurn('PLAYER');
      return { benchHp: b1.hp };
    }""")
    c.ok(r['benchHp']==40, f"전장 밖 영웅에게 지속 회복이 돌지 않음: {r}")

    print('\n=== 유지비: 출전한 영웅만 ===')
    page.evaluate("""() => {
      const p = mkP('p1', 5, 11), b1 = bench('b1'), b2 = bench('b2');
      state.playerUnits = [p, b1, b2]; state.enemyUnits = [mkE('e1', 7, 0)];
      return executeEndTurn();
    }""")
    page.wait_for_timeout(1500)
    log=page.evaluate("() => Array.from(document.querySelectorAll('*')).map(n => n.childElementCount === 0 ? n.textContent : '').filter(t => t.includes('[유지비 정산]')).pop() || ''")
    c.ok('필드 유닛: 1기' in log, f"유지비 정산에 미편성 영웅 제외: {log}")

    c.ok(not [e for e in errors if 'PAGEERROR' in e], 'JS 오류 없음 ' + str([e for e in errors if 'PAGEERROR' in e][:3]))
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
