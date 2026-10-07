// 국가 국영상점 검증: 순수 엔진(shopEngine.js · shareEngine.js 매출 가산) + 서버(supabase-economy.sql slg_shop_*) 를 PGlite 위에서 그대로 돌린다.
// 실행: node tests/verify_shop.mjs   (npm test 에 포함)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './sql/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.on('unhandledRejection', (e) => {
  const where = e && e.where ? ' | at ' + String(e.where).split(String.fromCharCode(10)).slice(0, 2).join(' / ') : '';
  console.log('FAIL 예외:', String(e && e.message).slice(0, 300) + where);
  process.exit(1);
});
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  (실제 ${JSON.stringify(a)} / 기대 ${JSON.stringify(b)})`}`);

// ---- 유물 정의 (등급 · 종류를 골고루, 최상급 · 개명 포함) ----
const RELICS = [];
for (const kind of ['gift', 'commander']) {
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
    for (let i = 0; i < 4; i++) RELICS.push({ id: `${kind}-${rarity}-${i}`, name: `${kind} ${rarity} ${i}`, kind, rarity, description: 'x', effects: [] });
  }
}
RELICS.push({ id: 'rename-1', name: '개명', kind: 'rename', rarity: 'common', description: '', effects: [] });

// ============================================================ 순수 엔진
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['shareEngine.js', 'shopEngine.js']) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
const rc = {}; vm.createContext(rc);
vm.runInContext(readFileSync(join(ROOT, 'campaignRegions.js'), 'utf8') + '\n;this.R=REGIONS;', rc);
const SE = ctx.ShareEngine, SH = ctx.ShopEngine, R = rc.R;

{
  const ids = (r) => SH.stockFor(R[r], RELICS).map((d) => d.id);
  const all = Object.keys(R).flatMap(ids);
  ok(all.length > 0 && all.every((id) => !id.includes('legendary')), '어느 국가도 최상급(legendary) 유물을 팔지 않는다');
  ok(all.every((id) => id !== 'rename-1'), '개명 유물은 팔지 않는다');
  eq(Object.keys(R).every((r) => ids(r).length === SH.CONFIG.slots), true, '국가마다 진열 수는 정해진 칸 수');
  eq(ids('mira'), ids('mira'), '같은 국가의 진열은 항상 같다');
  ok(new Set(Object.keys(R).map((r) => ids(r).join(','))).size === Object.keys(R).length, '국가마다 파는 유물이 서로 다르다 (같은 성향끼리도)');
  const kinds = (r) => SH.stockFor(R[r], RELICS).map((d) => d.kind);
  ok(kinds('liona').every((k) => k === 'gift'), '변경(frontier) 국가는 선물 유물만 판다');
  const mystic = SH.stockFor(R.elda, RELICS), frontier = SH.stockFor(R.liona, RELICS);
  ok(mystic.filter((d) => d.rarity === 'epic').length > frontier.filter((d) => d.rarity === 'epic').length, '신비(mystic) 국가는 변경 국가보다 영웅 유물이 많다');
  ok(frontier.every((d) => d.rarity !== 'epic'), '변경 국가는 영웅 유물을 팔지 않는다 (성향 가중치 0)');

  // 가격: 등급 기준가 × 물가, 지휘관 유물은 비싸다, 유물 할인
  const g = { kind: 'gift', rarity: 'common' }, c = { kind: 'commander', rarity: 'common' }, e = { kind: 'gift', rarity: 'epic' };
  eq(SH.price(g, 1, 0), 150, '일반 선물 유물 기준가 150G');
  eq(SH.price(c, 1, 0), 225, '지휘관 유물은 ×1.5');
  eq(SH.price(e, 1, 0), 1000, '영웅 유물 기준가');
  eq(SH.price(g, 2, 0), 300, '인플레이션(물가 ×2)이 가격에 곱해진다');
  ok(SH.price(g, 1.5, 0) === 225 && SH.price(g, 0.5, 0) === 75, '물가가 오르면 오르고 내리면 내린다');
  eq(SH.price(g, 1, 20), 120, '유물 상점 할인 20%');
  eq(SH.price(g, 1, 99), 38, '할인은 75%까지만');
  eq(SH.taxShare(1000), 1000, '판매 대금 전액이 세수에 가산된다 (기본 100%)');

  // 세수 가산: 매출이 지분율대로 다음 정산에 얹힌다
  const HR = 3600 * 1000, T = Date.UTC(2026, 0, 1);
  let nation = SE.createNation('liona', T);
  nation.holders = { me: { name: '나', bp: 2000, loop: 0 } };
  nation = SE.addShopSale(nation, 1000, T + 2 * HR);
  nation = SE.addShopSale(nation, 500, T + 3 * HR);
  eq(SE.shopRevenue(nation, T, T + 9 * HR), 1500, '매출 합계');
  const base = SE.computePayout({ nations: [nation], regions: R, holderId: 'me', fromMs: T, toMs: T + 9 * HR, hours: 8 });
  eq(base.count, 1, '8시간 정산 1회');
  eq(base.shopByRegion.liona, 300, '내 지분 20% × 매출 1500 = 300G가 세금에 가산');
  eq(base.shopTotal, 300, '가산 합계');
  const none = SE.computePayout({ nations: [{ ...nation, sales: [] }], regions: R, holderId: 'me', fromMs: T, toMs: T + 9 * HR, hours: 8 });
  ok(base.total === none.total, '기본 세수는 상점 매출과 따로 계산된다 (현행 세금에 가산)');
  const late = SE.computePayout({ nations: [nation], regions: R, holderId: 'me', fromMs: T + 8 * HR, toMs: T + 17 * HR, hours: 8 });
  eq(late.shopTotal || 0, 0, '이미 지난 정산 구간의 매출은 다시 받지 못한다');
  const old = SE.addShopSale(nation, 10, T + 200 * HR);
  ok(old.sales.length === 1, '오래된 매출 기록은 정리된다');
}

