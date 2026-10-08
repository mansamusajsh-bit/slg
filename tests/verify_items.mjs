// 서버 권위 아이템(리와인더 · 유물) 검증: supabase-economy.sql 을 PGlite 위에 올려 RPC 와 공격 시나리오를 그대로 돌린다.
// 실행: node tests/verify_items.mjs   (npm test 에 포함)
import { createDb } from './sql/harness.mjs';

process.on('unhandledRejection', (e) => {
  const where = e && e.where ? ' | at ' + String(e.where).split(String.fromCharCode(10)).slice(0, 2).join(' / ') : '';
  console.log('FAIL 예외:', String(e && e.message).slice(0, 300) + where);
  process.exit(1);
});
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  (실제 ${JSON.stringify(a)} / 기대 ${JSON.stringify(b)})`}`);
const rejects = async (fn, m, re) => { try { await fn(); ok(false, `${m} (예외가 나야 함)`); } catch (e) { ok(!re || re.test(String(e.message)), `${m}${re && !re.test(String(e.message)) ? ' ' + e.message : ''}`); } };

const H = 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
let nowMs = T0 + 3 * H;
const s = await createDb();
await s.at(nowMs);
const q1 = async (sql, args) => (await s.q(sql, args))[0];
const uid = (w) => s.user(w);
const boot = (w, g = 450) => s.rpc('slg_bootstrap', [w, g, 0], w);
const sync = (w) => s.rpc('slg_sync', [null, 0, []], w);
const items = async (w) => (await sync(w)).items;
const tick = async (ms) => { nowMs += ms; await s.at(nowMs); };
const put = (col, id, data) => s.q('insert into slg_records (collection_name, record_id, data) values ($1, $2, $3) on conflict (collection_name, record_id) do update set data = excluded.data', [col, id, JSON.stringify(data)]);
const relicDef = (id, kind, extra = {}) => put('relics', id, { id, name: '유물 ' + id, kind, rarity: 'common', description: '', effects: [], ...extra });
const grant = async (w, relicId) => (await q1('select public.slg_grant_relic($1, $2, $3, $4) as id', [await uid(w), relicId, JSON.stringify({ type: 'test' }), nowMs])).id;
const start = (w, ref, node, sector = 'A-1', type = 'battle', n = 5) => s.rpc('slg_encounter_start', [ref, node, sector, type, n], w);
const claim = (w, ref, choice) => s.rpc('slg_encounter_claim', choice == null ? [ref] : [ref, choice], w);
const fight = async (w, ref, { node = 'N-' + ref, sector = 'A-1', type = 'battle', n = 5, choice } = {}) => {
  const st = await start(w, ref, node, sector, type, n);
  if (st.ok === false) return st;
  await tick(30000);
  return claim(w, ref, choice);
};
const rw = async (w) => Number((await q1('select rewinders from slg_players where user_id = $1', [await uid(w)])).rewinders);
const owned = async (w) => (await items(w)).relics;
const gold = async (w) => Number((await q1('select gold from slg_players where user_id = $1', [await uid(w)])).gold);

// ---- 정의 데이터
for (const id of ['g1', 'g2', 'g3']) await relicDef(id, 'gift', { rarity: 'rare', effects: [{ scope: 'self', stat: 'atk', value: 3 }] });
for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) await relicDef(id, 'commander', { effects: [{ scope: 'army', stat: 'atk', value: 2 }] });
await relicDef('c-disc', 'commander', { effects: [{ scope: 'run', stat: 'shopDiscount', value: 50 }, { scope: 'run', stat: 'shopDiscount', value: 100 }] });
await relicDef('c-rw', 'commander', { effects: [{ scope: 'run', stat: 'rewinder', value: 2 }] });
await relicDef('rn', 'rename');
await put('rewardPools', 'A-1-battle', { id: 'A-1-battle', rolls: 1, allowDuplicates: false, entries: [{ type: 'relic', kind: 'gift', id: 'g1', weight: 1 }] });
await put('rewardPools', 'A-1-elite', { id: 'A-1-elite', rolls: 2, allowDuplicates: false, entries: [{ type: 'pool', pool: 'sub-gift', weight: 1 }, { type: 'gold', min: 10, max: 20, weight: 1 }] });
await put('rewardPools', 'sub-gift', { id: 'sub-gift', rolls: 1, allowDuplicates: false, entries: [{ type: 'relic', kind: 'gift', id: 'g2', weight: 1 }, { type: 'relic', kind: 'gift', id: 'g3', weight: 1 }] });
await put('rewardPools', 'A-1-boss-relic', { id: 'A-1-boss-relic', rolls: 3, allowDuplicates: false,
  entries: [{ type: 'relic', kind: 'commander', id: 'c1', weight: 1 }, { type: 'relic', kind: 'commander', id: 'c2', weight: 1 }, { type: 'relic', kind: 'commander', id: 'c3', weight: 1 }] });
