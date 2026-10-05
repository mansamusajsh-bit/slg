// 서버 권위 경제 검증: supabase-economy.sql 을 실제 Postgres(PGlite) 위에 올려서 RPC 를 그대로 호출한다.
// 실행: node tests/verify_server.mjs   (npm test 에 포함)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './sql/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 예외는 메시지와 SQL 위치만 짧게 (pglite 의 minified 스택이 화면을 덮지 않게)
process.on('unhandledRejection', (e) => {
  const where = e && e.where ? ' | at ' + String(e.where).split(String.fromCharCode(10)).slice(0, 2).join(' / ') : '';
  const iq = e && e.internalQuery ? ' | query: ' + String(e.internalQuery).slice(0, 160) : '';
  console.log('FAIL 예외:', String(e && e.message).slice(0, 300) + where + iq);
  process.exit(1);
});
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  (실제 ${JSON.stringify(a)} / 기대 ${JSON.stringify(b)})`}`);
const rejects = async (fn, m, re) => { try { await fn(); ok(false, `${m} (예외가 나야 함)`); } catch (e) { ok(!re || re.test(String(e.message)), `${m}${re && !re.test(String(e.message)) ? ' ' + e.message : ''}`); } };

// JS 엔진 (같은 식인지 대조하기 위해)
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['fedEngine.js', 'shareEngine.js']) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
const FE = ctx.FedEngine, SE = ctx.ShareEngine;

const H = 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

const s = await createDb();
const q1 = async (sql, args) => (await s.q(sql, args))[0];
const gold = async (who) => Number((await q1('select gold from slg_players where user_id = $1', [await s.user(who)])).gold);
const setGold = async (who, g) => s.q('update slg_players set gold = $2 where user_id = $1', [await s.user(who), g]);
const boot = async (who, g = 450, loop = 0, name = who) => s.rpc('slg_bootstrap', [name, g, loop], who);
const sync = (who, ...a) => s.rpc('slg_sync', a.length ? a : [null, 0, []], who);
const wallet = (who, txs) => s.rpc('slg_wallet_apply', [JSON.stringify(txs)], who);
let txn = 0;
const tx = (kind, amount, ref) => ({ id: `t${++txn}`, kind, amount, ref });
const unit = (o = {}) => ({ id: 'u_x', name: '용병', level: 1, classType: 'KNIGHT', promotions: { combatRank: 0 }, ...o });

await s.at(T0 + 3 * H);

// ------------------------------------------------------------ 스키마
{
  const regions = await s.q('select region_id, threat, neighbors, is_start from slg_regions order by region_id');
  const rc = {}; vm.createContext(rc);
  vm.runInContext(readFileSync(join(ROOT, 'campaignRegions.js'), 'utf8') + '\n;this.R=REGIONS;this.M=CAMPAIGN_MAP;', rc);
  const expect = Object.values(rc.R).map((r) => ({ region_id: r.id, threat: r.threat, neighbors: r.neighbors, is_start: r.id === rc.M.startRegionId }))
    .sort((a, b) => a.region_id.localeCompare(b.region_id));
  eq(regions, expect, '서버 구역 시드(위협도·이웃·시작지)가 campaignRegions.js 와 같다');
  const sql = readFileSync(join(ROOT, 'supabase-economy.sql'), 'utf8');
  let again = true; try { await s.db.exec(sql); } catch (e) { again = false; console.log(e.message); }
  ok(again, 'SQL 을 다시 실행해도 안전하다 (idempotent)');
  eq((await q1('select count(*)::int c from slg_regions')).c, 16, '다시 실행해도 구역은 그대로');
}

// ------------------------------------------------------------ 권한
{
  await s.user('a');
  await rejects(() => s.rpcAnon('slg_sync', [null, 0, []]), '로그인 없이 RPC 를 부르면 거절', /not_authenticated/);
  await s.rpc('slg_is_admin', [], 'a').then((v) => ok(v === false, '일반 계정은 관리자가 아니다'));
  await s.db.query('set role authenticated');
  await rejects(() => s.q('select * from slg_players'), '로그인한 사용자도 테이블을 직접 읽지 못한다', /permission denied/);
  await rejects(() => s.q("update slg_players set gold = 999999"), '골드를 직접 고칠 수 없다', /permission denied/);
  await rejects(() => s.q('select slg_credit(gen_random_uuid(), 1000, $1, null, 0)', ['x']), '내부 함수는 부를 수 없다', /permission denied/);
  await rejects(() => s.q('select slg_scale(1, 1)'), '유틸 함수도 노출되지 않는다', /permission denied/);
  await s.db.query('reset role');
  await rejects(() => s.rpc('slg_admin_adjust', [1000000], 'a'), '관리자가 아니면 골드 조정 불가', /forbidden|no_player/);
}

// ------------------------------------------------------------ 부트스트랩
{
  await rejects(() => sync('a'), '부트스트랩 전에는 동기화 불가', /no_player/);
  const r = await boot('a', 99999);
  ok(r.created === true && (await gold('a')) === 450, '새 플레이어의 시작 골드는 migrate_cap(450)으로 잘린다 (99999를 말해도)');
  await boot('b', 120);
  ok((await gold('b')) === 120, '적게 말하면 그대로');
  const r2 = await boot('a', 99999);
  ok(r2.created === false && (await gold('a')) === 450, '다시 부트스트랩해도 골드는 안 바뀐다');
  await boot('c'); await boot('d');
  for (const w of ['a', 'b', 'c', 'd']) await setGold(w, 1000);
  const snap = await sync('a', '레오나르도');
  ok(snap.ok && snap.player.gold === 1000 && snap.player.name === '레오나르도' && snap.player.loop === 0, '동기화: 지갑 · 이름 · 회차');
  ok(Object.keys(snap.nations).length === 16 && Object.values(snap.nations).every((n) => n.holders && typeof n.unowned === 'number'), '동기화: 16개 국가가 더미와 함께 만들어진다');
  ok(snap.fed.rateBp === 150 && snap.fed.price === 1 || Math.abs(snap.fed.price - 1) < 0.05, '동기화: 연준 기록 (금리 1.5%)');
}

