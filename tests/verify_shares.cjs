const fs=require('fs'), vm=require('vm'), path=require('path');
const ctx={console}; ctx.window=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','shareEngine.js'),'utf8'),ctx,{filename:'shareEngine.js'});
const S=ctx.ShareEngine, H=3600*1000;
let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fail++;};
const REG={a:{threat:2},b:{threat:4}};
const sum=n=>Object.values(n.holders).reduce((a,h)=>a+h.bp,0);

// 더미 국가
const n1=S.createNation('a'), n2=S.createNation('a');
ok(JSON.stringify(n1)===JSON.stringify(n2),'같은 regionId → 같은 더미 구성');
const dummies=Object.values(n1.holders);
ok(dummies.length>=2&&dummies.length<=4&&dummies.every(h=>h.dummy),'더미 2~4명: '+dummies.map(h=>h.name+' '+h.bp));
ok(sum(n1)>=3000&&sum(n1)<=7000&&S.unownedBp(n1)===10000-sum(n1),'더미 합 30~70%, 나머지 무주: 무주 '+S.unownedBp(n1));
ok(S.countRealHolders([n1])===0,'더미는 보유 플레이어 수에서 제외');

// 주기
ok(S.intervalHours(0)===8&&S.intervalHours(9)===8&&S.intervalHours(10)===4&&S.intervalHours(29)===4&&S.intervalHours(30)===1,'주기 8h → 4h(10명) → 1h(30명)');
ok(S.lastSettlementAt(Date.UTC(2026,0,1,9,30),8)===Date.UTC(2026,0,1,8),'8시간 정산 경계는 UTC 00·08·16시');
ok(S.settlementsBetween(Date.UTC(2026,0,1,7),Date.UTC(2026,0,1,17),8)===2,'07시→17시 사이 8h 정산 2회(08, 16)');
ok(S.settlementsBetween(Date.UTC(2026,0,1,8),Date.UTC(2026,0,1,8),8)===0,'같은 시각이면 0회');
ok(S.settlementsBetween(0,Date.UTC(2026,0,1,0),8)===9,'오래 비우면 최대 72시간분(8h×9회)만');
ok(S.taxPerSettlement(REG.a,8)===400&&S.taxPerSettlement(REG.a,1)*8===400,'시간당 세수는 주기와 무관 (위협도2: 8h 400G)');

// 구매: 무주부터
const me={id:'p1',name:'나',loop:0};
const free=S.unownedBp(n1);
let q=S.quotePurchase(n1,REG.a,'p1',1000);
ok(q.bp===1000&&q.fromUnowned===Math.min(1000,free),'무주 지분부터 매입');
let n=S.applyPurchase(n1,q,me);
ok(n.holders.p1.bp===1000&&sum(n)===sum(n1)+1000&&n.rev===1&&n1.rev===0,'매입 적용, 원본 불변, rev+1');
// 무주를 넘겨 사면 기존 보유자에게서 비율대로
q=S.quotePurchase(n,REG.a,'p2',S.unownedBp(n)+2000);
const fromH=Object.values(q.fromHolders).reduce((a,b)=>a+b,0);
ok(fromH===2000&&q.fromHolders.p1>0,'무주 소진 후 다른 보유자(나 포함)에게서 2000bp: '+JSON.stringify(q.fromHolders));
ok(Math.abs(q.cost-(Math.ceil(q.fromUnowned*S.pricePerBp(REG.a,false))+Object.values(q.payouts).reduce((a,b)=>a+b,0)))<1,'가격 = 무주가 + 보유자 할증가');
const n3=S.applyPurchase(n,q,{id:'p2',name:'둘',loop:0});
ok(sum(n3)===10000&&S.unownedBp(n3)===0,'합계 정확히 100%');
ok(n3.payouts.p1&&n3.payouts.p1.gold===q.payouts.p1&&!Object.keys(n3.payouts).some(id=>id.startsWith('dummy')),'실제 플레이어만 매각 대금 적립');
ok(S.countRealHolders([n3])===2,'보유 플레이어 2명');
// 100%를 넘게 살 수 없다
q=S.quotePurchase(n3,REG.a,'p2',99999);
ok(q.bp===10000-n3.holders.p2.bp,'자기 지분 외 전부가 상한');

// 대금 수령 / 회귀
let c=S.claimPayout(n3,'p1',0);
ok(c&&c.gold===n3.payouts.p1.gold&&!c.nation.payouts.p1,'매각 대금 수령');
ok(S.claimPayout(n3,'p1',1)===null,'다른 회차 대금은 받지 못함');
ok(S.isStale(n3,'p1',1)&&!S.isStale(n3,'p1',0),'회귀 횟수가 다르면 정리 대상');
const r=S.releaseHolder(n3,'p1');
ok(!r.holders.p1&&!r.payouts.p1&&S.unownedBp(r)===n3.holders.p1.bp,'회귀 → 지분이 무주로 돌아감');
ok(S.releaseHolder(r,'p1')===null,'정리할 것이 없으면 null');
// 이전 회차 지분은 새 매입에 합치지 않는다
const re=S.applyPurchase(n,S.quotePurchase(n,REG.a,'p1',100),{id:'p1',name:'나',loop:1});
ok(re.holders.p1.bp===100&&re.holders.p1.loop===1,'다른 회차의 남은 지분은 이어받지 않음');

// 세금
const pay=S.computePayout({nations:[n3,S.applyPurchase(S.createNation('b'),S.quotePurchase(S.createNation('b'),REG.b,'p1',5000),me)].map((x,i)=>Object.assign(x,{regionId:i?'b':'a'})),
  regions:REG,holderId:'p1',fromMs:Date.UTC(2026,0,1,7),toMs:Date.UTC(2026,0,1,17),hours:8});
const expA=Math.floor(400*n3.holders.p1.bp/10000*2), expB=Math.floor(600*0.5*2);
ok(pay.count===2&&pay.byRegion.a===expA&&pay.byRegion.b===expB&&pay.total===expA+expB,'지분율대로 세금: '+JSON.stringify(pay.byRegion));
ok(pay.settledUntil===Date.UTC(2026,0,1,16),'정산 기록은 마지막 정산 시각까지');

process.exit(fail?1:0);