await put('rewardPools', 'B-1-battle', { id: 'B-1-battle', rolls: 1, allowDuplicates: true, entries: [{ type: 'relic', kind: 'commander', id: 'c4', weight: 1 }] });
await put('rewardPools', 'loop-a', { id: 'loop-a', rolls: 1, entries: [{ type: 'pool', pool: 'loop-b', weight: 1 }] });
await put('rewardPools', 'loop-b', { id: 'loop-b', rolls: 1, entries: [{ type: 'pool', pool: 'loop-a', weight: 1 }] });

// ------------------------------------------------------------ 시작: 리와인더 3개, 유물 없음
{
  await boot('a', 450);
  const it = await items('a');
  ok(it.rewinders === 3 && it.relics.length === 0 && it.holdMax === 10 && it.migrated === true && it.pending === null, '새 플레이어: 리와인더 3개, 유물 없음, 이전할 예전 세이브 없음 (sync 의 items)');
}

// ------------------------------------------------------------ 리와인더 사용
{
  const u1 = await s.rpc('slg_rewinder_use', [], 'a');
  ok(u1.ok && u1.rewinders === 2, '리와인더를 쓰면 서버 보유가 1 줄어든다');
  await s.rpc('slg_rewinder_use', [], 'a'); await s.rpc('slg_rewinder_use', [], 'a');
  const u4 = await s.rpc('slg_rewinder_use', [], 'a');
  ok(u4.ok === false && u4.error === 'none' && (await rw('a')) === 0, '0개일 때는 쓸 수 없다 (음수가 되지 않는다)');
  await rejects(() => s.q('update slg_players set rewinders = -1 where user_id = $1', [s.users.a]), '음수는 DB 제약이 막는다', /check|violates/);
}

// ------------------------------------------------------------ 직접 조작 차단
{
  await s.db.query("select set_config('request.jwt.claim.sub', $1, false)", [await uid('a')]);
  await s.db.query('set role authenticated');
  await rejects(() => s.q('update slg_players set rewinders = 99'), '리와인더를 테이블에서 직접 고칠 수 없다', /permission denied/);
  await rejects(() => s.q("insert into slg_relics (user_id, relic_id, kind, snapshot, \"loop\", created_ms) values (gen_random_uuid(), 'x', 'rename', '{}', 0, 0)"), '유물을 테이블에 직접 넣을 수 없다', /permission denied/);
  await rejects(() => s.q('select * from slg_relics'), '유물 테이블을 직접 읽지 못한다', /permission denied/);
  await rejects(() => s.q('select * from slg_encounters'), '전투 기록을 직접 읽지 못한다', /permission denied/);
  await rejects(() => s.q("select slg_grant_relic(gen_random_uuid(), 'rn', null, 0)"), '유물 지급 함수는 부를 수 없다', /permission denied/);
  await rejects(() => s.q('select slg_grant_rewinders(gen_random_uuid(), 5, $1, null, 0)', ['x']), '리와인더 지급 함수는 부를 수 없다', /permission denied/);
  await rejects(() => s.q("select slg_item_log_add(gen_random_uuid(), 0, 'x', 1, null, null, 0)"), '내부 기록 함수도 부를 수 없다', /permission denied/);
  // 정의(유물 · 보상 풀 · 아이템)는 운영자만 쓴다
  await rejects(() => s.q("insert into slg_records (collection_name, record_id, data) values ('relics', 'evil', '{\"kind\":\"rename\"}')"), '일반 계정은 유물 정의를 만들 수 없다', /row-level security|policy/);
  await rejects(() => s.q("insert into slg_records (collection_name, record_id, data) values ('rewardPools', 'A-1-battle', '{}') on conflict (collection_name, record_id) do update set data = excluded.data"), '일반 계정은 보상 풀을 고칠 수 없다', /row-level security|policy/);
  const upd = await s.db.query("update slg_records set data = '{}' where collection_name = 'relics' and record_id = 'g1' returning 1");
  ok(upd.rows.length === 0, '일반 계정의 유물 정의 수정은 아무 행도 바꾸지 못한다 (RLS)');
  const del = await s.db.query("delete from slg_records where collection_name = 'items' or collection_name = 'rewardPools' returning 1");
  ok(del.rows.length === 0, '일반 계정은 아이템 · 보상 풀 정의를 지울 수 없다 (RLS)');
  await rejects(() => s.q("insert into slg_records (collection_name, record_id, data) values ('characters', 'evil', '{}')"), '일반 계정은 캐릭터 원본을 만들 수 없다', /row-level security|policy/);
  await rejects(() => s.q("insert into slg_records (collection_name, record_id, data) values ('skills', 'evil', '{}')"), '일반 계정은 스킬 원본을 만들 수 없다', /row-level security|policy/);
  await s.db.query("insert into slg_records (collection_name, record_id, data) values ('maps', 'free', '{}') on conflict do nothing");
  ok(true, '다른 컬렉션(맵 등)은 예전처럼 쓸 수 있다');
  await s.db.query('reset role');
  eq((await q1("select data ->> 'kind' k from slg_records where collection_name = 'relics' and record_id = 'g1'")).k, 'gift', '정의는 그대로다');
  // 운영자는 쓸 수 있다
  await s.q('insert into slg_admins (user_id) values ($1)', [await uid('a')]);
  await s.db.query('set role authenticated');
  await s.db.query("insert into slg_records (collection_name, record_id, data) values ('relics', 'adm-1', '{\"kind\":\"gift\"}')");
  ok(true, '운영자 계정은 유물 정의를 쓸 수 있다');
  await s.db.query('reset role');
  await s.q('delete from slg_admins where user_id = $1', [await uid('a')]);
  await s.q("delete from slg_records where record_id = 'adm-1'");
  // 로그인 없이
  await s.db.query("select set_config('request.jwt.claim.sub', '', false)");
  await s.db.query('set role anon');
  await rejects(() => s.q("insert into slg_records (collection_name, record_id, data) values ('relics', 'anon-evil', '{}')"), '로그인하지 않은 쪽도 유물 정의를 쓸 수 없다', /row-level security|policy/);
  await s.db.query('reset role');
}