// ------------------------------------------------------------ 지갑: 지출 · 수입 상한 · 멱등
{
  await setGold('a', 1000);
  let r = await wallet('a', [tx('spend', 300)]);
  ok(r.balance === 700 && r.results[0].ok, '지출은 서버 잔액에서 빠진다');
  const dup = { id: 'dupe1', kind: 'spend', amount: 100 };
  await wallet('a', [dup]);
  r = await wallet('a', [dup, dup]);
  ok(r.balance === 600 && r.results.every((x) => x.dup), '같은 거래 id 를 다시 보내도 한 번만 반영된다');
  r = await wallet('a', [tx('spend', 5000)]);
  ok(r.results[0].ok === false && r.results[0].reason === 'insufficient' && r.balance === 600, '잔액보다 많이 쓰면 거절, 잔액은 그대로');
  r = await wallet('a', [tx('earn_loot', 100000)]);
  ok(r.results[0].reason === 'over_cap' && r.balance === 600, '전리품 한 건 상한을 넘는 청구는 거절 (골드를 만들어 낼 수 없다)');
  r = await wallet('a', [tx('earn_loot', 100)]);
  ok(r.results[0].ok && r.balance === 700, '정상 범위의 전리품은 받는다');
  r = await wallet('a', [tx('mint', 100), tx('earn_cheat', 5)]);
  ok(r.results.every((x) => x.reason === 'unknown_kind') && r.balance === 700, '모르는 종류의 수입은 거절');
  r = await wallet('a', [{ id: 'neg', kind: 'earn_loot', amount: -50 }, { id: 'frac', kind: 'earn_loot', amount: '1e9' }, { kind: 'spend', amount: 1 }]);
  ok(r.results.every((x) => x.ok === false) && r.balance === 700, '음수 · 지수 표기 · id 없는 거래는 모두 거절');
  r = await wallet('a', [tx('earn_reward', 500, 'enc-1'), tx('earn_reward', 500, 'enc-1')]);
  ok(r.results[0].ok && r.results[1].reason === 'already_claimed' && r.balance === 1200, '전투 보상은 같은 ref(전투)로 한 번만');
  r = await wallet('a', [tx('earn_reward', 10)]);
  ok(r.results[0].reason === 'ref_required', '전투 보상은 ref 가 필요하다');
  r = await wallet('a', [tx('earn_event', 150, 'node-3'), tx('earn_event', 150, 'node-3')]);
  ok(r.results[0].ok && r.results[1].reason === 'already_claimed', '이벤트 보상도 같은 노드로 한 번만');
  // 시간당 상한: 15000G × 1.25
  await setGold('b', 0);
  let granted = 0, limited = 0;
  for (let i = 0; i < 40; i++) {
    const rr = await wallet('b', [tx('earn_loot', 900)]);
    if (rr.results[0].ok) granted += 900; else if (rr.results[0].reason === 'rate_limited' || rr.results[0].reason === 'over_cap') limited++;
  }
  ok(granted <= 15000 * 1.25 && granted > 5000 && limited > 0, `시간당 수입 상한이 있다: ${granted}G 만 들어옴, ${limited}건 거절`);
  await s.at(T0 + 3 * H + 61 * 60 * 1000);
  r = await wallet('b', [tx('earn_loot', 700)]);
  ok(r.results[0].ok, '1시간이 지나면 다시 받을 수 있다');
  await s.at(T0 + 3 * H);
  // 되돌리기 환급: 최근에 쓴 만큼까지
  await setGold('c', 1000);
  await wallet('c', [tx('spend', 200)]);
  r = await wallet('c', [tx('earn_rewind', 500)]);
  ok(r.results[0].reason === 'over_cap', '쓰지도 않은 골드를 되돌리기로 받을 수 없다');
  r = await wallet('c', [tx('earn_rewind', 200)]);
  ok(r.results[0].ok && r.balance === 1000, '쓴 만큼은 되돌려 받는다');
  r = await wallet('c', [tx('earn_rewind', 1)]);
  ok(r.results[0].reason === 'over_cap', '같은 지출을 두 번 되돌릴 수 없다');
  // 비상금(stash)
  r = await wallet('c', [tx('earn_stash', 100, 'loop:0')]);
  ok(r.results[0].ok && r.balance === 1100, '회귀 비상금은 이번 회차에 한 번');
  r = await wallet('c', [tx('earn_stash', 100, 'loop:0'), tx('earn_stash', 100, 'loop:7'), tx('earn_stash', 999, 'loop:0')]);
  ok(r.results.map((x) => x.reason).join() === 'already_claimed,bad_ref,over_cap', '비상금은 중복 · 다른 회차 · 금액 초과를 거절');
  // 지출은 소비(수요)로 기록되고 금융 거래는 아니다
  const sp = (await q1('select spend from slg_players where user_id = $1', [await s.user('a')])).spend;
  ok(Object.values(sp).reduce((x, y) => x + Number(y), 0) === 400, '소비(spend)만 수요 지표에 쌓인다 (300+100)');
}

