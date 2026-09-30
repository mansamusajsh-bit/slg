const fs=require('fs'), vm=require('vm');
const ctx={console:{log(){},error:console.error,warn(){}}}; ctx.window=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
for (const f of ['seedEngine.js','mapSchema.js','runEngine.js']) vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',f),'utf8'),ctx,{filename:f});
const R=ctx.RunEngine, MS=ctx.MapSchema;
let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fail++;};
const SECT={
 'A-1':{id:'A-1',difficulty:'EASY',encounterPool:['battle','battle','event']},
 'A-2':{id:'A-2',difficulty:'NORMAL',encounterPool:['battle','battle','elite','event']},
 'B-1':{id:'B-1',difficulty:'HARD',encounterPool:['battle','elite','event','boss']},
 'B-2':{id:'B-2',difficulty:'NIGHTMARE',locked:true,encounterPool:['elite','boss']}};
// 결정론
const a=R.createRun(SECT,'RUN-111111'), b=R.createRun(SECT,'RUN-111111'), c=R.createRun(SECT,'RUN-222222');
ok(JSON.stringify(a)===JSON.stringify(b),'같은 seed → 같은 노드 그래프');
ok(JSON.stringify(a.mapState)!==JSON.stringify(c.mapState),'다른 seed → 다른 그래프');
ok(R.validateRun(a).valid,'validateRun 통과 '+R.validateRun(a).errors.join(','));
// 구조
const n=a.mapState.nodes;
ok(n.every(x=>Object.keys(x).sort().join()==='id,next,sectorId,type'),'노드는 id/type/sectorId/next 4개 필드만');
ok(n.every(x=>/^[A-Z]-\d-\d{3}$/.test(x.id)),'노드 id 형식 "A-1-003": '+n.slice(0,3).map(x=>x.id));
ok(a.mapState.layers[0].length===1 && n.find(x=>x.id===a.mapState.layers[0][0]).type==='battle','시작 노드는 전투 1개');
const last=a.mapState.layers[a.mapState.layers.length-1];
ok(last.length===1 && n.find(x=>x.id===last[0]).type==='boss' && n.find(x=>x.id===last[0]).sectorId==='B-2','마지막 층은 보스 1개 (가장 어려운 섹터)');
ok(n.filter(x=>x.type==='boss').length===1,'보스는 정확히 1개');
ok(n.find(x=>x.id===a.mapState.layers[0][0]).sectorId==='A-1','시작 노드는 가장 쉬운 섹터');
// 도달 가능성: 모든 노드가 시작에서 도달 가능하고, 모든 노드가 보스로 이어짐
let failSeeds=[];
for(let i=0;i<300;i++){
  const r=R.createRun(SECT,'S-'+i), byId=Object.fromEntries(r.mapState.nodes.map(x=>[x.id,x]));
  const seen=new Set(), st=[...r.mapState.layers[0]]; while(st.length){const id=st.pop(); if(seen.has(id))continue; seen.add(id); byId[id].next.forEach(t=>st.push(t));}
  const bossId=r.mapState.layers[r.mapState.layers.length-1][0];
  const canReachBoss=(id,memo={})=> id===bossId || (byId[id].next.length>0 && byId[id].next.some(t=>canReachBoss(t)));
  if(seen.size!==r.mapState.nodes.length || !r.mapState.nodes.every(x=>canReachBoss(x.id)) || !R.validateRun(r).valid) failSeeds.push(i);
}
ok(failSeeds.length===0,'300개 seed 모두: 고립 노드 없음 + 모든 노드에서 보스 도달 가능'+(failSeeds.length?' 실패:'+failSeeds.slice(0,5):''));
// 타입 분포(일반 노드에 여러 종류가 나오는가)
const types=new Set(); for(let i=0;i<50;i++) R.createRun(SECT,'T-'+i).mapState.nodes.forEach(x=>types.add(x.type));
ok(['battle','elite','event','shop','boss'].every(t=>types.has(t)),'50개 seed에서 5종 노드 타입 모두 등장: '+[...types]);
// 해금 규칙
const run=R.createRun(SECT,'RUN-111111');
const first=run.mapState.layers[0][0];
ok(R.getAvailableNodes(run).map(x=>x.id).join()===first,'시작: 첫 층 노드만 열림');
ok(R.completeNode(run,run.mapState.layers[1][0]).ok===false,'해금 안 된 노드는 완료 불가');
let res=R.completeNode(run,first);
ok(res.ok && run.currentNodeId===first && run.completedNodes.join()===first,'첫 노드 완료 → currentNode/completedNodes 갱신');
ok(res.unlockedNodes.join()===run.mapState.nodes.find(x=>x.id===first).next.join() && res.unlockedNodes.length>0,'다음 노드 해금: '+res.unlockedNodes);
ok(R.completeNode(run,first).ok===false,'같은 노드 중복 완료 불가');
ok(R.getNodeStatus(run,first)==='completed' && R.getNodeStatus(run,res.unlockedNodes[0])==='available','상태: completed/available');
const otherLayer1=run.mapState.layers[1].filter(id=>!res.unlockedNodes.includes(id));
if(otherLayer1.length) ok(R.getNodeStatus(run,otherLayer1[0])==='locked','선택하지 않은 갈래는 locked');
// 끝까지 진행 → 보스 → 런 승리
let guard=0; while(run.status==='active' && guard++<20){ const av=R.getAvailableNodes(run); R.completeNode(run,av[0].id); }
ok(run.status==='won' && run.completedNodes.length===a.mapState.layers.length,'보스까지 완료 → status=won, 층 수만큼 완료 ('+run.completedNodes.length+')');
ok(R.getAvailableNodes(run).length===0,'런 종료 후 열린 노드 없음');
// 이벤트 결정론
const ev1=R.rollEvent(run,n[3]), ev2=R.rollEvent(run,n[3]);
ok(JSON.stringify(ev1)===JSON.stringify(ev2) && ev1.effects.length>0,'이벤트: 같은 노드 → 같은 결과 ('+ev1.id+')');
const evIds=new Set(); n.forEach(x=>evIds.add(R.rollEvent(a,x).id)); for(let i=0;i<30;i++)evIds.add(R.rollEvent(R.createRun(SECT,'E-'+i),n[2]).id);
ok(evIds.size===3,'이벤트 3종 모두 등장');
// 보상 (타입별)
const g=(t)=>MS.generateEncounterRewards('X-1',{enemyCount:2,type:t});
ok(g('battle')[0].amount===200 && g('elite')[0].amount===300 && g('boss')[0].amount===400,'골드 배율: 전투 200 / 정예 300 / 보스 400');
ok(MS.generateEncounterRewards('X-1',{enemyCount:2,type:'boss'}).some(r=>r.type==='rewinder'),'보스는 리와인더 확정');
ok(JSON.stringify(g('battle'))===JSON.stringify(g('battle')),'보상 결정론');
// 커스텀 섹터 1개만 있어도 동작
const one=R.createRun({'X-1':{id:'X-1',difficulty:'EASY'}},'ONE');
ok(R.validateRun(one).valid && one.mapState.nodes.every(x=>x.sectorId==='X-1'),'섹터 1개만 있어도 그래프 생성');
ok((()=>{try{R.createRun({},'x');return false}catch(e){return true}})(),'섹터 0개면 명시적 에러');
console.log(fail?('\n실패 '+fail+'건'):'\n모든 검증 통과'); process.exit(fail?1:0);