// ------------------------------------------------------------ 전투 시작 · 수령
{
  await boot('b', 450);
  eq((await start('b', 'bad ref', 'N-1')).error, 'bad_request', '전투 id 형식이 이상하면 거절');
  eq((await s.rpc('slg_encounter_start', ['e1', 'N-1', 'A-1', 'event', 3], 'b')).error, 'bad_request', '이벤트 종류는 전투로 시작할 수 없다');
  eq((await s.rpc('slg_encounter_start', ['e1', "N-1'; drop", 'A-1', 'battle', 3], 'b')).error, 'bad_request', '노드 id 에 이상한 문자는 거절');
  eq((await claim('b', 'never')).error, 'no_encounter', '시작하지 않은 전투는 수령할 수 없다');
  const st = await start('b', 'e1', 'N-1');
  ok(st.ok && st.status === 'active', '전투 시작 기록');
  const tf = await claim('b', 'e1');
  ok(tf.error === 'too_fast' && tf.waitMs > 0, '최소 전투 시간이 지나기 전에는 수령할 수 없다 (남은 시간을 알려 준다)');
  eq((await start('b', 'e1', 'N-1')).dup, true, '같은 전투를 다시 알려도 시각은 그대로 (시간을 늘려 우회할 수 없다)');
  await tick(30000);
  const c = await claim('b', 'e1');
  ok(c.ok && c.gold === 500 && !c.needChoice, '수령: 서버가 골드 기준액을 정한다 (적 5 × 100)');
  ok(c.relics.length === 1 && c.items.relics.length === 1 && c.items.relics[0].id === 'g1' && /^r\d+$/.test(c.items.relics[0].instanceId), '일반 전투: 보상 풀에서 서버가 굴린 유물을 받는다');
  const rwAfter = await rw('b');
  const again = await claim('b', 'e1');
  ok(again.ok && again.dup && (await rw('b')) === rwAfter && (await owned('b')).length === 1, '같은 전투를 다시 수령해도 보상은 한 번뿐이다');
  eq((await start('b', 'e2', 'N-1')).error, 'node_done', '이미 보상을 받은 노드는 회차 안에서 다시 보상받을 수 없다');
  const big = await fight('b', 'e3', { n: 9999 });
  ok(big.ok && big.gold === 1200, '적 수를 부풀려도 상한(12명)까지만 인정된다');
}