// ============================================================ 서버
const H = 3600 * 1000;
const TT = Date.UTC(2026, 2, 1, 0, 0, 0);   // 8시간 경계
const s = await createDb();
const q1 = async (sql, args) => (await s.q(sql, args))[0];
const uidOf = (w) => s.user(w);
const boot = (w, g = 450) => s.rpc('slg_bootstrap', [w, g, 0], w);
const sync = (w) => s.rpc('slg_sync', [null, 0, []], w);
const setGold = async (w, g) => s.q('update slg_players set gold = $2 where user_id = $1', [await uidOf(w), g]);
const gold = async (w) => Number((await q1('select gold from slg_players where user_id = $1', [await uidOf(w)])).gold);
const put = (col, id, data) => s.q('insert into slg_records (collection_name, record_id, data) values ($1, $2, $3) on conflict (collection_name, record_id) do update set data = excluded.data', [col, id, JSON.stringify(data)]);
const list = (w, r) => s.rpc('slg_shop_list', [r], w);
const buy = (w, r, id) => s.rpc('slg_shop_buy', [r, id], w);

await s.at(TT + 1000);
await boot('a', 5000); await boot('b', 5000);
for (const r of RELICS) await put('relics', r.id, r);

{
  eq((await list('a', 'liona')).error, 'not_secured', '점령하지 않은 국가의 상점은 열 수 없다');
  eq((await buy('a', 'liona', 'gift-common-0')).error, 'not_secured', '점령하지 않으면 살 수 없다');
  ok((await s.rpc('slg_region_secure', ['liona'], 'a')).ok, '시작지 점령');
  eq((await list('a', 'nowhere')).error, 'not_found', '없는 국가');
  const l = await list('a', 'liona');
  ok(l.ok && l.items.length === 6, '점령한 국가의 상점이 열린다 (6칸)');
  ok(l.items.every((i) => i.rarity !== 'legendary' && i.kind !== 'rename'), '서버 진열에도 최상급 · 개명 유물은 없다');
  ok(l.items.every((i) => i.kind === 'gift'), '서버도 변경(frontier) 국가는 선물 유물만 판다');
  const pr = (await sync('a')).fed.price;
  ok(l.items.every((i) => i.price === SH.price(i, pr, 0) && i.price > 0), `가격 = 등급 기준가 × 물가 (물가 ${pr}) — JS 엔진과 같다`);
  eq(l.taxPct, 100, '판매 대금의 세수 가산율을 알려 준다');
  await s.rpc('slg_region_secure', ['mira'], 'a');
  const lm = await list('a', 'mira');
  ok(JSON.stringify(lm.items.map((i) => i.id)) !== JSON.stringify(l.items.map((i) => i.id)), '국가마다 진열이 다르다');
  eq((await list('b', 'liona')).error, 'not_secured', '다른 플레이어의 점령 상태와는 무관 — b 는 아직 못 연다');
}