// ------------------------------------------------------------ 물가: JS 엔진과 같은 식
{
  await s.q('delete from slg_econ');
  await s.q('delete from slg_wallet_log');
  for (const w of ['a', 'b', 'c', 'd']) await setGold(w, 800);
  await s.q("update slg_players set spend = '{}'::jsonb, last_seen_ms = $1", [T0 + 3 * H]);
  await s.at(T0 + 3 * H);
  await s.q('select slg_econ_advance(slg_now_ms())');
  let e = await q1('select * from slg_econ');
  ok(Number(e.price) === 1 && e.rate_bp === 150 && e.last_tick_at === String(T0) || Number(e.last_tick_at) === T0, '초기 물가 1.0 · 금리 1.5% · 틱은 8시간 경계');
  // 거시 지표 (1인당 800G, 소비 0): 통화량 항 0, 수요 항 < 0
  await s.at(T0 + 8 * H + 1000);
  await s.q("update slg_players set last_seen_ms = slg_now_ms()");
  await s.q('select slg_econ_advance(slg_now_ms())');
  e = await q1('select * from slg_econ');
  const macro = e.macro;
  ok(macro.players === 4 && macro.money === 3200 && macro.spend === 0, `서버가 지갑에서 직접 통화량을 집계한다: ${JSON.stringify(macro)}`);
  const bd = await q1('select slg_breakdown(150, 1, $1::jsonb) b', [JSON.stringify(macro)]);
  const jsbd = FE.breakdown(150, 1, { ...macro, velocity: macro.velocity });
  ok(Math.abs(bd.b.total - jsbd.total) < 1e-9 && Math.abs(bd.b.money - jsbd.money) < 1e-9 && Math.abs(bd.b.demand - jsbd.demand) < 1e-9, '변동 요인 분해가 fedEngine.js(JS)와 같다');
  const noise = Number((await q1('select slg_noise(1) n')).n);
  const expectPrice = Math.round(1 * (1 + (jsbd.total + noise) / 100) * 10000) / 10000;
  ok(Math.abs(Number(e.price) - expectPrice) < 1e-9 && e.tick_count === 1, `첫 틱 물가 = JS 식 (${e.price} / ${expectPrice})`);
  // 통화량이 많고 소비가 빠르면 오른다
  await s.q("update slg_players set gold = 4000");
  await s.q("update slg_players set spend = jsonb_build_object(((slg_now_ms()/(8*3600000))-1)::text, 1500)");
  await s.at(T0 + 16 * H + 1000);
  await s.q("update slg_players set last_seen_ms = slg_now_ms()");
  const before = Number(e.price);
  await s.q('select slg_econ_advance(slg_now_ms())');
  e = await q1('select * from slg_econ');
  ok(Number(e.price) > before && e.macro.money === 16000 && e.macro.spend === 6000, `통화량이 넘치면 물가가 오른다 (${before} → ${e.price})`);
  // 72시간 넘게 안 온 사람은 집계에서 빠진다
  await s.at(T0 + 100 * H);
  await s.q("update slg_players set last_seen_ms = slg_now_ms() where user_id = $1", [await s.user('a')]);
  await s.q('select slg_econ_advance(slg_now_ms())');
  e = await q1('select * from slg_econ');
  ok(e.macro.players === 1, '오래 접속하지 않은 플레이어는 통화량 집계에서 빠진다');
  const hist = e.history;
  ok(hist.length <= 30 && hist.at(-1).price === Number(e.price), '가격 기록은 30개까지');
  // 오래 비워도 최대 90틱만
  await s.at(T0 + 8 * H * 5000);
  await s.q('select slg_econ_advance(slg_now_ms())');
  e = await q1('select * from slg_econ');
  ok(e.tick_count <= 5 + 90 + 10 && Number(e.price) >= 0.5 && Number(e.price) <= 5, '오래 비워도 90틱까지만 밀고 물가는 상·하한 안');
  await s.at(T0 + 24 * H);
}


// ============================================================ 이후 시나리오는 깨끗한 상태에서 시작한다
await s.q('truncate slg_wallet_log, slg_events, slg_inbox, slg_loans, slg_auctions, slg_motion_votes, slg_motion, slg_share_rights, slg_secured, slg_payouts, slg_shares, slg_nations restart identity cascade');
await s.q('delete from slg_econ');
await s.q('update slg_players set gold = 5000, "loop" = 0, last_seen_ms = 0, last_settled_ms = null, last_secure_ms = 0, loan_ban_until_ms = 0, spend = \'{}\'');
const TT = Date.UTC(2026, 2, 1, 0, 0, 0);   // 8시간 경계
await s.at(TT + 1000);
const uid = (w) => s.user(w);
const secure = (w, r) => s.rpc('slg_region_secure', [r], w);
const buy = (w, r, bp) => s.rpc('slg_share_buy', [r, bp], w);

// ------------------------------------------------------------ 구역 점령 → 지분 구매권
{
  let r = await secure('a', 'mira');
  ok(r.ok === false, '시작지에 인접하지 않은 구역은 점령 청구 불가 (미점령 상태에서 mira)');
  r = await secure('a', 'nowhere');
  ok(r.ok === false, '없는 구역은 거절');
  r = await secure('a', 'liona');
  ok(r.ok && r.availableMs === TT + 1000, '시작지는 바로 점령할 수 있다');
  r = await secure('a', 'liona');
  ok(r.ok && r.dup, '같은 구역을 다시 청구해도 한 번만');
  r = await secure('a', 'mira');
  ok(r.ok && r.availableMs === TT + 1000 + 180000, '너무 빨리 이어 청구하면 구매권이 줄 서서 열린다 (3분 간격)');
  r = await secure('a', 'vaska');
  ok(r.ok && r.availableMs === TT + 1000 + 360000, '다음 구역은 또 3분 뒤');
  r = await secure('a', 'arca');
  ok(r.ok === false, '인접하지 않은 구역(arca)은 건너뛸 수 없다');
}

