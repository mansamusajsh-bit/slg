// 운영자 메일 검증: supabase-economy.sql 을 PGlite 위에 올려 보내기 · 받기 · 공격 시나리오를 그대로 돌린다.
// 실행: node tests/verify_mail.mjs   (npm test 에 포함)
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

const H = 3600 * 1000, D = 24 * H;
let nowMs = Date.UTC(2026, 0, 1, 3, 0, 0);
const s = await createDb();
await s.at(nowMs);
const tick = async (ms) => { nowMs += ms; await s.at(nowMs); };
const q1 = async (sql, args) => (await s.q(sql, args))[0];
const put = (col, id, data) => s.q('insert into slg_records (collection_name, record_id, data) values ($1, $2, $3) on conflict (collection_name, record_id) do update set data = excluded.data', [col, id, JSON.stringify(data)]);
const boot = async (w, name) => { await s.rpc('slg_bootstrap', [w, 450, 0], w); if (name) await s.rpc('slg_set_name', [name, false], w); };
const gold = async (w) => Number((await q1('select gold from slg_players where user_id = $1', [await s.user(w)])).gold);
const rewinders = async (w) => Number((await q1('select rewinders from slg_players where user_id = $1', [await s.user(w)])).rewinders);
const relicCount = async (w) => Number((await q1('select count(*) as n from slg_relics where user_id = $1 and used_ms is null', [await s.user(w)])).n);
const inbox = async (w) => s.q("select payload from slg_inbox where user_id = $1 and kind = 'unit_gift' order by id", [await s.user(w)]);
const send = (target, title, attach = {}, days = 30, incNew = false, as = 'root') => s.rpc('slg_admin_mail_send', [target, title, '본문', JSON.stringify(attach), days, incNew], as);
const list = (w) => s.rpc('slg_mail_list', [], w);
const claim = (w, id = null) => s.rpc('slg_mail_claim', [id], w);

// 운영자 (이메일 인증된 rooin37@gmail.com)
s.users.root = (await s.q("insert into auth.users (email, email_confirmed_at) values ('rooin37@gmail.com', now()) returning id"))[0].id;
await boot('root', '운영테스트');
await boot('a', '알파');
await boot('b', '브라보');
await put('relics', 'r_gift', { id: 'r_gift', name: '선물 유물', kind: 'gift', rarity: 'rare', description: '', effects: [{ scope: 'self', stat: 'atk', value: 2 }] });
await put('relics', 'r_cmd', { id: 'r_cmd', name: '지휘관 유물', kind: 'commander', rarity: 'epic', description: '', effects: [] });
await put('characters', 'c_hero', { id: 'c_hero', name: '영웅' });

// ------------------------------------------------------------ 권한
await rejects(() => send('all', '해킹', { gold: 999 }, 30, false, 'a'), '일반 플레이어는 메일을 보낼 수 없다', /forbidden/);
await rejects(() => s.rpc('slg_admin_mail_list', [50], 'a'), '일반 플레이어는 보낸 메일 목록을 볼 수 없다', /forbidden/);
// 브라우저(authenticated 역할)로: 테이블 · 내부 함수는 막히고 RPC 는 열려 있다
const asBrowser = async (w, fn) => { await s.db.query("select set_config('request.jwt.claim.sub', $1, false)", [String(await s.user(w))]); await s.db.query('set role authenticated'); try { return await fn(); } finally { await s.db.query('reset role'); } };
const aId = await s.user('a');
await rejects(() => asBrowser('a', () => s.q('select * from slg_mail')), '브라우저는 메일 테이블을 직접 읽을 수 없다', /permission denied/);
await rejects(() => asBrowser('a', () => s.q('select public.slg_mail_claim_one($1, 1, 0)', [aId])), '내부 지급 함수는 직접 부를 수 없다', /permission denied/);
ok((await asBrowser('a', () => s.q('select public.slg_mail_list() as r')))[0].r.ok, '플레이어는 브라우저 권한으로 우편함을 열 수 있다');
await rejects(() => asBrowser('a', () => s.q("select public.slg_admin_mail_send('all', 'x', '', '{}'::jsonb, 30, false)")), '브라우저 권한의 일반 플레이어는 보낼 수 없다', /forbidden/);
const permMail = (await asBrowser('root', () => s.q("select public.slg_admin_mail_send('all', '권한 확인', '', '{}'::jsonb, 30, false) as r")))[0].r;
ok(permMail.ok, '운영자는 브라우저 권한으로 보낼 수 있다');
await s.rpc('slg_admin_mail_revoke', [permMail.id], 'root');

// ------------------------------------------------------------ 검사
eq((await send('all', '', {})).error, 'no_title', '제목이 없으면 거절');
eq((await send('없는사람', '안녕', {})).error, 'no_player', '없는 지휘관 이름이면 거절');
eq((await send('all', '많다', { gold: 999999999 })).error, 'gold_too_much', '골드 상한을 넘으면 거절');
eq((await send('all', '가짜', { relics: ['nope'] })).error, 'unknown_relic', '없는 유물이면 거절');
eq((await send('all', '가짜', { characters: ['nope'] })).error, 'unknown_character', '없는 캐릭터면 거절');
eq((await send('all', '음수', { gold: -5 })).error, 'bad_gold', '음수 골드는 거절');
eq((await send('all', '기간', {}, 0)).error, 'bad_days', '보관 기간 0일은 거절');