// ------------------------------------------------------------ 가짜 노드로 반복 수령 (횟수 · 시간 상한)
{
  await boot('farm', 450);
  let okCount = 0, lim = null;
  for (let i = 0; i < 40; i++) {
    const r = await fight('farm', 'f' + i, { node: 'FAKE-' + i });
    if (r.ok) okCount++; else { lim = r.error; break; }
  }
  ok(lim === 'rate_limited' && okCount === 30, `가짜 노드를 만들어 반복해도 시간당 수령 상한(30)에서 막힌다 (수령 ${okCount}, 사유 ${lim})`);
  const rewinders = await rw('farm');
  ok(rewinders <= 10, `그동안 모은 리와인더도 보유 상한(10) 안이다 (${rewinders})`);
  await s.q('update slg_players set rewinders = 0 where user_id = $1', [await uid('farm')]);
  const grants = Number((await q1("select coalesce(sum(qty),0) s from slg_item_log where user_id = $1 and kind = 'rewinder_grant'", [await uid('farm')])).s);
  ok(grants <= 40, `회차당 리와인더 획득량이 상한(40) 안이다 (${grants})`);
  await tick(H + 1000);
  const r2 = await fight('farm', 'f-late', { node: 'FAKE-LATE' });
  ok(r2.ok, '한 시간이 지나면 다시 받을 수 있다');
}

// ------------------------------------------------------------ 리와인더 보유 상한
{
  await boot('hold', 450);
  await s.q('update slg_players set rewinders = 10 where user_id = $1', [await uid('hold')]);
  for (let i = 0; i < 6; i++) await fight('hold', 'h' + i, { node: 'H-' + i });
  eq(await rw('hold'), 10, '보유가 가득 차 있으면 보상 리와인더는 더해지지 않는다');
  eq((await s.rpc('slg_rewinder_buy', ['village'], 'hold')).error, 'full', '가득 차 있으면 구매도 거절');
  eq(await gold('hold'), 450, '… 돈은 받지 않는다');
}

// ------------------------------------------------------------ 리와인더 하루 획득 상한 (회귀를 반복해 회차 상한을 새로 받아도 24시간 상한은 그대로)
{
  await boot('day', 450);
  const id = await uid('day');
  let total = 0;
  for (let i = 0; i < 30; i++) {
    await s.q('update slg_players set rewinders = 0 where user_id = $1', [id]);
    total += Number((await q1('select public.slg_grant_rewinders($1, 1, $2, null, $3) as g', [id, 'test', nowMs])).g);
    if (i === 14) await s.q('update slg_players set "loop" = "loop" + 1 where user_id = $1', [id]);   // 회차가 바뀌어도
  }
  eq(total, 20, '24시간 동안 받을 수 있는 리와인더는 20개까지 (회차를 바꿔도 우회 불가)');
  await tick(24 * H + 1000);
  await s.q('update slg_players set rewinders = 0 where user_id = $1', [id]);
  eq(Number((await q1('select public.slg_grant_rewinders($1, 1, $2, null, $3) as g', [id, 'test', nowMs])).g), 1, '24시간이 지나면 다시 받을 수 있다');
}

// ------------------------------------------------------------ 보스: 3택1
{
  await boot('boss', 450);
  const c = await fight('boss', 'b1', { type: 'boss', node: 'A-1-boss', n: 6 });
  ok(c.ok && c.needChoice && c.options.length === 3 && new Set(c.options).size === 3 && c.gold === 6000 && c.rewinders === 1, '보스: 후보 3개(서로 다름) · 골드 ×10 · 리와인더 확정');
  eq((await owned('boss')).length, 0, '고르기 전에는 유물이 없다');
  const sy = await items('boss');
  ok(sy.pending && sy.pending.ref === 'b1' && sy.pending.options.length === 3, '새로고침해도 선택 대기가 서버에 남아 있다 (sync items.pending)');
  eq((await claim('boss', 'b1', 7)).error, 'bad_choice', '후보 밖 번호는 거절');
  eq((await claim('boss', 'b1', -1)).error, 'bad_choice', '음수 번호도 거절');
  ok((await claim('boss', 'b1')).needChoice, '번호 없이 다시 부르면 후보를 다시 알려 준다 (유물은 지급하지 않는다)');
  eq((await owned('boss')).length, 0, '… 여전히 유물 없음');
  const chosen = await claim('boss', 'b1', 1);
  ok(chosen.ok && chosen.relics.length === 1 && (await owned('boss')).length === 1 && (await owned('boss'))[0].id === c.options[1], '고른 유물 하나만 받는다');
  const dup = await claim('boss', 'b1', 0);
  ok(dup.dup && (await owned('boss')).length === 1, '선택을 바꿔 다시 받을 수 없다');
  eq((await start('boss', 'b2', 'A-1-boss-2', 'A-1', 'boss', 6)).error, 'boss_done', '같은 구역의 보스 보상은 회차당 한 번 (가짜 보스 노드로 반복 불가)');
  const gold1 = await gold('boss');
  const { wallet } = { wallet: (w, txs) => s.rpc('slg_wallet_apply', [JSON.stringify(txs)], w) };
  const w1 = await wallet('boss', [{ id: 'bw1', kind: 'earn_reward', amount: 6000, ref: '0:b1' }]);
  ok(w1.results[0].ok && (await gold('boss')) === gold1 + 6000, '보스 보상 골드는 수령한 전투 ref 로 청구된다');
  const w2 = await wallet('boss', [{ id: 'bw2', kind: 'earn_reward', amount: 6000, ref: '0:b1-fake' }]);
  ok(w2.results[0].reason === 'no_encounter', '수령하지 않은 ref 로는 골드를 받을 수 없다');
}

