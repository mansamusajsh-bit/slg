"""스킬 연속 사용 버그 회귀 검증: 적이 AP가 남아도 같은 스킬은 한 턴에 한 번만 쓴다.
 - 재사용 대기 0으로 저장된 커스텀 스킬 (에디터에서 0을 넣을 수 있었다)
 - 오리아 국가 규칙(마법사 재사용 대기 -1)으로 대기 1이 0이 되던 경우"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

TEMPLATE_JS = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:6},{x:3,y:6},{x:4,y:6}], enemy: [{x:3,y:3}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [{ id:'e1', name:'아멜다', owner:'ENEMY', side:'ENEMY', classType:'MAGE', unitClass:'MAGE', x:3, y:3, hp:400, maxHp:400, atk:10, def:20, baseAP:4, ap:4 }];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}
"""

def enemy_turn_casts(page, cooldown, nation):
    page.evaluate("() => { try { closeAllModals(); } catch (e) {} document.querySelectorAll('.modal-backdrop.open, .pool-overlay').forEach(m => m.classList.remove('open')); }")
    page.evaluate("(s)=>startNewRun(s,{force:true})", f'CD-{cooldown}-{nation}')
    assert enter_region(page)
    nid = page.evaluate("()=>RunEngine.getAvailableNodes(state.run)[0].id")
    page.evaluate("(id)=>selectNode(id)", nid); page.wait_for_timeout(200)
    page.click('#btn-open-deploy-modal'); page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main'); page.wait_for_timeout(900)
    return page.evaluate("""async ([cd, nation]) => {
      const e = state.enemyUnits[0];
      state.currentBattle.nationId = nation;
      e.skillTree = []; e.skillTreeCustomized = true; e.learnedSkills = [];
      e.customSkill = { id: 'fire', name: '발화', type: 'ACTIVE', costAP: 1, coolDown: cd,
        targeting: { mode: 'ENEMY', rangeMin: 1, rangeMax: 6, radius: 0, affects: 'ENEMY' }, effects: [{ type: 'DAMAGE', value: 30 }] };
      e.skillCooldowns = {}; e.customSkillCooldown = 0; e.ap = 4; e.baseAP = 4;
      state.playerUnits.forEach(u => { u.hp = 400; u.maxHp = 400; });
      const before = document.querySelectorAll('.log-entry, #game-log > *').length;
      window.__casts = 0;
      const orig = SkillEngine.cast;
      SkillEngine.cast = function (c, s, x, y) { const r = orig.apply(this, arguments); if (r.ok && c === e) window.__casts++; return r; };
      Math.random = () => 0.1;   // AI가 스킬을 고르는 80% 판정을 항상 통과시킨다
      e.enemySkillsPrepared = true;
      await processEnemyTurn();
      SkillEngine.cast = orig;
      return { casts: window.__casts, cd: (e.skillCooldowns || {}).fire, apLeft: e.ap };
    }""", [cooldown, nation])

srv = start_server(); c = Check()
with sync_playwright() as pw:
    for cd, nation, label in [(0, 'liona', '재사용 대기 0으로 저장된 스킬'), (1, 'oria', '오리아(마법사 대기 -1) + 대기 1 스킬'), (2, 'oria', '오리아 + 대기 2 스킬')]:
        browser, page, errors = new_page(pw)   # 시나리오마다 새 페이지
        page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
        for t in ['A-1', 'A-2', 'B-1', 'B-2']: page.evaluate(TEMPLATE_JS, t)
        r = enemy_turn_casts(page, cd, nation)
        c.ok(r['casts'] == 1, f"{label}: AP 4로 한 턴에 {r['casts']}번 사용 (기대 1번), 남은 대기 {r['cd']}")
        if errors: print('오류:', errors[:3])
        browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건')
sys.exit(1 if c.fail else 0)