// ------------------------------------------------------------ 전체 메일
const all = await send('all', '점검 보상', { gold: 500, rewinders: 2, relics: ['r_gift', 'r_cmd'], characters: ['c_hero'] });
ok(all.ok && all.recipients === 3, '전체 메일 발송 (받는 사람 3명)');
const la = await list('a');
eq(la.mails.map((m) => m.title), ['점검 보상'], 'A의 우편함에 보인다');
eq(la.badge, { unread: 1, unclaimed: 1 }, '배지: 안 읽음 1, 받을 것 1');
eq(Object.entries(la.mails[0].attach.names).sort(), [['char:c_hero', '영웅'], ['relic:r_cmd', '지휘관 유물'], ['relic:r_gift', '선물 유물']], '첨부에 유물 · 캐릭터 이름이 같이 저장된다');
eq((await s.rpc('slg_sync', [null, 0, []], 'a')).mail, { unread: 1, unclaimed: 1 }, '동기화 응답에도 배지가 실린다');

const g0 = await gold('a'), rw0 = await rewinders('a');
const c1 = await claim('a', all.id);
ok(c1.ok, '받기 성공');
eq(await gold('a') - g0, 500, '골드 +500 (서버 지갑)');
eq(await rewinders('a') - rw0, 2, '리와인더 +2');
eq(await relicCount('a'), 2, '유물 2개 지급');
eq((await inbox('a')).map((r) => r.payload.characterId), ['c_hero'], '캐릭터는 우편(unit_gift)으로 전달된다');
eq(c1.badge, { unread: 0, unclaimed: 0 }, '받은 뒤 배지가 비워진다');

const c2 = await claim('a', all.id);
eq(c2.error, 'already_claimed', '같은 메일은 두 번 받을 수 없다');
eq(await gold('a') - g0, 500, '두 번째 받기로 골드가 늘지 않는다');
eq((await claim('a')).claimed.length, 0, '모두 받기로도 다시 받을 수 없다');

// 리와인더 상한(보유 10)을 넘겨도 운영자 선물은 그대로 준다 + 플레이어 획득 상한에 세지 않는다
const before = await rewinders('b');
await s.q('update slg_players set rewinders = 10 where user_id = $1', [await s.user('b')]);
const cb = await claim('b', all.id);
ok(cb.ok && await rewinders('b') === 12, '보유 상한을 넘어도 운영자가 정한 리와인더를 그대로 받는다');
eq(Number((await q1("select coalesce(sum(qty),0) as n from slg_item_log where user_id = $1 and kind = 'rewinder_grant'", [await s.user('b')])).n), 0, '메일 리와인더는 획득 상한 집계(rewinder_grant)에 들어가지 않는다');
void before;

// ------------------------------------------------------------ 개인 메일 · 이름 매칭
const one = await send(' 알 파 ', '개인 선물', { gold: 100 });
ok(one.ok && one.recipients === 1 && one.targetName === '알파', '지휘관 이름(공백 무시)으로 한 명에게 보낸다');
eq((await list('b')).mails.some((m) => m.id === one.id), false, '다른 사람 우편함에는 보이지 않는다');
eq((await claim('b', one.id)).error, 'not_found', '다른 사람의 개인 메일은 받을 수 없다');
ok((await claim('a', one.id)).ok, '받는 사람은 받을 수 있다');

// ------------------------------------------------------------ 가입 시점 · 만료 · 회수
await tick(H);
await boot('late', '늦게온사람');
eq((await list('late')).mails.length, 0, '보낸 뒤 가입한 사람은 기존 전체 메일을 받지 않는다');
const welcome = await send('all', '신규 환영', { gold: 50 }, 30, true);
await tick(H);
await boot('later', '더늦은사람');
eq((await list('later')).mails.map((m) => m.title), ['신규 환영'], '"신규 가입자도 받기" 메일은 나중에 가입해도 받는다');

const short = await send('all', '하루짜리', { gold: 10 }, 1);
await tick(D + 1000);
eq((await list('a')).mails.some((m) => m.id === short.id), false, '만료된 메일은 보이지 않는다');
eq((await claim('a', short.id)).error, 'expired', '만료된 메일은 받을 수 없다');

const rv = await send('all', '잘못 보냄', { gold: 99999 });
ok((await s.rpc('slg_admin_mail_revoke', [rv.id], 'root')).ok, '운영자는 메일을 회수할 수 있다');
eq((await claim('a', rv.id)).error, 'revoked', '회수된 메일은 받을 수 없다');

// ------------------------------------------------------------ 지우기 · 모두 받기 · 목록
const keep = await send('all', '지우기 테스트', { gold: 5 });
eq((await s.rpc('slg_mail_delete', [keep.id], 'a')).error, 'unclaimed', '첨부를 받기 전에는 지울 수 없다');
const note = await send('all', '공지만', {});
ok((await s.rpc('slg_mail_delete', [note.id], 'a')).ok, '첨부 없는 공지는 바로 지울 수 있다');
eq((await list('a')).mails.some((m) => m.id === note.id), false, '지운 메일은 우편함에서 빠진다');

const g1 = await gold('b');
const allClaim = await claim('b');
ok(allClaim.ok && allClaim.claimed.length >= 2, '모두 받기: 받을 수 있는 메일을 한꺼번에 받는다');
ok(await gold('b') > g1, '모두 받기로 골드가 들어온다');
ok((await s.rpc('slg_mail_read', [note.id], 'b')).ok, '읽음 표시');

const al = await s.rpc('slg_admin_mail_list', [50], 'root');
const row = al.mails.find((m) => m.id === all.id);
ok(row && row.claimed === 2, '운영자 목록에 받은 사람 수가 나온다');
ok(al.mails.find((m) => m.id === rv.id).revokedAt > 0, '운영자 목록에 회수 여부가 나온다');

const audit = await s.q("select count(*) as n from slg_audit where kind = 'mail_send'");
ok(Number(audit[0].n) >= 5, '보낸 메일은 감사 기록에 남는다');
void welcome;

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