// ------------------------------------------------------------ 하위 풀 · 중복 금지 · 순환 · 풀 없음
{
  await boot('pool', 450);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const r = await fight('pool', 'p' + i, { type: 'elite', node: 'P-' + i });
    if (r.ok) for (const it of r.items.relics) seen.add(it.id);
    await tick(H);   // 시간당 상한 회피
  }
  ok([...seen].every((id) => id === 'g2' || id === 'g3') && seen.size >= 1, `정예 풀: 하위 풀의 유물만 나온다 (${[...seen]})`);
  const none = await fight('pool', 'p-none', { sector: 'Z-9', node: 'Z-N' });
  ok(none.ok && none.relics.length === 0, '보상 풀이 없는 구역은 유물 없이 골드 · 리와인더만');
  await put('rewardPools', 'C-1-battle', { id: 'C-1-battle', rolls: 1, entries: [{ type: 'pool', pool: 'loop-a', weight: 1 }] });
  const cyc = await fight('pool', 'p-cyc', { sector: 'C-1', node: 'C-N' });
  ok(cyc.ok && cyc.relics.length === 0, '풀이 서로를 가리켜도 무한 반복하지 않는다');
}

// ------------------------------------------------------------ 지휘관 유물: 중복 · 장착
{
  await boot('cmd', 450);
  for (const id of ['c1', 'c2', 'c3', 'c4']) await grant('cmd', id);
  let o = await owned('cmd');
  eq(o.map((r) => r.equipped), [true, true, true, false], '빈 슬롯이 있으면 자동 장착, 슬롯(3)을 넘으면 장착하지 않는다');
  eq(await grant('cmd', 'c1'), null, '같은 지휘관 유물은 두 개 가질 수 없다');
  const inst = (id) => o.find((r) => r.id === id).instanceId;
  eq((await s.rpc('slg_relic_equip', [inst('c4'), true], 'cmd')).error, 'slots_full', '슬롯이 가득 차면 장착 불가');
  ok((await s.rpc('slg_relic_equip', [inst('c1'), false], 'cmd')).ok, '해제할 수 있다');
  ok((await s.rpc('slg_relic_equip', [inst('c4'), true], 'cmd')).ok, '해제한 뒤에는 장착할 수 있다');
  await boot('other', 450);
  eq((await s.rpc('slg_relic_equip', [inst('c2'), false], 'other')).error, 'not_found', '남의 유물은 장착 · 해제할 수 없다');
  await grant('cmd', 'g1');
  o = await owned('cmd');
  eq((await s.rpc('slg_relic_equip', [o.find((r) => r.id === 'g1').instanceId, true], 'cmd')).error, 'not_found', '선물 유물은 장착할 수 없다');
  eq((await s.rpc('slg_relic_equip', ['r1; drop table x', true], 'cmd')).error, 'bad_request', '형식이 이상한 id 는 거절');
}

// ------------------------------------------------------------ 선물 유물 소비
{
  await boot('gift', 450); await boot('thief', 450);
  await grant('gift', 'g2'); await grant('gift', 'c5');
  const o = await owned('gift');
  const g = o.find((r) => r.id === 'g2'), c = o.find((r) => r.id === 'c5');
  eq((await s.rpc('slg_relic_gift', [g.instanceId, 'u1'], 'thief')).error, 'not_found', '남의 선물 유물은 쓸 수 없다');
  eq((await s.rpc('slg_relic_gift', [c.instanceId, 'u1'], 'gift')).error, 'not_found', '지휘관 유물은 선물할 수 없다');
  const r1 = await s.rpc('slg_relic_gift', [g.instanceId, 'u1'], 'gift');
  ok(r1.ok && r1.relic.id === 'g2' && r1.relic.effects[0].stat === 'atk' && (await owned('gift')).length === 1, '선물하면 한 번 쓰이고 사라진다 (효과는 클라이언트가 캐릭터에 더한다)');
  eq((await s.rpc('slg_relic_gift', [g.instanceId, 'u1'], 'gift')).error, 'not_found', '같은 유물을 두 번 선물할 수 없다');
}

