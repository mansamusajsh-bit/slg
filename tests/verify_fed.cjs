const fs=require('fs'), vm=require('vm'), path=require('path');
const ctx={console}; ctx.window=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','fedEngine.js'),'utf8'),ctx,{filename:'fedEngine.js'});
const F=ctx.FedEngine, H=3600*1000, C=F.CONFIG;
let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fail++;};
const T0=Date.UTC(2026,0,1,0,0,0);

// ---- 물가 · 금리 ----
let fed=F.createFed(T0+3*H);
ok(fed.price===1&&fed.rateBp===C.rateInitBp&&fed.lastTickAt===T0,'초기: 물가 1.0, 금리 1.5%, 틱은 8시간 경계에 정렬');
ok(F.advance(fed,T0+7*H)===fed,'8시간이 안 지났으면 그대로');
const one=F.advance(fed,T0+8*H);
ok(one.tickCount===1&&one.lastTickAt===T0+8*H&&one.rev===fed.rev+1,'8시간 지나면 1틱');
const a1=F.advance(fed,T0+80*H), a2=F.advance(fed,T0+80*H);
ok(JSON.stringify(a1)===JSON.stringify(a2),'같은 시각까지 밀면 누가 밀어도 같은 결과(잡음이 틱 번호로 정해짐)');
ok(a1.tickCount===10&&a1.history.length===11,'80시간 = 10틱');
const hi={...fed,rateBp:C.rateMaxBp}, lo={...fed,rateBp:C.rateMinBp};
const up=F.advance(lo,T0+240*H), down=F.advance(hi,T0+240*H);
ok(up.price>1.05&&down.price<1,`금리가 낮으면 물가 상승(${up.price}), 높으면 하락(${down.price})`);
ok(F.driftPct(C.neutralBp)===C.baseDriftPct&&F.driftPct(C.rateMaxBp)<0,'중립금리에서는 기본 상승분, 최고금리에서는 하락');
const wild=F.advance({...fed,rateBp:C.rateMinBp},T0+8*H*5000);
ok(wild.tickCount===C.maxCatchupTicks&&wild.price<=C.priceMax&&wild.price>=C.priceMin,'오래 비워도 최대 '+C.maxCatchupTicks+'틱, 물가는 상·하한 안');
ok(F.scale(25,1)===25&&F.scale(25,1.5)===38&&F.scale(120,1.5)===180&&F.scale(300,1.03)===310,'가격 환산: 소액 1G, 100G 이상 5G 단위');
ok(F.lendingRateBp(fed)===C.rateInitBp+C.spreadBp,'대출금리 = 정책금리 + 가산금리');

// ---- 위원회 ----
const mk=(regionId,holders)=>({regionId,holders});
const nations=[
  mk('r1',{d:{name:'더미',bp:6000,dummy:true},p1:{name:'가',bp:3000},p2:{name:'나',bp:1000}}),   // 더미가 1위여도 플레이어 1위가 위원
  mk('r2',{p1:{name:'가',bp:5000},p3:{name:'다',bp:4000}}),                                         // p1이 두 국가 1위 → 한 표
  mk('r3',{p3:{name:'다',bp:50}}),                                                                   // 1% 미만은 위원 아님
  mk('r4',{d:{name:'더미',bp:9000,dummy:true}}),
  mk('r5',{p2:{name:'나',bp:2500},p4:{name:'라',bp:2500}})                                          // 동률 → id 순
];
const com=F.committee(nations);
ok(com.length===2&&com[0].id==='p1'&&com[0].seats.length===2&&com[0].totalBp===8000,'지분 1위(더미 제외)가 위원, 여러 국가 1위여도 1명');
ok(com[1].id==='p2','동률은 id 순으로 한 명 (r5 → p2)');
ok(F.majority(1)===1&&F.majority(2)===2&&F.majority(3)===2&&F.majority(4)===3,'과반 = 절반 초과');

