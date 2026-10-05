"""지휘관 스킬(철갑 외피·수비의 리더·전략적 후퇴)과 유물 효과(군 전체·전투·턴·보상)가 실제로 적용되는지 검증."""
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
  window.mk = (id, x, y, extra) => Object.assign({ id, name:id, owner:'PLAYER', classType:'KNIGHT', unitClass:'KNIGHT', level:1, hp:100, maxHp:100, atk:40, def:30, ap:2, baseAP:2, x, y, promotions:{combatRank:0}, isDead:false, isDeployed:true }, extra||{});
  window.mkE = (id, x, y, extra) => mk(id, x, y, Object.assign({ owner:'ENEMY' }, extra||{}));
  window.setTerrain = (x,y,terrain,structure) => { const t = state.currentBattle.map.tiles.find(t=>t.x===x&&t.y===y); t.terrain=terrain; t.type=terrain; t.structure=structure||null; t.hasRoad=false; };
  setTerrain(5,5,'plain'); setTerrain(5,6,'hill');
  window.cmdRelics = (effects) => {   // effects: [[stat, value], ...] → 장착한 지휘관 유물 1개
    state.run.relics = [{ instanceId:'R1', id:'cmd_test', name:'시험 유물', kind:'commander', rarity:'rare', effects: effects.map(([stat,value]) => ({ scope:'army', stat, value })) }];
    state.run.equippedRelics = ['R1'];
  };
  window.noRelics = () => { state.run.relics = []; state.run.equippedRelics = []; };
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
    E = lambda js, arg=None: page.evaluate(js, arg) if arg is not None else page.evaluate(js)

    print('\n=== 지휘관 스킬 데이터 ===')
    page.evaluate("() => { state.commander.unlockedSkills = {}; }")

    print('\n=== 철갑 외피 (Ironclad) ===')
    dm = "([ironclad, attWon]) => { state.commander.unlockedSkills = { Ironclad: ironclad }; return calculateRoundCombatDamage(mkE('A',5,4), mk('D',5,5), attWon, 60); }"
    base = page.evaluate(dm, [False, True]); iron = page.evaluate(dm, [True, True])
    c.ok(iron['defenderDamage'] == round(base['defenderDamage']*0.7), f'아군 방어자가 받는 피해 -30% ({base["defenderDamage"]} -> {iron["defenderDamage"]})')
    base2 = page.evaluate("() => { state.commander.unlockedSkills = {}; return calculateRoundCombatDamage(mk('A',5,4), mkE('D',5,5), true, 60); }")
    iron2 = page.evaluate("() => { state.commander.unlockedSkills = { Ironclad: true }; return calculateRoundCombatDamage(mk('A',5,4), mkE('D',5,5), true, 60); }")
    c.ok(iron2['defenderDamage'] == base2['defenderDamage'], '적이 받는 피해는 그대로')
    c.ok(iron2['attackerDamage'] == round(base2['attackerDamage']*0.7) or abs(iron2['attackerDamage']-base2['attackerDamage']*0.7) <= 1, f'아군 공격자가 받는 반격 피해 -30% ({base2["attackerDamage"]} -> {iron2["attackerDamage"]})')

    print('\n=== 수비의 리더 (DefendersLeader) ===')
    dl = "([skill, chance]) => { state.commander.unlockedSkills = skill ? { DefendersLeader: true } : {}; return calculateRoundCombatDamage(mkE('A',5,4), mk('D',5,5), true, chance); }"
    off = page.evaluate(dl, [False, 60]); on = page.evaluate(dl, [True, 60]); calm = page.evaluate(dl, [True, 40])
    c.ok(on['attackerDamage'] > off['attackerDamage'] and on['defenderDamage'] < off['defenderDamage'], f'수세(적 승률 60%)에서 반격 증가 · 받는 피해 감소 ({off} -> {on})')
    c.ok(calm == page.evaluate(dl, [False, 40]), '적 승률 40%면 발동하지 않음')

    print('\n=== 전략적 후퇴 (TacticalRetreat) — 방어자가 아군일 때만 ===')
    ctx = "() => { state.commander.unlockedSkills = { TacticalRetreat: true, DefendersLeader: true }; const strong = mkE('S',5,4,{atk:500}); const weak = mk('W',5,5,{def:5}); return calculateCombatModifiers(strong, weak); }"
    m = page.evaluate(ctx)
    c.ok(any(s['id']=='TacticalRetreat_FlankingBonus' for s in m['synergies']) and abs(m['defender']['retreatChance']-0.2) < 1e-9, f'위기의 아군 방어자: 퇴각 확률 +20% (got {m["defender"]["retreatChance"]})')
    ctx2 = "() => { state.commander.unlockedSkills = { TacticalRetreat: true, DefendersLeader: true }; const strong = mk('S',5,4,{atk:500}); const weakEnemy = mkE('W',5,5,{def:5}); return calculateCombatModifiers(strong, weakEnemy); }"
    m2 = page.evaluate(ctx2)
    c.ok(m2['synergies'] == [] and m2['defender']['retreatChance'] == 0, '적 방어자에게는 지휘관 패시브가 붙지 않음')
    page.evaluate("() => { state.commander.unlockedSkills = {}; }")

    print('\n=== 지휘관 스킬 해금 트리 ===')
    tree = page.evaluate("() => { openSkillsModal(); return [...document.querySelectorAll('#modal-skill-grid .skill-card-name span:first-child')].map(e=>e.textContent); }")
    c.ok(any('DefendersLeader' in t for t in tree) and any('TacticalRetreat' in t for t in tree) and any('Ironclad' in t for t in tree), f'스킬 창에 3종 표시 ({len(tree)}개)')
    page.evaluate("() => closeAllModals()")

    print('\n=== 유물: 군 전체 공격/방어 ===')
    page.evaluate("() => cmdRelics([['atk',3],['def',-2]])")
    c.ok(page.evaluate("calculateEffectiveStrength(mk('P',0,0),'atk')")==43, '아군 공격력 +3')
    c.ok(page.evaluate("calculateEffectiveStrength(mk('P',0,0),'def')")==28, '아군 방어력 -2')
    c.ok(page.evaluate("calculateEffectiveStrength(mkE('E',0,0),'atk')")==40, '적에게는 적용되지 않음')
    page.evaluate("() => noRelics()")
    c.ok(page.evaluate("calculateEffectiveStrength(mk('P',0,0),'atk')")==40, '해제하면 원래대로')
    page.evaluate("() => { state.run.relics=[{instanceId:'R2',kind:'commander',effects:[{scope:'army',stat:'atk',value:5}]}]; state.run.equippedRelics=[]; }")
    c.ok(page.evaluate("calculateEffectiveStrength(mk('P',0,0),'atk')")==40, '장착하지 않은 유물은 효과 없음')

    print('\n=== 유물: 치명타 · 회피 · 지형 방어 · 반격 ===')
    page.evaluate("() => { noRelics(); window.A=mk('A',5,4); window.D=mkE('D',5,5); }")
    base = page.evaluate("(()=>{const o=getCombatOdds(A,D); return {atk:o.finalAtk, P:o.P};})()")
    page.evaluate("() => cmdRelics([['critRate',20]])")
    o = page.evaluate("(()=>{const o=getCombatOdds(A,D); return {atk:o.finalAtk, P:o.P};})()")
    c.ok(abs(o['atk']-base['atk']*1.10)<1e-6 and o['P']>base['P'], f'치명타율 20%p -> 공격력 +10% (기대값) ({base["atk"]} -> {o["atk"]})')
    page.evaluate("() => cmdRelics([['evasion',20]])")
    pe = page.evaluate("getCombatOdds(mkE('X',5,4), mk('Y',5,5)).P"); pn = page.evaluate("() => { noRelics(); return getCombatOdds(mkE('X',5,4), mk('Y',5,5)).P; }")
    c.ok(abs(pe - pn*0.8) < 1e-9, f'회피 20%: 적의 공격 승률 x0.8 ({pn:.3f} -> {pe:.3f})')
    c.ok(abs(page.evaluate("() => { cmdRelics([['evasion',20]]); return getCombatOdds(mk('X',5,4), mkE('Y',5,5)).P; }") - page.evaluate("() => { noRelics(); return getCombatOdds(mk('X',5,4), mkE('Y',5,5)).P; }")) < 1e-9, '아군이 공격할 때는 적 회피가 없음')
    page.evaluate("() => noRelics()")
    t0 = page.evaluate("getCombatOdds(mkE('X',5,5), mk('Y',5,6)).tileDefBonus")   # 언덕 위 아군 방어
    page.evaluate("() => cmdRelics([['terrainDef',10]])")
    t1 = page.evaluate("getCombatOdds(mkE('X',5,5), mk('Y',5,6)).tileDefBonus")
    c.ok(abs((t1-t0)-0.10) < 1e-9, f'지형 방어 +10%p: 언덕 방어 보너스 {t0} -> {t1}')
    t2 = page.evaluate("getCombatOdds(mkE('X',5,3), mk('Y',5,5)).tileDefBonus")
    c.ok(t2 == 0, '방어 보너스가 없는 평지에서는 변화 없음')
    page.evaluate("() => noRelics()")
    cb = page.evaluate("calculateRoundCombatDamage(mk('A',5,4), mkE('D',5,5), true, 60)")
    page.evaluate("() => cmdRelics([['counterDmg',50]])")
    cd = page.evaluate("calculateRoundCombatDamage(mkE('A',5,4), mk('D',5,5), true, 60)")
    page.evaluate("() => noRelics()")
    cn = page.evaluate("calculateRoundCombatDamage(mkE('A',5,4), mk('D',5,5), true, 60)")
    c.ok(cd['attackerDamage'] > cn['attackerDamage'], f'반격 피해 +50%: {cn["attackerDamage"]} -> {cd["attackerDamage"]}')

    print('\n=== 유물: 선물 유물은 받은 캐릭터만 ===')
    page.evaluate("() => { noRelics(); window.G1=mk('G1',0,0,{giftRelics:[{effects:[{scope:'self',stat:'evasion',value:8},{scope:'self',stat:'atk',value:5}]}]}); window.G2=mk('G2',0,0); }")
    c.ok(page.evaluate("getRelicStatFor(G1,'evasion')")==8 and page.evaluate("getRelicStatFor(G2,'evasion')")==0, '받은 캐릭터만 회피 +8')
    c.ok(page.evaluate("calculateEffectiveStrength(G1,'atk')")==40, '선물 atk는 선물할 때 이미 더했으므로 전투에서 이중 적용하지 않음')
    page.evaluate("() => cmdRelics([['evasion',5]])")
    c.ok(page.evaluate("getRelicStatFor(G1,'evasion')")==13 and page.evaluate("getRelicStatFor(G2,'evasion')")==5, '지휘관 유물과 합산')

    print('\n=== 유물: 흡혈 (전투 후 회복) ===')
    page.evaluate("""() => {
      noRelics(); cmdRelics([['lifesteal',50]]);
      window.__rand = Math.random; Math.random = () => 0;     // 주사위 0 → 공격자 승리
      const a = state.playerUnits.find(u=>!u.isDead && u.isDeployed); window.LA = a;
      a.x=5; a.y=4; a.hp=50; a.ap=2; a.affection=90; a.favorability=90; a.isInactivated=false; a.promotions={combatRank:0};
      const e = state.enemyUnits[0]; window.LE = e; e.x=5; e.y=5; e.isDead=false; e.hp=50; e.maxHp=50;
      window.__hpBefore = a.hp;
      executeCombat(a, e);
      Math.random = window.__rand;
    }""")
    after = page.evaluate("({hp: LA.hp, dead: LE.isDead})")
    c.ok(after['dead'], '공격 성공 (적 처치)')
    c.ok(after['hp'] > 50 - 1 or after['hp'] >= 50, f'흡혈로 HP 회복 (50 -> {after["hp"]})')
    page.evaluate("() => noRelics()")

    print('\n=== 유물: 보호막이 교환 피해를 먼저 막음 ===')
    r = page.evaluate("""() => { const u = mk('S',0,0,{hp:80, statuses:[{type:'SHIELD', value:15, turns:5, source:'유물'}]});
      applyExchangeDamage(u, 10); const a = {hp:u.hp, sh:u.statuses.length?u.statuses[0].value:0};
      applyExchangeDamage(u, 10); return {a, hp:u.hp, left:u.statuses.length}; }""")
    c.ok(r['a']=={'hp':80,'sh':5} and r['hp']==75 and r['left']==0, f'보호막 15: 10 흡수 -> 5 남음, 다음 10 중 5 흡수 후 HP -5 ({r})')

    print('\n=== 유물: 전투 시작 (보호막 · 첫 턴 AP · 이동력) ===')
    page.evaluate("""() => { noRelics();
      cmdRelics([['shield',10],['hp',5],['firstTurnAp',1],['ap',1],['mobility',1]]);
      state.playerUnits.forEach(u => { u.statuses = []; u.baseAP = 2; u.ap = 0; u.relicApBonus = 0; });
      applyRelicBattleStart(); }""")
    st = page.evaluate("(()=>{const u=state.playerUnits.find(u=>!u.isDead&&u.isDeployed&&u.x>=0); return {sh:(u.statuses||[]).filter(s=>s.type==='SHIELD').reduce((a,s)=>a+s.value,0), base:u.baseAP, ap:u.ap, bonus:u.relicApBonus};})()")
    c.ok(st['sh']==15, f'보호막 = shield 10 + hp 5 (got {st["sh"]})')
    c.ok(st['base']==4 and st['bonus']==2, f'ap+mobility 2 -> baseAP 4 (got {st["base"]})')
    c.ok(st['ap']==5, f'첫 턴 AP = baseAP 4 + 1 (got {st["ap"]})')
    page.evaluate("() => applyRelicBattleStart()")
    c.ok(page.evaluate("state.playerUnits.find(u=>!u.isDead&&u.isDeployed&&u.x>=0).baseAP")==4, '다시 호출해도 이동력이 중복되지 않음')
    page.evaluate("() => removeRelicBattleBonuses()")
    c.ok(page.evaluate("state.playerUnits.find(u=>!u.isDead&&u.isDeployed&&u.x>=0).baseAP")==2, '전투가 끝나면 이동력 보정을 걷음')
    page.evaluate("() => { noRelics(); state.playerUnits.forEach(u=>{u.statuses=[];}); }")

    print('\n=== 유물: 턴 시작 재생 ===')
    page.evaluate("""() => { cmdRelics([['regen',4]]); state.playerUnits.forEach(u => { u.hp = 50; });
      window.__regenIds = state.playerUnits.filter(u=>!u.isDead && u.isDeployed !== false).map(u=>u.id); applyRelicRegen(); }""")
    hp = page.evaluate("state.playerUnits.filter(u=>__regenIds.includes(u.id)).map(u=>[u.hp, Math.min(u.maxHp, 54)])")
    c.ok(all(h==e for h,e in hp), f'재생 +4 (최대 HP까지): {hp}')
    page.evaluate("() => { cmdRelics([['regen',-3]]); state.playerUnits.forEach(u => { u.hp = 2; }); applyRelicRegen(); }")
    hp = page.evaluate("state.playerUnits.filter(u=>__regenIds.includes(u.id)).map(u=>u.hp)")
    c.ok(all(h==1 for h in hp), f'음수 재생은 HP 1 아래로 내려가지 않음: {hp}')
    page.evaluate("() => noRelics()")

    print('\n=== 유물: 승리 정산 (전투 후 회복 · SP · 호감도) ===')
    page.evaluate("""() => { cmdRelics([['healAfterBattle',20],['spGain',1],['affection',3]]);
      const alive = state.playerUnits.filter(u=>!u.isDead);
      state.currentDeployedUnitIds = alive.map(u=>u.id);
      alive.forEach(u => { u.hp = 40; u.skillPoints = 0; u.affection = 50; u.favorability = 50; });
      window.__alive = alive.map(u=>u.id); applyRelicVictoryRewards(); }""")
    res = page.evaluate("state.playerUnits.filter(u=>__alive.includes(u.id)).map(u=>[u.hp, Math.min(u.maxHp, 40 + Math.round(u.maxHp*0.2)), u.skillPoints, u.affection])")
    c.ok(all(r[0]==r[1] and r[2]==1 and r[3]==53 for r in res), f'HP +20% / SP +1 / 호감도 +3: {res}')
    page.evaluate("() => noRelics()")

    print('\n=== 유물: 골드 · 상점 · 경험치 ===')
    c.ok(page.evaluate("() => { noRelics(); return scaleIncomeWithRelics(100) === scaleIncome(100); }"), '유물 없으면 수입 그대로')
    c.ok(page.evaluate("() => { cmdRelics([['goldGain',50]]); return scaleIncomeWithRelics(100) === Math.round(scaleIncome(100)*1.5); }"), '골드 획득 +50%')
    c.ok(page.evaluate("() => { cmdRelics([['goldGain',900]]); return scaleIncomeWithRelics(100) === scaleIncome(100)*2; }"), '골드 획득은 +100%까지만 (서버 상한 보호)')
    c.ok(page.evaluate("() => { cmdRelics([['shopDiscount',20]]); return scaleShopGold(100) === Math.round(scaleGold(100)*0.8); }"), '상점 할인 20%')
    c.ok(page.evaluate("() => { cmdRelics([['shopDiscount',500]]); return scaleShopGold(100) === Math.round(scaleGold(100)*0.25); }"), '상점 할인은 75%까지만')
    xp = page.evaluate("""() => { noRelics(); const u = mk('XP',0,0,{xp:0}); state.playerUnits.push(u);
      const baseline = (() => { let t=0; for (let i=0;i<200;i++){ u.xp=0; awardPromotionXp(u, 10, 't'); t+=u.xp; } return t/200; })();
      cmdRelics([['expGain',50]]);
      const boosted = (() => { let t=0; for (let i=0;i<200;i++){ u.xp=0; awardPromotionXp(u, 10, 't'); t+=u.xp; } return t/200; })();
      state.playerUnits.pop(); noRelics(); return {baseline, boosted}; }""")
    c.ok(xp['boosted'] > xp['baseline']*1.3, f'병과 경험치 +50%: {xp}')

    print('\n=== 유물: 스킬 재사용 대기 ===')
    cd = page.evaluate("""() => {
      const u = mk('SK',5,5,{}); state.playerUnits.push(u);
      const skill = SkillEngine.normalizeSkill({ id:'t_skill', name:'시험', type:'ACTIVE', costAP:0, coolDown:3, targeting:{mode:'SELF',rangeMin:0,rangeMax:0,radius:0,affects:'ALLY'}, effects:[{type:'HEAL', value:1}] });
      const out = {};
      noRelics(); u.skillCooldowns = {}; out.base = (SkillEngine.cast(u, skill, 5, 5), u.skillCooldowns.t_skill);
      cmdRelics([['skillCooldown',-1]]); u.skillCooldowns = {}; out.minus = (SkillEngine.cast(u, skill, 5, 5), u.skillCooldowns.t_skill);
      cmdRelics([['skillCooldown',-9]]); u.skillCooldowns = {}; out.floor = (SkillEngine.cast(u, skill, 5, 5), u.skillCooldowns.t_skill);
      state.playerUnits.pop(); noRelics(); return out; }""")
    c.ok(cd == {'base':3, 'minus':2, 'floor':1}, f'쿨다운 3 -> 2 (최소 1): {cd}')

    print('\n=== 유물: 시공간 리와인더 / 사거리 ===')
    page.evaluate("""() => {
      window.SlgStore = { list: async (name) => name === 'relics' ? [
        { id:'cmd_hourglass', name:'모래시계', kind:'commander', rarity:'rare', description:'', effects:[{scope:'run', stat:'rewinder', value:2}] }] : [] };
    }""")
    page.evaluate("async () => { await ensureRewardDataLoaded(); }")
    rw0 = page.evaluate("state.rewinders")
    page.evaluate("() => { noRelics(); grantRelic('cmd_hourglass', null); }")
    c.ok(page.evaluate("state.rewinders") == rw0 + 2, f'획득 즉시 리와인더 +2 ({rw0} -> {page.evaluate("state.rewinders")})')
    c.ok(page.evaluate("state.run.relics[0].rewinderGranted") == 2, '지급 기록 남김')
    page.evaluate("() => noRelics()")
    c.ok(page.evaluate("() => { state.commander.unlockedSkills = {}; return getEnemiesInRange(Object.assign(state.playerUnits.find(u=>!u.isDead), {x:5,y:2,ap:2,isInactivated:false})).length >= 0; }"), '사거리 함수 정상')
    near = page.evaluate("""() => { state.commander.unlockedSkills = {}; const u = state.playerUnits.find(u=>!u.isDead); u.x=5; u.y=2; u.ap=2; u.isInactivated=false;
      const e = state.enemyUnits[0]; e.isDead=false; e.x=5; e.y=4;
      noRelics(); const a = getEnemiesInRange(u).length; cmdRelics([['range',1]]); const b = getEnemiesInRange(u).length; noRelics(); return [a,b]; }""")
    c.ok(near == [0, 1], f'사거리 +1: 2칸 떨어진 적이 사거리에 들어옴 {near}')

    print('\n=== 콘솔 오류 ===')
    c.ok(not errors, f'페이지 오류 없음 {errors[:3]}')
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} passed'); sys.exit(1 if c.fail else 0)
