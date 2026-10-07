// 한 런(회차) 상한 검증: 리와인더 보유 상한(게임 획득분만) · 회차 유물 상한(실제 런 최대치) · 국가별 보스 · 회차 수령 횟수.
// 실행: node tests/verify_caps.mjs   (npm test 에 포함)
import { createDb } from './sql/harness.mjs';

process.on('unhandledRejection', (e) => { console.log('FAIL 예외:', String(e && e.message).slice(0, 300)); process.exit(1); });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  (실제 ${JSON.stringify(a)} / 기대 ${JSON.stringify(b)})`}`);

let nowMs = Date.UTC(2026, 0, 1, 3, 0, 0);
const s = await createDb();
await s.at(nowMs);
const tick = async (ms) => { nowMs += ms; await s.at(nowMs); };
const q1 = async (sql, args) => (await s.q(sql, args))[0];
const put = (col, id, data) => s.q('insert into slg_records (collection_name, record_id, data) values ($1, $2, $3) on conflict (collection_name, record_id) do update set data = excluded.data', [col, id, JSON.stringify(data)]);
const uid = (w) => s.user(w);
const boot = (w) => s.rpc('slg_bootstrap', [w, 450, 0], w);
const rw = async (w) => q1('select rewinders, rewinders_gift from slg_players where user_id = $1', [await uid(w)]);
const grantRw = async (w, n) => Number((await q1('select public.slg_grant_rewinders($1, $2, $3, $4, $5) as g', [await uid(w), n, 'test', 't' + Math.random(), nowMs])).g);
const cap = async (fn) => Number((await q1(`select public.${fn}() as v`)).v);

// 기본 데이터와 같은 풀: 일반 전투 2회 · 정예 3회 굴림
await put('rewardPools', 'A-1-battle', { id: 'A-1-battle', rolls: 2, entries: [{ type: 'gold', min: 1, max: 1, weight: 1 }] });
await put('rewardPools', 'B-1-elite', { id: 'B-1-elite', rolls: 3, entries: [{ type: 'gold', min: 1, max: 1, weight: 1 }] });
await put('relics', 'g1', { id: 'g1', name: '선물', kind: 'gift', rarity: 'common', effects: [] });

// ------------------------------------------------------------ 계산된 상한
eq(await cap('slg_run_regions'), 16, '국가 수 16');
eq(await cap('slg_run_boss_cap'), 16, '회차당 보스 = 국가 수 (16)');
eq(await cap('slg_run_claim_cap'), 112, '회차당 수령 = 16국 × 7노드 (112)');
eq(await cap('slg_run_relic_cap'), 288, '회차당 전투 유물 = 16 × (첫 전투 2 + 중간 5층 × 3 + 보스 1) = 288');
await put('rewardPools', 'B-1-elite', { id: 'B-1-elite', rolls: 4, entries: [{ type: 'gold', min: 1, max: 1, weight: 1 }] });
eq(await cap('slg_run_relic_cap'), 16 * (2 + 5 * 4 + 1), '정예 풀 rolls 를 바꾸면 유물 상한도 따라간다');
await put('rewardPools', 'B-1-elite', { id: 'B-1-elite', rolls: 3, entries: [{ type: 'gold', min: 1, max: 1, weight: 1 }] });
eq(Number((await q1("select count(*) n from slg_config where key in ('relic_loop_cap','boss_per_loop','claims_per_loop')")).n), 0, '예전 고정 상한(60 · 4 · 80)은 지워졌다');

// ------------------------------------------------------------ 리와인더: 보유 상한은 게임 획득분만
await boot('a');
await s.q('update slg_players set rewinders = 10 where user_id = $1', [await uid('a')]);
eq(await grantRw('a', 1), 0, '게임 획득분 10개(상한)면 더 얻지 못한다');
await s.q("insert into slg_mail (target, title, attach, created_ms, expires_ms) values ($1, '선물', '{\"rewinders\":5}', $2, $3)", [await uid('a'), nowMs, nowMs + 86400000]);
const mid = Number((await q1('select max(id) id from slg_mail')).id);
ok((await s.rpc('slg_mail_claim', [mid], 'a')).ok, '우편으로 리와인더 5개 받기');
eq(await rw('a'), { rewinders: 15, rewinders_gift: 5 }, '보유 15개 (선물 5개)');
eq((await s.rpc('slg_sync', [null, 0, []], 'a')).items.giftRewinders, 5, '동기화 응답에 선물 리와인더 수가 실린다');
await s.rpc('slg_rewinder_use', [], 'a');
eq(await rw('a'), { rewinders: 14, rewinders_gift: 4 }, '쓰면 선물분부터 줄어든다');
for (let i = 0; i < 4; i++) await s.rpc('slg_rewinder_use', [], 'a');
eq(await rw('a'), { rewinders: 10, rewinders_gift: 0 }, '선물분을 다 쓰면 게임 획득분 10개가 남는다');
eq(await grantRw('a', 1), 0, '게임 획득분이 여전히 10개라 더 얻지 못한다');
await s.rpc('slg_rewinder_use', [], 'a');
eq(await grantRw('a', 3), 1, '게임 획득분 9개 → 1개만 더 얻는다 (상한 10)');

