"""적 자동 생성: 아군과 같은 캐릭터 풀(characters)에서 seed로 적을 뽑는지 검증."""
import json, os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

POOL_JS = """
(n) => {
  const classes = ['MELEE','ARCHER','MAGE','KNIGHT','FIREARM'];
  window.__characters = Array.from({length:n}, (_,i) => ({
    id: 'char_'+i, name: '캐릭터'+i, classType: classes[i%5], unitClass: classes[i%5], avatar: '👤',
    stats: { hp: 100, maxHp: 100, atk: 40+i, def: 30, mobility: 2 }, favorability: 70, imageUrl: '',
    customSkill: { name: '패시브'+i, type: 'PASSIVE', effectValue: 20, description: 'x' }
  }));
  if (typeof syncGlobalCharactersFromSupabase === 'function') syncGlobalCharactersFromSupabase(JSON.parse(JSON.stringify(window.__characters)));
}"""
# 적 스폰 지점 n개가 있는 템플릿 (고정 적 없음)
TPL_JS = """
([id, spawns]) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12},{x:4,y:12}], enemy: spawns.map(([x,y])=>({x,y})) };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}"""

def enter(page, seed=None):
    if seed: page.evaluate("(s)=>{state.forcedSeed=s}", seed)
    page.evaluate("()=>{state.strategy.commanderAP=24}"); page.click('#btn-open-deploy-modal'); page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main'); page.wait_for_timeout(700)

