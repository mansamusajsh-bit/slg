"""국가별 전투 규칙 (nationRules.js): 16개 규칙이 상대국 적에게만 걸리는지 · 승률 창 표기 · 병과 특성."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

TEMPLATE_JS = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12},{x:4,y:12}], enemy: [{x:3,y:2}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [
    { id:'e1', name:'적병', owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', x:3, y:2, hp:100, maxHp:100, atk:30, def:20, baseAP:2, ap:2 }
  ];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}
"""

# 전투 하나를 잡아 두고, 각 사례마다 국가·유닛·지형을 직접 꾸민다.
SETUP_JS = """
() => {
  window.__mk = (id, cls, owner, x, y, extra) => Object.assign({
    id, name: id, classType: cls, unitClass: cls, owner, x, y, hp: 100, maxHp: 100, atk: 40, def: 30,
    baseAP: 2, ap: 2, level: 1, statuses: [], skillCooldowns: {}, affection: 80, isDead: false, isDeployed: true,
    movedTilesThisTurn: 0
  }, extra || {});
  window.__scene = (nation, players, enemies, terrain) => {
    state.currentBattle.nationId = nation;
    state.currentBattle.nationState = {};
    state.currentBattle.map.tiles.forEach(t => { t.terrain = 'plain'; t.structure = null; t.hasRoad = false; });
    Object.entries(terrain || {}).forEach(([k, v]) => { const [x, y] = k.split(',').map(Number); getTile(x, y).terrain = v; });
    window.__origIds = window.__origIds || state.playerUnits.map(u => u.id);
    state.playerUnits = state.playerUnits.filter(u => window.__origIds.includes(u.id)); // 이전 사례의 시험 유닛은 치운다
    state.playerUnits.forEach(u => { u.x = -1; u.y = -1; u.isDeployed = false; });
    players.forEach(p => state.playerUnits.push(p));
    state.currentDeployedUnitIds = players.map(p => p.id);
    state.enemyUnits = enemies;
    resetTacticalBattleState(); // 이전 사례에서 승리 처리된 상태를 되돌린다
  };
}
"""

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    c.ok(enter_region(page),'부관 임명 → 구역 진입')
    for sid in ['A-1','A-2','B-1']: page.evaluate(TEMPLATE_JS, sid)
    start=page.evaluate("state.run.mapState.layers[0][0]")
    ok=page.evaluate("async (id)=>{ state.run.mapState.nodes.forEach(n=>{ if(n.type!=='boss') n.type='battle'; }); return await enterEncounter(id); }", start)
    c.ok(ok and page.evaluate("state.currentBattle.nationId")=='liona', '전투 진입 시 상대 국가가 currentBattle.nationId에 기록된다 (리오나)')
    page.evaluate(SETUP_JS)

    print('\n=== 데이터 ===')
    d=page.evaluate("""()=>{ const ids=Object.keys(REGIONS); const R=NationRules.NATION_RULES;
      return { missing: ids.filter(i=>!R[i]), bad: Object.values(R).filter(r=>!r.name||!r.description||!r.weakness||!r.rule||/\\d/.test(r.description+r.weakness)).map(r=>r.id) }; }""")
    c.ok(d['missing']==[] and d['bad']==[], f'16개 국가 모두 이름·설명·약점(수치 없음)·규칙 키를 가진다 {d}')

    print('\n=== 이동력 · 사거리 (리오나 · 미라 · 바스카) ===')
    r=page.evaluate("""()=>{
      const pA=__mk('pA','ARCHER','PLAYER',2,12);
      const eA=__mk('eA','ARCHER','ENEMY',3,2); const eK=__mk('eK','KNIGHT','ENEMY',4,2,{baseAP:2});
      __scene('liona',[pA],[eA]); NationRules.onBattleStart(state.currentBattle);
      const liona=eA.baseAP;
      __scene('vaska',[pA],[eK]); NationRules.onBattleStart(state.currentBattle);
      const vaska=eK.baseAP;
      const eA2=__mk('eA2','ARCHER','ENEMY',3,2);
      __scene('mira',[pA],[eA2]);
      return { liona, vaska, miraEnemy:getUnitAttackRange(eA2), miraPlayer:getUnitAttackRange(pA), playerAp:pA.baseAP };
    }""")
    print('   ',r)
    c.ok(r['liona']==4, '리오나: 적 궁수 이동력 +2 (2→4)')
    c.ok(r['vaska']==1, '바스카: 적 기사 이동력 -2, 최소 1')
    c.ok(r['miraEnemy']==2 and r['miraPlayer']<=2, '미라: 적 궁수 사거리 +1')
    c.ok(r['playerAp']==2, '아군 궁수는 국가 규칙을 받지 않는다')

    print('\n=== 바스카 면역 · 오리아 쿨다운 (스킬 엔진) ===')
    r=page.evaluate("""()=>{
      const p=__mk('pS','MELEE','PLAYER',3,4); const eK=__mk('eK','KNIGHT','ENEMY',3,3);
      __scene('vaska',[p],[eK]);
      const sk=SkillEngine.fromPreset('shield_bash'); p.skillTree=[]; p.learnedSkills=[]; p.customSkill=null;
      const res=SkillEngine.cast(p, sk, eK.x, eK.y);
      const stunned=SkillEngine.hasStatus(eK,'STUN');
      const eM=__mk('eM','MAGE','ENEMY',3,3); __scene('oria',[p],[eM]);
      const fb=SkillEngine.fromPreset('fireball'); const r2=SkillEngine.cast(eM, fb, p.x, p.y);
      const pM=__mk('pM','MAGE','PLAYER',3,6); const fb2=SkillEngine.fromPreset('fireball');
      eM.x=3; eM.y=5; const r3=SkillEngine.cast(pM, fb2, eM.x, eM.y);
      return { ok:res.ok, stunned, enemyCd:eM.skillCooldowns[fb.id], playerCd:pM.skillCooldowns[fb2.id], c2:r2.ok, c3:r3.ok };
    }""")
    print('   ',r)
    c.ok(r['ok'] and not r['stunned'], '바스카: 적 기사에게 기절이 걸리지 않는다')
    c.ok(r['c2'] and r['enemyCd']==1, '오리아: 적 마법사 화염구 재사용 대기 2→1')
    c.ok(r['c3'] and r['playerCd']==2, '아군 마법사는 그대로 2')

    print('\n=== 루마 은신 ===')
    r=page.evaluate("""()=>{
      const p=__mk('pL','ARCHER','PLAYER',3,6,{giftRelics:[{effects:[{stat:'range',value:2}]}]});
      const e=__mk('eL','MELEE','ENEMY',3,4);
      __scene('luma',[p],[e],{'3,4':'forest'});
      const far=getEnemiesInRange(p).length;
      const before=state.enemyUnits[0].hp; executeCombat(p,e); const blocked=!e.isDead && e.hp===before && p.ap===2;
      p.y=5; const near=getEnemiesInRange(p).length;
      getTile(3,4).terrain='plain'; p.y=6; const plain=getEnemiesInRange(p).length;
      return {far, blocked, near, plain};
    }""")
    print('   ',r)
    c.ok(r['far']==0 and r['blocked'], '루마: 숲 위의 적은 거리 2에서 노릴 수 없다 (공격도 막힌다)')
    c.ok(r['near']==1 and r['plain']==1, '바로 곁이거나 숲 밖이면 노릴 수 있다')

    print('\n=== 승률 창 (로칸 · 발렌 · 아르카 · 티노 · 토르바) ===')
    r=page.evaluate("""()=>{
      const out={};
      const p=__mk('pO','MELEE','PLAYER',3,6);
      const eR=__mk('eR','MELEE','ENEMY',3,5,{hp:50});
      __scene('rokan',[p],[eR]); out.rokan=getCombatOdds(eR,p).factors.filter(f=>f.label.startsWith('국가 규칙'));
      eR.hp=10; out.rokanMax=getCombatOdds(eR,p).factors.find(f=>f.label.startsWith('국가 규칙')).pct;
      const eV=__mk('eV','FIREARM','ENEMY',3,5); __scene('valen',[p],[eV]);
      const ov=getCombatOdds(eV,p); out.valen=ov.factors.filter(f=>f.label.startsWith('국가 규칙'));
      __scene(null,[p],[eV]); const base=getCombatOdds(eV,p); out.valenDefRatio=ov.finalDef/base.finalDef;
      const a1=__mk('a1','MELEE','ENEMY',3,5), a2=__mk('a2','MELEE','ENEMY',4,4), a3=__mk('a3','MELEE','ENEMY',5,3);
      __scene('arca',[p],[a1,a2,a3]); out.arca=getCombatOdds(p,a1).factors.filter(f=>f.label.startsWith('국가 규칙'));
      a3.x=7; a3.y=0; out.arcaBroken=getCombatOdds(p,a1).factors.filter(f=>f.label.startsWith('국가 규칙')).length;
      const eT=__mk('eT','MELEE','ENEMY',3,5); __scene('tino',[p],[eT]);
      out.tino=getCombatOdds(p,eT).factors.filter(f=>f.label.startsWith('국가 규칙')).length;
      const eArc=__mk('eArc','ARCHER','ENEMY',3,5), eG=__mk('eG','MELEE','ENEMY',4,5);
      __scene('torva',[p],[eArc,eG]); out.torva=getCombatOdds(p,eArc).factors.filter(f=>f.label.startsWith('국가 규칙')).length;
      out.playerSide=getCombatOdds(p,eArc).factors.filter(f=>f.side==='atk'&&f.label.startsWith('국가 규칙')).length;
      return out;
    }""")
    print('   ',r)
    c.ok(len(r['rokan'])==1 and r['rokan'][0]['pct']==50 and r['rokanMax']==75, '로칸: 체력 -50% → 공격 +50%, 최대 +75%, 승률 창에 표시')
    c.ok(len(r['valen'])==1 and abs(r['valenDefRatio']-0.5)<1e-6, '발렌: 총병 공격은 방어 50% 무시, 승률 창에 표시')
    c.ok(len(r['arca'])==1 and r['arca'][0]['pct']==30 and r['arcaBroken']==0, '아르카: 3기 이상 8방향 연결 시 방어 +30%, 끊기면 해제')
    c.ok(r['tino']==1 and r['torva']==1, '티노 부동 반격 · 토르바 호위도 승률 창에 표시')
    c.ok(r['playerSide']==0, '아군 공격에는 국가 공격 보정이 붙지 않는다')

    page.evaluate("()=>{ debugParams.forcedBattleResult='FORCE_WIN'; }")

    print('\n=== 티노 부동 반격 (교환 피해) ===')
    r=page.evaluate("""()=>{
      const p=__mk('pT','MELEE','PLAYER',3,6,{atk:200}); const e=__mk('eT','MELEE','ENEMY',3,5,{atk:40});
      __scene('tino',[p],[e]); executeCombat(p,e); const hpStill=p.hp;
      const p2=__mk('pT2','MELEE','PLAYER',3,6,{atk:200}); const e2=__mk('eT2','MELEE','ENEMY',3,5,{atk:40,movedTilesThisTurn:1});
      __scene('tino',[p2],[e2]); executeCombat(p2,e2); const hpMoved=p2.hp;
      return {hpStill, hpMoved, dead:e.isDead};
    }""")
    print('   ',r)
    c.ok(r['dead'] and r['hpStill']<=80, f"이동하지 않은 근접병을 이겨도 반격 피해(최소 공격력 50%)를 받는다 (HP {r['hpStill']})")
    c.ok(r['hpMoved']>r['hpStill'], '이동한 근접병은 반격을 보장하지 않는다')

    print('\n=== 토르바 호위 ===')
    r=page.evaluate("""()=>{
      const p=__mk('pG','MELEE','PLAYER',3,6,{atk:200}); const eArc=__mk('eArc','ARCHER','ENEMY',3,5), eG=__mk('eG','MELEE','ENEMY',4,5);
      __scene('torva',[p],[eArc,eG]); executeCombat(p,eArc);
      return {archer:eArc.isDead, guard:eG.isDead};
    }""")
    c.ok(not r['archer'] and r['guard'], '궁수를 노렸지만 곁의 근접병이 대신 막아서 쓰러진다 (1회만)')

    print('\n=== 아라 돌파 넉백 ===')
    r=page.evaluate("""()=>{
      const k=__mk('eK','KNIGHT','ENEMY',3,3,{movedTilesThisTurn:1});
      const t=__mk('pT','MELEE','PLAYER',3,4), n=__mk('pN','MELEE','PLAYER',4,4);
      __scene('ara',[t,n],[k]); debugParams.forcedBattleResult='FORCE_LOSE'; executeCombat(k,t);
      const pushed={x:n.x,y:n.y};
      const k2=__mk('eK2','KNIGHT','ENEMY',3,3,{movedTilesThisTurn:0}); const t2=__mk('pT2','MELEE','PLAYER',3,4), n2=__mk('pN2','MELEE','PLAYER',4,4);
      __scene('ara',[t2,n2],[k2]); executeCombat(k2,t2); const still={x:n2.x,y:n2.y};
      debugParams.forcedBattleResult='FORCE_WIN';
      return {pushed, still, dead:t.isDead};
    }""")
    print('   ',r)
    c.ok(r['dead'] and r['pushed']=={'x':4,'y':5}, '이동 후 공격으로 이긴 적 기사가 공격 방향(아래)으로 곁의 아군을 1칸 밀어낸다')
    c.ok(r['still']=={'x':4,'y':4}, '이동하지 않고 공격하면 밀어내지 않는다')

    print('\n=== 엘다 보호막 · 나루 AP · 실바 후퇴 ===')
    r=page.evaluate("""()=>{
      const p=__mk('pE','MELEE','PLAYER',3,6); const e=__mk('eE','MELEE','ENEMY',3,5);
      __scene('elda',[p],[e]); NationRules.onBattleStart(state.currentBattle);
      const shield=(e.statuses.find(s=>s.type==='SHIELD')||{}).value||0; const pShield=(p.statuses||[]).some(s=>s.type==='SHIELD');
      const eN=__mk('eN','MELEE','ENEMY',3,5,{ap:1,baseAP:2}); const pN=__mk('pN','MELEE','PLAYER',3,6);
      __scene('naru',[pN],[eN]); debugParams.forcedBattleResult='FORCE_LOSE'; executeCombat(eN,pN);
      const naruAp=eN.ap; debugParams.forcedBattleResult='FORCE_WIN';
      // 적 궁수가 아군을 쓰러뜨리고 (3,5)로 전진한 뒤, 남은 아군(3,7)에게서 멀어지는 쪽으로 1칸 물러난다
      const eS=__mk('eS','ARCHER','ENEMY',3,4,{hp:100}); const pS=__mk('pS','MELEE','PLAYER',3,5), pS2=__mk('pS2','MELEE','PLAYER',3,7);
      __scene('silva',[pS,pS2],[eS]); debugParams.forcedBattleResult='FORCE_LOSE'; executeCombat(eS,pS); debugParams.forcedBattleResult='FORCE_WIN';
      return {shield,pShield,naruAp,pNdead:pN.isDead,silva:{x:eS.x,y:eS.y},silvaAlive:!eS.isDead};
    }""")
    print('   ',r)
    c.ok(r['shield']==30 and not r['pShield'], '엘다: 전투 시작 시 적에게만 보호막 (최대 HP의 30%)')
    c.ok(r['pNdead'] and r['naruAp']==1, '나루: 아군을 처치한 적은 AP 1 회복 (공격에 1 쓰고 1 돌려받음, 최대 AP 이하)')
    c.ok(r['silvaAlive'] and r['silva']=={'x':3,'y':4}, f"실바: 사격 후 아군에게서 1칸 물러난다 ({r['silva']})")

    print('\n=== 사보 도하 ===')
    r=page.evaluate("""()=>{
      const e=__mk('eW','MELEE','ENEMY',3,3); const p=__mk('pW','MELEE','PLAYER',5,5);
      __scene('savo',[p],[e],{'3,4':'river','5,6':'river'});
      return {enemy:getUnitMoveCost(e,getTile(3,4)), player:getUnitMoveCost(p,getTile(5,6))};
    }""")
    c.ok(r['enemy']==1 and r['player']==2, f'사보: 적만 물(강) 칸을 1 AP로 건넌다 {r}')

    print('\n=== 모르 불사 (부활 대기 중에는 승리하지 않는다) ===')
    r=page.evaluate("""async ()=>{
      const realRandom=Math.random; Math.random=()=>0.99; // 포섭 굴림 실패 (포섭되면 부활하지 않는다)
      const p=__mk('pM','MELEE','PLAYER',3,9,{atk:500}); const e=__mk('eM','MELEE','ENEMY',3,8);
      __scene('mor',[p],[e]); executeCombat(p,e);
      Math.random=realRandom; debugParams.forcedBattleResult=null;
      p.x=3; p.y=13; // 적 턴에 부활한 적이 닿지 않는 곳으로
      const afterKill={dead:e.isDead, active:state.isCombatActive, won:!!window.victoryProcessed};
      await processEnemyTurn();
      const revived={dead:e.isDead, hp:e.hp, active:state.isCombatActive};
      e.isDead=true; e.hp=0; NationRules.onUnitDeath(e); checkTacticalVictory();
      return {afterKill, revived, secondDeathWins:!!window.victoryProcessed};
    }""")
    print('   ',r)
    c.ok(r['afterKill']['dead'] and r['afterKill']['active'] and not r['afterKill']['won'], '모르: 마지막 적이 쓰러져도 부활 대기 중이면 승리하지 않는다')
    c.ok(not r['revived']['dead'] and r['revived']['hp']==30, '다음 적 턴에 HP 30%로 부활')
    c.ok(r['secondDeathWins'], '부활은 전투당 1회 — 두 번째로 쓰러지면 승리')
    page.evaluate("()=>{ debugParams.forcedBattleResult=null; }")

    print('\n=== 병과 특성 ===')
    r=page.evaluate("""()=>{
      const k=__mk('pK','KNIGHT','PLAYER',3,6,{movedTilesThisTurn:3}); const e=__mk('eX','MELEE','ENEMY',3,5);
      __scene(null,[k],[e]);
      const charge=getCombatOdds(k,e).factors.find(f=>f.label.startsWith('병과 특성: 기마'));
      k.movedTilesThisTurn=9; const chargeMax=getCombatOdds(k,e).factors.find(f=>f.label.startsWith('병과 특성: 기마')).pct;
      getTile(3,5).terrain='forest'; const fort=getCombatOdds(k,e).factors.find(f=>f.label.startsWith('병과 특성: 방진'));
      const a=__mk('pA','ARCHER','PLAYER',2,2); __scene(null,[a],[e],{'2,2':'mountain'});
      const eagle=getUnitAttackRange(a);
      return {charge:charge&&charge.pct, chargeMax, fort:fort&&fort.pct, eagle, burst:[getCollateralBurstBonus(__mk('m','MAGE','PLAYER',0,0),2), getCollateralBurstBonus(__mk('m','MAGE','PLAYER',0,0),9)]};
    }""")
    print('   ',r)
    c.ok(r['charge']==12 and r['chargeMax']==20, '기사 기마 돌격: 이동 칸당 +4%, 최대 +20%')
    c.ok(r['fort']==15, '근접 방진 구축: 숲에서 방어 +15%')
    c.ok(r['eagle']>=2, '궁수 독수리의 눈: 산악에서 사거리 +1')
    c.ok(abs(r['burst'][0]-0.10)<1e-9 and abs(r['burst'][1]-0.20)<1e-9, '마법사 연쇄 폭발: 인접 적당 +5%p, 최대 +20%p')

    print('\n=== 부관 브리핑 ===')
    b=page.evaluate("()=>{ const R=NationRules.NATION_RULES.mira; return {has: typeof CampaignMapView!=='undefined' && CampaignMapView.BRIEFING.nationRule.length>0, desc:R.description}; }")
    c.ok(b['has'], '브리핑에 국가 규칙 줄이 있다')

    print('\n=== 콘솔 오류 ===')
    c.ok(not errors, f'페이지 오류 없음 ({errors[:3]})')

print('%d/%d pass' % (c.n-c.fail, c.n)); sys.exit(1 if c.fail else 0)
