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
    page.click('#btn-open-deploy-modal')
    page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main')
    page.wait_for_timeout(700)

def kill_enemies_and_win(page):
    page.evaluate("() => { state.enemyUnits.forEach(e => { e.isDead = true; e.hp = 0; }); window.defeatedEnemyCount = state.enemyUnits.length; checkTacticalVictory(); }")
    page.wait_for_timeout(300)

srv=start_server()
c=Check()
with sync_playwright() as pw:
    browser,page,errors=boot(pw)
    page.evaluate(TEMPLATE_JS,'A-1'); page.evaluate(TEMPLATE_JS,'A-2'); page.evaluate(TEMPLATE_JS,'B-1')
    page.evaluate("() => { state.run.mapState.nodes.forEach(n => { if (n.type==='event'||n.type==='shop') n.type='battle'; }); }")  # 이 파일은 '전투' 흐름 전용 (이벤트/상점은 e2e2)
    start=page.evaluate("state.run.mapState.layers[0][0]")
    gold0=page.evaluate("state.gold"); rew0=page.evaluate("state.rewinders")

    print('\n=== [잘못된 진입 차단] ===')
    calls_before=page.evaluate("window.__templateCalls.length")  # 전략맵이 지형 막대용으로 조회한 횟수는 제외
    c.ok(page.evaluate("enterEncounter('A-1')")==False,"섹터 id로는 전투에 못 들어간다 (enterEncounter('A-1') → false)")
    lockedNode=page.evaluate("state.run.mapState.layers[2][0]")
    c.ok(page.evaluate("(id)=>enterEncounter(id)",lockedNode)==False,f'잠긴 노드({lockedNode}) 진입 차단')
    page.evaluate("switchGameView('SECTOR_MAP')")
    c.ok(page.evaluate("state.currentView")=='STRATEGY' and page.evaluate("!!document.getElementById('view-strategy-main').classList.contains('active')"),'전투 없이 전술 화면 전환 시도 → 전략맵 유지')
    c.ok(page.evaluate("state.currentBattle")is None,'위 시도들로 전투가 만들어지지 않았다')
    errors.clear()  # 위 시도들은 의도된 실패라 콘솔 error가 정상적으로 찍힌다

    print('\n=== [11단계] 노드 → enterEncounter → 전술맵 ===')
    page.evaluate("(id)=>selectNode(id)", start)
    launch_selected(page)
    b=page.evaluate("state.currentBattle")
    c.ok(b is not None and b['nodeId']==start and b['sectorId']=='A-1' and b['type']=='battle','currentBattle이 시작 노드에서 생성: '+str(b and (b['id'],b['nodeId'],b['type'])))
    c.ok(b['id']=='enc-00001','Encounter id enc-00001')
    c.ok(b['map']['width']==8 and b['map']['height']==14 and len(b['map']['tiles'])==112,'map 8x14, 112 tiles')
    c.ok(page.evaluate("window.__templateCalls.slice(%d)" % 0)[-1]=='A-1','템플릿은 노드의 sector → defaultTemplateId(A-1)로 조회')
    c.ok(page.evaluate("state.currentView")=='SECTOR_MAP' and page.evaluate("document.getElementById('view-sector-field').classList.contains('active')"),'전술 화면 활성')
    c.ok(page.evaluate("state.strategy.commanderAP")is None,'출격 AP 없음 (통솔력은 출전 인원 한도)')
    c.ok(page.evaluate("state.enemyUnits.length")==2,'적 2기 (템플릿에 배치된 고정 적)')
    c.ok(b['rewards'][0]=={'type':'gold','amount':200},'rewards gold 200 (적 2 x 100): '+json.dumps(b['rewards']))
    c.ok(page.evaluate("document.querySelectorAll('#grid-map .tile, #grid-map > *').length")>=112,'그리드에 타일 렌더 (>=112)')
    c.ok(errors==[],'콘솔/페이지 오류 없음 '+str(errors[:3]))

    print('\n=== [13단계] 전투 중 저장 구조 ===')
    page.evaluate("saveGameState(true)")
    sv=page.evaluate("window.__saved[window.__saved.length-1]")
    c.ok(sv['version']=='3.0.0' and set(['player','run','currentBattle']).issubset(sv.keys()),'v3 최상위: '+str(sorted(sv.keys())))
    c.ok(set(sv['player'].keys())=={'loopCount','memories','unlockedCharacters','settings','characterCollection','inventory','rewinders','progression'},'player(영구) 구성: '+str(sorted(sv['player'].keys())))
    run=sv['run']
    c.ok(set(['id','seed','status','currentNodeId','completedNodes','mapState','encounters','encounterSeq','party','reserve','gold','commandBonus']).issubset(run.keys()),'run 구성: '+str(sorted(run.keys())))
    c.ok(not any(('tiles' in n or 'map' in n) for n in run['mapState']['nodes']),'런(노드)에 전술 타일 없음')
    c.ok(sv['currentBattle']['live']['enemyUnits'].__len__()==2 and sv['currentBattle']['map']['tiles'].__len__()==112 and run['encounterSeq']==1,'currentBattle에 map + live.enemyUnits, encounterSeq=1')
    c.ok('playerUnits' not in sv and 'gold' not in sv,'옛 평평한 키(playerUnits/gold)는 최상위에 없음')
    saved_mid=sv
    mid_battle_id=b['id']; mid_seed=b['seed']

    print('\n=== [13단계] 전투 중 저장 → 새로고침 → 복원 ===')
    b2,p2,e2=boot(pw, saved_mid)
    c.ok(p2.evaluate("state.currentBattle && state.currentBattle.id")==mid_battle_id,'같은 전투 복원 (id '+mid_battle_id+')')
    c.ok(p2.evaluate("state.currentBattle.seed")==mid_seed,'seed 동일')
    c.ok(p2.evaluate("state.enemyUnits.length")==2 and p2.evaluate("state.currentBattle.map.tiles.length")==112,'적/맵 복원')
    c.ok(p2.evaluate("state.run.seed")==saved_mid['run']['seed'] and p2.evaluate("state.encounterSeq")==1,'런 seed / encounterSeq 복원')
    c.ok(p2.evaluate("state.isCombatActive")==True and p2.evaluate("state.isCombatPaused")==True,'복원된 전투는 일시정지 상태')
    c.ok(p2.is_visible('#modal-tactical-pause') and p2.is_visible('#btn-pause-resume'),'일시정지 메뉴(계속하기/후퇴) 표시')
    p2.click('#btn-pause-resume'); p2.wait_for_timeout(300)
    c.ok(p2.evaluate("state.isCombatPaused")==False and p2.evaluate("document.getElementById('view-sector-field').classList.contains('active')"),'계속하기 → 전술 화면 재개')
    c.ok(e2==[],'복원 중 오류 없음 '+str(e2[:3]))
    b2.close()

    print('\n=== [12단계] 승리 → finishEncounter ===')
    kill_enemies_and_win(page)
    c.ok(page.evaluate("state.currentBattle.status")=='won','승리 판정 → battle.status=won')
    c.ok(page.evaluate("state.gold")==gold0,'승리 직후에는 아직 골드 미지급 (복귀 시 1회 지급)')
    c.ok(page.is_visible('#btn-victory-proceed'),'승리 모달 표시')
    page.click('#btn-victory-proceed'); page.wait_for_timeout(500)
    st=page.evaluate("({gold:state.gold,rew:state.rewinders,view:state.currentView,battle:state.currentBattle,done:state.run.completedNodes,cur:state.run.currentNodeId,enc:state.run.encounters,avail:RunEngine.getAvailableNodes(state.run).map(n=>n.id),sel:state.selectedNodeId,enemies:state.enemyUnits.length})")
    c.ok(st['gold']==gold0+200,f"골드 지급 +200 ({gold0} → {st['gold']})")
    c.ok(st['rew']>=rew0 and st['rew']<=rew0+1,f"리와인더 {rew0} → {st['rew']}")
    c.ok(st['done']==[start] and st['cur']==start,'노드 완료: completedNodes=[시작 노드]')
    c.ok(st['battle'] is None and st['enemies']==0,'currentBattle/enemyUnits 정리')
    c.ok(st['view']=='STRATEGY' and page.evaluate("document.getElementById('view-strategy-main').classList.contains('active')"),'전략맵 복귀')
    c.ok(len(st['avail'])>=1 and all(n!=start for n in st['avail']),'다음 노드 해금: '+str(st['avail']))
    c.ok(st['sel'] in st['avail'],'선택 노드가 열린 노드로 이동')
    c.ok(len(st['enc'])==1 and st['enc'][0]['victory']==True and st['enc'][0]['encounterId']=='enc-00001','run.encounters에 요약 1건 (맵 없음): '+json.dumps({k:v for k,v in st['enc'][0].items() if k!='rewards'}))
    c.ok('tiles' not in json.dumps(st['enc']) ,'encounters 요약에 타일 없음')
    c.ok(page.evaluate(f"document.querySelector('#node-pin-{start}').classList.contains('is-completed')"),'시작 노드 핀이 completed 스타일')
    c.ok(page.evaluate("document.getElementById('strat-run-hud-text').textContent").endswith('1/7층'),'HUD 진행 1/7층')
    c.ok(page.evaluate("finishEncounter({victory:true})") is None,'finishEncounter 중복 호출은 무시(이중 지급 없음)')
    c.ok(page.evaluate("state.gold")==gold0+200,'골드 그대로')

    print('\n=== [12단계] 후퇴: 노드 미완료 ===')
    # 다음 전투 노드 선택
    nxt=page.evaluate("RunEngine.getAvailableNodes(state.run).find(n=>RunEngine.isBattleType(n.type)).id")
    page.evaluate("(id)=>selectNode(id)", nxt)
    launch_selected(page)
    c.ok(page.evaluate("state.currentBattle && state.currentBattle.id")=='enc-00002','두 번째 전투 id enc-00002')
    gold_before=page.evaluate("state.gold")
    page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(300)
    st=page.evaluate("({done:state.run.completedNodes,battle:state.currentBattle,enc:state.run.encounters,avail:RunEngine.getAvailableNodes(state.run).map(n=>n.id),gold:state.gold,view:state.currentView})")
    c.ok(nxt not in st['done'] and nxt in st['avail'],'후퇴: 노드 완료 안 됨, 다시 도전 가능')
    c.ok(st['battle'] is None and st['view']=='STRATEGY','후퇴: 전투 정리 + 전략맵')
    c.ok(st['gold']==gold_before,'후퇴: 보상 없음')
    c.ok(len(st['enc'])==2 and st['enc'][1]['victory']==False and st['enc'][1]['reason']=='retreat','encounters에 후퇴 기록')

    print('\n=== [12단계] 승리 후 "계속 탐색" → 복귀 버튼(switchGameView) 경로 ===')
    page.evaluate("(id)=>selectNode(id)", nxt)
    launch_selected(page)
    kill_enemies_and_win(page)
    exp_gold=page.evaluate("state.currentBattle.rewards.filter(r=>r.type==='gold').reduce((a,r)=>a+r.amount,0)")
    page.click('#btn-victory-explore'); page.wait_for_timeout(200)
    c.ok(page.evaluate("state.currentView")=='SECTOR_MAP' and page.evaluate("state.currentBattle.status")=='won','계속 탐색: 전술 화면 유지, status=won')
    g1=page.evaluate("state.gold")
    page.click('#btn-return-to-strategy'); page.wait_for_timeout(400)
    st=page.evaluate("({done:state.run.completedNodes,battle:state.currentBattle,gold:state.gold,view:state.currentView})")
    c.ok(nxt in st['done'] and st['battle'] is None and st['view']=='STRATEGY','복귀 버튼으로 나가도 노드 완료 + 보상 처리')
    c.ok(st['gold']==g1+exp_gold,f'그 경로에서도 보상 1회 지급 (+{exp_gold}G)')

    print('\n=== [12단계] 승리 후 일시정지 메뉴의 "후퇴"로 나가도 승리로 처리 ===')
    nxt2=page.evaluate("RunEngine.getAvailableNodes(state.run).find(n=>RunEngine.isBattleType(n.type))?.id")
    if nxt2:
        page.evaluate("(id)=>selectNode(id)", nxt2); launch_selected(page); kill_enemies_and_win(page)
        page.evaluate("executeTacticalRetreat()"); page.wait_for_timeout(300)
        c.ok(page.evaluate("(id)=>state.run.completedNodes.includes(id)", nxt2),'won 상태에서 후퇴 핸들러로 나가도 노드 완료')
    else:
        print('SKIP (다음 노드가 전투가 아님)')

    print('\n=== [12단계] 파산 패배 ===')
    nxt3=page.evaluate("RunEngine.getAvailableNodes(state.run).find(n=>RunEngine.isBattleType(n.type))?.id")
    if nxt3:
        page.evaluate("(id)=>selectNode(id)", nxt3); launch_selected(page)
        page.evaluate("finishEncounter({victory:false, reason:'bankrupt'})"); page.wait_for_timeout(200)
        c.ok(page.evaluate("(id)=>!state.run.completedNodes.includes(id) && state.currentBattle===null && state.run.encounters.slice(-1)[0].reason==='bankrupt'", nxt3),'패배: 노드 미완료, 기록됨')
    else:
        print('SKIP')
    c.ok(errors==[],'전 과정 콘솔/페이지 오류 없음 '+str(errors[:5]))
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건')
sys.exit(1 if c.fail else 0)