await boot('b');
await s.q('update slg_players set rewinders = 12, rewinders_gift = 6, gold = 10000 where user_id = $1', [await uid('b')]);
eq(await grantRw('b', 2), 2, '선물 6개 + 게임 6개면 게임 획득분은 4개 더 얻을 수 있다 (2개 요청 → 2개)');
const buy = await s.rpc('slg_rewinder_buy', ['village'], 'b');
ok(buy.ok, `보유 합계가 14개여도 게임 획득분이 8개면 살 수 있다 (${buy.error || ''})`);
ok((await s.rpc('slg_rewinder_buy', ['village'], 'b')).ok, '게임 획득분 9개 → 10개까지 산다 (보유 합계 16)');
const full = await s.rpc('slg_rewinder_buy', ['village'], 'b');
eq(full.error, 'full', '게임 획득분이 10개가 되면 더 살 수 없다');

// ------------------------------------------------------------ 유물 상한: 전투 유물만 센다
await boot('c');
const relicCap = await cap('slg_run_relic_cap');
const cId = await uid('c');
await s.q(`insert into slg_relics (user_id, relic_id, kind, snapshot, source, "loop", created_ms)
           select $1, 'g1', 'gift', '{}'::jsonb, jsonb_build_object('nodeId', 'liona-A-1-' || g, 'type', 'battle'), 0, $2 from generate_series(1, $3::int) g`, [cId, nowMs, relicCap - 1]);
const grant = async (src) => (await q1('select public.slg_grant_relic($1, $2, $3, $4) as id', [cId, 'g1', JSON.stringify(src), nowMs])).id;
ok(await grant({ nodeId: 'mira-A-1-001', type: 'battle' }) != null, `전투 유물 ${relicCap}번째까지는 받는다`);
ok(await grant({ nodeId: 'mira-A-1-002', type: 'battle' }) == null, `전투 유물이 회차 상한(${relicCap})에 닿으면 더 받지 못한다`);
ok(await grant({ type: 'mail', mailId: 1 }) != null, '운영 메일 유물은 회차 상한에 막히지 않는다');
ok(await grant({ type: 'tax', regionId: 'liona' }) != null, '세금 유물은 회차 전투 상한에 세지 않는다 (정산 1회 5개 상한은 따로)');

// ------------------------------------------------------------ 보스: 국가마다 한 번 (모든 국가의 보스가 같은 섹터 B-2 를 써도)
await boot('d');
const fight = async (ref, node, type = 'boss') => {
  const st = await s.rpc('slg_encounter_start', [ref, node, 'B-2', type, 5], 'd');
  if (st.ok === false) return st;
  await tick(20000);
  const r = await s.rpc('slg_encounter_claim', [ref], 'd');
  if (r.needChoice) return s.rpc('slg_encounter_claim', [ref, 0], 'd');
  return r;
};
await put('rewardPools', 'B-2-boss-relic', { id: 'B-2-boss-relic', rolls: 1, entries: [{ type: 'relic', kind: 'gift', id: 'g1', weight: 1 }] });
ok((await fight('b1', 'liona-B-2-007')).ok, '리오나 보스 보상');
ok((await fight('b2', 'mira-B-2-007')).ok, '미라 보스 보상 (섹터가 같아도 국가가 다르면 받는다 — 예전에는 막혔다)');
eq((await fight('b3', 'liona-B-2-008')).error, 'boss_done', '같은 국가의 보스는 회차에 한 번');
let n = 0;
for (const reg of ['vaska', 'oria', 'luma', 'tino', 'rokan', 'savo', 'torva', 'ara', 'elda', 'naru', 'silva', 'valen', 'arca', 'mor']) {
  if ((await fight('x' + reg, `${reg}-B-2-007`)).ok) n++;
}
eq(n, 14, '16개 국가 보스를 모두 받을 수 있다 (2 + 14)');
eq((await fight('fake', 'nowhere-B-2-007')).error, 'boss_done', '16국을 다 받으면 가짜 구역 보스는 더 받지 못한다');

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