// ---- 안건 ----
const ids=(...x)=>x.map(id=>({id,name:id.toUpperCase()}));
let m3=ids('a','b','c');
let r=F.propose(fed,{id:'z',name:'Z'},1,m3,T0);
ok(!!r.error,'위원이 아니면 발의 불가');
r=F.propose(fed,m3[0],1,m3,T0);
ok(!r.error&&r.fed.motion&&r.fed.motion.votes.a.v==='yes'&&r.fed.rateBp===C.rateInitBp,'3명 위원: 발의만으로는 가결되지 않음');
ok(!!F.propose(r.fed,m3[1],-1,m3,T0).error,'안건이 진행 중이면 새 발의 불가');
let v=F.vote(r.fed,m3[1],'no',m3,T0+H);
ok(v.fed.motion&&F.tally(v.fed.motion,m3).no===1,'반대 1표: 아직 진행');
v=F.vote(v.fed,m3[2],'no',m3,T0+2*H);
ok(!v.fed.motion&&v.fed.lastMotion.result==='rejected'&&v.fed.rateBp===C.rateInitBp,'반대 2표 → 더 이상 가결 불가, 부결');
v=F.vote(r.fed,m3[1],'yes',m3,T0+H);
ok(!v.fed.motion&&v.fed.lastMotion.result==='passed'&&v.fed.rateBp===C.rateInitBp+C.rateStepBp,'찬성 2/3 → 가결, 금리 +0.25%p');
ok(v.fed.lastRateChangeAt===T0+H,'금리 변경 시각 기록');
const cd=F.propose(v.fed,m3[2],1,m3,T0+2*H);
ok(!!cd.error&&cd.waitMs>0,'금리 변경 직후에는 냉각 기간');
ok(!F.propose(v.fed,m3[2],1,m3,T0+H+C.rateCooldownHours*H).error,'냉각 기간이 지나면 다시 발의 가능');
const solo=F.propose(fed,{id:'a',name:'A'},-1,ids('a'),T0);
ok(solo.fed.rateBp===C.rateInitBp-C.rateStepBp&&!solo.fed.motion,'위원이 1명이면 발의 즉시 가결');
ok(!!F.propose({...fed,rateBp:C.rateMinBp},m3[0],-1,m3,T0).error&&!!F.propose({...fed,rateBp:C.rateMaxBp},m3[0],1,m3,T0).error,'금리 하한/상한을 넘는 안건은 불가');
const exp=F.resolve(r.fed,m3,T0+C.motionTtlHours*H);
ok(!exp.motion&&exp.lastMotion.result==='expired','마감 시간이 지나면 만료');
const lost=F.resolve(F.vote(r.fed,m3[1],'yes',ids('a','b','c','d','e'),T0+H).fed,ids('c','d','e'),T0+2*H);
ok(F.tally({votes:{a:{v:'yes'},b:{v:'yes'}}},ids('c','d')).yes===0,'위원이 아닌 사람의 표는 세지 않는다');
ok(lost.motion&&F.tally(lost.motion,ids('c','d','e')).yes===0,'위원 명단이 바뀌면 그 기준으로 다시 센다');
// 가결 시점에 물가가 현재 금리까지 먼저 반영되는가
const pre=F.propose(fed,{id:'a',name:'A'},1,ids('a'),T0+30*H);
ok(pre.fed.tickCount===3&&pre.fed.rateBp===C.rateInitBp+C.rateStepBp,'금리 변경 전에 지난 틱을 이전 금리로 먼저 반영');

// ---- 대출 ----
ok(F.maxLoan(300)===180&&F.maxLoan(0)===0,'한도 = 담보가치 × 60%');
ok(F.normalizeTerm(1)===8&&F.normalizeTerm(30)===32&&F.normalizeTerm(999)===168,'기간은 8시간 단위, 최대 168시간(1주일)');
const rate=200;
const q=F.quoteLoan(200,72,rate);
ok(q.periods===9&&q.perPeriod===4&&q.totalInterest===36&&q.totalRepay===236,'견적: 200G × 2% = 8시간마다 4G × 9회');
const unit={id:'u',name:'용병'};
const mkLoan=()=>F.createLoan({id:'L1',principal:200,termHours:24,rateBp:rate,collateral:unit,collateralValue:300,nowMs:T0});
let L=mkLoan();
ok(L.dueAt===T0+24*H&&F.nextInterestAt(L)===T0+8*H&&F.loanPeriods(L)===3,'이자는 대출 시점부터 8시간마다, 만기 24h = 3회');
let s=F.settleLoan(L,T0+7*H,100);
ok(s.events.length===0&&s.gold===100,'8시간 전에는 아무 일도 없다');
s=F.settleLoan(L,T0+17*H,100);
ok(s.events.length===2&&s.gold===92&&s.loan.periodsDone===2&&s.loan.status==='active','17시간: 이자 2회 4G씩 납부');
s=F.settleLoan(L,T0+24*H,1000);
ok(s.loan.status==='repaid'&&s.gold===1000-12-200&&s.events.at(-1).type==='repaid','만기에 골드가 충분하면 이자 3회 + 원금 자동 상환');
s=F.settleLoan(L,T0+24*H,100);
ok(s.loan.status==='defaulted'&&s.events.at(-1).type==='default'&&s.events.at(-1).reason==='maturity','만기에 원금을 못 갚으면 몰수');
s=F.settleLoan(L,T0+30*H,0);
ok(s.loan.status==='defaulted'&&s.loan.missed===3&&s.events.at(-1).reason==='missed','이자를 못 내면 연체가 쌓인다');
const L5=F.createLoan({id:'L5',principal:200,termHours:168,rateBp:rate,collateral:unit,collateralValue:300,nowMs:T0});
s=F.settleLoan(L5,T0+24*H,0);
ok(s.loan.status==='defaulted'&&s.events.at(-1).reason==='missed'&&s.loan.periodsDone===3,'이자 3회 연속 미납 → 만기 전이라도 몰수');
s=F.settleLoan(L5,T0+16*H,0);
ok(s.loan.status==='active'&&s.loan.missed===2&&s.loan.arrears===8,'2회 연속 미납: 밀린 이자 누적');
let s2=F.settleLoan(s.loan,T0+24*H,500);
ok(s2.loan.status==='active'&&s2.loan.missed===0&&s2.loan.arrears===0&&s2.gold===500-12,'밀린 이자를 한꺼번에 내면 연체 해소');
ok(F.payoffAmount(s.loan)===208,'조기 상환액 = 원금 + 밀린 이자');
const off=F.settleLoan(L5,T0+10000*H,100000);
ok(off.loan.status==='repaid'&&off.loan.periodsDone===21&&off.loan.interestPaid===21*4,'오래 접속하지 않아도 8시간 이자는 빠짐없이 정산');

