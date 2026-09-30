import json
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *
TEMPLATE_JS = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12},{x:4,y:12}], enemy: [{x:3,y:2}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [
    { id:'e1', name:'고블린', owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', x:3, y:2, hp:50, maxHp:50, atk:30, def:20, baseAP:2, ap:2 },
    { id:'e2', name:'궁수', owner:'ENEMY', side:'ENEMY', classType:'ARCHER', unitClass:'ARCHER', x:4, y:2, hp:40, maxHp:40, atk:30, def:10, baseAP:2, ap:2 }
  ];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}
"""
def boot(pw, payload=None):
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    if payload is not None:
        page.evaluate("p => { window.__cloudLoad = p; }", payload)
        page.evaluate("() => window.onSupabaseUserReady({uid:'test-user-123'})")
        page.wait_for_timeout(600)
    return browser,page,errors
def launch_selected(page):
    page.click('#btn-open-deploy-modal'); page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main'); page.wait_for_timeout(700)
def win(page):
    page.evaluate("() => { state.enemyUnits.forEach(e => { e.isDead = true; e.hp = 0; }); window.defeatedEnemyCount = state.enemyUnits.length; checkTacticalVictory(); }"); page.wait_for_timeout(300)
def fresh_run(page, seed):
    page.evaluate("(s)=>startNewRun(s,{force:true})", seed)
def advance_to(page, pred):
    """RunEngine으로 (전투 없이) 조건을 만족하는 노드가 열릴 때까지 첫 번째 열린 노드를 완료한다. 열린 노드 id 반환."""
    return page.evaluate("""(predSrc)=>{ const pred=new Function('n','return '+predSrc);
      for(let i=0;i<10;i++){ const av=RunEngine.getAvailableNodes(state.run); const hit=av.find(pred); if(hit) return hit.id; RunEngine.completeNode(state.run, av[0].id);} return null; }""", pred)

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=boot(pw)
    for t in ['A-1','A-2','B-1']: page.evaluate(TEMPLATE_JS,t)   # B-2는 일부러 등록하지 않는다 (템플릿 없음 경로 검증)

    print('\n=== 런 seed 재현성 ===')
    fresh_run(page,'RUN-777'); m1=page.evaluate("JSON.stringify(state.run.mapState)")
    fresh_run(page,'RUN-888'); m2=page.evaluate("JSON.stringify(state.run.mapState)")
    fresh_run(page,'RUN-777'); m3=page.evaluate("JSON.stringify(state.run.mapState)")
    c.ok(m1==m3 and m1!=m2,'같은 런 seed → 같은 노드 그래프, 다른 seed → 다른 그래프')

    print('\n=== 이벤트 노드 ===')
    fresh_run(page,'RUN-EVT'); start=page.evaluate("state.run.mapState.layers[0][0]")
    page.evaluate("(id)=>RunEngine.completeNode(state.run,id)",start)
    evn=page.evaluate("state.run.mapState.layers[1][0]")
    page.evaluate("(id)=>{ RunEngine.getNode(state.run,id).type='event'; selectNode(id); }",evn)
    c.ok('이벤트' in page.evaluate("document.querySelector('#btn-open-deploy-modal').innerText"),'이벤트 노드 선택 → 버튼 문구 "이벤트 진행"')
    c.ok('AP 소모 없음' in page.evaluate("document.getElementById('strat-action-summary-cost').textContent"),'AP 소모 없음 표기')
    g0=page.evaluate("state.gold"); r0=page.evaluate("state.rewinders"); ap0=page.evaluate("state.strategy.commanderAP")
    page.evaluate("()=>{ const u=state.playerUnits[0]; u.hp=10; }")
    ev=page.evaluate("(id)=>RunEngine.rollEvent(state.run,RunEngine.getNode(state.run,id))",evn)
    page.click('#btn-open-deploy-modal'); page.wait_for_timeout(200)
    c.ok(page.is_visible('#modal-run-node') and not page.evaluate("document.getElementById('modal-sector-deploy').classList.contains('open')"),'이벤트 전용 창이 뜨고 출전 편성 모달은 안 뜬다: '+ev['title'])
    page.evaluate("()=>{ const b=document.querySelector('#modal-run-node button'); b.click(); b.click(); }")  # 이중 클릭
    page.wait_for_timeout(200)
    st=page.evaluate("({g:state.gold,r:state.rewinders,ap:state.strategy.commanderAP,hp:state.playerUnits[0].hp,max:state.playerUnits[0].maxHp,done:state.run.completedNodes,last:state.run.encounters.slice(-1)[0],modal:!!document.getElementById('modal-run-node')})")
    eff=ev['effects'][0]
    exp_ok={'gold':st['g']==g0+eff['amount'],'rewinder':st['r']==r0+1,'heal_all':st['hp']==st['max']}[eff['type']]
    c.ok(exp_ok,f"이벤트 효과 정확히 1회 적용 ({eff['type']}) — 이중 클릭에도 중복 없음")
    c.ok(evn in st['done'] and st['last']['reason']=='node' and not st['modal'],'노드 완료 + encounters 기록 + 창 닫힘')
    c.ok(st['ap']==ap0,'AP 변화 없음')
    c.ok(page.evaluate("RunEngine.getAvailableNodes(state.run).length")>=1,'다음 노드 해금')

    print('\n=== 상점 노드 ===')
    shp=advance_to(page,"n.type!=='boss'")
    page.evaluate("(id)=>{ RunEngine.getNode(state.run,id).type='shop'; selectNode(id); state.gold=1000; }",shp)
    page.click('#btn-open-deploy-modal'); page.wait_for_timeout(200)
    btns=page.evaluate("[...document.querySelectorAll('#modal-run-node button')].map(b=>b.textContent)")
    c.ok(len(btns)==3 and '리와인더' in btns[0] and '회복' in btns[1] and btns[2]=='떠나기','상점 버튼: '+str(btns))
    r0=page.evaluate("state.rewinders")
    page.evaluate("()=>document.querySelectorAll('#modal-run-node button')[0].click()"); page.wait_for_timeout(150)
    c.ok(page.evaluate("state.gold")==850 and page.evaluate("state.rewinders")==r0+1,'리와인더 구매: -150G, +1')
    c.ok(page.evaluate("document.querySelectorAll('#modal-run-node button')[0].disabled"),'같은 상품 재구매 불가(구매 완료)')
    page.evaluate("()=>{ state.playerUnits[0].hp=10; }")
    page.evaluate("()=>document.querySelectorAll('#modal-run-node button')[1].click()"); page.wait_for_timeout(150)
    c.ok(page.evaluate("state.gold")==730 and page.evaluate("state.playerUnits[0].hp")==page.evaluate("state.playerUnits[0].maxHp"),'전원 회복 구매: -120G, 체력 회복')
    page.evaluate("()=>{ state.gold=50; }"); page.evaluate("renderAll()")
    page.evaluate("()=>{ document.getElementById('modal-run-node').remove(); }")
    page.evaluate("(id)=>{ openRunNodeModal(RunEngine.getNode(state.run,id)); }",shp)
    c.ok(page.evaluate("[...document.querySelectorAll('#modal-run-node button')].slice(0,2).every(b=>b.disabled)"),'골드 부족하면 구매 버튼 비활성')
    page.evaluate("()=>document.querySelectorAll('#modal-run-node button')[2].click()"); page.wait_for_timeout(150)
    c.ok(shp in page.evaluate("state.run.completedNodes"),'떠나기 → 노드 완료')

    print('\n=== 보스: 템플릿 없는 섹터 → 실패 경로 → 클리어 ===')
    boss=advance_to(page,"n.type==='boss'")
    c.ok(boss is not None and page.evaluate("(id)=>RunEngine.getNode(state.run,id).sectorId",boss)=='B-2','보스 노드가 열림 (섹터 B-2)')
    page.evaluate("(id)=>selectNode(id)",boss); page.evaluate("()=>{ state.strategy.commanderAP=24; state.gold=500; }")
    errors.clear()
    launch_selected(page)
    st=page.evaluate("({battle:state.currentBattle,ap:state.strategy.commanderAP,view:state.currentView,avail:RunEngine.isNodeAvailable(state.run,state.selectedNodeId)})")
    c.ok(st['battle'] is None and st['ap']==24 and st['view']=='STRATEGY' and st['avail'],'B-2 템플릿이 없으면 전투가 만들어지지 않고 AP 환불, 노드는 그대로 열려 있음 (기본맵으로 대체하지 않는다)')
    c.ok(any('B-2' in e and '템플릿' in e for e in errors),'사용자에게 원인 전달(콘솔/로그): '+(errors[0][:60] if errors else ''))
    errors.clear()  # 위 오류는 의도된 실패 경로
    page.evaluate(TEMPLATE_JS,'B-2')
    g0=page.evaluate("state.gold"); r0=page.evaluate("state.rewinders")
    launch_selected(page)
    c.ok(page.evaluate("state.currentBattle.type")=='boss','보스 전투 type=boss')
    rw=page.evaluate("state.currentBattle.rewards")
    c.ok(rw[0]['amount']==400 and any(r['type']=='rewinder' for r in rw),'보스 보상: 골드 x2(400) + 리와인더 확정 '+json.dumps(rw))
    win(page); page.click('#btn-victory-proceed'); page.wait_for_timeout(500)
    st=page.evaluate("({s:state.run.status,g:state.gold,r:state.rewinders,avail:RunEngine.getAvailableNodes(state.run).length,hud:document.getElementById('strat-run-hud-text').textContent,btn:document.querySelector('#btn-open-deploy-modal').innerText,dis:document.querySelector('#btn-open-deploy-modal').disabled})")
    c.ok(st['s']=='won' and st['g']==g0+400 and st['r']==r0+1,'보스 클리어 → run.status=won, 보상 지급')
    c.ok(st['avail']==0 and '클리어' in st['hud'] and st['dis'] and '런 종료' in st['btn'],'런 종료 UI: HUD 클리어, 열린 노드 없음, 출격 버튼 비활성')
    page.evaluate("openSectorDeployModal()")
    c.ok(not page.evaluate("document.getElementById('modal-sector-deploy').classList.contains('open')"),'런 종료 후 출전 모달 열리지 않음')
    c.ok(page.evaluate("state.run.encounters.slice(-1)[0].type")=='boss' and page.evaluate("state.run.encounters.slice(-1)[0].victory"),'마지막 encounters 기록 = 보스 승리')

    print('\n=== 새 런 ===')
    seed_old=page.evaluate("state.run.seed"); g=page.evaluate("state.gold")
    page.click('#btn-new-run'); page.wait_for_timeout(300)
    st=page.evaluate("({seed:state.run.seed,status:state.run.status,done:state.run.completedNodes,seq:state.encounterSeq,g:state.gold,ap:state.strategy.commanderAP,avail:RunEngine.getAvailableNodes(state.run).length})")
    c.ok(st['seed']!=seed_old and st['status']=='active' and st['done']==[] and st['seq']==0 and st['avail']==1,'새 런: 새 seed, 진행도/encounterSeq 초기화, 시작 노드 열림')
    c.ok(st['g']==g and st['ap']==24,'캐릭터/골드는 유지')
    # 전투 중에는 새 런 불가
    fresh_run(page,'RUN-LOCK'); page.evaluate("(id)=>selectNode(id)",page.evaluate("state.run.mapState.layers[0][0]")); launch_selected(page)
    c.ok(page.evaluate("startNewRun()")==False and page.evaluate("state.currentBattle!==null"),'전투 중에는 새 런 시작 차단')

    print('\n=== 같은 seed → 같은 전장 (재현) ===')
    page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(200)
    page.evaluate("state.forcedSeed='A-1-111111'"); launch_selected(page); t1=page.evaluate("JSON.stringify(state.currentBattle.map.tiles)")
    page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(200)
    page.evaluate("state.forcedSeed='A-1-111111'"); launch_selected(page); t2=page.evaluate("JSON.stringify(state.currentBattle.map.tiles)")
    page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(200)
    page.evaluate("state.forcedSeed='A-1-222222'"); launch_selected(page); t3=page.evaluate("JSON.stringify(state.currentBattle.map.tiles)")
    c.ok(t1==t2 and t1!=t3,'forcedSeed 같으면 타일 동일, 다르면 다름')
    page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(200)
    c.ok(errors==[],'여기까지 콘솔/페이지 오류 없음 '+str(errors[:4]))

    print('\n=== 승리 직후 저장 → 새로고침 → 보상 수령 ===')
    fresh_run(page,'RUN-WON'); s0=page.evaluate("state.run.mapState.layers[0][0]"); page.evaluate("(id)=>selectNode(id)",s0)
    launch_selected(page); win(page); g0=page.evaluate("state.gold")
    sv=page.evaluate("saveGameState(true), window.__saved[window.__saved.length-1]")
    c.ok(sv['currentBattle']['status']=='won' and sv['player']['gold']==g0,'won 상태 전투가 저장됨 (골드는 아직 미지급)')
    b2,p2,e2=boot(pw, sv)
    c.ok(p2.evaluate("state.currentBattle && state.currentBattle.status")=='won' and p2.is_visible('#btn-victory-proceed'),'새로고침 후 승리 모달이 다시 뜬다')
    p2.click('#btn-victory-proceed'); p2.wait_for_timeout(500)
    st=p2.evaluate("({g:state.gold,done:state.run.completedNodes,b:state.currentBattle,v:state.currentView})")
    c.ok(st['g']==g0+200 and s0 in st['done'] and st['b'] is None and st['v']=='STRATEGY','수령 → 보상 1회 지급 + 노드 완료 + 전략맵')
    p2.evaluate("saveGameState(true)"); sv2=p2.evaluate("window.__saved[window.__saved.length-1]")
    c.ok(sv2['currentBattle'] is None,'전투가 끝난 뒤 저장에는 currentBattle이 없다')
    c.ok(e2==[],'복원 오류 없음 '+str(e2[:3]))
    b2.close()

    print('\n=== 옛 v1 세이브(평평한 구조) 호환 ===')
    units=sv['player']['characters']
    v1={'version':'1.0.0','savedAt':'2026-01-01T00:00:00Z','guest':sv['guest'],'currentView':'SECTOR_MAP','currentSector':'A-2',
        'strategy':sv['player']['progression']['strategy'],'turn':5,'gold':777,'rewinders':2,'stackMoveEnabled':True,
        'commander':sv['player']['progression']['commander'],'playerUnits':units,'characterCollection':[],
        'enemyUnits':[{'id':'old1','owner':'ENEMY','hp':10,'maxHp':10,'x':1,'y':1,'classType':'MELEE'}],'selectedUnitId':units[0]['id']}
    b3,p3,e3=boot(pw, v1)
    st=p3.evaluate("({g:state.gold,r:state.rewinders,t:state.turn,view:state.currentView,run:state.run.status,done:state.run.completedNodes.length,battle:state.currentBattle,en:state.enemyUnits.length,act:document.getElementById('view-strategy-main').classList.contains('active'),units:state.playerUnits.length})")
    c.ok(st['g']==777 and st['r']==2 and st['t']==5 and st['units']==len(units),'v1 세이브의 골드/리와인더/턴/캐릭터 복원')
    c.ok(st['run']=='active' and st['done']==0 and st['battle'] is None,'v1에는 런이 없으므로 새 런이 생성됨')
    c.ok(st['view']=='STRATEGY' and st['act'] and st['en']==0,'SECTOR_MAP으로 저장돼 있어도 전략맵으로 열림, 옛 enemyUnits는 버림')
    c.ok(e3==[],'v1 로드 오류 없음 '+str(e3[:3]))
    b3.close()

    print('\n=== 손상된 세이브 방어 ===')
    bad=json.loads(json.dumps(sv2)); bad['player']['roguelikeRun']['mapState']={'nodes':[],'layers':[]}
    b4,p4,e4=boot(pw, bad)
    c.ok(p4.evaluate("state.run.status")=='active' and p4.evaluate("state.run.mapState.nodes.length")>0 and p4.evaluate("state.gold")==sv2['player']['gold'],'손상된 런 → 새 런으로 대체, 골드/캐릭터는 유지')
    b4.close()
    stale=json.loads(json.dumps(sv)); stale['currentBattle']['nodeId']='Z-9-999'; stale['currentBattle']['status']='active'
    b5,p5,e5=boot(pw, stale)
    c.ok(p5.evaluate("state.currentBattle")is None and p5.evaluate("state.currentView")=='STRATEGY' and p5.evaluate("state.enemyUnits.length")==0,'런에 없는 노드의 저장 전투는 버리고 전략맵으로')
    c.ok(e5==[] and e4==[],'오류 없음 '+str((e4+e5)[:3]))
    b5.close()
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건'); sys.exit(1 if c.fail else 0)