// ------------------------------------------------------------ 리와인더 구매 · 유물 할인 · 지휘관 리와인더 효과
{
  await boot('buy', 450); await s.q('update slg_players set gold = 1000 where user_id = $1', [await uid('buy')]);
  eq((await s.rpc('slg_rewinder_buy', ['gacha'], 'buy')).error, 'bad_request', '모르는 구매처는 거절');
  const price = Number((await q1('select price from slg_econ where id = 1')).price);
  const scaled = async (base) => Number((await q1('select public.slg_scale($1::numeric, $2::numeric) as v', [base, price])).v);
  const village = await scaled(120), shop = await scaled(150);
  const v = await s.rpc('slg_rewinder_buy', ['village'], 'buy');
  ok(v.ok && v.cost === village && v.rewinders === 4 && v.balance === 1000 - village, `마을: 서버가 정한 가격(120G × 물가 = ${village}G)으로 산다`);
  const sh = await s.rpc('slg_rewinder_buy', ['shop'], 'buy');
  ok(sh.ok && sh.cost === shop && sh.rewinders === 5, `상점 노드: 150G × 물가 = ${shop}G`);
  await grant('buy', 'c-disc');
  const d = await s.rpc('slg_rewinder_buy', ['shop'], 'buy');
  const disc = Math.max(1, Math.round(shop * 0.25));
  ok(d.ok && d.cost === disc && d.rewinders === 6, `장착한 유물의 상점 할인은 서버가 계산한다 (150% 를 말해도 최대 75% 로 제한: ${d.cost}G / 기대 ${disc}G)`);
  const vv = await s.rpc('slg_rewinder_buy', ['village'], 'buy');
  eq(vv.cost, village, '마을 구매에는 상점 할인이 적용되지 않는다');
  await s.q('update slg_players set gold = 10 where user_id = $1', [await uid('buy')]);
  const poor = await s.rpc('slg_rewinder_buy', ['village'], 'buy');
  ok(poor.error === 'insufficient' && (await rw('buy')) === 7, '돈이 모자라면 거절 (리와인더는 늘지 않는다)');
  await grant('buy', 'c-rw');
  eq(await rw('buy'), 9, '리와인더 효과가 있는 지휘관 유물은 얻는 순간 한 번만 채워 준다');
  const log = await q1("select count(*)::int c from slg_item_log where user_id = $1 and kind = 'rewinder_buy'", [await uid('buy')]);
  eq(log.c, 4, '구매는 기록에 남는다');
}

// ------------------------------------------------------------ 이벤트
{
  await boot('ev', 450);
  const seen = new Set(); let prevRw = await rw('ev');
  for (let i = 0; i < 24; i++) {
    const r = await s.rpc('slg_event_roll', ['EV-' + i, 'A-1'], 'ev');
    if (!(r.ok && r.event && r.event.id)) ok(false, `이벤트 ${i}: 서버가 결과를 정해야 한다`);
    seen.add(r.event.id);
    if (r.event.id === 'supply_cache') { if (!(r.event.gold >= 100 && r.event.gold <= 250)) ok(false, '이벤트 골드는 100~250'); }
    const now = await rw('ev');
    if (r.event.id === 'time_fragment') { if (now !== Math.min(10, prevRw + 1) && now !== prevRw) ok(false, '이벤트 리와인더는 최대 1'); }
    else if (now !== prevRw) ok(false, '리와인더 결과가 아닌데 리와인더가 늘었다');
    prevRw = now;
  }
  ok(seen.size >= 2, `이벤트 결과가 섞여 나온다 (${[...seen]})`);
  const a = await s.rpc('slg_event_roll', ['EV-0', 'A-1'], 'ev');
  const b = await s.rpc('slg_event_roll', ['EV-0', 'A-1'], 'ev');
  ok(a.dup && b.dup && JSON.stringify(a.event) === JSON.stringify(b.event), '같은 이벤트 노드는 다시 굴려도 같은 결과 (다시 굴려 좋은 결과를 고를 수 없다)');
  eq((await s.rpc('slg_event_roll', ["x'; --", 'A-1'], 'ev')).error, 'bad_request', '이상한 노드 id 는 거절');
}