{
  // 지분 구매 → 상점 매출이 지분율대로 세금에 가산
  await setGold('a', 50000);
  const r0 = await s.rpc('slg_share_buy', ['liona', 2000], 'a');
  ok(r0.ok, 'a 가 liona 지분 20% 매입');
  await s.at(TT + 2000);   // 지분을 산 뒤에 팔린 대금부터 가산 대상이다
  await sync('a');
  const stock = (await list('a', 'liona')).items;
  const item = stock[0];
  const g0 = await gold('a');
  const r = await buy('a', 'liona', item.id);
  ok(r.ok && r.cost === item.price && r.relicId === item.id, `유물 구매 성공 (${r.cost}G)`);
  eq(await gold('a'), g0 - r.cost, '대금만큼 골드가 줄어든다');
  ok(r.items.relics.some((x) => x.id === item.id), '구매한 유물이 보유 목록에 들어온다');
  eq((await q1("select source ->> 'type' as t from slg_relics where user_id = $1 and relic_id = $2", [await uidOf('a'), item.id])).t, 'shop', '유물 출처는 상점');
  eq(Number((await q1('select sum(gold) g from slg_shop_sales where region_id = $1', ['liona'])).g), r.tax, '대금이 그 국가 매출로 쌓인다');
  const snap = await sync('a');
  eq(snap.shopPending.liona, r.tax, '동기화에 다음 정산 가산 매출이 담긴다');
  eq((await list('a', 'liona')).pending, r.tax, '상점 화면에도 가산 매출이 보인다');

  // 같은 구성의 두 번째 구매 (선물 유물은 중복 구매 가능) → 매출 누적
  const r2 = await buy('a', 'liona', item.id);
  ok(r2.ok, '선물 유물은 다시 살 수 있다');
  const total = r.tax + r2.tax;

  // 정산: 다음 8시간 경계가 지나면 기본 세금 + 상점 매출 × 지분율
  await s.at(TT + 9 * H);
  const g1 = await gold('a');
  const snap2 = await sync('a');
  const tax = snap2.events.find((e) => e.kind === 'tax');
  ok(tax && tax.payload.shop > 0, '세금 정산 이벤트에 상점 가산분이 표시된다');
  const mine = Number((await q1('select bp from slg_shares where holder = $1 and region_id = $2', [String(await uidOf('a')), 'liona'])).bp);
  eq(tax.payload.shop, Math.floor(total * mine / 10000), `상점 매출 ${total}G × 지분 ${mine / 100}% 가 세금에 가산된다`);
  const base = Math.round(Math.floor(300 * R.liona.taxMult * mine / 10000) * snap2.fed.price);
  ok(Math.abs(tax.payload.byRegion.liona - (base + tax.payload.shop)) <= 1, `세금 = 기본 세수(물가 반영) ${base}G + 상점 가산 ${tax.payload.shop}G`);
  ok((await gold('a')) - g1 >= tax.payload.total - 1, '가산분까지 지갑에 들어온다');
  eq((await sync('a')).shopPending.liona || 0, 0, '정산이 끝나면 가산 대기 매출은 비워진다');
  const g2 = await gold('a');
  await sync('a');
  eq(await gold('a'), g2, '같은 정산 구간의 매출은 한 번만 받는다');
}

{
  // 구매 제한
  await s.at(TT + 10 * H);
  const stock = (await list('a', 'mira')).items;
  const cmd = stock.find((i) => i.kind === 'commander');
  if (cmd) {
    ok((await buy('a', 'mira', cmd.id)).ok, '지휘관 유물 구매');
    eq((await buy('a', 'mira', cmd.id)).error, 'owned', '이미 가진 지휘관 유물은 다시 살 수 없다 (대금도 빠지지 않는다)');
    ok((await list('a', 'mira')).items.find((i) => i.id === cmd.id).owned === true, '목록에 보유 표시');
  } else console.log('SKIP 지휘관 유물이 이 진열에 없다');
  eq((await buy('a', 'mira', 'gift-legendary-0')).error, 'not_in_stock', '진열에 없는 유물(최상급)은 살 수 없다');
  eq((await buy('a', 'mira', 'rename-1')).error, 'not_in_stock', '개명 유물도 살 수 없다');
  eq((await buy('a', 'mira', 'nope')).error, 'not_in_stock', '없는 유물');
  await setGold('a', 1);
  const cheap = (await list('a', 'mira')).items.find((i) => !i.owned);
  const poor = await buy('a', 'mira', cheap.id);
  ok(poor.error === 'insufficient' && (await gold('a')) === 1, '골드가 모자라면 못 산다 (잔액 그대로)');
  await setGold('a', 1000000);
  await put('relics', 'gift-common-0', RELICS[0]);
  let bought = Number((await list('a', 'mira')).bought);
  let last;
  for (let i = bought; i < 14; i++) { last = await buy('a', 'mira', (await list('a', 'mira')).items.find((x) => x.kind === 'gift').id); if (!last.ok) break; }
  eq(last.error, 'daily_limit', '하루 구매 횟수 제한');
}

{
  // 인플레이션: 물가가 오르면 서버 가격도 오른다
  await s.at(TT + 40 * H);
  await s.q('update slg_econ set price = price * 2 where id = 1');
  await s.rpc('slg_region_secure', ['liona'], 'b');
  const lb = await list('b', 'liona');
  const p2 = Number((await q1('select price from slg_econ where id = 1')).price);
  ok(lb.items.every((i) => i.price === SH.price(i, p2, 0)), `물가가 ${p2.toFixed(2)}배일 때 가격도 따라간다`);
}

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
await s.db.close();
process.exit(fail ? 1 : 0);