// ---- 경매 ----
let A=F.createAuction({id:'a1',unit,value:300,nowMs:T0});
ok(A.startPrice===150&&A.endsAt===T0+24*H&&A.status==='open','시작가 = 감정가 50%, 24시간');
ok(F.minBid(A)===150,'첫 입찰은 시작가부터');
const p1={id:'p1',name:'가',loop:0}, p2={id:'p2',name:'나',loop:0};
ok(!!F.applyBid(A,p1,149,T0+H).error,'시작가 미만 입찰 불가');
let b1=F.applyBid(A,p1,150,T0+H);
ok(b1.auction.currentBid===150&&b1.auction.bidderId==='p1'&&F.minBid(b1.auction)===160,'입찰 성공, 최소 증가폭 max(10G, 5%)');
ok(!!F.applyBid(b1.auction,p1,500,T0+2*H).error,'최고 입찰자가 또 입찰할 수 없다');
ok(!!F.applyBid(b1.auction,p2,159,T0+2*H).error,'증가폭 미달 불가');
let b2=F.applyBid(b1.auction,p2,200,T0+2*H);
ok(b2.auction.refunds.p1.gold===150&&b2.auction.bidderId==='p2','밀려난 입찰자의 입찰금은 환급 대기');
let b3=F.applyBid(b2.auction,p1,400,T0+3*H);
ok(b3.auction.refunds.p2.gold===200&&b3.auction.refunds.p1.gold===150,'환급은 입찰자별로 쌓인다');
const snipe=F.applyBid(A,p1,150,T0+24*H-60000);
ok(snipe.auction.endsAt===T0+24*H-60000+C.antiSnipeMs,'마감 5분 전 입찰은 마감 연장');
ok(!!F.applyBid(A,p1,150,T0+24*H).error,'마감 후 입찰 불가');
ok(F.closeIfEnded(b3.auction,T0+23*H)===null,'마감 전에는 닫히지 않는다');
const sold=F.closeIfEnded(b3.auction,T0+25*H);
ok(sold.status==='sold'&&sold.winnerId==='p1'&&sold.finalPrice===400,'마감 → 최고 입찰자 낙찰');
const unsold=F.closeIfEnded(A,T0+25*H);
ok(unsold.status==='open'&&unsold.relists===1&&unsold.startPrice===105&&unsold.endsAt===T0+49*H,'유찰 → 시작가 30% 내려 재등록');
const rf=F.claimRefund(b3.auction,'p2',0);
ok(rf.gold===200&&!rf.auction.refunds.p2&&rf.auction.refunds.p1,'환급 수령');
ok(F.claimRefund(b3.auction,'p2',1).gold===0,'회귀한 입찰자의 환급금은 소멸');
ok(F.claimRefund(b3.auction,'zz',0)===null,'받을 게 없으면 null');
const dv=F.claimWinner(sold,'p1',0);
ok(dv.auction.status==='delivered'&&dv.unit.name==='용병'&&F.claimWinner(dv.auction,'p1',0)===null,'낙찰자 수령은 한 번만');
ok(F.claimWinner(sold,'p2',0)===null,'낙찰자가 아니면 수령 불가');
ok(F.claimWinner(sold,'p1',3).auction.status==='void'&&F.claimWinner(sold,'p1',3).unit===null,'회귀한 낙찰자는 캐릭터를 받지 못한다');

console.log(fail?`\n${fail}건 실패`:'\n전부 통과');
process.exit(fail?1:0);