// ------------------------------------------------------------ 지분 구매 · 가격 · 세금
{
  let r = await buy('b', 'liona', 500);
  ok(r.ok === false, '점령하지 않은 국가의 지분은 못 산다 (구매권 없음)');
  r = await buy('a', 'mira', 100);
  ok(r.ok === false && r.availableMs, '구매권이 아직 열리지 않았으면 못 산다');
  await setGold('a', 5000);
  r = await buy('a', 'liona', 1000);
  const nation = (await sync('a')).nations.liona;
  ok(r.ok && r.bp === 1000 && r.cost === 180 && r.balance === 4820, '무주 지분 10% = 180G (위협도1: 8시간 세수 300 × 0.0001 × 6 × 1000bp)');
  ok(nation.holders[await uid('a')].bp === 1000 && nation.holders[await uid('a')].loop === 0, '지분이 기록된다');
  const r2 = await buy('a', 'liona', 99999);
  ok(r2.ok && r2.bp <= 4000, '구매권은 최대 50%까지 (이미 10% 샀으니 최대 40%)');
  const left = (await sync('a')).rights.liona;
  ok(left.boughtBp === 1000 + r2.bp && left.maxBp === 5000, '구매권 사용량이 기록된다');
  // JS 견적과 같은 식인가 (같은 보유 구성을 JS 에 넣어 비교)
  const snap = await sync('a');
  const nj = snap.nations.mira;
  const jsQuote = SE.quotePurchase({ holders: nj.holders }, { threat: 2 }, 'zz', 1500, snap.fed.price);
  const srvQuote = await q1("select slg_share_quote('mira', 'zz', 1500, $1) q", [snap.fed.price]);
  ok(srvQuote.q.cost === jsQuote.cost && srvQuote.q.bp === jsQuote.bp, `서버 견적이 shareEngine.js 견적과 같다 (${srvQuote.q.cost}G / ${jsQuote.cost}G)`);
  // 다른 플레이어에게서 사 오기: b 가 liona 를 점령하고 a 의 지분을 산다
  await secure('b', 'liona');
  await setGold('b', 100000);
  const before = (await sync('a')).nations.liona;
  const aBp = before.holders[await uid('a')].bp;
  const free = before.unowned;
  r = await buy('b', 'liona', 5000);
  ok(r.ok && r.bp === 5000, 'b 가 liona 지분 50% 매입');
  const after = (await sync('a')).nations.liona;
  const aBp2 = after.holders[await uid('a')] ? after.holders[await uid('a')].bp : 0;
  ok(aBp2 < aBp || free >= 5000, '무주 지분이 모자라면 기존 보유자에게서 비율대로 사 온다');
  // 세금 정산: 8시간 뒤
  await s.at(TT + 9 * H);
  const g0 = await gold('a');
  const snap2 = await sync('a');
  const mine = (await q1('select coalesce(sum(bp), 0)::int bp from slg_shares where holder = $1 and region_id = $2', [String(await uid('a')), 'liona'])).bp;
  const tax = snap2.events.find((e) => e.kind === 'tax');
  ok(tax && tax.payload.hours === 8 && tax.payload.count === 1, '정산 주기가 지나면 세금 이벤트가 온다');
  const price = snap2.fed.price;
  ok(tax && Math.abs(tax.payload.byRegion.liona - Math.round(Math.floor(300 * mine / 10000) * price)) <= 1, `세금 = 8시간 세수 × 지분율 × 물가 (${tax && tax.payload.byRegion.liona}G)`);
  ok((await gold('a')) > g0, '세금이 지갑에 들어온다');
  const g1 = await gold('a');
  await sync('a');
  ok((await gold('a')) === g1, '같은 시각에 다시 동기화해도 세금은 한 번만');
  // 오래 접속하지 않으면 최대 72시간분
  await s.at(TT + 9 * H + 500 * H);
  const snap3 = await sync('a');
  const tax3 = snap3.events.find((e) => e.kind === 'tax' && e.payload.count > 1);
  ok(tax3 && tax3.payload.count === 9, '오래 접속하지 않아도 세금은 최대 72시간(8h×9회)분만');
  await s.at(TT + 1000);
}