// ------------------------------------------------------------ 예전 세이브 이전 (한 번)
{
  await boot('mig', 450);
  const newer = await s.rpc('slg_items_migrate', [9, JSON.stringify([{ id: 'c1' }])], 'mig');
  ok(newer.already && (await owned('mig')).length === 0 && (await rw('mig')) === 3, '새 플레이어는 이전할 것이 없다 (유물을 말해도 받지 못한다)');
  await s.q('update slg_players set rewinders = 3, items_migrated = false where user_id = $1', [await uid('mig')]);
  const r = await s.rpc('slg_items_migrate', [999, JSON.stringify([{ id: 'c1' }, { id: 'c1' }, { id: 'g1' }, { id: 'rn' }, { id: 'nope' }, { id: 'c2' }])], 'mig');
  ok(r.ok && r.relics === 3 && r.items.rewinders === 5, '이전: 리와인더는 상한(5), 유물은 중복 · 개명권 · 없는 id 를 빼고 인정');
  const again = await s.rpc('slg_items_migrate', [5, JSON.stringify([{ id: 'c3' }])], 'mig');
  ok(again.already && (await owned('mig')).length === 3 && (await rw('mig')) === 5, '두 번째 이전은 무시된다 (한 번만)');
  await boot('mig2', 450); await s.q('update slg_players set items_migrated = false where user_id = $1', [await uid('mig2')]);
  const many = await s.rpc('slg_items_migrate', [1, JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ id: 'mig-' + i })))], 'mig2');
  ok(many.relics === 0, '정의에 없는 유물 30개를 말해도 하나도 받지 못한다');
  for (let i = 0; i < 20; i++) await relicDef('mg-' + i, 'gift');
  await boot('mig3', 450); await s.q('update slg_players set items_migrated = false where user_id = $1', [await uid('mig3')]);
  const cap = await s.rpc('slg_items_migrate', [0, JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: 'mg-' + i })))], 'mig3');
  ok(cap.relics === 10, '이전할 수 있는 유물 수에도 상한(10)이 있다');
}

// ------------------------------------------------------------ 회귀: 유물은 사라지고 리와인더는 남는다 / 개명 유물
{
  await boot('loop', 450);
  await grant('loop', 'c1'); await grant('loop', 'g1'); await grant('loop', 'rn');
  await fight('loop', 'l1', { node: 'L-1' });
  const before = await rw('loop');
  await tick(60000);
  const lr = await s.rpc('slg_loop_return', [1], 'loop');
  ok(lr.ok && lr.loop === 1, '회귀 처리');
  ok((await owned('loop')).length === 0, '회귀하면 유물이 모두 사라진다 (개명 유물 포함)');
  eq(await rw('loop'), before, '리와인더는 회귀해도 남는다');
  const r = await fight('loop', 'l1', { node: 'L-1' });
  ok(r.ok, '새 회차에서는 같은 전투 id · 노드 id 로 다시 보상받을 수 있다 (회차별 기록)');
  await boot('loop2', 450);
  eq((await s.rpc('slg_set_name', ['회귀후이름', false], 'loop')).ok, true, '이름 정하기');
  eq((await s.rpc('slg_set_name', ['회귀후이름2', true], 'loop')).error, 'no_relic', '회귀로 개명 유물이 사라졌으므로 개명할 수 없다');
}

// ------------------------------------------------------------ 세금 유물: 지분 1위가 아닐 때만, 서버가 굴린다
{
  await boot('tax', 450); await sync('tax');
  const id = await uid('tax');
  const setShares = async (mine, other) => {
    await s.q("delete from slg_shares where region_id = 'liona'");
    await s.q("insert into slg_shares (region_id, holder, name, bp, dummy, \"loop\") values ('liona', $1, 'tax', $2, false, 0), ('liona', 'dummy-x', '가상', $3, true, 0)", [id.toString(), mine, other]);
  };
  await setShares(3000, 2000);   // 내가 1위
  const top = await q1("select slg_tax_relics($1, 0, array['liona'], 30, $2) as r", [id, nowMs]);
  eq(top.r, [], '지분 1위에게는 세금 유물이 나오지 않는다');
  await setShares(1000, 4000);   // 1위 아님
  const low = (await q1("select slg_tax_relics($1, 0, array['liona'], 30, $2) as r", [id, nowMs])).r;
  ok(low.length >= 1 && low.length <= 5, `1위가 아니면 확률로 받는다 (한 번에 최대 5개): ${low.length}개`);
  const kinds = (await owned('tax')).map((r) => r.kind);
  ok(kinds.length === low.length && kinds.every((k) => k === 'gift'), '변경(frontier) 성향 국가는 선물 유물만 준다');
  const noShare = (await q1("select slg_tax_relics($1, 0, array['mira'], 30, $2) as r", [id, nowMs])).r;
  eq(noShare, [], '지분이 없는 국가에서는 받을 수 없다');
}