def leave(page):
    page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(250)

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    page.evaluate("()=>{ startNewRun('RUN-ENEMY',{force:true}); }")
    start=page.evaluate("state.run.mapState.layers[0][0]"); page.evaluate("(id)=>selectNode(id)",start)

    print('\n=== 캐릭터 풀에서 적 생성 ===')
    page.evaluate(POOL_JS, 8)
    page.evaluate(TPL_JS, ['A-1', [[1,1],[3,1],[5,1],[7,1]]])
    enter(page, 'A-1-424242')
    e1=page.evaluate("state.enemyUnits"); sp=page.evaluate("state.currentBattle.map.spawnPoints.enemy")
    pool_ids={f'char_{i}' for i in range(8)}
    c.ok(len(e1)>=2 and len(e1)==len(sp),f'적 {len(e1)}명 생성 = 사용된 적 스폰 {len(sp)}곳 (스폰 4곳 중 seed가 고른 수)')
    c.ok(all(e['sourceCharacterId'] in pool_ids for e in e1),'모든 적이 캐릭터 풀의 캐릭터에서 유래 (sourceCharacterId)')
    c.ok(len({e['sourceCharacterId'] for e in e1})==len(e1),'풀이 충분하면 한 전투에 같은 캐릭터가 중복 등장하지 않음')
    c.ok(all(any(p['x']==e['x'] and p['y']==e['y'] for p in sp) for e in e1),'적은 모두 스폰 지점 위에 배치')
    c.ok(all(e['owner']=='ENEMY' and e['hp']==e['maxHp'] and not e['isDead'] for e in e1),'owner=ENEMY, 풀 HP')
    c.ok(all(e.get('customSkill') and e['customSkill']['name'].startswith('패시브') for e in e1),'아군과 같은 customSkill 구조를 가진다')
    # 난이도 배율: A-1=EASY → 0.8배, 레벨 1
    src={c_['id']:c_ for c_ in page.evaluate("window.__characters")}
    ok_scale=all(e['atk']==round(src[e['sourceCharacterId']]['stats']['atk']*0.8) and e['maxHp']==80 and e['level']==1 for e in e1)
    c.ok(ok_scale,'EASY 섹터 배율 x0.8, 레벨 1 (예: HP 100→80)')
    c.ok(page.evaluate("state.currentBattle.rewards[0].amount")==len(e1)*100,f'rewards 골드 = 적 수 x 100 ({len(e1)*100})')
    leave(page)

    print('\n=== seed 재현성 ===')
    def snap(seed):
        enter(page, seed); r=page.evaluate("state.enemyUnits.map(e=>[e.id,e.x,e.y])"); t=page.evaluate("JSON.stringify(state.currentBattle.map.tiles)"); leave(page); return r,t
    a1=snap('A-1-424242'); a2=snap('A-1-424242'); b1=snap('A-1-999999')
    c.ok(a1==a2,'같은 seed → 같은 적 구성/위치 + 같은 지형')
    c.ok(a1!=b1,'다른 seed → 다른 전장')
    c.ok(page.evaluate("state.enemyUnits.length")==0,'전투 종료 후 enemyUnits 정리')

    print('\n=== 풀이 스폰 수보다 작을 때 ===')
    page.evaluate(POOL_JS, 2)
    enter(page,'A-1-424242'); e=page.evaluate("state.enemyUnits")
    c.ok(len(e)>=2 and all(x['sourceCharacterId'] in {'char_0','char_1'} for x in e),f'풀 2명이어도 스폰 수만큼 채운다 (재사용 허용, {len(e)}명)')
    leave(page)

    print('\n=== 적 스폰 지점이 없는 템플릿 ===')
    page.evaluate(POOL_JS, 6)
    page.evaluate(TPL_JS, ['A-1', []])
    enter(page,'A-1-777');     e=page.evaluate("state.enemyUnits")
    c.ok(2<=len(e)<=4,f'스폰 지점이 없어도 seed로 자리를 골라 적 {len(e)}명 생성')
    c.ok(all(x['y']<=page.evaluate("state.currentBattle.map.height")*0.5 for x in e),'적은 플레이어(하단) 반대편에 배치: y='+str(sorted(x['y'] for x in e)))
    e_again=None; leave(page)
    enter(page,'A-1-777'); e_again=page.evaluate("state.enemyUnits.map(e=>[e.id,e.x,e.y])"); leave(page)
    c.ok(e_again==[[x['id'],x['x'],x['y']] for x in e],'그 경우도 같은 seed면 같은 배치')

    print('\n=== 캐릭터 풀이 비어 있을 때 ===')
    page.evaluate("window.__characters=[]"); page.evaluate("()=>{ window.syncGlobalCharactersFromSupabase && 0; }")
    page.evaluate(TPL_JS, ['A-1', [[1,1],[3,1]]])
    # 캐시를 비운 새 페이지에서 확인
    b2,p2,e2=new_page(pw)
    p2.goto(f'http://127.0.0.1:{PORT}/index.html'); p2.wait_for_timeout(1200)
    p2.evaluate(TPL_JS, ['A-1', [[1,1],[3,1]]]); p2.evaluate("()=>{ startNewRun('RUN-ENEMY',{force:true}); }")
    p2.evaluate("(id)=>selectNode(id)", p2.evaluate("state.run.mapState.layers[0][0]"))
    ap=p2.evaluate("state.strategy.commanderAP"); e2.clear()
    enter(p2)
    st=p2.evaluate("({b:state.currentBattle,ap:state.strategy.commanderAP,view:state.currentView,avail:RunEngine.isNodeAvailable(state.run,state.selectedNodeId)})")
    c.ok(st['b'] is None and st['ap']==ap and st['view']=='STRATEGY' and st['avail'],'풀이 비고 고정 적도 없으면 전투를 시작하지 않는다 (AP 환불, 노드 유지)')
    c.ok(any('적으로 쓸 캐릭터가 없습니다' in x for x in e2),'원인 안내: '+(e2[0][:70] if e2 else '없음'))
    b2.close()

    print('\n=== 풀이 늦게 로드돼도 전투 진입 시 불러온다 ===')
    b3,p3,e3=new_page(pw)
    p3.goto(f'http://127.0.0.1:{PORT}/index.html'); p3.wait_for_timeout(1200)
    p3.evaluate(POOL_JS, 5); p3.evaluate(TPL_JS, ['A-1', [[1,1],[3,1],[5,1]]])  # 이 시점까지 캐시는 비어 있음
    p3.evaluate("()=>{ startNewRun('RUN-ENEMY',{force:true}); }")
    p3.evaluate("(id)=>selectNode(id)", p3.evaluate("state.run.mapState.layers[0][0]"))
    enter(p3,'A-1-5')
    c.ok(p3.evaluate("state.currentBattle!==null && state.enemyUnits.length>=2"),'enterEncounter가 풀을 먼저 불러온 뒤 적을 생성')
    b3.close()

    print('\n=== 보스/정예 배율 + 전투 진행 중 오류 없음 ===')
    page.evaluate(POOL_JS, 8); page.evaluate(TPL_JS, ['A-1',[[1,1],[3,1],[5,1]]]); page.evaluate(TPL_JS, ['B-2',[[1,1],[3,1]]])
    page.evaluate("()=>{ startNewRun('RUN-ENEMY',{force:true}); }")
    boss=page.evaluate("""()=>{ for(let i=0;i<10;i++){ const av=RunEngine.getAvailableNodes(state.run); const h=av.find(n=>n.type==='boss'); if(h) return h.id; RunEngine.completeNode(state.run,av[0].id);} }""")
    page.evaluate("(id)=>{selectNode(id); state.strategy.commanderAP=24;}",boss); enter(page,'B-2-1')
    eb=page.evaluate("state.enemyUnits")
    # B-2=NIGHTMARE(레벨6, x1.6) + boss(레벨+2, x1.5) → 레벨 8, HP 100*2.4=240
    c.ok(all(e['level']==8 and e['maxHp']==240 for e in eb),f'보스 노드(NIGHTMARE): 레벨 8, HP x2.4 (100→{eb[0]["maxHp"]})')
    c.ok(page.evaluate("state.currentBattle.rewards.some(r=>r.type==='rewinder')"),'보스 보상에 리와인더 포함')
    page.evaluate("()=>{ state.gold=5000; }")
    page.evaluate("executeEndTurn && executeEndTurn()"); page.wait_for_timeout(2500)
    c.ok(page.evaluate("state.enemyUnits.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.x>=0&&e.x<8&&e.y>=0&&e.y<14)"),'적 턴(AI) 진행 후에도 모든 적 좌표가 맵 안')
    leave(page)
    c.ok(errors==[],'콘솔/페이지 오류 없음 '+str(errors[:4]))
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건'); sys.exit(1 if c.fail else 0)