// ------------------------------------------------------------ 연준: 위원 · 표결
{
  await s.q('truncate slg_motion_votes, slg_motion, slg_econ cascade');
  await s.at(TT + 20 * H);
  await sync('a');
  await s.q('truncate slg_shares, slg_payouts cascade');
  const A = String(await uid('a')), B = String(await uid('b')), C = String(await uid('c'));
  await s.q("insert into slg_shares (region_id, holder, name, bp, dummy, loop) values ('liona', $1, 'a', 3000, false, 0), ('mira', $2, 'b', 2000, false, 0), ('vaska', $3, 'c', 100, false, 0), ('liona', 'dummy_liona_0', '더미', 6000, true, null), ('savo', $1, 'a', 50, false, 0)", [A, B, C]);
  const mem = (await sync('a')).members;
  ok(mem.length === 3 && mem.map((m) => m.id).includes(A), `국가별 지분 1위(더미 제외, 1% 이상)가 위원: ${mem.length}명`);
  ok(!mem.some((m) => m.seats.some((x) => x.regionId === 'savo')), '1% 미만(50bp)은 위원 자격이 안 된다');
  const comm = FE.committee(Object.entries((await sync('a')).nations).map(([id, n]) => ({ regionId: id, holders: n.holders })));
  ok(comm.map((m) => m.id).sort().join() === mem.map((m) => m.id).sort().join(), '서버 위원 명단이 fedEngine.committee(JS)와 같다');
  let r = await s.rpc('slg_fed_propose', [1], 'd');
  ok(r.ok === false, '위원이 아닌 사람은 발의 불가');
  r = await s.rpc('slg_fed_propose', [1], 'a');
  ok(r.ok && r.fed.motion && Object.keys(r.fed.motion.votes).length === 1 && r.fed.rateBp === 150, '3명 위원: 발의만으로는 가결 안 됨 (발의자 찬성 1표)');
  ok(FE.tally(r.fed.motion, mem).yes === 1, '안건 모양이 fedEngine.js 와 같아 JS tally 이 그대로 쓰인다');
  r = await s.rpc('slg_fed_propose', [-1], 'b');
  ok(r.ok === false, '진행 중인 안건이 있으면 새 발의 불가');
  r = await s.rpc('slg_fed_vote', ['no'], 'c');
  ok(r.ok && r.fed.motion, '반대 1표: 아직 진행');
  r = await s.rpc('slg_fed_vote', ['yes'], 'b');
  ok(r.ok && !r.fed.motion && r.fed.rateBp === 175 && r.fed.lastMotion.result === 'passed', '찬성 2/3 → 가결, 금리 +0.25%p');
  r = await s.rpc('slg_fed_propose', [1], 'a');
  ok(r.ok === false && r.waitMs > 0, '금리 변경 직후에는 냉각 기간');
  await s.at(TT + 20 * H + 8 * H + 1);
  r = await s.rpc('slg_fed_propose', [-1], 'c');
  ok(r.ok && r.fed.motion, '냉각 기간이 지나면 다시 발의');
  r = await s.rpc('slg_fed_vote', ['no'], 'a');
  r = await s.rpc('slg_fed_vote', ['no'], 'b');
  ok(!r.fed.motion && r.fed.lastMotion.result === 'rejected' && r.fed.rateBp === 175, '반대 2표 → 더 이상 가결 불가, 부결');
  // 만료
  await s.q('update slg_econ set last_rate_change_at = 0');
  r = await s.rpc('slg_fed_propose', [1], 'a');
  ok(r.ok && r.fed.motion, '다시 발의');
  await s.at(TT + 20 * H + 8 * H + 1 + 25 * H);
  const sn = await sync('d');
  ok(!sn.fed.motion && sn.fed.lastMotion.result === 'expired', '24시간 안에 결론이 안 나면 만료 (누가 접속하든 정리된다)');
  // 한 명뿐이면 즉시 가결, 경계 검증
  await s.q('delete from slg_shares where holder in ($1, $2)', [B, C]);
  await s.q('update slg_econ set last_rate_change_at = 0');
  r = await s.rpc('slg_fed_propose', [-1], 'a');
  ok(r.ok && r.fed.rateBp === 150, '위원이 1명이면 발의 즉시 가결');
  await s.q('update slg_econ set last_rate_change_at = 0, rate_bp = 25');
  r = await s.rpc('slg_fed_propose', [-1], 'a');
  ok(r.ok === false && /아래로/.test(r.error), '금리 하한(0.25%) 아래로는 못 내린다');
  await s.q('update slg_econ set rate_bp = 500');
  r = await s.rpc('slg_fed_propose', [1], 'a');
  ok(r.ok === false && /넘길/.test(r.error), '금리 상한(5%)을 넘길 수 없다');
  await s.q('update slg_econ set rate_bp = 150, last_rate_change_at = 0');
}