// ------------------------------------------------------------ Opus 검토에서 나온 공격 재현 (모두 막혀야 한다)
{
  await relicDef('leg1', 'commander', { rarity: 'legendary', effects: [{ scope: 'run', stat: 'shopDiscount', value: 75 }] });
  // 1) 사고 → 환불(earn_rewind) 로 공짜 리와인더
  await boot('atk1', 450);
  const g0 = await gold('atk1');
  const b = await s.rpc('slg_rewinder_buy', ['village'], 'atk1');
  ok(b.ok, '구매는 된다');
  const refund = await s.rpc('slg_wallet_apply', [JSON.stringify([{ id: 'rf1', kind: 'earn_rewind', amount: b.cost }])], 'atk1');
  eq(refund.results[0].ok, false, '리와인더 구매 대금은 earn_rewind 로 환불받을 수 없다');
  eq(await gold('atk1'), g0 - b.cost, '골드는 돌려받지 못한다');
  // 2) 일일 구매 상한
  let n = 0, last;
  for (let i = 0; i < 15; i++) {
    await s.q('update slg_players set gold = 5000, rewinders = 0 where user_id = $1', [await uid('atk1')]);
    last = await s.rpc('slg_rewinder_buy', ['village'], 'atk1');
    if (last.ok) n++;
  }
  ok(n <= 9 && last.error === 'daily_limit', `하루 구매 횟수가 제한된다 (추가 성공 ${n}회, 마지막 ${last.error})`);
  // 3) 선행 0 ref 로 한 보상 여러 번
  await boot('atk3', 450);
  const c = await fight('atk3', 'z1', { node: 'Z-1', n: 5 });
  const loop = Number((await q1('select "loop" from slg_players where user_id = $1', [await uid('atk3')])).loop);
  const pay = async (ref, id) => (await s.rpc('slg_wallet_apply', [JSON.stringify([{ id, kind: 'earn_reward', amount: 100, ref }])], 'atk3')).results[0].ok;
  const first = await pay(`${loop}:z1`, 'p1');
  const zeros = [await pay(`0${loop}:z1`, 'p2'), await pay(`00${loop}:z1`, 'p3')];
  ok(first && zeros.every((x) => !x), '0 을 붙인 ref 로는 같은 전투 보상을 다시 받을 수 없다');
  // 4) 동시에 진행 중인 전투는 하나, 보스는 회차당 상한
  await boot('atk4', 450);
  for (let i = 0; i < 3; i++) await start('atk4', 'a' + i, 'N-a' + i);
  eq(Number((await q1("select count(*) c from slg_encounters where user_id = $1 and status = 'active'", [await uid('atk4')])).c), 1, '진행 중인 전투는 하나뿐');
  let bosses = 0;
  for (let i = 0; i < 20; i++) { const r = await fight('atk4', 'bs' + i, { node: 'B-' + i, sector: 'FAKE' + i, type: 'boss', n: 12 }); if (r.ok) bosses++; if (r.needChoice) await claim('atk4', 'bs' + i, 0); }
  ok(bosses <= 16, `가짜 구역으로 보스를 반복해도 회차당 국가 수(16)까지 (${bosses})`);
  // 5) 이전: 전설 유물은 못 받는다
  await boot('atk5', 450); await s.q('update slg_players set items_migrated = false where user_id = $1', [await uid('atk5')]);
  const m = await s.rpc('slg_items_migrate', [0, JSON.stringify([{ id: 'leg1' }, { id: 'g1' }])], 'atk5');
  eq(m.relics, 1, '이전으로 전설 유물을 받을 수 없다 (일반/희귀만)');
  // 6) 이벤트도 시간당 상한
  await boot('atk6', 450);
  await s.q("update slg_config set value = 2 where key = 'claims_per_hour'");
  const res = []; for (let i = 0; i < 6; i++) res.push((await s.rpc('slg_event_roll', ['E-' + i, 'A-1'], 'atk6')).ok);
  eq(res.filter(Boolean).length, 2, '이벤트도 시간당 상한을 넘기지 못한다');
  await s.q("update slg_config set value = 30 where key = 'claims_per_hour'");
}

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
await s.db.close();
process.exit(fail ? 1 : 0);
