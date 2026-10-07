"""아군 1명 지정 스킬: 대상 칸에 아군이 여럿 겹쳐 있으면 선택창이 뜨고, 고른 아군에게만 효과가 들어가는지 검증."""
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
  const mk = (id, x, y, hp) => Object.assign({ id, name:id, owner:'PLAYER', classType:'KNIGHT', unitClass:'KNIGHT', level:1, hp, maxHp:100, atk:40, def:30, ap:2, baseAP:2, x, y, affection:80, promotions:{combatRank:0}, isDead:false, isDeployed:true });
  state.playerUnits.forEach(u => { u.x = 0; u.y = 0; });
  state.playerUnits.push(mk('CASTER', 5, 5, 100), mk('A_LOW', 5, 6, 20), mk('B_HIGH', 5, 6, 90), mk('SOLO', 4, 5, 50));
  const heal = SkillEngine.normalizeSkill({ id:'t_heal1', name:'시험치유', type:'ACTIVE', costAP:0, coolDown:0, targeting:{mode:'ALLY',rangeMin:0,rangeMax:2,radius:0,affects:'ALLY'}, effects:[{type:'HEAL', value:5}] });
  const orig = SkillEngine.getUnitSkills;
  SkillEngine.getUnitSkills = (u) => u.id === 'CASTER' ? [heal] : orig(u);
  window.hp = (id) => state.playerUnits.find(u => u.id === id).hp;
  window.aim = () => { state.playerUnits.find(u => u.id === 'CASTER').skillCooldowns = {}; useUnitSkill('CASTER', 't_heal1'); return !!skillTargeting; };
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

    print('\n=== 아군이 혼자 있는 칸 → 선택창 없이 바로 시전 ===')
    c.ok(page.evaluate("aim()"), '대상 선택 모드 진입')
    page.evaluate("castTargetedSkillAt(4,5)")
    c.ok(page.locator('#skill-ally-picker').count()==0, '선택창이 뜨지 않음')
    c.ok(page.evaluate("hp('SOLO')")==55, 'SOLO 회복 (50 → 55)')

    print('\n=== 아군 2명이 겹친 칸 → 선택창에서 고른 아군에게만 ===')
    c.ok(page.evaluate("aim()"), '대상 선택 모드 진입')
    page.evaluate("castTargetedSkillAt(5,6)")
    c.ok(page.locator('#skill-ally-picker .skill-ally-picker-item').count()==2, '겹친 아군 2명이 선택지로 나옴')
    c.ok(page.evaluate("hp('A_LOW')")==20 and page.evaluate("hp('B_HIGH')")==90, '고르기 전에는 시전되지 않음')
    page.click('#skill-ally-picker [data-target-id="B_HIGH"]'); page.wait_for_timeout(200)
    c.ok(page.locator('#skill-ally-picker').count()==0, '고르면 선택창이 닫힘')
    c.ok(page.evaluate("hp('B_HIGH')")==95 and page.evaluate("hp('A_LOW')")==20, 'HP가 높은 B_HIGH를 골라도 B_HIGH만 회복 (예전엔 HP 낮은 쪽 고정)')
    c.ok(page.evaluate("!skillTargeting"), '시전 후 대상 선택 모드 종료')

    print('\n=== 선택창을 닫으면 대상 선택 모드로 돌아간다 ===')
    page.evaluate("aim(); castTargetedSkillAt(5,6)")
    page.click('#skill-ally-picker .skill-ally-picker-close'); page.wait_for_timeout(100)
    c.ok(page.locator('#skill-ally-picker').count()==0 and page.evaluate("!!skillTargeting"), '닫기 → 선택창만 닫히고 대상 선택은 유지')
    c.ok(page.evaluate("hp('A_LOW')")==20 and page.evaluate("hp('B_HIGH')")==95, '닫으면 아무에게도 시전되지 않음')
    page.evaluate("castTargetedSkillAt(5,6)")
    if os.environ.get('SHOT'): page.screenshot(path=os.environ['SHOT'])
    page.evaluate("cancelSkillTargeting()")
    c.ok(page.locator('#skill-ally-picker').count()==0, '스킬 취소하면 선택창도 닫힘')

    c.ok(not errors, f'페이지 오류 없음: {errors}')
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