// ------------------------------------------------------------ 대출
await s.q('truncate slg_motion_votes, slg_motion, slg_events, slg_inbox, slg_loans, slg_auctions, slg_wallet_log, slg_shares, slg_payouts, slg_nations, slg_share_rights, slg_secured cascade');
await s.q('update slg_players set gold = 1000, loan_ban_until_ms = 0, last_seen_ms = 0');
const LT = Date.UTC(2026, 3, 1, 0, 0, 0);
await s.at(LT);
await sync('a');
const loanTake = (w, id, u, p, t) => s.rpc('slg_loan_take', [id, JSON.stringify(u), p, t], w);
{
  const econ = await q1('select rate_bp, price from slg_econ');
  const rate = econ.rate_bp + 50;
  const price = Number(econ.price);
  const valueOf = (lvl, rank) => Math.max(10, Math.round(Math.max(1, Math.round(300 * price / 10) * 10) * (1 + (lvl - 1) * 0.2) * (1 + rank * 0.25) / 10) * 10);
  let r = await loanTake('a', 'loan_aaa1', unit({ level: 3, promotions: { combatRank: 1 } }), 100, 24);
  ok(r.ok && r.loan.principal === 100 && r.loan.rateBp === rate && r.loan.termHours === 24 && r.balance === 1100, '대출: 대출액이 지갑에 들어오고 금리는 정책금리 + 0.5%p 로 고정');
  ok(r.loan.collateralValue === valueOf(3, 1), `담보가치는 몸값 공식과 같다 (${r.loan.collateralValue}G)`);
  const again = await loanTake('a', 'loan_aaa1', unit({ level: 99 }), 999, 168);
  ok(again.ok && again.dup && (await gold('a')) === 1100, '같은 대출 id 를 다시 보내도 한 번만 (재전송 안전)');
  const other = await loanTake('b', 'loan_aaa1', unit(), 100, 24);
  ok(other.ok === false, '남의 대출 id 로 요청하면 거절');
  r = await loanTake('a', 'loan_aaa2', unit({ level: 1 }), 10, 24);
  ok(r.ok === false, '최소 대출액(50G) 미만은 거절');
  r = await loanTake('a', 'loan_aaa2', unit({ level: 1 }), 9999, 24);
  ok(r.ok === false && /사이/.test(r.error), '담보가치의 60%를 넘는 대출은 거절');
  r = await loanTake('a', 'loan_aaa2', unit({ level: 9999, promotions: { combatRank: 999 } }), 100000, 24);
  ok(r.ok === false, '레벨·승급을 부풀려 말해도 상한(30, 4)으로 잘려서 한도를 못 넘는다');
  r = await loanTake('a', 'bad id!', unit(), 100, 24);
  ok(r.ok === false, '이상한 대출 id 는 거절');
  r = await loanTake('a', 'loan_aaa3x', { name: 5 }, 100, 24);
  ok(r.ok === false, '캐릭터 형식이 아니면 거절');
  r = await loanTake('a', 'loan_aaa3', unit({ level: 5 }), 200, 5000);
  ok(r.ok && r.loan.termHours === 168, '기간은 최대 168시간(1주일)으로 잘린다');
  r = await loanTake('a', 'loan_aaa4', unit({ level: 5 }), 100, 1);
  ok(r.ok && r.loan.termHours === 8, '기간은 최소 8시간');
  r = await loanTake('a', 'loan_aaa5', unit({ level: 5 }), 100, 8);
  ok(r.ok === false && /3건/.test(r.error), '동시에 3건까지');
  // 이자: 8시간마다 원금 × 금리
  const per = Math.max(1, Math.ceil(100 * rate / 10000));
  const gBefore = await gold('a');
  await s.at(LT + 7 * H);
  let sn = await sync('a');
  ok((await gold('a')) === gBefore, '8시간 전에는 이자가 나가지 않는다');
  await s.at(LT + 8 * H);
  sn = await sync('a');
  const interest = sn.events.filter((e) => e.kind === 'loan_interest');
  ok(interest.length === 3 && (await gold('a')) < gBefore, `대출 시점부터 8시간 뒤 이자가 자동으로 나간다 (대출 3건)`);
  const l1 = sn.loans.find((l) => l.id === 'loan_aaa1');
  ok(l1.periodsDone === 1 && l1.interestPaid === per, '이자 납부가 대출에 기록된다');
  const jsLoan = FE.createLoan({ id: 'x', principal: 100, termHours: 24, rateBp: rate, collateral: unit(), collateralValue: 300, nowMs: LT });
  const jsRes = FE.settleLoan(jsLoan, LT + 8 * H, 1000);
  ok(jsRes.loan.periodsDone === 1 && jsRes.loan.interestPaid === per, '서버 이자가 fedEngine.settleLoan(JS)과 같다');
  // 상환 (8시간 만기였던 aaa4 는 이미 자동 상환됐다 — 새 대출로 조기 상환을 본다)
  ok((await sync('a')).events.some((e) => e.kind === 'loan_repaid' && e.payload.loanId === 'loan_aaa4'), '8시간 만기 대출은 이자 정산과 함께 만기 상환된다');
  ok((await loanTake('a', 'loan_aaa6', unit({ level: 5 }), 100, 72)).ok, '새 대출');
  const rep = await s.rpc('slg_loan_repay', ['loan_aaa6'], 'a');
  ok(rep.ok && rep.owed === 100, '조기 상환 = 원금(밀린 이자 없음)');
  sn = await sync('a');
  const back = sn.inbox.find((i) => i.payload.loanId === 'loan_aaa6');
  ok(back && back.kind === 'unit' && back.payload.unit.name === '용병', '상환하면 담보 캐릭터가 우편함으로 돌아온다');
  ok((await s.rpc('slg_loan_repay', ['loan_aaa6'], 'a')).ok === false, '이미 갚은 대출은 다시 상환할 수 없다');
  ok((await s.rpc('slg_loan_repay', ['loan_aaa3'], 'b')).ok === false, '남의 대출은 상환할 수 없다');
  await s.rpc('slg_sync', [null, sn.events.at(-1).id, [back.id]], 'a');
  const cleared = await sync('a');
  ok(!cleared.inbox.some((i) => i.id === back.id) && !cleared.events.some((e) => e.id === sn.events[0].id), '우편함 · 소식은 ack 하면 비워진다');
  // 만기 자동 상환
  await setGold('a', 5000);
  await s.at(LT + 24 * H);
  sn = await sync('a');
  ok(!sn.loans.some((l) => l.id === 'loan_aaa1') && sn.events.some((e) => e.kind === 'loan_repaid' && e.payload.loanId === 'loan_aaa1'), '만기에 골드가 있으면 원금이 자동 상환된다');
  ok(sn.inbox.some((i) => i.payload.loanId === 'loan_aaa1'), '담보가 돌아온다');
  // 이자 연체 → 몰수 (loan_aaa3: 168시간)
  await setGold('a', 0);
  await s.at(LT + 24 * H + 8 * H);
  sn = await sync('a');
  const l3 = sn.loans.find((l) => l.id === 'loan_aaa3');
  ok(l3 && l3.missed === 1 && l3.arrears > 0, '이자를 못 내면 밀린 이자(arrears)가 쌓인다');
  await s.at(LT + 24 * H + 24 * H);
  sn = await sync('a');
  ok(!sn.loans.some((l) => l.id === 'loan_aaa3') && sn.events.some((e) => e.kind === 'loan_default' && e.payload.reason === 'missed'), '이자 3회 연속 미납 → 만기 전이라도 담보 몰수');
  const auc = sn.auctions.find((a) => a.id === 'auc_loan_aaa3');
  ok(auc && auc.status === 'open' && auc.unit.name === '용병' && auc.startPrice === Math.round(auc.value * 0.5), '몰수된 담보가 경매에 올라간다 (시작가 = 감정가 50%)');
  ok(sn.loanBanUntil > LT, '몰수당하면 한동안 대출 금지');
  r = await loanTake('a', 'loan_aaa9', unit({ level: 5 }), 100, 24);
  ok(r.ok === false && /몰수/.test(r.error), '대출 금지 기간에는 새 대출 불가');
  // 만기에 못 갚으면 몰수
  await s.q('update slg_players set loan_ban_until_ms = 0'); await setGold('b', 1000);
  await s.at(LT + 200 * H);
  r = await loanTake('b', 'loan_bbb1', unit({ name: '기사B', level: 4 }), 150, 8);
  ok(r.ok, 'b 의 대출');
  await setGold('b', 20);
  await s.at(LT + 200 * H + 8 * H);
  sn = await sync('b');
  ok(sn.events.some((e) => e.kind === 'loan_default' && e.payload.reason === 'maturity') && sn.auctions.some((a) => a.id === 'auc_loan_bbb1'), '만기에 원금을 못 갚으면 몰수 → 경매');
}

