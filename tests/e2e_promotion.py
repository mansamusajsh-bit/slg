"""병과 승급 효과가 실제 전투·이동·턴 종료에 반영되는지 검증."""
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
  window.mk = (id, x, y, extra) => Object.assign({ id, name:id, owner:'PLAYER', classType:'KNIGHT', unitClass:'KNIGHT', level:1, hp:100, maxHp:100, atk:40, def:30, ap:2, baseAP:2, x, y, promotions:{combatRank:0}, isDead:false }, extra||{});
  window.setTerrain = (x,y,terrain,structure) => { const t = state.currentBattle.map.tiles.find(t=>t.x===x&&t.y===y); t.terrain=terrain; t.type=terrain; t.structure=structure||null; t.hasRoad=false; };
  setTerrain(5,5,'plain'); setTerrain(6,5,'plain','city'); setTerrain(5,6,'hill'); setTerrain(6,6,'forest'); setTerrain(7,7,'mountain');
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

    print('\n=== 전투 단계 (옛 형식 / 승급 후 배열 형식) ===')
    page.evaluate("() => { window.A = mk('A',5,4,{promotions:{combatRank:2}}); window.D = mk('D',5,5,{owner:'ENEMY'}); }")
    v = page.evaluate("getCombatOdds(A,D).finalAtk")
    c.ok(abs(v-40*1.2)<1e-6, f'옛 형식 combatRank 2 -> 공격 +20% (got {v})')
    page.evaluate("() => { A.xp=999; applyPromotion(A,'combat_3'); }")
    c.ok(page.evaluate("Array.isArray(A.promotions)"), '승급 후 배열 형식')
    v = page.evaluate("getCombatOdds(A,D).finalAtk")
    c.ok(abs(v-40*1.3)<1e-6, f'전투 III 승급 후 공격 +30% 반영 (got {v})')
    c.ok(page.evaluate("getCombatRank(A)")==3, '단계 3')
    page.evaluate("() => { A.xp=999; applyPromotion(A,'combat_4'); }")
    v = page.evaluate("getCombatOdds(A,D).finalAtk")
    c.ok(abs(v-40*1.4)<1e-6, f'전투 IV: 누적 합산 없이 +40% (got {v})')
    page.evaluate("() => { window.B = mk('B',5,4,{promotions:{combatRank:6}}); B.xp=999; applyPromotion(B,'raider_1'); }")
    v = page.evaluate("getCombatOdds(B,D).finalAtk")
    c.ok(page.evaluate("getCombatRank(B)")==6 and abs(v-40*1.6)<1e-6, f'승급 변환 후에도 6단계 유지 (got {v})')
    c.ok(page.evaluate("calculateUnitPower(B)")==page.evaluate("calculateUnitPower(mk('Z',0,0,{promotions:{combatRank:6}}))"), '전투력 표시도 변환 후 동일')

    print('\n=== 도시 공격/주둔, 지형 방어 ===')
    page.evaluate("() => { window.a=mk('A2',6,4); window.d=mk('D2',6,5,{owner:'ENEMY'}); }")
    base_city = page.evaluate("getCombatOdds(a,d).P")
    page.evaluate("() => { a.promotions=['raider_1','raider_2']; }")
    p_raid = page.evaluate("getCombatOdds(a,d).P")
    c.ok(p_raid>base_city, f'도시 공격 II: 도시 칸 승률 상승 ({base_city:.3f} -> {p_raid:.3f})')
    page.evaluate("() => { a.promotions=[]; d.promotions=['garrison_1','garrison_2','garrison_3']; }")
    c.ok(page.evaluate("getCombatOdds(a,d).P")<base_city, '도시 주둔 III: 공격 승률 하락')
    page.evaluate("() => { window.h=mk('H',5,6,{owner:'ENEMY'}); window.k=mk('K',5,7); }")
    h0=page.evaluate("getCombatOdds(k,h).P")
    page.evaluate("() => { h.promotions=['guerilla_1','guerilla_2']; }")
    c.ok(page.evaluate("getCombatOdds(k,h).P")<h0, '게릴라: 언덕 방어 보너스')
    page.evaluate("() => { window.f=mk('F',6,6,{owner:'ENEMY'}); window.g=mk('G',6,7); }")
    f0=page.evaluate("getCombatOdds(g,f).P")
    page.evaluate("() => { f.promotions=['woodsman_1','woodsman_2']; }")
    c.ok(page.evaluate("getCombatOdds(g,f).P")<f0, '삼림 전문: 숲 방어 보너스')
    page.evaluate("() => { window.pl=mk('PL',5,5,{owner:'ENEMY',promotions:['guerilla_2','woodsman_2','garrison_3']}); window.q=mk('Q',5,4); }")
    pl0=page.evaluate("getCombatOdds(q,pl).P")
    page.evaluate("() => { pl.promotions=[]; }")
    c.ok(abs(page.evaluate("getCombatOdds(q,pl).P")-pl0)<1e-9, '평지에서는 지형 승급 보너스 없음')

    print('\n=== 제식 훈련 (선제 타격/반격) ===')
    dm = lambda: page.evaluate("calculateRoundCombatDamage(a,d,true,60)")
    page.evaluate("() => { a.promotions=[]; d.promotions=[]; }")
    base=dm()
    page.evaluate("() => { d.promotions=['drill_1','drill_2','drill_3','drill_4']; }")
    dr=dm()
    c.ok(dr['attackerDamage']>base['attackerDamage'] and dr['defenderDamage']<base['defenderDamage'], f'방어자 반격 증가 / 받는 피해 감소 ({base} -> {dr})')
    page.evaluate("() => { a.promotions=['drill_4']; d.promotions=[]; }")
    c.ok(dm()['attackerDamage']<base['attackerDamage'], '공격자 선제 타격: 받는 피해 감소')

    print('\n=== 이동 비용 ===')
    MV = "(p)=>getUnitMoveCost(mk('M',7,6,{promotions:p}),getBattleTiles().find(t=>t.x===7&&t.y===7))"
    c.ok(page.evaluate(MV, [])==2, '산악 기본 AP 2')
    c.ok(page.evaluate(MV, ['guerilla_1','guerilla_2'])==1, '게릴라 II: 산악 AP 1')
    c.ok(page.evaluate(MV, ['guerilla_1'])==2, '게릴라 I: 변화 없음')
    c.ok(page.evaluate("getUnitMoveCost(mk('M',5,4,{promotions:['guerilla_1','guerilla_2']}),getBattleTiles().find(t=>t.x===5&&t.y===5))")==1, '평지 최소 1')

    print('\n=== 의무병 ===')
    page.evaluate("""() => {
      state.playerUnits.length = 0;
      state.playerUnits.push(mk('M1',3,3,{hp:50,promotions:['medic_1']}), mk('X1',3,4,{hp:50}), mk('X2',3,7,{hp:50}), mk('X3',3,3,{hp:50}),
        mk('M2',6,6,{hp:50,promotions:['medic_1','medic_2']}), mk('X4',6,8,{hp:50}), mk('X5',6,9,{hp:50}), mk('DEAD',3,3,{hp:0,isDead:true}));
      applyMedicHealing();
    }""")
    hp = page.evaluate("Object.fromEntries(state.playerUnits.map(u=>[u.id,u.hp]))")
    c.ok(hp['M1']==60, f'의무병 I 본인 +10% (got {hp["M1"]})')
    c.ok(hp['X1']==60 and hp['X3']==60, '인접 / 같은 타일 아군 +10%')
    c.ok(hp['X2']==50, '범위 밖 아군 회복 없음')
    c.ok(hp['M2']==70, f'의무병 II 본인 +20% (got {hp["M2"]})')
    c.ok(hp['X4']==70 and hp['X5']==50, '의무병 II: 거리 2까지 O, 3은 X')
    c.ok(hp['DEAD']==0, '전사자는 회복 없음')
    page.evaluate("() => { state.playerUnits.find(u=>u.id==='M1').hp=100; applyMedicHealing(); }")
    c.ok(page.evaluate("state.playerUnits.find(u=>u.id==='M1').hp")==100, '최대 HP 초과 없음')

    print('\n=== 콘솔 오류 ===')
    c.ok(not errors, f'페이지 오류 없음 {errors[:3]}')
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} passed'); sys.exit(1 if c.fail else 0)
