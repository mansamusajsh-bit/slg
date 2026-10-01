// rewardEngine.js 순수 로직 검증: 검증 규칙, 순환 참조, 시드 결정론, 보유 지휘관 유물 필터
const fs=require('fs'), vm=require('vm'), path=require('path');
const ctx={console}; ctx.window=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
for (const f of ['seedEngine.js','rewardEngine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx,{filename:f});
const RE=ctx.RewardEngine, SE=ctx.SeedEngine;
let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fail++;};
const clone=x=>JSON.parse(JSON.stringify(x));

const relics=[
  {id:'iron_banner',name:'철 깃발',kind:'commander',rarity:'rare',effects:[{scope:'army',stat:'atk',value:2}]},
  {id:'war_drum',name:'전쟁 북',kind:'commander',rarity:'common',effects:[{scope:'battle',stat:'ap',value:1}]},
  {id:'old_locket',name:'낡은 로켓',kind:'gift',rarity:'common',effects:[{scope:'self',stat:'def',value:3}]},
];
const items=[{id:'potion',name:'회복약',description:''}];
const characters=[{id:'char_a',name:'A'},{id:'char_b',name:'B'}];
const pools=[
  {id:'A-commander-relics',name:'지휘관 유물',rolls:1,allowDuplicates:false,entries:[
    {type:'relic',kind:'commander',id:'iron_banner',weight:1},{type:'relic',kind:'commander',id:'war_drum',weight:1}]},
  {id:'A-recruits',name:'영입',rolls:1,allowDuplicates:false,entries:[{type:'recruit',id:'char_a',weight:1},{type:'recruit',id:'char_b',weight:1}]},
];
const main={id:'A-battle-normal',name:'A지역 일반 전투',rolls:2,allowDuplicates:false,entries:[
  {type:'gold',min:30,max:60,weight:50},
  {type:'item',id:'potion',weight:30},
  {type:'relic',kind:'gift',id:'old_locket',weight:15},
  {type:'relic',kind:'commander',pool:'A-commander-relics',weight:5},
  {type:'recruit',pool:'A-recruits',weight:5}]};
const catalog={pools,relics,items,characters};

// ---- 검증
ok(RE.validateRewardPool(main,catalog).valid,'예시 풀은 유효: '+JSON.stringify(RE.validateRewardPool(main,catalog).errors));
const errOf=(p)=>RE.validateRewardPool(p,catalog).errors;
let p=clone(main); p.entries[1].id='nope';
ok(errOf(p).some(e=>e.entryIndex===1&&e.field==='id'),'존재하지 않는 아이템 id → entry 1 오류');
p=clone(main); p.entries[2].id='ghost';
ok(errOf(p).some(e=>e.entryIndex===2),'존재하지 않는 유물 id → 오류');
p=clone(main); p.entries[2].kind='commander';
ok(errOf(p).some(e=>e.entryIndex===2&&/kind/.test(e.message)),'유물 kind 불일치 → 오류');
p=clone(main); p.entries[3].pool='missing-pool';
ok(errOf(p).some(e=>e.entryIndex===3&&e.field==='pool'),'존재하지 않는 풀 참조 → 오류');
p=clone(main); p.entries[4].pool='A-commander-relics';
ok(errOf(p).some(e=>e.entryIndex===4&&/하위 풀/.test(e.message)),'recruit entry가 유물 풀을 참조 → 타입 불일치 오류');
p=clone(main); p.entries[0].weight=0;
ok(errOf(p).some(e=>e.entryIndex===0&&e.field==='weight'),'weight 0 → 오류');
p=clone(main); p.entries[0].weight=-3;
ok(errOf(p).some(e=>e.field==='weight'),'weight 음수 → 오류');
p=clone(main); p.entries[0].min=80;
ok(errOf(p).some(e=>e.entryIndex===0&&/min/.test(e.message)),'min > max → 오류');
p=clone(main); p.rolls=0;
ok(errOf(p).some(e=>e.field==='rolls'),'rolls 0 → 오류');
p=clone(main); p.entries=[];
ok(errOf(p).some(e=>e.field==='entries'),'entries 비어 있음 → 오류');
p=clone(main); p.entries[1]={type:'item',id:'potion',pool:'A-recruits',weight:1};
ok(errOf(p).some(e=>e.entryIndex===1&&/정확히 하나/.test(e.message)),'id와 pool 동시 지정 → 오류');
p=clone(main); p.entries[3].pool='A-battle-normal';
ok(errOf(p).some(e=>/자기 자신/.test(e.message)),'자기 자신 참조 → 오류');

// 순환: X → Y → X
const X={id:'X',name:'X',rolls:1,allowDuplicates:true,entries:[{type:'item',pool:'Y',weight:1}]};
const Y={id:'Y',name:'Y',rolls:1,allowDuplicates:true,entries:[{type:'item',pool:'X',weight:1}]};
const cyc=RE.validateRewardPool(X,{...catalog,pools:[...pools,Y]});
ok(!cyc.valid && cyc.errors.some(e=>/순환 참조: X → Y → X/.test(e.message)),'순환 참조 X→Y→X 탐지: '+cyc.errors.map(e=>e.message).join(' | '));
// 3단 순환: X → Y → Z → X (편집 중인 풀이 최신값으로 덮어써지는지)
const Y2={...Y,entries:[{type:'item',pool:'Z',weight:1}]}, Z={id:'Z',name:'Z',rolls:1,allowDuplicates:true,entries:[{type:'item',pool:'X',weight:1}]};
ok(!RE.validateRewardPool(X,{...catalog,pools:[...pools,Y2,Z,{id:'X',name:'old',rolls:1,allowDuplicates:true,entries:[{type:'item',id:'potion',weight:1}]}]}).valid,'3단 순환 X→Y→Z→X 탐지 (저장본 대신 편집본 기준)');

// 유물 검증
ok(RE.validateRelic(relics[0]).valid,'commander 유물 유효');
ok(RE.validateRelic(relics[2]).valid,'gift 유물 유효');
ok(!RE.validateRelic({...relics[2],effects:[{scope:'army',stat:'atk',value:1}]}).valid,'gift 유물 scope=army → 오류');
ok(!RE.validateRelic({...relics[0],effects:[{scope:'self',stat:'atk',value:1}]}).valid,'commander 유물 scope=self → 오류');
ok(!RE.validateRelic({...relics[0],kind:'weird'}).valid,'알 수 없는 kind → 오류');
ok(!RE.validateItem({id:'bad id',name:'x'}).valid,'공백 포함 id → 오류');

// ---- 뽑기 결정론
const runSim=(seed)=>RE.simulateRewardPool(main,SE.createRNG(seed),2000,{pools});
const s1=runSim('SEED-1'), s2=runSim('SEED-1'), s3=runSim('SEED-2');
ok(JSON.stringify(s1)===JSON.stringify(s2),'같은 시드 → 같은 시뮬레이션 결과');
ok(JSON.stringify(s1)!==JSON.stringify(s3),'다른 시드 → 다른 결과');
ok(s1.totalRewards===4000 && s1.emptyRolls===0,'rolls=2 × 2000회 = 4000개 보상');
const one=RE.rollRewardPool(main,SE.createRNG('R'),{pools}), one2=RE.rollRewardPool(main,SE.createRNG('R'),{pools});
ok(JSON.stringify(one)===JSON.stringify(one2),'rollRewardPool 단건 결정론: '+JSON.stringify(one));

// 분포가 weight를 따르는가 (1회 뽑기 풀로 확인)
const single={...clone(main),rolls:1};
const big=RE.simulateRewardPool(single,SE.createRNG('DIST'),20000,{pools});
const share=k=>(big.rows.find(r=>r.key===k)||{share:0}).share;
ok(Math.abs(share('gold')-50/105)<0.015 && Math.abs(share('item:potion')-30/105)<0.015,'분포 ≈ weight/합계(105) (gold '+share('gold').toFixed(3)+', potion '+share('item:potion').toFixed(3)+')');
const gold=big.rows.find(r=>r.key==='gold');
ok(gold.goldMin>=30 && gold.goldMax<=60,'골드 범위 30~60 준수 ('+gold.goldMin+'~'+gold.goldMax+')');

// 중복 금지
let dupFail=false; const rng=SE.createRNG('DUP');
for(let i=0;i<3000;i++){const res=RE.rollRewardPool(main,rng,{pools}); const keys=res.map(RE.rewardKey); if(new Set(keys).size!==keys.length||new Set(res.map(r=>r.entryIndex)).size!==res.length) dupFail=true;}
ok(!dupFail,'allowDuplicates=false → 한 번의 뽑기 안에서 같은 entry/보상 없음');
const dupPool={id:'D',name:'D',rolls:5,allowDuplicates:true,entries:[{type:'item',id:'potion',weight:1}]};
ok(RE.rollRewardPool(dupPool,SE.createRNG('x'),{}).length===5,'allowDuplicates=true → 같은 항목 반복 가능');
const noDup={...dupPool,allowDuplicates:false};
ok(RE.rollRewardPool(noDup,SE.createRNG('x'),{}).length===1,'중복 금지 + 후보 소진 → 남은 뽑기는 빈 결과');

// 보유 지휘관 유물 제외
const cmdOnly={id:'C',name:'C',rolls:1,allowDuplicates:false,entries:[{type:'relic',kind:'commander',pool:'A-commander-relics',weight:1}]};
let leaked=false; const r2=SE.createRNG('OWN');
for(let i=0;i<500;i++){const res=RE.rollRewardPool(cmdOnly,r2,{pools,ownedCommanderRelicIds:['iron_banner']}); if(res.some(x=>x.id==='iron_banner')) leaked=true;}
ok(!leaked,'보유한 지휘관 유물(iron_banner)은 하위 풀에서도 제외');
ok(RE.rollRewardPool(cmdOnly,SE.createRNG('o'),{pools,ownedCommanderRelicIds:['iron_banner','war_drum']}).length===0,'모두 보유 → 빈 결과');
const direct={id:'Dc',name:'Dc',rolls:1,allowDuplicates:false,entries:[{type:'relic',kind:'commander',id:'iron_banner',weight:99},{type:'item',id:'potion',weight:1}]};
ok(RE.rollRewardPool(direct,SE.createRNG('d'),{ownedCommanderRelicIds:['iron_banner']})[0].id==='potion','직접 지정된 보유 지휘관 유물도 제외');

// 폴백 금지: 하위 풀이 context에 없으면 throw
let threw=false; try{RE.rollRewardPool(main,SE.createRNG('z'),{pools:[]});}catch(e){threw=/A-commander-relics|A-recruits/.test(e.message);}
// 첫 뽑기가 하위 풀까지 가지 않을 수도 있으므로 후보 판정 단계에서 throw해야 한다.
ok(threw,'하위 풀 누락 → 기본값 대체 없이 에러');
let threw2=false; try{RE.rollRewardPool(main,Math.random===undefined?null:null,{pools});}catch(e){threw2=true;}
ok(threw2,'rng 없이 호출 → 에러 (Math.random 폴백 없음)');

// 참조 검색
ok(RE.findReferences('relic','old_locket',[main,...pools]).length===1,'findReferences: 유물 참조 1건');
ok(RE.findReferences('pool','A-recruits',[main,...pools])[0].poolId==='A-battle-normal','findReferences: 풀 참조');

// 소스 규칙: 엔진/에디터에서 Math.random과 게임 state를 쓰지 않는다
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const sources=['rewardEngine.js',...fs.readdirSync(path.join(__dirname,'..','editors')).filter(f=>f.endsWith('.js')).map(f=>'editors/'+f)];
for(const f of sources){
  const code=strip(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));
  ok(!/Math\.random/.test(code),f+': Math.random 미사용');
  ok(!/\bstate\b|playerState|currentBattle/.test(code),f+': 게임 state 미참조');
}

console.log(fail?`\n${fail} FAILED`:'\nALL PASS'); process.exit(fail?1:0);