// ------------------------------------------------------------ 경매
{
  await s.q('update slg_players set loan_ban_until_ms = 0');
  const sn0 = await sync('c');
  const A1 = sn0.auctions.find((a) => a.id === 'auc_loan_aaa3');
  const start = A1.startPrice;
  const bid = (w, id, amt) => s.rpc('slg_auction_bid', [id, amt], w);
  await setGold('c', 5000); await setGold('d', 5000);
  let r = await bid('c', 'auc_loan_aaa3', start - 1);
  ok(r.ok === false && r.minBid === start, '시작가 미만 입찰 불가');
  r = await bid('c', 'nope', 100);
  ok(r.ok === false, '없는 경매');
  await setGold('c', 5);
  r = await bid('c', 'auc_loan_aaa3', start);
  ok(r.ok === false && /부족/.test(r.error), '골드가 모자라면 입찰 불가');
  await setGold('c', 5000);
  r = await bid('c', 'auc_loan_aaa3', start);
  ok(r.ok && r.balance === 5000 - start, '입찰금은 즉시 서버 지갑에서 묶인다 (에스크로)');
  ok((await bid('c', 'auc_loan_aaa3', start + 1000)).ok === false, '최고 입찰자가 또 입찰할 수 없다');
  const minNext = start + Math.max(10, Math.ceil(start * 0.05));
  ok((await bid('d', 'auc_loan_aaa3', minNext - 1)).ok === false, '증가폭(max(10G,5%)) 미달 불가');
  r = await bid('d', 'auc_loan_aaa3', minNext);
  ok(r.ok && (await gold('c')) === 5000, '더 높은 입찰이 나오면 이전 입찰금은 즉시 환급된다');
  ok((await sync('c')).events.some((e) => e.kind === 'auction_outbid'), '밀려난 입찰자는 소식을 받는다');
  // 마감 직전 입찰 → 연장
  const a2 = (await sync('c')).auctions.find((a) => a.id === 'auc_loan_aaa3');
  await s.at(a2.endsAt - 60000);
  r = await bid('c', 'auc_loan_aaa3', minNext + 100);
  const a3 = (await sync('c')).auctions.find((a) => a.id === 'auc_loan_aaa3');
  ok(r.ok && a3.endsAt === a2.endsAt - 60000 + 300000, '마감 5분 안의 입찰은 마감이 5분 연장된다');
  // 마감 → 낙찰자 우편함
  await s.at(a3.endsAt + 1);
  const dsn = await sync('c');
  const closed = dsn.auctions.find((a) => a.id === 'auc_loan_aaa3');
  ok(closed.status === 'delivered' && closed.finalPrice === minNext + 100 && closed.winnerName === 'c', '마감 → 최고 입찰자 낙찰');
  ok(dsn.inbox.some((i) => i.payload.auctionId === 'auc_loan_aaa3' && i.payload.unit.name === '용병'), '낙찰자는 캐릭터를 우편함으로 받는다');
  ok(dsn.events.some((e) => e.kind === 'auction_won'), '낙찰 소식');
  ok((await bid('d', 'auc_loan_aaa3', 99999)).ok === false, '끝난 경매에는 입찰 불가');
  const dn = await sync('d');
  ok(!dn.inbox.some((i) => i.payload.auctionId === 'auc_loan_aaa3'), '낙찰자가 아닌 사람에게는 가지 않는다');
  // 유찰 → 재등록 (시작가 30% 인하)
  const b1 = dn.auctions.find((a) => a.id === 'auc_loan_bbb1');
  await s.at(b1.endsAt + 1);
  const rsn = await sync('d');
  const relisted = rsn.auctions.find((a) => a.id === 'auc_loan_bbb1');
  ok(relisted.status === 'open' && relisted.relists === 1 && relisted.startPrice === Math.round(relisted.value * 0.5 * 0.7), '입찰이 없으면 시작가를 30% 낮춰 다시 올린다');
  // 낙찰자가 그 사이 회귀하면 낙찰금도 캐릭터도 사라진다
  await bid('d', 'auc_loan_bbb1', relisted.startPrice);
  const loopBefore = (await q1('select "loop" l from slg_players where user_id = $1', [await uid('d')])).l;
  await s.at(relisted.endsAt - 1000);
  await s.q('update slg_players set last_loop_ms = 0');
  const lr = await s.rpc('slg_loop_return', [loopBefore + 1], 'd');
  ok(lr.ok && lr.loop === loopBefore + 1 && lr.balance === 450, '회귀: 회차 +1, 골드는 시작 골드로');
  await s.at(relisted.endsAt + 1);
  const vsn = await sync('c');
  ok(vsn.auctions.find((a) => a.id === 'auc_loan_bbb1').status === 'void' && !(await sync('d')).inbox.some((i) => i.payload.auctionId === 'auc_loan_bbb1'), '낙찰자가 회귀했다면 캐릭터는 전달되지 않는다 (void)');
}

// ------------------------------------------------------------ 회귀
{
  await s.q('truncate slg_loans, slg_events, slg_inbox, slg_share_rights, slg_secured, slg_shares, slg_payouts, slg_nations cascade');
  await s.q('update slg_players set gold = 3000, loan_ban_until_ms = 0, last_loop_ms = 0');
  const Tl = Date.UTC(2026, 5, 1, 0, 0, 0);
  await s.at(Tl);
  await sync('a');
  const ra = await s.rpc('slg_region_secure', ['liona'], 'a');
  await s.rpc('slg_share_buy', ['liona', 500], 'a');
  const ln = await loanTake('a', 'loan_ret1', unit({ level: 3 }), 100, 72);
  ok(ra.ok && ln.ok, '회귀 준비: 점령 · 지분 · 대출');
  const p0 = (await q1('select "loop" l from slg_players where user_id = $1', [await uid('a')])).l;
  let r = await s.rpc('slg_loop_return', [p0], 'a');
  ok(r.noop === true, '이미 처리된 회차 번호로 부르면 아무 일도 없다 (재전송 안전)');
  await s.at(Tl + 1000);
  r = await s.rpc('slg_loop_return', [p0 + 1], 'a');
  ok(r.ok && r.balance === 450 && r.loop === p0 + 1 && (await gold('a')) === 450, '회귀하면 골드가 시작 골드로 초기화된다');
  const sn = await sync('a');
  ok(!sn.loans.length && Object.keys(sn.rights).length === 0 && !Object.values(sn.nations).some((n) => n.holders[String(sn.player.id)]), '회귀하면 대출은 소멸, 구매권 · 지분은 초기화');
  ok((await q1("select status from slg_loans where id = 'loan_ret1'")).status === 'void', '대출은 void 처리 (담보도 함께 사라진다)');
  r = await s.rpc('slg_loop_return', [p0 + 2], 'a');
  ok(r.ok === false, '너무 빨리 연달아 회귀할 수 없다');
  r = await wallet('a', [tx('earn_stash', 100, `loop:${p0 + 1}`)]);
  ok(r.results[0].ok && r.balance === 550, '회귀 비상금은 새 회차 번호로 한 번 받는다');
  await s.q("insert into slg_shares (region_id, holder, name, bp, dummy, loop) values ('mira', $1, 'old', 900, false, $2)", [String(await uid('a')), p0]);
  await sync('b');
  eq((await q1("select count(*)::int c from slg_shares where holder = $1 and region_id = 'mira'", [String(await uid('a'))])).c, 0, '이전 회차 지분은 아무나 동기화해도 정리된다');
}


