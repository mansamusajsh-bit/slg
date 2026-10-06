"""회귀: 전술 일시정지 메뉴를 열었다가 재개하면 스킬 버튼이 "전투 중"으로 잠기고 사용되지 않던 버그.
원인: resumeTacticalCombat 이 뷰를 옛 값 'SECTOR_FIELD' 로 되돌렸는데, 스킬 사용 판정(isTacticalBattleActive)은 'SECTOR_MAP' 만 인정했다."""
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
    page.evaluate("""() => {
      const u = state.playerUnits.find(x => !x.isDead);
      u.skillTree = [0,1].map(i => ({ id:'s'+i, tier:1, name:'시험'+i, type:'ACTIVE', costAP:1, coolDown:2, description:'d', targeting:{mode:'SELF',rangeMin:0,rangeMax:0,radius:0,affects:'ALLY'}, effects:[{type:'HEAL', value:1}] }));
      u.skillTreeCustomized = true; u.learnedSkills = ['s0','s1']; u.ap = 3; window.__u = u; selectedUnitId = u.id;
    }""")

    def snap():
        page.evaluate("openFullShotOverlay(__u)"); page.wait_for_timeout(250)
        return page.evaluate("""() => ({ view: state.currentView, active: isTacticalBattleActive(),
          btns: [...document.querySelectorAll('#fullshot-skill-card-container .fs-skill-btn')].map(b => b.textContent.trim()),
          disabled: [...document.querySelectorAll('#fullshot-skill-card-container .fs-skill-btn')].map(b => b.disabled) })""")

    print('\n=== 전투 중 ===')
    s = snap()
    c.ok(s['view']=='SECTOR_MAP' and s['active'] and all(t.startswith('사용') for t in s['btns']) and not any(s['disabled']), f'스킬 버튼 사용 가능: {s["btns"]}')

    print('\n=== 일시정지 → 재개 (버그 재현 경로) ===')
    page.evaluate("openTacticalPauseMenu()"); page.wait_for_timeout(200)
    s = snap()
    c.ok(s['view']=='STRATEGY_MENU_OVERLAY' and not s['active'], '일시정지 중에는 스킬을 쓸 수 없다 (의도된 동작)')
    page.evaluate("resumeTacticalCombat()"); page.wait_for_timeout(300)
    s = snap()
    c.ok(s['view']=='SECTOR_MAP', f'재개 후 뷰가 전술 화면의 정식 값 (got {s["view"]!r})')
    c.ok(s['active'], '재개 후 isTacticalBattleActive() 참')
    c.ok(all(t.startswith('사용') for t in s['btns']) and not any(s['disabled']), f'재개 후 스킬 버튼이 "전투 중"으로 잠기지 않는다: {s["btns"]}')

    print('\n=== 재개 후 실제 시전 ===')
    page.click('#fullshot-skill-card-container [data-skill-use="s0"]'); page.wait_for_timeout(400)
    r = page.evaluate("({ cd: __u.skillCooldowns.s0, ap: __u.ap })")
    c.ok(r['cd'] == 2 and r['ap'] == 2, f'클릭하면 시전된다 (쿨다운 {r["cd"]}, AP 3 -> {r["ap"]})')

    print('\n=== 여러 번 반복해도 유지 ===')
    for i in range(3):
        page.evaluate("openTacticalPauseMenu()"); page.evaluate("resumeTacticalCombat()")
    c.ok(page.evaluate("state.currentView")=='SECTOR_MAP' and page.evaluate("isTacticalBattleActive()"), '일시정지/재개를 3번 반복해도 전술 화면 유지')

    print('\n=== 방어: 옛 뷰 값(SECTOR_FIELD)이 들어와도 전술 화면으로 인정 ===')
    page.evaluate("state.currentView = 'SECTOR_FIELD'")
    c.ok(page.evaluate("isTacticalBattleActive()"), "currentView='SECTOR_FIELD' 이고 전투 객체가 있으면 전투 중으로 판정")
    page.evaluate("state.currentView = 'STRATEGY'")
    c.ok(not page.evaluate("isTacticalBattleActive()"), '전략 화면이면 전투 중이 아님')
    page.evaluate("state.currentView = 'SECTOR_MAP'")

    c.ok(not [e for e in errors if 'PAGEERROR' in e], 'JS 오류 없음 ' + str([e for e in errors if 'PAGEERROR' in e][:3]))
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