// ------------------------------------------------------------ slg_records 정책 (세이브는 본인 것만 · 서버 권위 컬렉션은 쓰기 금지)
{
  const A = String(await uid('a')), B = String(await uid('b'));
  await s.q("insert into slg_records (collection_name, record_id, data) values ('gameState', $1, '{\"gold\":1}'), ('gameState', $2, '{\"gold\":2}'), ('characters', 'c1', '{}'), ('nationShares', 'liona', '{}')", [A, B]);
  const asUser = async (w, fn) => { await s.db.query("select set_config('request.jwt.claim.sub', $1, false)", [String(await uid(w))]); await s.db.query('set role authenticated'); try { return await fn(); } finally { await s.db.query('reset role'); } };
  const mine = await asUser('a', () => s.q("select record_id from slg_records where collection_name = 'gameState'"));
  eq(mine.map((r) => r.record_id), [A], '세이브는 본인 것만 읽힌다 (남의 세이브는 안 보인다)');
  ok((await asUser('a', () => s.q("select 1 from slg_records where collection_name = 'characters'"))).length === 1, '에디터 컬렉션(캐릭터 등)은 그대로 읽힌다');
  await rejects(() => asUser('a', () => s.q("insert into slg_records (collection_name, record_id, data) values ('gameState', $1, '{}')", [B])), '남의 세이브를 덮어쓸 수 없다', /row-level security/);
  const upd = await asUser('a', () => s.db.query("update slg_records set data = '{\"hack\":1}' where collection_name = 'gameState' and record_id = $1", [B]));
  ok(upd.affectedRows === 0, '남의 세이브를 수정하면 0건 (조용히 무시)');
  const del = await asUser('a', () => s.db.query("delete from slg_records where collection_name = 'gameState' and record_id = $1", [B]));
  ok(del.affectedRows === 0, '남의 세이브를 지울 수 없다');
  await asUser('a', () => s.q("insert into slg_records (collection_name, record_id, data) values ('gameState', $1, '{\"ok\":1}') on conflict (collection_name, record_id) do update set data = excluded.data", [A]));
  ok(true, '본인 세이브는 쓸 수 있다');
  await rejects(() => asUser('a', () => s.q("insert into slg_records (collection_name, record_id, data) values ('fedState', 'main', '{\"price\":0.1}')")), '예전 공유 컬렉션(fedState)에는 쓸 수 없다', /row-level security/);
  await rejects(() => asUser('a', () => s.q("insert into slg_records (collection_name, record_id, data) values ('charAuctions', 'x', '{}')")), 'charAuctions 에도 쓸 수 없다', /row-level security/);
  ok((await asUser('a', () => s.q("select 1 from slg_records where collection_name = 'nationShares'"))).length === 1, '그래도 읽기는 가능하다');
  const edUpd = await asUser('a', () => s.db.query("update slg_records set data = '{\"x\":1}' where collection_name = 'characters'"));
  ok(edUpd.affectedRows === 1, '에디터 컬렉션 쓰기는 기존과 같다');
}


// ------------------------------------------------------------ 관리자 (이메일 기준 · 인증된 계정만)
{
  const adminId = (await s.q("insert into auth.users (email, email_confirmed_at) values ('Rooin37@Gmail.com', now()) returning id"))[0].id;
  const fakeId = (await s.q("insert into auth.users (email, email_confirmed_at) values ('rooin37@gmail.com', null) returning id"))[0].id;
  s.users.root = adminId; s.users.fake = fakeId;
  ok((await s.rpc('slg_is_admin', [], 'root')) === true, 'slg_admin_emails 의 이메일(대소문자 무시)로 가입·인증한 계정은 관리자');
  ok((await s.rpc('slg_is_admin', [], 'fake')) === false, '이메일 인증이 안 된 같은 주소 계정은 관리자가 아니다 (사칭 방지)');
  ok((await s.rpc('slg_is_admin', [], 'b')) === false, '다른 계정은 관리자가 아니다');
  await s.rpc('slg_bootstrap', ['root', 450, 0], 'root');
  ok((await s.rpc('slg_sync', [null, 0, []], 'root')).player.admin === true, '동기화 응답에 관리자 여부가 실린다');
  const r = await s.rpc('slg_admin_adjust', [1000], 'root');
  ok(r.ok && r.balance === 1450, '관리자는 골드를 조정할 수 있다');
  await rejects(() => s.rpc('slg_admin_adjust', [1000], 'b'), '일반 계정은 골드를 조정할 수 없다', /forbidden/);
  await s.db.query('set role authenticated');
  await rejects(() => s.q('select * from slg_admin_emails'), '관리자 이메일 목록은 브라우저가 읽을 수 없다', /permission denied/);
  await s.db.query('reset role');
}

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
await s.db.close();
process.exit(fail ? 1 : 0);
