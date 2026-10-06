-- ============================================================================
-- supabase-economy.sql — 서버 권위 경제 (지갑 · 인플레이션 · 연준 · 지분/세금 · 담보대출 · 캐릭터 경매)
--
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 실행하세요. (여러 번 실행해도 안전합니다 — 데이터는 지우지 않습니다.)
-- 실행 전에 Authentication > Providers 에서 Email(필수)과 Google(선택)을 켜 두세요. 자세한 순서는 README "서버 권위 경제" 참고.
--
-- 원칙
--  * 골드 잔액·물가·금리·지분·대출·경매는 전부 이 DB가 가진다. 브라우저는 RPC(slg_* 함수)만 부를 수 있고 테이블은 직접 못 읽고 못 쓴다.
--  * 모든 RPC는 로그인한 사용자(auth.uid())의 것만 건드린다. security definer + search_path 고정.
--  * 쓰기 RPC는 전부 같은 어드바이저리 락을 잡아 직렬로 실행된다 (동시성 버그·데드락 방지. 이 규모에서는 충분히 빠르다).
--  * 시각은 전부 DB 시각(ms). 클라이언트 시계는 믿지 않는다.
--  * 전투는 서버가 재현할 수 없으므로 전투 수입은 "건당 상한 · 1회 청구(ref) · 시간당 상한"으로 부풀리기를 막는 수준까지만 검증한다.
-- ============================================================================

-- ---------------------------------------------------------------- 설정값 (운영 중 UPDATE 로 조정 가능)
create table if not exists public.slg_config (key text primary key, value numeric not null);

insert into public.slg_config (key, value) values
  -- 물가 · 연준
  ('tick_hours', 8), ('rate_init_bp', 150), ('rate_min_bp', 25), ('rate_max_bp', 500), ('rate_step_bp', 25), ('neutral_bp', 150),
  ('base_drift_pct', 0.15), ('sensitivity_pct', 0.20), ('noise_pct', 0.10), ('price_min', 0.5), ('price_max', 5),
  ('max_catchup_ticks', 90), ('motion_ttl_hours', 24), ('rate_cooldown_hours', 8), ('min_seat_bp', 100), ('history_len', 30),
  ('ref_money', 800), ('ref_velocity', 0.12), ('velocity_weight', 0.5), ('gap_gain', 0.10), ('gap_cap_pct', 1.0),
  ('money_idx_min', 0.2), ('money_idx_max', 5), ('vel_idx_min', 0.5), ('vel_idx_max', 2),
  ('report_max_age_hours', 72), ('spend_window_ticks', 3),
  -- 대출
  ('spread_bp', 50), ('ltv', 0.6), ('min_loan', 50), ('term_step_hours', 8), ('min_term_hours', 8), ('max_term_hours', 168),
  ('max_active_loans', 3), ('miss_limit', 3), ('loan_total_cap_base', 1500), ('loan_default_ban_hours', 72),
  ('collateral_max_level', 30), ('collateral_max_rank', 4), ('ransom_base', 300),
  -- 담보 회수 실패 시 채권 회수: 몰수 확인이 없으면 서버 지갑에서 압류하고 모자란 만큼은 빚으로 남아 이후 수입의 일부(%)에서 갚는다
  ('seize_confirm_ms', 600000), ('seize_verify_ms', 600000), ('debt_garnish_pct', 50),
  -- 경매
  ('auction_hours', 24), ('anti_snipe_ms', 300000), ('min_inc_pct', 5), ('min_inc_flat', 10), ('open_pct', 0.5),
  ('relist_drop_pct', 30), ('min_start_price', 10), ('auction_recent_hours', 24),
  -- 국가 지분 · 세금
  ('tax_base', 25), ('tax_per_threat', 12.5), ('purchase_right_bp', 5000), ('price_unowned_paybacks', 6), ('price_holder_paybacks', 9),
  ('max_catchup_hours', 72), ('dummy_count_min', 2), ('dummy_count_max', 4), ('dummy_total_min_pct', 30), ('dummy_total_max_pct', 70),
  ('secure_min_interval_ms', 180000),
  -- 지갑
  ('start_gold', 450), ('stash_gold', 100), ('migrate_cap', 450),
  ('earn_cap_per_hour_base', 15000), ('loot_max_base', 800), ('reward_max_base', 6000), ('event_max_base', 400), ('sell_max_base', 3000),
  ('price_tolerance', 1.25), ('rewind_window_ms', 1200000), ('min_loop_interval_ms', 20000)
on conflict (key) do nothing;

create or replace function public.slg_cfg(k text) returns numeric
language sql stable set search_path = public as $$
  select value from public.slg_config where key = k
$$;

-- ---------------------------------------------------------------- 구역 (campaignRegions.js 와 같아야 한다 — 테스트가 비교한다)
create table if not exists public.slg_regions (
  region_id text primary key,
  threat int not null,
  neighbors text[] not null,
  is_start boolean not null default false,
  tax_mult numeric not null default 1      -- 국가별 세수 배율 (campaignRegions.js 의 taxMult)
);
alter table public.slg_regions add column if not exists tax_mult numeric not null default 1;

insert into public.slg_regions (region_id, threat, neighbors, is_start) values
  ('liona', 1, array['mira', 'vaska'], true),
  ('mira', 2, array['liona', 'luma', 'savo', 'vaska'], false),
  ('vaska', 2, array['liona', 'mira', 'savo', 'tino'], false),
  ('oria', 4, array['rokan', 'tino'], false),
  ('luma', 3, array['mira', 'savo', 'torva'], false),
  ('tino', 3, array['elda', 'oria', 'rokan', 'savo', 'vaska'], false),
  ('rokan', 4, array['elda', 'oria', 'silva', 'tino'], false),
  ('savo', 3, array['arca', 'luma', 'mira', 'naru', 'tino', 'torva', 'vaska'], false),
  ('torva', 4, array['ara', 'arca', 'luma', 'savo'], false),
  ('ara', 5, array['arca', 'torva'], false),
  ('elda', 4, array['naru', 'rokan', 'silva', 'tino', 'valen'], false),
  ('naru', 4, array['arca', 'elda', 'savo', 'valen'], false),
  ('silva', 5, array['elda', 'mor', 'rokan', 'valen'], false),
  ('valen', 5, array['elda', 'mor', 'naru', 'silva'], false),
  ('arca', 4, array['ara', 'naru', 'savo', 'torva'], false),
  ('mor', 6, array['silva', 'valen'], false)
on conflict (region_id) do update set threat = excluded.threat, neighbors = excluded.neighbors, is_start = excluded.is_start;

update public.slg_regions r set tax_mult = v.m from (values
  ('liona', 0.8), ('mira', 1.3), ('vaska', 0.9), ('oria', 1.6), ('luma', 0.8), ('tino', 1.0), ('rokan', 1.1), ('savo', 1.2),
  ('torva', 1.0), ('ara', 1.0), ('elda', 1.2), ('naru', 1.4), ('silva', 0.9), ('valen', 1.5), ('arca', 1.1), ('mor', 1.5)
) as v(id, m) where r.region_id = v.id;

-- ---------------------------------------------------------------- 플레이어 · 지갑
create table if not exists public.slg_players (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '지휘관',
  gold bigint not null default 0 check (gold >= 0),
  loop int not null default 0,
  run_started_ms bigint not null default 0,
  created_ms bigint not null,
  last_seen_ms bigint not null,
  last_settled_ms bigint,                       -- 마지막 세금 정산 시각 (null = 아직 지분이 없었다)
  last_secure_ms bigint not null default 0,     -- 마지막 구역 점령 청구가 "유효해지는" 시각 (대기열)
  last_loop_ms bigint not null default 0,
  loan_ban_until_ms bigint not null default 0,  -- 담보를 몰수당하면 한동안 대출 불가
  spend jsonb not null default '{}'::jsonb      -- { 틱번호: 그 틱에 쓴 골드 } — 소비(수요) 집계용
);

create table if not exists public.slg_wallet_log (
  id bigserial primary key,
  user_id uuid not null,
  tx_id text not null,
  kind text not null,
  delta bigint not null,
  ref text,
  balance_after bigint not null,
  at_ms bigint not null,
  unique (user_id, tx_id)
);
create index if not exists slg_wallet_log_user_at on public.slg_wallet_log (user_id, at_ms);
-- 1회성 수입은 같은 ref 로 두 번 받을 수 없다
create unique index if not exists slg_wallet_log_once on public.slg_wallet_log (user_id, kind, ref)
  where ref is not null and kind in ('earn_reward', 'earn_event', 'earn_stash');

create table if not exists public.slg_admins (user_id uuid primary key references auth.users (id) on delete cascade);
-- 이메일로 관리자 지정 (가입 전에도 등록해 둘 수 있다). 이메일 인증이 끝난 계정만 관리자로 인정한다 —
-- "Confirm email" 을 꺼 둔 상태에서 남이 같은 주소로 먼저 가입해도 관리자가 되지 못한다 (Google 로그인은 인증된 이메일이다).
create table if not exists public.slg_admin_emails (email text primary key);
insert into public.slg_admin_emails (email) values ('rooin37@gmail.com') on conflict (email) do nothing;

-- 플레이어에게 보여 줄 소식 (세금 · 이자 · 몰수 · 낙찰 …). 클라이언트가 확인(ack)하면 지운다.
create table if not exists public.slg_events (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  at_ms bigint not null
);
create index if not exists slg_events_user on public.slg_events (user_id, id);

-- 플레이어에게 전달할 물건 (경매로 받은 캐릭터 · 몰수 확정된 담보). 클라이언트가 받아 적은 뒤 ack.
create table if not exists public.slg_inbox (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  payload jsonb not null,
  at_ms bigint not null
);
create index if not exists slg_inbox_user on public.slg_inbox (user_id, id);

-- ---------------------------------------------------------------- 연준 (싱글턴) · 안건
create table if not exists public.slg_econ (
  id int primary key default 1 check (id = 1),
  rev bigint not null default 0,
  rate_bp int not null,
  price numeric not null default 1,
  last_tick_at bigint not null,
  tick_count int not null default 0,
  last_rate_change_at bigint not null default 0,
  history jsonb not null default '[]'::jsonb,
  macro jsonb,
  last_motion jsonb
);

create table if not exists public.slg_motion (
  id text primary key,
  dir int not null check (dir in (-1, 1)),
  proposer uuid not null,
  proposer_name text not null,
  created_ms bigint not null,
  expires_ms bigint not null
);
create unique index if not exists slg_motion_single on public.slg_motion ((true)); -- 동시에 안건은 하나

create table if not exists public.slg_motion_votes (
  motion_id text not null references public.slg_motion (id) on delete cascade,
  voter uuid not null,
  name text not null,
  v text not null check (v in ('yes', 'no')),
  primary key (motion_id, voter)
);

-- ---------------------------------------------------------------- 국가 지분
create table if not exists public.slg_nations (
  region_id text primary key references public.slg_regions (region_id),
  created_ms bigint not null
);
create table if not exists public.slg_shares (
  region_id text not null references public.slg_regions (region_id),
  holder text not null,                -- 플레이어 user_id 문자열 또는 'dummy_<region>_<i>'
  name text not null,
  bp int not null check (bp > 0),      -- 1/10000 단위
  dummy boolean not null default false,
  loop int,                            -- 지분을 얻었을 때의 회귀 횟수 (더미는 null)
  primary key (region_id, holder)
);
create table if not exists public.slg_payouts (   -- 다른 플레이어가 내 지분을 사 가면 쌓이는 대금
  region_id text not null,
  holder text not null,
  gold bigint not null check (gold > 0),
  loop int not null,
  primary key (region_id, holder)
);
create table if not exists public.slg_share_rights (   -- 구역 점령으로 생기는 지분 구매권
  user_id uuid not null,
  region_id text not null references public.slg_regions (region_id),
  loop int not null,
  max_bp int not null,
  bought_bp int not null default 0,
  available_ms bigint not null,        -- 이 시각부터 구매 가능 (점령 청구 간격 제한)
  primary key (user_id, region_id)
);
create table if not exists public.slg_secured (
  user_id uuid not null,
  region_id text not null references public.slg_regions (region_id),
  loop int not null,
  at_ms bigint not null,
  primary key (user_id, region_id)
);

-- ---------------------------------------------------------------- 대출 · 경매
create table if not exists public.slg_loans (
  id text primary key,
  user_id uuid not null,
  loop int not null,
  principal bigint not null,
  rate_bp int not null,
  started_ms bigint not null,
  term_hours int not null,
  due_ms bigint not null,
  periods_done int not null default 0,
  interest_paid bigint not null default 0,
  arrears bigint not null default 0,
  missed int not null default 0,
  status text not null default 'active' check (status in ('active', 'repaid', 'defaulted', 'void')),
  collateral jsonb not null,
  collateral_value bigint not null
);
create index if not exists slg_loans_user on public.slg_loans (user_id, status);

-- 감사 기록: 클라이언트의 주장이 서버가 볼 수 있는 증거(저장된 세이브)와 다를 때 남긴다. 브라우저는 읽지 못한다 (관리자 RPC slg_audit_list 로만).
create table if not exists public.slg_audit (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,          -- seize_claim · seize_mismatch · seize_unverified · seize_no_confirm · collateral_substitute · rename
  detail jsonb not null default '{}'::jsonb,
  at_ms bigint not null
);
create index if not exists slg_audit_user on public.slg_audit (user_id, id);
-- 몰수 확정 후 담보 회수 상태: pending(확인 대기) · claimed(클라이언트가 몰수했다고 알림 → 저장된 세이브로 검증 대기)
--   · done(검증 통과) · lost(회수 실패 → 지갑 압류 + 빚)
alter table public.slg_loans drop constraint if exists slg_loans_seize_state_check;
alter table public.slg_loans add column if not exists seize_state text;
alter table public.slg_loans add column if not exists seize_claim_ms bigint;                     -- 몰수했다고 알린 시각
alter table public.slg_loans add column if not exists claim bigint not null default 0;          -- 몰수 시점의 채권액 (원금 + 밀린 이자)
alter table public.slg_loans add column if not exists defaulted_ms bigint;
alter table public.slg_loans add column if not exists seize_seen_ms bigint;                      -- 몰수 우편이 클라이언트에 처음 전달된 시각
-- 압류하고도 모자란 채권. 회귀해도 남고, 이후 수입에서 일부씩 갚는다 (빚이 있는 동안 새 대출 불가)
alter table public.slg_players add column if not exists debt bigint not null default 0 check (debt >= 0);
-- 플레이어 이름: 시작할 때 한 번 정하면(name_set) 이후에는 개명 유물로만 바꾼다.
-- 지분 · 표결 · 경매에서 이름으로 사람을 가리키므로, 대소문자와 공백을 무시하고 서로 달라야 한다 (name_key).
-- 아직 이름을 정하지 않은 기존 플레이어(name_set = false)는 이 제약에서 빠진다 → 다음 접속 때 정한다.
alter table public.slg_players add column if not exists name_set boolean not null default false;
alter table public.slg_players add column if not exists name_key text;
create unique index if not exists slg_players_name_key_uq on public.slg_players (name_key) where name_set;

create table if not exists public.slg_auctions (
  id text primary key,
  unit jsonb not null,
  value bigint not null,
  status text not null default 'open' check (status in ('open', 'sold', 'delivered', 'void')),
  reason text not null default 'default',
  seller_name text not null default '연방준비기금',
  relists int not null default 0,
  start_price bigint not null,
  current_bid bigint not null default 0,
  bidder uuid,
  bidder_name text,
  bidder_loop int,
  bids int not null default 0,
  created_ms bigint not null,
  ends_ms bigint not null,
  winner uuid,
  winner_name text,
  final_price bigint not null default 0,
  closed_ms bigint
);
create index if not exists slg_auctions_status on public.slg_auctions (status, ends_ms);

-- ---------------------------------------------------------------- 아이템 (리와인더 · 유물): 서버가 원본
-- 리와인더 개수 · 유물 보유는 이 테이블들에만 있다. 브라우저는 읽기만 하고 (slg_sync 의 items), 바꾸는 것은 전부 아래 RPC 가 한다.
alter table public.slg_players add column if not exists rewinders int not null default 3 check (rewinders >= 0);
-- 이 버전 이전부터 있던 플레이어(items_migrated = false)만 예전 세이브의 리와인더 · 유물을 한 번 이전할 수 있다. 새 플레이어는 처음부터 true.
alter table public.slg_players add column if not exists items_migrated boolean not null default false;
alter table public.slg_players alter column items_migrated set default true;
alter table public.slg_regions add column if not exists relic_profile text not null default 'tribal';   -- 세금 유물 성향 (shareEngine.js RELIC_PROFILES)

update public.slg_regions r set relic_profile = v.p from (values
  ('liona', 'frontier'), ('mira', 'merchant'), ('vaska', 'martial'), ('oria', 'merchant'), ('luma', 'tribal'), ('tino', 'merchant'),
  ('rokan', 'martial'), ('savo', 'martial'), ('torva', 'martial'), ('ara', 'tribal'), ('elda', 'mystic'), ('naru', 'merchant'),
  ('silva', 'tribal'), ('valen', 'merchant'), ('arca', 'martial'), ('mor', 'mystic')
) as v(id, p) where r.region_id = v.id;

create table if not exists public.slg_relics (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  relic_id text not null,
  kind text not null check (kind in ('commander', 'gift', 'rename')),
  snapshot jsonb not null,                 -- 얻은 시점의 정의 (이름 · 효과 · 등급). 나중에 정의가 바뀌어도 그대로
  source jsonb,
  equipped boolean not null default false,
  "loop" int not null,
  created_ms bigint not null,
  used_ms bigint,                          -- 쓰였거나(개명 · 선물) 회귀로 사라진 시각. null 이면 지금 가지고 있다
  used_for text
);
create index if not exists slg_relics_owned on public.slg_relics (user_id) where used_ms is null;

-- 전투 · 이벤트 한 건. 시작(slg_encounter_start)과 수령(slg_encounter_claim)을 서버가 기록한다.
create table if not exists public.slg_encounters (
  user_id uuid not null references auth.users (id) on delete cascade,
  "loop" int not null,
  ref text not null,                       -- 클라이언트 전투 id (회차마다 다시 1부터 센다)
  node_id text not null,
  sector_id text not null,
  type text not null check (type in ('battle', 'elite', 'boss', 'event')),
  enemies int not null default 1,
  started_ms bigint not null,
  status text not null default 'active' check (status in ('active', 'awaiting', 'claimed', 'void')),
  gold_reward bigint not null default 0,
  rewinder_reward int not null default 0,
  result jsonb,
  claimed_ms bigint,
  primary key (user_id, "loop", ref)
);
-- 한 노드의 보상은 회차당 한 번, 보스는 구역(섹터)마다 회차당 한 번 (가짜 노드 id 로 반복 수령하는 것을 막는다)
create unique index if not exists slg_enc_node_once on public.slg_encounters (user_id, "loop", node_id) where status in ('awaiting', 'claimed');
create unique index if not exists slg_enc_boss_once on public.slg_encounters (user_id, "loop", sector_id) where type = 'boss' and status in ('awaiting', 'claimed');
create index if not exists slg_enc_recent on public.slg_encounters (user_id, claimed_ms);

create table if not exists public.slg_item_log (
  id bigserial primary key,
  user_id uuid not null,
  "loop" int not null,
  kind text not null,                      -- rewinder_grant · rewinder_use · rewinder_buy · relic_grant · relic_use · relic_wipe ...
  qty int not null default 1,
  ref text,
  detail jsonb,
  at_ms bigint not null
);
create index if not exists slg_item_log_user on public.slg_item_log (user_id, kind, "loop");

insert into public.slg_config (key, value) values
  ('rewinder_hold_max', 10), ('rewinder_loop_grants', 40), ('rewinder_price_village', 120), ('rewinder_price_shop', 150),
  ('relic_loop_cap', 60), ('commander_slots', 3), ('migrate_rewinder_cap', 5), ('migrate_relic_cap', 10),
  ('enc_min_ms', 10000), ('rewinder_day_grants', 20), ('rewinder_day_buys', 10), ('boss_per_loop', 4), ('enc_max_enemies', 12), ('claims_per_hour', 30), ('claims_per_loop', 80), ('enc_max_node_len', 48)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 권한: 브라우저는 테이블을 직접 못 본다 (RPC 만)
do $$
declare t text;
begin
  foreach t in array array['slg_config','slg_regions','slg_players','slg_wallet_log','slg_admins','slg_admin_emails','slg_events','slg_inbox','slg_econ',
                           'slg_motion','slg_motion_votes','slg_nations','slg_shares','slg_payouts','slg_share_rights','slg_secured',
                           'slg_loans','slg_auctions','slg_audit','slg_relics','slg_encounters','slg_item_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', t); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', t); end if;
  end loop;
end $$;

-- ============================================================================
-- 공통 유틸
-- ============================================================================
create or replace function public.slg_now_ms() returns bigint
language sql volatile set search_path = public as $$
  select coalesce(nullif(current_setting('slg.now_ms', true), '')::bigint, (extract(epoch from clock_timestamp()) * 1000)::bigint)
$$;

create or replace function public.slg_uid() returns uuid
language plpgsql stable set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return u;
end $$;

create or replace function public.slg_lock() returns void
language sql volatile set search_path = public as $$ select pg_advisory_xact_lock(727001) $$;

-- 0~1 의사난수 (같은 seed → 같은 값)
create or replace function public.slg_rand(seed text) returns numeric
language sql immutable set search_path = public as $$
  select (('x' || substr(md5(seed), 1, 8))::bit(32)::bigint)::numeric / 4294967296.0
$$;

-- 문자열 → 정수 (아니면 기본값)
create or replace function public.slg_int(v text, dflt int) returns int
language sql immutable set search_path = public as $$
  select case when v ~ '^-?[0-9]{1,9}$' then v::int else dflt end
$$;

-- 기준가 × 물가. 소액은 1G, 100G 이상은 5G 단위 (config.js scaleGold 와 같다)
create or replace function public.slg_scale(base numeric, price numeric) returns bigint
language plpgsql immutable set search_path = public as $$
declare v numeric := base * price; u numeric;
begin
  if not (v > 0) then return 0; end if;
  u := case when v >= 100 then 5 else 1 end;
  return greatest(1, (round(v / u) * u)::bigint);
end $$;

-- 수입용: 1G 단위 (config.js scaleIncome 과 같다)
create or replace function public.slg_scale_income(base numeric, price numeric) returns bigint
language sql immutable set search_path = public as $$
  select case when base * price > 0 then greatest(1, round(base * price)::bigint) else 0 end
$$;

create or replace function public.slg_hist_trim(h jsonb, n int) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
  from (select x, i from jsonb_array_elements(h) with ordinality as t(x, i) order by i desc limit n) s
$$;

-- ============================================================================
-- 물가 · 연준 엔진 (fedEngine.js 와 같은 식)
-- ============================================================================
create or replace function public.slg_econ_init(p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare tick_ms bigint := (slg_cfg('tick_hours') * 3600000)::bigint; b bigint;
begin
  b := (p_now / tick_ms) * tick_ms;
  insert into slg_econ (id, rate_bp, price, last_tick_at, history)
  values (1, slg_cfg('rate_init_bp')::int, 1, b, jsonb_build_array(jsonb_build_object('at', b, 'price', 1, 'rateBp', slg_cfg('rate_init_bp')::int)))
  on conflict (id) do nothing;
end $$;

-- 정책금리 항: 기본 상승분 − 민감도 × (금리 − 중립)
create or replace function public.slg_drift_pct(p_rate_bp int) returns numeric
language sql stable set search_path = public as $$
  select slg_cfg('base_drift_pct') - slg_cfg('sensitivity_pct') * ((p_rate_bp - slg_cfg('neutral_bp')) / 100.0)
$$;

-- 틱 하나의 물가 변동(%)을 원인별로: { rate, money, demand, total }
create or replace function public.slg_breakdown(p_rate_bp int, p_price numeric, p_macro jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  r numeric := slg_drift_pct(p_rate_bp);
  m numeric := 0; d numeric := 0; s numeric; k numeric;
  players numeric; money numeric; vel numeric; money_idx numeric; vel_idx numeric;
begin
  if p_macro is not null then
    players := coalesce((p_macro->>'players')::numeric, 0);
    money := coalesce((p_macro->>'money')::numeric, 0);
    vel := coalesce((p_macro->>'velocity')::numeric, 0);
    if players > 0 and money > 0 then
      money_idx := least(slg_cfg('money_idx_max'), greatest(slg_cfg('money_idx_min'), (money / players) / slg_cfg('ref_money')));
      vel_idx := least(slg_cfg('vel_idx_max'), greatest(slg_cfg('vel_idx_min'), vel / slg_cfg('ref_velocity')));
      m := slg_cfg('gap_gain') * ln(money_idx / p_price) * 100;
      d := slg_cfg('gap_gain') * slg_cfg('velocity_weight') * ln(vel_idx) * 100;
      s := m + d;
      if abs(s) > slg_cfg('gap_cap_pct') then
        k := slg_cfg('gap_cap_pct') / abs(s);
        m := m * k; d := d * k;
      end if;
    end if;
  end if;
  return jsonb_build_object('rate', r, 'money', m, 'demand', d, 'total', r + m + d);
end $$;

create or replace function public.slg_noise(n int) returns numeric
language sql immutable set search_path = public as $$
  select (slg_rand('fed|' || n) * 2 - 1) * slg_cfg('noise_pct')
$$;

-- 접속 중인 플레이어를 합친 거시 지표 { at, players, money, debt, spend, velocity }. 아무도 없으면 null.
create or replace function public.slg_build_macro(p_now bigint) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  tick_ms bigint := (slg_cfg('tick_hours') * 3600000)::bigint;
  ti bigint := p_now / tick_ms;
  cutoff bigint := p_now - (slg_cfg('report_max_age_hours') * 3600000)::bigint;
  w int := slg_cfg('spend_window_ticks')::int;
  n int; money numeric; spend numeric; debt numeric;
begin
  select count(*), coalesce(sum(gold), 0) into n, money from slg_players where last_seen_ms >= cutoff;
  if n = 0 then return null; end if;
  select coalesce(sum(a), 0) into spend from (
    select (select avg((p.spend ->> k::text)::numeric) from generate_series(ti - w, ti - 1) k where p.spend ? k::text) as a
    from slg_players p where p.last_seen_ms >= cutoff
  ) q;
  select coalesce(sum(l.principal + l.arrears), 0) into debt
  from slg_loans l join slg_players p on p.user_id = l.user_id
  where l.status = 'active' and p.last_seen_ms >= cutoff;
  return jsonb_build_object('at', p_now, 'players', n, 'money', money, 'debt', debt, 'spend', round(spend),
                            'velocity', case when money > 0 then spend / money else 0 end);
end $$;

-- 지나간 틱을 모두 적용한다. 틱이 지났으면 그 시점의 거시 지표를 집계해서 같이 적는다.
create or replace function public.slg_econ_advance(p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare
  e slg_econ%rowtype;
  tick_ms bigint := (slg_cfg('tick_hours') * 3600000)::bigint;
  boundary bigint; missed bigint; steps int; i int; n int;
  v_macro jsonb; bd jsonb; pct numeric; newprice numeric;
  v_hist jsonb; v_price numeric; v_tick int;
begin
  perform slg_econ_init(p_now);
  select * into e from slg_econ where id = 1 for update;
  boundary := (p_now / tick_ms) * tick_ms;
  if boundary <= e.last_tick_at then return; end if;
  v_macro := slg_build_macro(p_now);
  missed := (boundary - e.last_tick_at) / tick_ms;
  steps := least(missed, slg_cfg('max_catchup_ticks'))::int;
  v_hist := e.history; v_price := e.price; v_tick := e.tick_count;
  for i in 1..steps loop
    n := v_tick + 1;
    bd := slg_breakdown(e.rate_bp, v_price, v_macro);
    pct := (bd->>'total')::numeric + slg_noise(n);
    newprice := round(v_price * (1 + pct / 100), 4);
    v_price := least(slg_cfg('price_max'), greatest(slg_cfg('price_min'), newprice));
    v_tick := n;
    v_hist := v_hist || jsonb_build_array(jsonb_build_object('at', e.last_tick_at + i * tick_ms, 'price', v_price, 'rateBp', e.rate_bp));
  end loop;
  update slg_econ set
    price = v_price, tick_count = v_tick, last_tick_at = boundary, macro = v_macro,
    history = slg_hist_trim(v_hist, slg_cfg('history_len')::int), rev = rev + 1
  where id = 1;
end $$;

-- ============================================================================
-- 플레이어 · 지갑 내부 함수 (RPC 가 아니다 — 클라이언트에 노출하지 않는다)
-- ============================================================================
create or replace function public.slg_clean_name(p_name text) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(left(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'), 24), ''), '지휘관')
$$;

-- 이름 비교용 키: 대소문자 · 공백을 무시한다 ("Leo Nardo" = "leonardo")
create or replace function public.slg_name_key(p_name text) returns text
language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(p_name, ''), '\s', '', 'g'))
$$;

-- 이름 규칙 검사. 통과하면 { ok, name }, 아니면 { ok:false, error }.
--   error: too_short(2자 미만) · too_long(12자 초과) · bad_chars(< > & " ' \) · reserved(기본 이름·운영 용어·게스트 표기) · taken(다른 플레이어가 사용 중)
-- p_uid 본인의 이름은 "다른 플레이어"가 아니다 (대소문자만 바꾸는 개명 허용).
create or replace function public.slg_name_check(p_name text, p_uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare n text; k text;
begin
  n := btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
  if char_length(n) < 2 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  if char_length(n) > 12 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if n ~ '[<>&"''\\]' then return jsonb_build_object('ok', false, 'error', 'bad_chars'); end if;
  k := slg_name_key(n);
  if k = any (array['지휘관', '레오나르도', '관리자', '운영자', '시스템', 'admin', 'administrator', 'gm', 'system']) or k ~ '^(guest|fb_)' then
    return jsonb_build_object('ok', false, 'error', 'reserved');
  end if;
  if exists (select 1 from slg_players where name_set and name_key = k and user_id <> p_uid)
     or exists (select 1 from slg_shares where dummy and slg_name_key(name) = k) then   -- 지분표의 가상 보유자 이름도 비워 둔다
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;
  return jsonb_build_object('ok', true, 'name', n);
end $$;

create or replace function public.slg_event(p_uid uuid, p_kind text, p_payload jsonb, p_now bigint) returns void
language sql volatile set search_path = public as $$
  insert into slg_events (user_id, kind, payload, at_ms) values (p_uid, p_kind, coalesce(p_payload, '{}'::jsonb), p_now)
$$;

-- 소비(수요) 기록: 이번 틱 소비액에 더하고 오래된 틱은 지운다
create or replace function public.slg_track_spend(p_uid uuid, p_amount bigint, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare tick_ms bigint := (slg_cfg('tick_hours') * 3600000)::bigint; ti bigint := p_now / tick_ms; k text := (p_now / tick_ms)::text;
begin
  update slg_players set spend = coalesce((
      select jsonb_object_agg(key, value) from jsonb_each(spend) where key::bigint >= ti - 8 and key <> k), '{}'::jsonb)
    || jsonb_build_object(k, coalesce((spend ->> k)::numeric, 0) + p_amount)
  where user_id = p_uid;
end $$;

create or replace function public.slg_credit(p_uid uuid, p_amount bigint, p_kind text, p_ref text, p_now bigint, p_tx text default null)
returns bigint language plpgsql volatile set search_path = public as $$
declare bal bigint; d bigint;
begin
  if p_amount < 0 then raise exception 'negative_credit'; end if;
  update slg_players set gold = gold + p_amount where user_id = p_uid returning gold into bal;
  if bal is null then raise exception 'no_player'; end if;
  insert into slg_wallet_log (user_id, tx_id, kind, delta, ref, balance_after, at_ms)
  values (p_uid, coalesce(p_tx, 'srv:' || gen_random_uuid()::text), p_kind, p_amount, p_ref, bal, p_now);
  -- 빚이 있으면 수입(세금 · 지분 대금 · 전리품 · 보상 · 판매 · 회귀 지원금)의 일부를 먼저 갚는다
  if p_kind in ('tax', 'share_payout', 'earn_loot', 'earn_reward', 'earn_event', 'earn_sell', 'earn_stash') then
    d := least((select debt from slg_players where user_id = p_uid),
               floor(p_amount * slg_cfg('debt_garnish_pct') / 100.0)::bigint);
    if d > 0 then
      update slg_players set gold = gold - d, debt = debt - d where user_id = p_uid returning gold into bal;
      insert into slg_wallet_log (user_id, tx_id, kind, delta, ref, balance_after, at_ms)
      values (p_uid, 'srv:' || gen_random_uuid()::text, 'debt_garnish', -d, p_kind, bal, p_now);
    end if;
  end if;
  return bal;
end $$;

-- 잔액이 모자라면 false (아무것도 바뀌지 않는다). p_demand: 소비(수요) 지표에 센다.
create or replace function public.slg_debit(p_uid uuid, p_amount bigint, p_kind text, p_ref text, p_now bigint, p_tx text default null, p_demand boolean default false)
returns boolean language plpgsql volatile set search_path = public as $$
declare bal bigint;
begin
  if p_amount < 0 then raise exception 'negative_debit'; end if;
  update slg_players set gold = gold - p_amount where user_id = p_uid and gold >= p_amount returning gold into bal;
  if bal is null then return false; end if;
  insert into slg_wallet_log (user_id, tx_id, kind, delta, ref, balance_after, at_ms)
  values (p_uid, coalesce(p_tx, 'srv:' || gen_random_uuid()::text), p_kind, -p_amount, p_ref, bal, p_now);
  if p_demand then perform slg_track_spend(p_uid, p_amount, p_now); end if;
  return true;
end $$;

-- ============================================================================
-- 연준 위원회 · 안건
-- ============================================================================
-- 국가별 지분 1위(더미 · 이전 회차 보유자 제외, min_seat_bp 이상). 한 사람이 여러 국가 1위여도 한 명.
create or replace function public.slg_committee()
returns table (id uuid, name text, total_bp bigint, seats jsonb)
language sql stable set search_path = public as $$
  with top as (
    select distinct on (s.region_id) s.region_id, p.user_id, p.name, s.bp, s.holder
    from slg_shares s join slg_players p on p.user_id::text = s.holder and p.loop is not distinct from s.loop
    where not s.dummy and s.bp >= slg_cfg('min_seat_bp')
    order by s.region_id, s.bp desc, s.holder asc
  )
  select user_id, max(name), sum(bp)::bigint, jsonb_agg(jsonb_build_object('regionId', region_id, 'bp', bp) order by region_id)
  from top group by user_id order by sum(bp) desc, user_id asc
$$;

create or replace function public.slg_can_change_rate(p_dir int, p_now bigint) returns jsonb
language plpgsql stable set search_path = public as $$
declare e slg_econ%rowtype; tgt int; wait bigint;
begin
  select * into e from slg_econ where id = 1;
  tgt := e.rate_bp + p_dir * slg_cfg('rate_step_bp')::int;
  if tgt < slg_cfg('rate_min_bp') then
    return jsonb_build_object('ok', false, 'reason', '정책금리는 ' || (slg_cfg('rate_min_bp') / 100) || '% 아래로 내릴 수 없습니다.');
  end if;
  if tgt > slg_cfg('rate_max_bp') then
    return jsonb_build_object('ok', false, 'reason', '정책금리는 ' || (slg_cfg('rate_max_bp') / 100) || '%를 넘길 수 없습니다.');
  end if;
  wait := e.last_rate_change_at + (slg_cfg('rate_cooldown_hours') * 3600000)::bigint - p_now;
  if wait > 0 then
    return jsonb_build_object('ok', false, 'reason', '직전 금리 변경 후 냉각 기간입니다.', 'waitMs', wait);
  end if;
  return jsonb_build_object('ok', true, 'target', tgt);
end $$;

-- 안건 정리: 가결 → 금리 변경 / 부결 / 만료. (호출 전에 slg_econ_advance 로 물가를 현재 금리까지 밀어 둔다.)
create or replace function public.slg_fed_resolve(p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare
  m slg_motion%rowtype; total int; need int; yes int; no int; res text; chk jsonb; e slg_econ%rowtype; newrate int; hist jsonb;
begin
  select * into m from slg_motion;
  if not found then return; end if;
  select count(*) into total from slg_committee();
  select count(*) filter (where v.v = 'yes'), count(*) filter (where v.v = 'no') into yes, no
  from slg_motion_votes v where v.motion_id = m.id and v.voter in (select c.id from slg_committee() c);
  need := total / 2 + 1;
  if total > 0 and yes >= need then res := 'passed';
  elsif total = 0 or no > total - need then res := 'rejected';
  elsif p_now >= m.expires_ms then res := 'expired';
  else return;
  end if;
  select * into e from slg_econ where id = 1 for update;
  newrate := e.rate_bp;
  if res = 'passed' then
    chk := slg_can_change_rate(m.dir, p_now);
    if (chk->>'ok')::boolean then
      newrate := (chk->>'target')::int;
      hist := slg_hist_trim(e.history || jsonb_build_array(jsonb_build_object('at', p_now, 'price', e.price, 'rateBp', newrate)), slg_cfg('history_len')::int);
      update slg_econ set rate_bp = newrate, last_rate_change_at = p_now, history = hist where id = 1;
    else
      res := 'rejected';
    end if;
  end if;
  update slg_econ set rev = rev + 1,
    last_motion = jsonb_build_object('result', res, 'dir', m.dir, 'at', p_now, 'rateBp', newrate, 'yes', yes, 'no', no, 'total', total, 'proposerName', m.proposer_name)
  where id = 1;
  delete from slg_motion where id = m.id;
end $$;

-- 클라이언트용 연준 기록 (fedEngine.js 의 기록과 같은 모양)
create or replace function public.slg_fed_json() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', 'main', 'rev', e.rev, 'rateBp', e.rate_bp, 'price', e.price, 'lastTickAt', e.last_tick_at, 'tickCount', e.tick_count,
    'lastRateChangeAt', e.last_rate_change_at, 'history', e.history, 'macro', e.macro, 'lastMotion', e.last_motion,
    'motion', (select jsonb_build_object('id', m.id, 'dir', m.dir, 'proposerId', m.proposer, 'proposerName', m.proposer_name,
                 'createdAt', m.created_ms, 'expiresAt', m.expires_ms,
                 'votes', coalesce((select jsonb_object_agg(v.voter::text, jsonb_build_object('name', v.name, 'v', v.v)) from slg_motion_votes v where v.motion_id = m.id), '{}'::jsonb))
               from slg_motion m limit 1))
  from slg_econ e where e.id = 1
$$;

-- ============================================================================
-- 국가 지분 · 세금 (shareEngine.js 와 같은 식)
-- ============================================================================
-- total 을 weights 비율로 나눈 정수 배열 (합이 정확히 total, 최대 나머지 방식, 동률은 앞 번호 우선)
create or replace function public.slg_split_bp(p_total int, p_weights numeric[]) returns int[]
language plpgsql immutable set search_path = public as $$
declare n int := coalesce(array_length(p_weights, 1), 0); sumw numeric := 0; i int; res int[] := '{}'; raw numeric[] := '{}'; rest int; used int := 0; j int;
begin
  if n = 0 then return '{}'; end if;
  for i in 1..n loop sumw := sumw + p_weights[i]; end loop;
  if sumw = 0 or p_total <= 0 then
    for i in 1..n loop res := res || 0; end loop;
    return res;
  end if;
  for i in 1..n loop
    raw := raw || (p_total * p_weights[i] / sumw);
    res := res || floor(p_total * p_weights[i] / sumw)::int;
    used := used + res[i];
  end loop;
  rest := p_total - used;
  for j in select s.i from (select g as i, raw[g] - floor(raw[g]) as frac from generate_series(1, n) g) s order by s.frac desc, s.i asc loop
    exit when rest <= 0;
    res[j] := res[j] + 1;
    rest := rest - 1;
  end loop;
  return res;
end $$;

create or replace function public.slg_tax_per_settlement(p_region text, p_hours numeric) returns numeric
language sql stable set search_path = public as $$
  select (slg_cfg('tax_base') + r.threat * slg_cfg('tax_per_threat')) * r.tax_mult * p_hours from slg_regions r where r.region_id = p_region
$$;

-- 지분을 가진 (더미 · 이전 회차 제외) 플레이어 수에 따른 정산 주기 (시간)
create or replace function public.slg_interval_hours() returns int
language plpgsql stable set search_path = public as $$
declare n int;
begin
  select count(distinct s.holder) into n from slg_shares s
  join slg_players p on p.user_id::text = s.holder and p."loop" is not distinct from s."loop"
  where not s.dummy and s.bp > 0;
  return case when n >= 30 then 1 when n >= 10 then 4 else 8 end;
end $$;

-- 처음 만드는 국가에는 더미 플레이어를 섞어 넣는다 (같은 구역 → 같은 구성)
create or replace function public.slg_ensure_nations(p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare
  r record; cnt int; total int; weights numeric[]; bps int[]; i int; names text[]; avail text[]; idx int;
begin
  names := array['철혈백작','Lumi_K','금저울상단','Guest_4821','붉은매용병단','Arden','북부곡물왕','Guest_7302','흑요석','mira_lover',
                 '은행가베른','세이렌','Guest_1957','방랑기사단','Rokan_fan','소금장수','Valen','모래시계','Guest_6640','청동망치'];
  for r in select region_id from slg_regions where region_id not in (select region_id from slg_nations) order by region_id loop
    cnt := slg_cfg('dummy_count_min')::int + floor(slg_rand('nation|' || r.region_id || '|count') * (slg_cfg('dummy_count_max') - slg_cfg('dummy_count_min') + 1))::int;
    total := (slg_cfg('dummy_total_min_pct')::int + floor(slg_rand('nation|' || r.region_id || '|total') * (slg_cfg('dummy_total_max_pct') - slg_cfg('dummy_total_min_pct') + 1))::int) * 100;
    weights := '{}';
    for i in 1..cnt loop weights := weights || (1 + slg_rand('nation|' || r.region_id || '|w|' || i) * 3); end loop;
    bps := slg_split_bp(total, weights);
    avail := names;
    for i in 1..cnt loop
      idx := floor(slg_rand('nation|' || r.region_id || '|name|' || i) * array_length(avail, 1))::int + 1;
      if bps[i] > 0 then
        insert into slg_shares (region_id, holder, name, bp, dummy, loop) values (r.region_id, 'dummy_' || r.region_id || '_' || (i - 1), avail[idx], bps[i], true, null);
      end if;
      avail := avail[1:idx - 1] || avail[idx + 1:array_length(avail, 1)];
    end loop;
    insert into slg_nations (region_id, created_ms) values (r.region_id, p_now);
  end loop;
end $$;

-- 회귀로 낡은 (회차가 다른) 플레이어 지분 · 대금 정리
create or replace function public.slg_purge_stale() returns void
language plpgsql volatile set search_path = public as $$
begin
  delete from slg_shares s using slg_players p where p.user_id::text = s.holder and not s.dummy and s."loop" is distinct from p."loop";
  delete from slg_payouts o using slg_players p where p.user_id::text = o.holder and o."loop" is distinct from p."loop";
end $$;

create or replace function public.slg_unowned_bp(p_region text) returns int
language sql stable set search_path = public as $$
  select greatest(0, 10000 - coalesce((select sum(bp) from slg_shares where region_id = p_region), 0))::int
$$;

-- 1bp 가격 = (8시간 세수 / 10000) × 회수배수 × 물가
create or replace function public.slg_price_per_bp(p_region text, p_from_holder boolean, p_mult numeric) returns numeric
language sql stable set search_path = public as $$
  select slg_tax_per_settlement(p_region, 8) / 10000
         * (case when p_from_holder then slg_cfg('price_holder_paybacks') else slg_cfg('price_unowned_paybacks') end)
         * (case when p_mult > 0 then p_mult else 1 end)
$$;

-- 견적: 무주 지분부터, 모자라면 다른 보유자 지분을 보유 비율대로 (shareEngine.quotePurchase)
-- { bp, fromUnowned, fromHolders:{id:bp}, cost, payouts:{id:gold} }
create or replace function public.slg_share_quote(p_region text, p_buyer text, p_want int, p_mult numeric) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  want int := greatest(0, coalesce(p_want, 0));
  free int := slg_unowned_bp(p_region);
  from_unowned int := least(want, free);
  ids text[]; ws numeric[]; others_bp int := 0; from_others int; parts int[]; i int;
  from_holders jsonb := '{}'; payouts jsonb := '{}';
  unit_unowned numeric := slg_price_per_bp(p_region, false, p_mult);
  unit_holder numeric := slg_price_per_bp(p_region, true, p_mult);
  cost bigint; pay bigint;
begin
  select array_agg(holder order by holder), array_agg(bp::numeric order by holder), coalesce(sum(bp), 0)
    into ids, ws, others_bp
  from slg_shares where region_id = p_region and holder <> p_buyer and bp > 0;
  from_others := least(want - from_unowned, others_bp);
  cost := ceil(from_unowned * unit_unowned);
  if from_others > 0 then
    parts := slg_split_bp(from_others, ws);
    for i in 1..array_length(ids, 1) loop
      if parts[i] > 0 then
        from_holders := from_holders || jsonb_build_object(ids[i], parts[i]);
        pay := ceil(parts[i] * unit_holder);
        payouts := payouts || jsonb_build_object(ids[i], pay);
        cost := cost + pay;
      end if;
    end loop;
  end if;
  return jsonb_build_object('bp', from_unowned + from_others, 'fromUnowned', from_unowned, 'fromHolders', from_holders, 'cost', cost, 'payouts', payouts);
end $$;

-- 견적대로 지분을 옮긴다 (구매자 대금 지급은 호출하는 쪽이 이미 했다). 더미에게 가는 대금은 버린다.
create or replace function public.slg_share_apply(p_region text, p_quote jsonb, p_buyer uuid, p_buyer_name text, p_buyer_loop int) returns void
language plpgsql volatile set search_path = public as $$
declare r record; h record; pay bigint;
begin
  for r in select key as holder, value::int as bp from jsonb_each_text(p_quote->'fromHolders') loop
    select * into h from slg_shares where region_id = p_region and holder = r.holder;
    if not found then continue; end if;
    if h.bp - r.bp <= 0 then delete from slg_shares where region_id = p_region and holder = r.holder;
    else update slg_shares set bp = bp - r.bp where region_id = p_region and holder = r.holder; end if;
    pay := coalesce((p_quote->'payouts'->>r.holder)::bigint, 0);
    if not h.dummy and pay > 0 then
      insert into slg_payouts (region_id, holder, gold, "loop") values (p_region, r.holder, pay, h."loop")
      on conflict (region_id, holder) do update set gold = case when slg_payouts."loop" = excluded."loop" then slg_payouts.gold + excluded.gold else excluded.gold end, "loop" = excluded."loop";
    end if;
  end loop;
  insert into slg_shares (region_id, holder, name, bp, dummy, loop)
  values (p_region, p_buyer::text, p_buyer_name, (p_quote->>'bp')::int, false, p_buyer_loop)
  on conflict (region_id, holder) do update set bp = slg_shares.bp + excluded.bp, name = excluded.name;
end $$;

-- 매각 대금 수령 + 세금 정산 (플레이어 한 명). 접속할 때마다 호출된다.
create or replace function public.slg_settle_player(p_uid uuid, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare
  v_loop int; p slg_players%rowtype; o record; hours int; step bigint; from_ms bigint; cnt bigint; reg record; g numeric; total bigint := 0; k numeric;
  by_region jsonb := '{}'; holds boolean; settled_until bigint; v_price numeric;
begin
  select * into p from slg_players where user_id = p_uid;
  v_loop := p."loop";
  -- 다른 플레이어가 내 지분을 사 가며 쌓인 대금
  for o in select * from slg_payouts where holder = p_uid::text and "loop" = v_loop loop
    perform slg_credit(p_uid, o.gold, 'share_payout', o.region_id, p_now);
    delete from slg_payouts where region_id = o.region_id and holder = o.holder;
    perform slg_event(p_uid, 'share_payout', jsonb_build_object('regionId', o.region_id, 'gold', o.gold), p_now);
  end loop;
  -- 세금
  select exists (select 1 from slg_shares where holder = p_uid::text and "loop" is not distinct from p."loop" and bp > 0) into holds;
  if p.last_settled_ms is null or not holds then
    update slg_players set last_settled_ms = p_now where user_id = p_uid;
    return;
  end if;
  if not (p_now > p.last_settled_ms) then return; end if;
  hours := slg_interval_hours();
  step := hours * 3600000::bigint;
  from_ms := greatest(p.last_settled_ms, p_now - (slg_cfg('max_catchup_hours') * 3600000)::bigint);
  cnt := greatest(0, (p_now / step) - (from_ms / step));
  if cnt = 0 then return; end if;
  select e.price into v_price from slg_econ e where e.id = 1;
  for reg in select s.region_id, s.bp from slg_shares s where s.holder = p_uid::text and s."loop" is not distinct from v_loop and s.bp > 0 order by s.region_id loop
    g := floor((slg_tax_per_settlement(reg.region_id, hours) * reg.bp / 10000) * cnt);
    if g > 0 then
      k := round(g * v_price);
      if k > 0 then
        by_region := by_region || jsonb_build_object(reg.region_id, k);
        total := total + k::bigint;
      end if;
    end if;
  end loop;
  settled_until := (p_now / step) * step;
  update slg_players set last_settled_ms = settled_until where user_id = p_uid;
  if total > 0 then
    perform slg_credit(p_uid, total, 'tax', null, p_now);
    perform slg_event(p_uid, 'tax', jsonb_build_object('hours', hours, 'count', cnt, 'total', total, 'byRegion', by_region,
      'relics', slg_tax_relics(p_uid, v_loop, array(select jsonb_object_keys(by_region)), cnt, p_now)), p_now);
  end if;
end $$;

-- ============================================================================
-- 대출 (fedEngine.js 의 settleLoan 과 같은 규칙)
-- ============================================================================
-- 담보가치 = 몸값 공식 (game.js getCaptiveRansom): 기본가(물가 반영, 10G 단위) × (1 + (레벨−1)×0.2) × (1 + 승급×0.25)
-- 레벨·승급은 클라이언트가 말한 값이므로 상한(collateral_max_level / rank)으로 자른다.
create or replace function public.slg_collateral_value(p_unit jsonb, p_price numeric) returns bigint
language plpgsql stable set search_path = public as $$
declare lvl int; rk int; base numeric; cost numeric;
begin
  lvl := least(slg_cfg('collateral_max_level')::int, greatest(1, slg_int(p_unit ->> 'level', 1)));
  rk := least(slg_cfg('collateral_max_rank')::int, greatest(0, slg_int(p_unit -> 'promotions' ->> 'combatRank', 0)));
  base := greatest(1, round(slg_cfg('ransom_base') * p_price / 10) * 10);
  cost := base * (1 + (lvl - 1) * 0.2) * (1 + rk * 0.25);
  return greatest(10, (round(cost / 10) * 10)::bigint);
end $$;

create or replace function public.slg_loan_json(l slg_loans) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', l.id, 'principal', l.principal, 'rateBp', l.rate_bp, 'startedAt', l.started_ms, 'termHours', l.term_hours,
    'dueAt', l.due_ms, 'periodsDone', l.periods_done, 'interestPaid', l.interest_paid, 'arrears', l.arrears, 'missed', l.missed,
    'status', l.status, 'collateral', l.collateral, 'collateralValue', l.collateral_value)
$$;

create or replace function public.slg_start_price(p_value bigint, p_relists int) returns bigint
language sql stable set search_path = public as $$
  select greatest(slg_cfg('min_start_price')::bigint,
                  round(p_value * slg_cfg('open_pct') * power(1 - slg_cfg('relist_drop_pct') / 100, p_relists))::bigint)
$$;

-- 몰수한 담보를 경매에 올린다 (id 가 대출 id 에서 나오므로 두 번 올라가지 않는다)
create or replace function public.slg_auction_create(p_id text, p_unit jsonb, p_value bigint, p_reason text, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
begin
  insert into slg_auctions (id, unit, value, reason, start_price, created_ms, ends_ms)
  values (p_id, p_unit, p_value, p_reason, slg_start_price(p_value, 0), p_now, p_now + (slg_cfg('auction_hours') * 3600000)::bigint)
  on conflict (id) do nothing;
end $$;

-- 플레이어 한 명의 대출을 p_now 까지 정산한다: 8시간 이자 → 만기 상환 / 몰수
create or replace function public.slg_loans_settle(p_uid uuid, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare
  l slg_loans%rowtype;
  step_h int := slg_cfg('term_step_hours')::int; step_ms bigint := (slg_cfg('term_step_hours') * 3600000)::bigint;
  total int; periods int; paid bigint; arr bigint; miss int; st text; reason text; due bigint; owed bigint; v_name text;
begin
  for l in select * from slg_loans where user_id = p_uid and status = 'active' order by started_ms, id loop
    total := l.term_hours / step_h;
    periods := l.periods_done; paid := l.interest_paid; arr := l.arrears; miss := l.missed; st := 'active'; reason := null;
    v_name := coalesce(l.collateral ->> 'name', '담보');
    while periods < total and l.started_ms + (periods + 1) * step_ms <= p_now loop
      due := greatest(1, ceil(l.principal * l.rate_bp / 10000.0))::bigint + arr;
      periods := periods + 1;
      if slg_debit(p_uid, due, 'loan_interest', l.id, p_now) then
        paid := paid + due; arr := 0; miss := 0;
        perform slg_event(p_uid, 'loan_interest', jsonb_build_object('loanId', l.id, 'name', v_name, 'amount', due, 'done', periods, 'total', total), p_now);
      else
        arr := due; miss := miss + 1;
        perform slg_event(p_uid, 'loan_missed', jsonb_build_object('loanId', l.id, 'name', v_name, 'amount', due, 'missed', miss, 'limit', slg_cfg('miss_limit')), p_now);
        if miss >= slg_cfg('miss_limit') then st := 'defaulted'; reason := 'missed'; exit; end if;
      end if;
    end loop;
    if st = 'active' and periods >= total and p_now >= l.due_ms then
      owed := l.principal + arr;
      if slg_debit(p_uid, owed, 'loan_repay', l.id, p_now) then
        st := 'repaid';   -- 캐릭터는 대출 중에도 플레이어 곁에 있으므로 돌려줄 것이 없다
        perform slg_event(p_uid, 'loan_repaid', jsonb_build_object('loanId', l.id, 'name', v_name, 'amount', owed), p_now);
      else
        st := 'defaulted'; reason := 'maturity';
      end if;
    end if;
    update slg_loans set periods_done = periods, interest_paid = paid, arrears = arr, missed = miss, status = st,
      seize_state = case when st = 'defaulted' then 'pending' else seize_state end,
      claim = case when st = 'defaulted' then l.principal + arr else claim end,
      defaulted_ms = case when st = 'defaulted' then p_now else defaulted_ms end
    where id = l.id;
    if st = 'defaulted' then
      perform slg_auction_create('auc_' || l.id, l.collateral, l.collateral_value, 'default', p_now);
      -- 몰수 확정: 클라이언트가 이 우편을 받으면 담보 캐릭터를 자기 명단에서 뺀다
      insert into slg_inbox (user_id, kind, payload, at_ms)
        values (p_uid, 'seize', jsonb_build_object('unit', l.collateral, 'loanId', l.id), p_now);
      update slg_players set loan_ban_until_ms = greatest(loan_ban_until_ms, p_now + (slg_cfg('loan_default_ban_hours') * 3600000)::bigint) where user_id = p_uid;
      perform slg_event(p_uid, 'loan_default', jsonb_build_object('loanId', l.id, 'name', v_name, 'reason', reason), p_now);
    end if;
  end loop;
end $$;

-- 담보 회수 실패 → 채권 회수: 지갑에서 압류하고, 모자란 만큼은 빚(slg_players.debt)으로 남긴다
create or replace function public.slg_loan_garnish(p_uid uuid, p_loan_id text, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare l slg_loans%rowtype; bal bigint; taken bigint; rest bigint;
begin
  select * into l from slg_loans where id = p_loan_id and user_id = p_uid and status = 'defaulted' and seize_state in ('pending', 'claimed') for update;
  if not found then return; end if;
  select gold into bal from slg_players where user_id = p_uid;
  taken := least(coalesce(bal, 0), l.claim);
  if taken > 0 then perform slg_debit(p_uid, taken, 'loan_garnish', l.id, p_now); end if;
  rest := l.claim - taken;
  if rest > 0 then update slg_players set debt = debt + rest where user_id = p_uid; end if;
  update slg_loans set seize_state = 'lost' where id = l.id;
  perform slg_event(p_uid, 'loan_garnish', jsonb_build_object('loanId', l.id, 'name', coalesce(l.collateral ->> 'name', '담보'), 'taken', taken, 'debt', rest), p_now);
end $$;

-- 감사 기록 한 줄
create or replace function public.slg_audit_add(p_uid uuid, p_kind text, p_detail jsonb, p_now bigint) returns void
language sql volatile set search_path = public as $$
  insert into slg_audit (user_id, kind, detail, at_ms) values (p_uid, p_kind, coalesce(p_detail, '{}'::jsonb), p_now)
$$;

-- 서버에 저장된 세이브(slg_records gameState)에 이 캐릭터가 "살아서" 있는가. 세이브가 없거나 읽을 수 없으면 null.
-- 캐릭터 식별은 클라이언트 getCharacterId 와 같은 순서 (characterId → sourceCharacterId → catalogId → id)
create or replace function public.slg_saved_has_char(p_uid uuid, p_unit jsonb) returns boolean
language plpgsql stable set search_path = public as $$
declare d jsonb; cid text; u jsonb; found boolean := false;
begin
  select data into d from slg_records where collection_name = 'gameState' and record_id = p_uid::text;
  if d is null or jsonb_typeof(d -> 'run') <> 'object' then return null; end if;
  cid := coalesce(p_unit ->> 'characterId', p_unit ->> 'sourceCharacterId', p_unit ->> 'catalogId', p_unit ->> 'id');
  for u in select x from jsonb_array_elements(case when jsonb_typeof(d -> 'run' -> 'party') = 'array' then d -> 'run' -> 'party' else '[]'::jsonb end
                                         || case when jsonb_typeof(d -> 'run' -> 'reserve') = 'array' then d -> 'run' -> 'reserve' else '[]'::jsonb end) x
  loop
    if jsonb_typeof(u) = 'object'
       and coalesce(u ->> 'characterId', u ->> 'sourceCharacterId', u ->> 'catalogId', u ->> 'id') = cid
       and coalesce(u ->> 'isDead', 'false') <> 'true'
       and (jsonb_typeof(u -> 'hp') <> 'number' or (u ->> 'hp')::numeric > 0) then
      found := true; exit;
    end if;
  end loop;
  return found;
end $$;

-- 몰수 후속 처리:
--  · pending  : 우편을 받고도 제한시간 안에 확인이 없으면 회수 실패 → 압류 (+ 감사 기록)
--  · claimed  : "몰수했다"는 주장을 저장된 세이브와 대조 — 세이브에 그 캐릭터가 아직 살아 있으면 거짓 → 압류 (+ 감사 기록)
create or replace function public.slg_loans_garnish_overdue(p_uid uuid, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare l record; has boolean;
begin
  for l in select * from slg_loans where user_id = p_uid and status = 'defaulted' and seize_state = 'pending'
             and seize_seen_ms is not null and p_now >= seize_seen_ms + slg_cfg('seize_confirm_ms')::bigint loop
    perform slg_audit_add(p_uid, 'seize_no_confirm', jsonb_build_object('loanId', l.id, 'name', l.collateral ->> 'name', 'seenMs', l.seize_seen_ms), p_now);
    perform slg_loan_garnish(p_uid, l.id, p_now);
  end loop;
  for l in select * from slg_loans where user_id = p_uid and status = 'defaulted' and seize_state = 'claimed'
             and p_now >= seize_claim_ms + slg_cfg('seize_verify_ms')::bigint loop
    has := slg_saved_has_char(p_uid, l.collateral);
    if has is true then
      perform slg_audit_add(p_uid, 'seize_mismatch', jsonb_build_object('loanId', l.id, 'name', l.collateral ->> 'name',
        'claimMs', l.seize_claim_ms, 'note', '몰수했다고 알렸지만 저장된 세이브에 캐릭터가 살아 있다'), p_now);
      perform slg_loan_garnish(p_uid, l.id, p_now);
    else
      if has is null then
        perform slg_audit_add(p_uid, 'seize_unverified', jsonb_build_object('loanId', l.id, 'note', '저장된 세이브가 없어 검증하지 못했다'), p_now);
      end if;
      update slg_loans set seize_state = 'done' where id = l.id;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 경매 마감
-- ============================================================================
create or replace function public.slg_auctions_close(p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
declare a slg_auctions%rowtype; w_loop int; v_name text;
begin
  for a in select * from slg_auctions where status = 'open' and ends_ms <= p_now order by ends_ms, id loop
    if a.bidder is not null then
      select p."loop" into w_loop from slg_players p where p.user_id = a.bidder;
      v_name := coalesce(a.unit ->> 'name', '캐릭터');
      if w_loop is not distinct from a.bidder_loop then
        update slg_auctions set status = 'delivered', winner = a.bidder, winner_name = a.bidder_name, final_price = a.current_bid, closed_ms = p_now where id = a.id;
        insert into slg_inbox (user_id, kind, payload, at_ms)
          values (a.bidder, 'unit', jsonb_build_object('unit', a.unit, 'source', 'auction', 'auctionId', a.id, 'price', a.current_bid), p_now);
        perform slg_event(a.bidder, 'auction_won', jsonb_build_object('auctionId', a.id, 'name', v_name, 'price', a.current_bid), p_now);
      else
        -- 낙찰자가 그 사이 회귀했다: 낙찰금도 캐릭터도 사라진다
        update slg_auctions set status = 'void', winner = a.bidder, winner_name = a.bidder_name, final_price = a.current_bid, closed_ms = p_now where id = a.id;
      end if;
    else
      update slg_auctions set relists = relists + 1, start_price = slg_start_price(a.value, a.relists + 1),
        ends_ms = p_now + (slg_cfg('auction_hours') * 3600000)::bigint where id = a.id;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 한 번의 요청 처음에 하는 정리 (물가 틱 · 안건 · 경매 마감 · 내 세금 · 내 대출)
-- ============================================================================
create or replace function public.slg_tick(p_uid uuid, p_now bigint) returns void
language plpgsql volatile set search_path = public as $$
begin
  perform slg_econ_advance(p_now);
  perform slg_ensure_nations(p_now);
  perform slg_purge_stale();
  perform slg_fed_resolve(p_now);
  perform slg_loans_settle(p_uid, p_now);
  perform slg_loans_garnish_overdue(p_uid, p_now);
  perform slg_auctions_close(p_now);
  perform slg_settle_player(p_uid, p_now);
end $$;

-- ============================================================================
-- RPC — 클라이언트가 부르는 함수 (전부 security definer, 로그인 필요)
-- ============================================================================
create or replace function public.slg_player_for(p_uid uuid) returns slg_players
language plpgsql stable set search_path = public as $$
declare p slg_players%rowtype;
begin
  select * into p from slg_players where user_id = p_uid;
  if not found then raise exception 'no_player' using errcode = 'P0001'; end if;
  return p;
end $$;

-- 첫 접속: 플레이어를 만든다. 이미 있으면 접속 시각만 갱신한다 (이름은 slg_set_name 으로만 정한다 — 클라이언트가 말한 이름으로 덮어쓰지 않는다).
-- 새 플레이어의 시작 골드는 클라이언트가 말한 값을 migrate_cap 으로 자른다. 새 플레이어의 이름은 임시값(name_set = false)이다.
create or replace function public.slg_bootstrap(p_name text, p_claimed_gold bigint default 0, p_loop int default 0) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  select * into p from slg_players where user_id = uid;
  if not found then
    insert into slg_players (user_id, name, gold, "loop", run_started_ms, created_ms, last_seen_ms)
    values (uid, slg_clean_name(p_name),
            greatest(0, least(coalesce(p_claimed_gold, 0), slg_cfg('migrate_cap')::bigint)),
            greatest(0, least(coalesce(p_loop, 0), 100000)), now_ms, now_ms, now_ms);
    insert into slg_wallet_log (user_id, tx_id, kind, delta, ref, balance_after, at_ms)
      select uid, 'srv:bootstrap', 'bootstrap', gold, null, gold, now_ms from slg_players where user_id = uid;
    return jsonb_build_object('ok', true, 'created', true, 'nameSet', false);
  end if;
  update slg_players set last_seen_ms = now_ms where user_id = uid;
  return jsonb_build_object('ok', true, 'created', false, 'nameSet', p.name_set);
end $$;

-- 이름이 쓸 수 있는지만 본다 (저장하지 않는다). 이름 입력 창이 입력하는 동안 부른다.
create or replace function public.slg_name_available(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); c jsonb;
begin
  c := slg_name_check(p_name, uid);
  return c || jsonb_build_object('available', coalesce((c ->> 'ok')::boolean, false));
end $$;

-- 이름을 정한다.
--   p_change = false : 처음 정할 때만 가능하다. 이미 정했으면 already_set.
--   p_change = true  : 개명 유물을 쓸 때. 서버가 가진 개명 유물(slg_relics kind='rename')이 있어야 하고, 이름이 바뀌면 그 유물 하나를 쓴다.
--                      개명은 전부 감사 기록(slg_audit 'rename')에 남는다.
-- 이름이 바뀌면 지분표에 적힌 내 이름도 함께 바뀐다 (이미 끝난 표결 · 경매 기록은 그 시점의 이름으로 남는다).
create or replace function public.slg_set_name(p_name text, p_change boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); p slg_players%rowtype; c jsonb; n text; v_relic bigint;
begin
  perform slg_lock();
  p := slg_player_for(uid);
  if p.name_set and not coalesce(p_change, false) then
    return jsonb_build_object('ok', false, 'error', 'already_set', 'name', p.name);
  end if;
  if p.name_set then
    select r.id into v_relic from slg_relics r where r.user_id = uid and r.kind = 'rename' and r.used_ms is null order by r.id limit 1 for update;
    if v_relic is null then return jsonb_build_object('ok', false, 'error', 'no_relic'); end if;
  end if;
  c := slg_name_check(p_name, uid);
  if (c ->> 'ok')::boolean is not true then return c; end if;
  n := c ->> 'name';
  begin
    update slg_players set name = n, name_key = slg_name_key(n), name_set = true where user_id = uid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end;
  update slg_shares set name = n where holder = uid::text and not dummy;
  if p.name_set then
    update slg_relics set used_ms = slg_now_ms(), used_for = 'rename' where id = v_relic;
    perform slg_item_log_add(uid, p."loop", 'relic_use', 1, null, jsonb_build_object('for', 'rename'), slg_now_ms());
    perform slg_audit_add(uid, 'rename', jsonb_build_object('from', p.name, 'to', n), slg_now_ms());
  end if;
  return jsonb_build_object('ok', true, 'name', n, 'changed', p.name_set, 'items', slg_items_json(uid));
end $$;

-- ---------------------------------------------------------------- 지갑
-- p_txs: [{ id, kind, amount, ref }]  amount 는 항상 양수(크기). kind 가 방향을 정한다.
--   지출: spend(소비로 센다) · adjust · forfeit            — 잔액이 모자라면 거절
--   수입: earn_loot · earn_reward · earn_event · earn_sell · earn_stash · earn_rewind — 건당 상한 · 1회 청구 · 시간당 상한
-- 같은 id 를 다시 보내면 무시한다 (재전송 안전).
-- 전투 보상 골드(earn_reward)는 서버가 "수령"을 기록한 전투(ref = '회차:전투id')에서만, 서버가 정한 기준액 이내(유물 골드 보너스 최대 +100%)로 받는다.
create or replace function public.slg_reward_ok(p_uid uuid, p_loop int, p_ref text, p_amt bigint, p_price numeric, p_tol numeric) returns boolean
language plpgsql stable set search_path = public as $$
declare e slg_encounters%rowtype; v_loop int;
begin
  if p_ref is null or p_ref !~ '^(0|[1-9][0-9]{0,8}):.+$' then return false; end if;
  v_loop := split_part(p_ref, ':', 1)::int;
  if v_loop <> p_loop then return false; end if;
  select * into e from slg_encounters x where x.user_id = p_uid and x."loop" = v_loop and x.ref = substr(p_ref, length(split_part(p_ref, ':', 1)) + 2)
    and x.type <> 'event' and x.status in ('awaiting', 'claimed');
  if not found then return false; end if;
  return p_amt <= slg_scale_income(e.gold_reward, p_price) * 2 * p_tol;
end $$;

create or replace function public.slg_wallet_apply(p_txs jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; econ_price numeric; tol numeric := slg_cfg('price_tolerance');
  t jsonb; v_tx text; v_kind text; v_amt bigint; v_ref text; results jsonb := '[]'; ok boolean; reason text; cap numeric;
  earned bigint; spent bigint; refunded bigint; bal bigint;
begin
  if jsonb_typeof(p_txs) <> 'array' or jsonb_array_length(p_txs) > 200 then raise exception 'bad_request'; end if;
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  update slg_players set last_seen_ms = now_ms where user_id = uid;
  select e.price into econ_price from slg_econ e where e.id = 1;

  for t in select x.value from jsonb_array_elements(p_txs) as x loop
    v_tx := left(t ->> 'id', 64); v_kind := t ->> 'kind'; v_ref := left(t ->> 'ref', 64);
    v_amt := case when (t ->> 'amount') ~ '^[0-9]{1,12}$' then (t ->> 'amount')::bigint else -1 end;
    ok := false; reason := null;
    if v_tx is null or v_kind is null or v_amt < 0 then
      reason := 'bad_tx';
    elsif exists (select 1 from slg_wallet_log w where w.user_id = uid and w.tx_id = v_tx) then
      results := results || jsonb_build_object('id', v_tx, 'ok', true, 'dup', true);
      continue;
    elsif v_amt = 0 then
      ok := true;
    elsif v_kind in ('spend', 'adjust', 'forfeit') then
      ok := slg_debit(uid, v_amt, v_kind, v_ref, now_ms, v_tx, v_kind = 'spend');
      if not ok then reason := 'insufficient'; end if;
    elsif v_kind in ('earn_loot', 'earn_reward', 'earn_event', 'earn_sell') then
      cap := case v_kind when 'earn_loot' then slg_cfg('loot_max_base') when 'earn_reward' then slg_cfg('reward_max_base')
                         when 'earn_event' then slg_cfg('event_max_base') else slg_cfg('sell_max_base') end;
      if v_kind in ('earn_reward', 'earn_event') and v_ref is null then
        reason := 'ref_required';
      elsif v_amt > slg_scale_income(cap, econ_price) * tol then
        reason := 'over_cap';
      elsif v_kind = 'earn_reward' and not slg_reward_ok(uid, p."loop", v_ref, v_amt, econ_price, tol) then
        reason := 'no_encounter';
      else
        select coalesce(sum(w.delta), 0) into earned from slg_wallet_log w
          where w.user_id = uid and w.kind in ('earn_loot', 'earn_reward', 'earn_event', 'earn_sell') and w.at_ms > now_ms - 3600000;
        if earned + v_amt > slg_scale_income(slg_cfg('earn_cap_per_hour_base'), econ_price) * tol then
          reason := 'rate_limited';
        elsif v_kind in ('earn_reward', 'earn_event')
              and exists (select 1 from slg_wallet_log w where w.user_id = uid and w.kind = v_kind and w.ref = v_ref) then
          reason := 'already_claimed';
        else
          perform slg_credit(uid, v_amt, v_kind, v_ref, now_ms, v_tx);
          ok := true;
        end if;
      end if;
    elsif v_kind = 'earn_stash' then
      -- 회귀 보상 "비상금": 회차마다 한 번, 정해진 금액만
      if v_ref is distinct from ('loop:' || p."loop") then reason := 'bad_ref';
      elsif v_amt > slg_cfg('stash_gold') then reason := 'over_cap';
      elsif exists (select 1 from slg_wallet_log w where w.user_id = uid and w.kind = 'earn_stash' and w.ref = v_ref) then reason := 'already_claimed';
      else perform slg_credit(uid, v_amt, v_kind, v_ref, now_ms, v_tx); ok := true; end if;
    elsif v_kind = 'earn_rewind' then
      -- 턴 되돌리기로 돌려받는 골드: 최근에 실제로 쓴 만큼까지만
      select coalesce(-sum(w.delta), 0) into spent from slg_wallet_log w
        where w.user_id = uid and w.kind in ('spend', 'adjust') and w.at_ms > now_ms - slg_cfg('rewind_window_ms');
      select coalesce(sum(w.delta), 0) into refunded from slg_wallet_log w
        where w.user_id = uid and w.kind = 'earn_rewind' and w.at_ms > now_ms - slg_cfg('rewind_window_ms');
      if v_amt > spent - refunded then reason := 'over_cap';
      else perform slg_credit(uid, v_amt, v_kind, v_ref, now_ms, v_tx); ok := true; end if;
    else
      reason := 'unknown_kind';
    end if;
    results := results || case when ok then jsonb_build_object('id', v_tx, 'ok', true)
                               else jsonb_build_object('id', v_tx, 'ok', false, 'reason', reason) end;
  end loop;
  select gold into bal from slg_players where user_id = uid;
  return jsonb_build_object('ok', true, 'balance', bal, 'results', results);
end $$;

-- 관리자인가: slg_admins 에 user_id 가 있거나, 인증된 이메일이 slg_admin_emails 에 있다
create or replace function public.slg_admin_uid(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from slg_admins where user_id = p_uid)
      or exists (select 1 from auth.users u join slg_admin_emails e on lower(e.email) = lower(u.email)
                 where u.id = p_uid and u.email_confirmed_at is not null)
$$;

-- 관리자 전용 골드 조정
create or replace function public.slg_admin_adjust(p_delta bigint) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; bal bigint;
begin
  if not slg_admin_uid(uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform slg_lock();
  now_ms := slg_now_ms();
  perform slg_player_for(uid);
  if p_delta >= 0 then bal := slg_credit(uid, p_delta, 'admin', null, now_ms);
  else
    if not slg_debit(uid, -p_delta, 'admin', null, now_ms) then return jsonb_build_object('ok', false, 'error', 'insufficient'); end if;
    select gold into bal from slg_players where user_id = uid;
  end if;
  return jsonb_build_object('ok', true, 'balance', bal);
end $$;

create or replace function public.slg_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select slg_admin_uid(auth.uid())
$$;

-- ---------------------------------------------------------------- 회귀
create or replace function public.slg_loop_return(p_new_loop int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; start_gold bigint := slg_cfg('start_gold')::bigint; newloop int;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  if p_new_loop <= p."loop" then
    return jsonb_build_object('ok', true, 'noop', true, 'loop', p."loop", 'balance', p.gold);   -- 이미 처리됨 (재전송 안전)
  end if;
  if now_ms - p.last_loop_ms < slg_cfg('min_loop_interval_ms') then
    return jsonb_build_object('ok', false, 'error', '너무 빨리 회귀했습니다.');
  end if;
  newloop := p."loop" + 1;
  update slg_loans set status = 'void' where user_id = uid and status = 'active';
  delete from slg_shares where holder = uid::text;
  delete from slg_payouts where holder = uid::text;
  delete from slg_share_rights where user_id = uid;
  delete from slg_secured where user_id = uid;
  update slg_relics set used_ms = now_ms, used_for = 'regression' where user_id = uid and used_ms is null;
  update slg_players set gold = start_gold, "loop" = newloop, run_started_ms = now_ms, last_loop_ms = now_ms,
    last_settled_ms = null, last_secure_ms = 0 where user_id = uid;
  insert into slg_wallet_log (user_id, tx_id, kind, delta, ref, balance_after, at_ms)
    values (uid, 'srv:loop:' || newloop, 'loop_reset', start_gold - p.gold, 'loop:' || newloop, start_gold, now_ms);
  return jsonb_build_object('ok', true, 'loop', newloop, 'balance', start_gold);
end $$;

-- ---------------------------------------------------------------- 구역 점령 · 지분 구매
create or replace function public.slg_region_secure(p_region text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; r slg_regions%rowtype; avail bigint;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  select * into r from slg_regions where region_id = p_region;
  if not found then return jsonb_build_object('ok', false, 'error', '알 수 없는 구역입니다.'); end if;
  if exists (select 1 from slg_secured where user_id = uid and region_id = p_region and "loop" = p."loop") then
    return jsonb_build_object('ok', true, 'dup', true);
  end if;
  if not r.is_start and not exists (
      select 1 from slg_secured s join slg_regions sr on sr.region_id = s.region_id
      where s.user_id = uid and s."loop" = p."loop" and p_region = any (sr.neighbors)) then
    return jsonb_build_object('ok', false, 'error', '인접한 점령 구역이 없습니다.');
  end if;
  -- 점령 청구 간격 제한: 너무 빨리 몰아서 청구해도 구매권은 이 간격으로 줄 서서 열린다
  avail := greatest(now_ms, p.last_secure_ms + (case when p.last_secure_ms = 0 then 0 else slg_cfg('secure_min_interval_ms') end)::bigint);
  update slg_players set last_secure_ms = avail where user_id = uid;
  insert into slg_secured (user_id, region_id, "loop", at_ms) values (uid, p_region, p."loop", now_ms);
  insert into slg_share_rights (user_id, region_id, "loop", max_bp, bought_bp, available_ms)
    values (uid, p_region, p."loop", slg_cfg('purchase_right_bp')::int, 0, avail)
  on conflict (user_id, region_id) do update set "loop" = excluded."loop", max_bp = excluded.max_bp, bought_bp = 0, available_ms = excluded.available_ms;
  return jsonb_build_object('ok', true, 'availableMs', avail);
end $$;

create or replace function public.slg_share_buy(p_region text, p_want int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; rt slg_share_rights%rowtype; want int; q jsonb; mult numeric; bal bigint; v_from_others int;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  select * into rt from slg_share_rights where user_id = uid and region_id = p_region and "loop" = p."loop";
  if not found then return jsonb_build_object('ok', false, 'error', '이 국가의 지분 구매권이 없습니다. 점령하면 생깁니다.'); end if;
  if rt.available_ms > now_ms then return jsonb_build_object('ok', false, 'error', '구매권이 아직 열리지 않았습니다.', 'availableMs', rt.available_ms); end if;
  want := least(greatest(0, coalesce(p_want, 0)), rt.max_bp - rt.bought_bp);
  if want <= 0 then return jsonb_build_object('ok', false, 'error', '살 수 있는 지분이 없습니다.'); end if;
  select e.price into mult from slg_econ e where e.id = 1;
  q := slg_share_quote(p_region, uid::text, want, mult);
  if (q ->> 'bp')::int <= 0 then return jsonb_build_object('ok', false, 'error', '살 수 있는 지분이 없습니다.'); end if;
  if not slg_debit(uid, (q ->> 'cost')::bigint, 'share_buy', p_region, now_ms) then
    return jsonb_build_object('ok', false, 'error', '골드가 부족합니다 (필요 ' || (q ->> 'cost') || 'G)', 'cost', (q ->> 'cost')::bigint);
  end if;
  perform slg_share_apply(p_region, q, uid, p.name, p."loop");
  update slg_share_rights set bought_bp = bought_bp + (q ->> 'bp')::int where user_id = uid and region_id = p_region;
  update slg_players set last_settled_ms = coalesce(last_settled_ms, now_ms) where user_id = uid;
  select gold into bal from slg_players where user_id = uid;
  select coalesce(sum(value::int), 0) into v_from_others from jsonb_each_text(q -> 'fromHolders');
  return jsonb_build_object('ok', true, 'bp', (q ->> 'bp')::int, 'cost', (q ->> 'cost')::bigint, 'fromOthers', v_from_others, 'balance', bal);
end $$;

-- ---------------------------------------------------------------- 연준 표결
create or replace function public.slg_fed_propose(p_dir int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; chk jsonb; d int := case when p_dir > 0 then 1 else -1 end; mid text;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  if not exists (select 1 from slg_committee() c where c.id = uid) then return jsonb_build_object('ok', false, 'error', '연준 위원만 안건을 낼 수 있습니다.'); end if;
  if exists (select 1 from slg_motion) then return jsonb_build_object('ok', false, 'error', '이미 표결 중인 안건이 있습니다.'); end if;
  chk := slg_can_change_rate(d, now_ms);
  if not (chk ->> 'ok')::boolean then return jsonb_build_object('ok', false, 'error', chk ->> 'reason', 'waitMs', chk -> 'waitMs'); end if;
  mid := 'm' || (select tick_count from slg_econ where id = 1) || '_' || (now_ms / 1000);
  insert into slg_motion (id, dir, proposer, proposer_name, created_ms, expires_ms)
    values (mid, d, uid, p.name, now_ms, now_ms + (slg_cfg('motion_ttl_hours') * 3600000)::bigint);
  insert into slg_motion_votes (motion_id, voter, name, v) values (mid, uid, p.name, 'yes');
  perform slg_fed_resolve(now_ms);     -- 위원이 한 명뿐이면 바로 가결
  return jsonb_build_object('ok', true, 'fed', slg_fed_json());
end $$;

create or replace function public.slg_fed_vote(p_choice text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; m slg_motion%rowtype;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  if not exists (select 1 from slg_committee() c where c.id = uid) then return jsonb_build_object('ok', false, 'error', '연준 위원만 표결할 수 있습니다.'); end if;
  select * into m from slg_motion;
  if not found then return jsonb_build_object('ok', false, 'error', '표결 중인 안건이 없습니다.'); end if;
  if now_ms >= m.expires_ms then return jsonb_build_object('ok', false, 'error', '이미 만료된 안건입니다.'); end if;
  insert into slg_motion_votes (motion_id, voter, name, v) values (m.id, uid, p.name, case when p_choice = 'no' then 'no' else 'yes' end)
  on conflict (motion_id, voter) do update set v = excluded.v, name = excluded.name;
  perform slg_fed_resolve(now_ms);
  return jsonb_build_object('ok', true, 'fed', slg_fed_json());
end $$;

-- ---------------------------------------------------------------- 대출 RPC
-- p_id 는 클라이언트가 만든 대출 id (같은 id 로 다시 보내면 이미 만든 대출을 돌려준다 — 재전송 안전)
create or replace function public.slg_loan_take(p_id text, p_unit jsonb, p_principal bigint, p_term_hours int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; e slg_econ%rowtype; l slg_loans%rowtype; value bigint; maxp bigint; term int; outstanding bigint; active int; bal bigint;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{6,64}$' then return jsonb_build_object('ok', false, 'error', '잘못된 요청입니다.'); end if;
  select * into l from slg_loans where id = p_id;
  if found then
    if l.user_id <> uid then return jsonb_build_object('ok', false, 'error', '잘못된 요청입니다.'); end if;
    select gold into bal from slg_players where user_id = uid;
    return jsonb_build_object('ok', true, 'dup', true, 'loan', slg_loan_json(l), 'balance', bal);
  end if;
  if p_unit is null or jsonb_typeof(p_unit) <> 'object' or jsonb_typeof(p_unit -> 'name') <> 'string' or length(p_unit::text) > 32768 then
    return jsonb_build_object('ok', false, 'error', '담보로 맡길 수 없는 캐릭터입니다.');
  end if;
  if p.debt > 0 then
    return jsonb_build_object('ok', false, 'error', '갚지 못한 빚 ' || p.debt || 'G 가 남아 있어 새 대출을 받을 수 없습니다.', 'debt', p.debt);
  end if;
  if now_ms < p.loan_ban_until_ms then
    return jsonb_build_object('ok', false, 'error', '담보를 몰수당한 직후라 한동안 대출을 받을 수 없습니다.', 'untilMs', p.loan_ban_until_ms);
  end if;
  select count(*), coalesce(sum(principal), 0) into active, outstanding from slg_loans where user_id = uid and status = 'active';
  if active >= slg_cfg('max_active_loans') then
    return jsonb_build_object('ok', false, 'error', '동시에 ' || slg_cfg('max_active_loans')::int || '건까지만 받을 수 있습니다.');
  end if;
  select * into e from slg_econ where id = 1;
  value := slg_collateral_value(p_unit, e.price);
  maxp := floor(value * slg_cfg('ltv'));
  if p_principal is null or p_principal < slg_cfg('min_loan') or p_principal > maxp then
    return jsonb_build_object('ok', false, 'error', '대출액은 ' || slg_cfg('min_loan')::int || 'G ~ ' || maxp || 'G 사이여야 합니다.');
  end if;
  if outstanding + p_principal > slg_scale(slg_cfg('loan_total_cap_base'), e.price) then
    return jsonb_build_object('ok', false, 'error', '대출 잔액 한도를 넘습니다.');
  end if;
  term := least(slg_cfg('max_term_hours')::int, greatest(slg_cfg('min_term_hours')::int,
            (round(coalesce(p_term_hours, slg_cfg('min_term_hours')::int)::numeric / slg_cfg('term_step_hours')) * slg_cfg('term_step_hours'))::int));
  insert into slg_loans (id, user_id, "loop", principal, rate_bp, started_ms, term_hours, due_ms, collateral, collateral_value)
    values (p_id, uid, p."loop", p_principal, e.rate_bp + slg_cfg('spread_bp')::int, now_ms, term, now_ms + term * 3600000::bigint, p_unit, value)
    returning * into l;
  bal := slg_credit(uid, p_principal, 'loan_in', p_id, now_ms);
  return jsonb_build_object('ok', true, 'loan', slg_loan_json(l), 'balance', bal);
end $$;

create or replace function public.slg_loan_repay(p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; l slg_loans%rowtype; owed bigint; bal bigint;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  perform slg_player_for(uid);
  perform slg_tick(uid, now_ms);    -- 지금까지의 이자를 먼저 낸다
  select * into l from slg_loans where id = p_id and user_id = uid and status = 'active';
  if not found then return jsonb_build_object('ok', false, 'error', '상환할 수 있는 대출이 아닙니다.'); end if;
  owed := l.principal + l.arrears;
  if not slg_debit(uid, owed, 'loan_repay', l.id, now_ms) then
    return jsonb_build_object('ok', false, 'error', '골드가 부족합니다 (필요 ' || owed || 'G)', 'owed', owed);
  end if;
  update slg_loans set status = 'repaid', arrears = 0 where id = l.id;
  select gold into bal from slg_players where user_id = uid;
  return jsonb_build_object('ok', true, 'owed', owed, 'balance', bal);
end $$;

-- 담보 캐릭터의 최신 모습을 기록한다 (몰수되면 이 모습으로 경매에 올라간다).
-- p_substitute = true 면 담보 캐릭터가 죽어서 다른 캐릭터로 교체하는 것 (담보가치 · 대출액은 그대로).
-- false 면 같은 캐릭터여야 한다.
create or replace function public.slg_loan_collateral(p_id text, p_unit jsonb, p_substitute boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; l slg_loans%rowtype; old_id text; new_id text;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  perform slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  select * into l from slg_loans where id = p_id and user_id = uid and status = 'active';
  if not found then return jsonb_build_object('ok', false, 'error', '진행 중인 대출이 아닙니다.'); end if;
  if p_unit is null or jsonb_typeof(p_unit) <> 'object' or jsonb_typeof(p_unit -> 'name') <> 'string' or length(p_unit::text) > 32768 then
    return jsonb_build_object('ok', false, 'error', '담보로 쓸 수 없는 캐릭터입니다.');
  end if;
  old_id := coalesce(l.collateral ->> 'characterId', l.collateral ->> 'sourceCharacterId', l.collateral ->> 'catalogId', l.collateral ->> 'id');
  new_id := coalesce(p_unit ->> 'characterId', p_unit ->> 'sourceCharacterId', p_unit ->> 'catalogId', p_unit ->> 'id');
  if not coalesce(p_substitute, false) and old_id is distinct from new_id then
    return jsonb_build_object('ok', false, 'error', '다른 캐릭터로 바꿀 수 없습니다.');
  end if;
  if exists (select 1 from slg_loans o where o.user_id = uid and o.status = 'active' and o.id <> l.id
             and coalesce(o.collateral ->> 'characterId', o.collateral ->> 'sourceCharacterId', o.collateral ->> 'catalogId', o.collateral ->> 'id') = new_id) then
    return jsonb_build_object('ok', false, 'error', '이미 다른 대출의 담보입니다.');
  end if;
  if coalesce(p_substitute, false) then
    -- "죽었다"는 주장은 검증하지 못하므로 기록해 둔다 (옛 담보가 저장된 세이브에 살아 있으면 의심 — 관리자 RPC slg_audit_list 로 본다)
    perform slg_audit_add(uid, 'collateral_substitute', jsonb_build_object('loanId', l.id, 'from', l.collateral ->> 'name', 'to', p_unit ->> 'name',
      'oldAliveInSave', slg_saved_has_char(uid, l.collateral)), now_ms);
  end if;
  update slg_loans set collateral = p_unit where id = l.id;
  return jsonb_build_object('ok', true);
end $$;

-- 관리자 전용: 감사 기록 (최근 순) + 계정별 의심 횟수
create or replace function public.slg_audit_list(p_limit int default 100) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); rows jsonb; sus jsonb;
begin
  if not slg_admin_uid(uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'userId', a.user_id, 'name', p.name, 'kind', a.kind, 'detail', a.detail, 'atMs', a.at_ms) order by a.id desc), '[]'::jsonb)
    into rows from (select * from slg_audit order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) a left join slg_players p on p.user_id = a.user_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId', s.user_id, 'name', s.name, 'mismatch', s.m, 'noConfirm', s.n, 'subsAliveInSave', s.x) order by s.m + s.n + s.x desc), '[]'::jsonb)
    into sus from (
      select a.user_id, max(p.name) as name,
             count(*) filter (where a.kind = 'seize_mismatch') as m,
             count(*) filter (where a.kind = 'seize_no_confirm') as n,
             count(*) filter (where a.kind = 'collateral_substitute' and a.detail ->> 'oldAliveInSave' = 'true') as x
      from slg_audit a left join slg_players p on p.user_id = a.user_id group by a.user_id
      having count(*) filter (where a.kind in ('seize_mismatch', 'seize_no_confirm')) > 0
          or count(*) filter (where a.kind = 'collateral_substitute' and a.detail ->> 'oldAliveInSave' = 'true') > 0) s;
  return jsonb_build_object('ok', true, 'suspects', sus, 'rows', rows);
end $$;

-- 몰수 확인: 클라이언트가 담보 캐릭터를 실제로 명단에서 뺐으면 p_removed = true (담보로 충분 → 끝),
-- 이미 죽었거나 없어서 뺄 게 없었으면 false (회수 실패 → 지갑 압류 + 빚).
-- 주의: 서버는 로스터를 볼 수 없으므로 거짓 true 는 막지 못한다. 막는 것은 "확인 자체를 피하는" 쪽뿐이다.
create or replace function public.slg_loan_seized(p_id text, p_removed boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; l slg_loans%rowtype;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  perform slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  select * into l from slg_loans where id = p_id and user_id = uid and status = 'defaulted';
  if not found then return jsonb_build_object('ok', false, 'error', '몰수된 대출이 아닙니다.'); end if;
  if l.seize_state = 'pending' then
    if coalesce(p_removed, false) then
      -- 바로 믿지 않는다: 저장된 세이브가 따라올 시간을 주고(seize_verify_ms) 그때 세이브와 대조한다
      update slg_loans set seize_state = 'claimed', seize_claim_ms = now_ms where id = l.id;
      perform slg_audit_add(uid, 'seize_claim', jsonb_build_object('loanId', l.id, 'name', l.collateral ->> 'name',
        'savedHasCharNow', slg_saved_has_char(uid, l.collateral)), now_ms);
    else perform slg_loan_garnish(uid, l.id, now_ms); end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- 경매 입찰
create or replace function public.slg_auction_bid(p_id text, p_amount bigint) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; a slg_auctions%rowtype; minbid bigint; prev_loop int; bal bigint; amt bigint := floor(coalesce(p_amount, 0));
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  select * into a from slg_auctions where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', '경매를 찾을 수 없습니다.'); end if;
  if a.status <> 'open' or now_ms >= a.ends_ms then return jsonb_build_object('ok', false, 'error', '이미 끝난 경매입니다.'); end if;
  if a.bidder = uid then return jsonb_build_object('ok', false, 'error', '이미 최고 입찰자입니다.'); end if;
  minbid := case when a.current_bid > 0
                 then a.current_bid + greatest(slg_cfg('min_inc_flat')::bigint, ceil(a.current_bid * slg_cfg('min_inc_pct') / 100)::bigint)
                 else a.start_price end;
  if amt < minbid then return jsonb_build_object('ok', false, 'error', '최소 ' || minbid || 'G부터 입찰할 수 있습니다.', 'minBid', minbid); end if;
  if not slg_debit(uid, amt, 'auction_bid', p_id, now_ms) then
    return jsonb_build_object('ok', false, 'error', '골드가 부족합니다 (필요 ' || amt || 'G)');
  end if;
  if a.bidder is not null then
    select pp."loop" into prev_loop from slg_players pp where pp.user_id = a.bidder;
    if prev_loop is not distinct from a.bidder_loop then
      perform slg_credit(a.bidder, a.current_bid, 'auction_refund', p_id, now_ms);
      perform slg_event(a.bidder, 'auction_outbid', jsonb_build_object('auctionId', p_id, 'name', coalesce(a.unit ->> 'name', '캐릭터'), 'refund', a.current_bid), now_ms);
    end if;
  end if;
  update slg_auctions set current_bid = amt, bidder = uid, bidder_name = p.name, bidder_loop = p."loop", bids = bids + 1,
    ends_ms = case when ends_ms - now_ms < slg_cfg('anti_snipe_ms') then now_ms + slg_cfg('anti_snipe_ms')::bigint else ends_ms end
  where id = p_id;
  select gold into bal from slg_players where user_id = uid;
  return jsonb_build_object('ok', true, 'bid', amt, 'balance', bal);
end $$;

-- ============================================================================
-- 동기화: 정리를 한 번 하고, 화면에 필요한 모든 것을 한 번에 돌려준다
-- ============================================================================
create or replace function public.slg_sync(p_name text default null, p_ack_events bigint default 0, p_ack_inbox bigint[] default '{}') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; nations jsonb; rights jsonb; loans jsonb; auctions jsonb; inbox jsonb; events jsonb; members jsonb;
  recent bigint;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  -- p_name 은 예전 클라이언트와의 호환용으로만 받는다 — 이름은 서버가 정한다 (slg_set_name).
  update slg_players set last_seen_ms = now_ms where user_id = uid;
  perform slg_tick(uid, now_ms);
  if coalesce(p_ack_events, 0) > 0 then delete from slg_events where user_id = uid and id <= p_ack_events; end if;
  if p_ack_inbox is not null and array_length(p_ack_inbox, 1) > 0 then delete from slg_inbox where user_id = uid and id = any (p_ack_inbox); end if;
  -- 몰수 우편이 처음 전달된 시각을 적는다 (이 시각부터 확인 제한시간이 흐른다 — 오프라인 중에는 흐르지 않는다)
  update slg_loans set seize_seen_ms = now_ms
    where user_id = uid and status = 'defaulted' and seize_state = 'pending' and seize_seen_ms is null
      and id in (select i.payload ->> 'loanId' from slg_inbox i where i.user_id = uid and i.kind = 'seize');
  select * into p from slg_players where user_id = uid;
  recent := now_ms - (slg_cfg('auction_recent_hours') * 3600000)::bigint;

  select coalesce(jsonb_object_agg(region_id, jsonb_build_object(
      'id', region_id, 'regionId', region_id, 'rev', 0, 'payouts', '{}'::jsonb,
      'holders', holders, 'unowned', slg_unowned_bp(region_id))), '{}'::jsonb) into nations
  from (
    select s.region_id, jsonb_object_agg(s.holder, jsonb_build_object('name', coalesce(pp.name, s.name), 'bp', s.bp, 'dummy', s.dummy, 'loop', s."loop")) as holders
    from slg_shares s left join slg_players pp on pp.user_id::text = s.holder and not s.dummy
    group by s.region_id
  ) n;
  select coalesce(jsonb_object_agg(region_id, jsonb_build_object('maxBp', max_bp, 'boughtBp', bought_bp, 'availableMs', available_ms)), '{}'::jsonb) into rights
    from slg_share_rights where user_id = uid and "loop" = p."loop";
  select coalesce(jsonb_agg(slg_loan_json(l) order by l.started_ms), '[]'::jsonb) into loans from slg_loans l where l.user_id = uid and l.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'unit', a.unit, 'value', a.value, 'status', a.status, 'reason', a.reason, 'sellerName', a.seller_name,
      'relists', a.relists, 'startPrice', a.start_price, 'currentBid', a.current_bid, 'bidderId', a.bidder, 'bidderName', a.bidder_name,
      'bidderLoop', a.bidder_loop, 'bids', a.bids, 'createdAt', a.created_ms, 'endsAt', a.ends_ms, 'winnerId', a.winner,
      'winnerName', a.winner_name, 'finalPrice', a.final_price, 'closedAt', a.closed_ms) order by a.ends_ms), '[]'::jsonb) into auctions
    from slg_auctions a where a.status = 'open' or coalesce(a.closed_ms, 0) >= recent;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'payload', i.payload, 'atMs', i.at_ms) order by i.id), '[]'::jsonb) into inbox
    from (select * from slg_inbox where user_id = uid order by id limit 20) i;
  select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'kind', ev.kind, 'payload', ev.payload, 'atMs', ev.at_ms) order by ev.id), '[]'::jsonb) into events
    from (select * from slg_events where user_id = uid order by id limit 50) ev;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'seats', c.seats, 'totalBp', c.total_bp) order by c.total_bp desc, c.id), '[]'::jsonb) into members from slg_committee() c;

  return jsonb_build_object(
    'ok', true, 'now', now_ms,
    'player', jsonb_build_object('id', uid, 'gold', p.gold, 'loop', p."loop", 'name', p.name, 'nameSet', p.name_set, 'createdAt', p.created_ms, 'admin', slg_admin_uid(uid), 'debt', p.debt),
    'fed', slg_fed_json(), 'members', members, 'nations', nations, 'shareHours', slg_interval_hours(), 'rights', rights,
    'loans', loans, 'auctions', auctions, 'inbox', inbox, 'events', events,
    'items', slg_items_json(uid), 'loanBanUntil', p.loan_ban_until_ms, 'config', jsonb_build_object('startGold', slg_cfg('start_gold'), 'stashGold', slg_cfg('stash_gold')));
end $$;

-- ============================================================================
-- 아이템 (리와인더 · 유물) — 서버가 원본이다
--   * 리와인더 · 유물은 클라이언트가 만들 수 없다. 얻는 길은 전부 아래 함수뿐이고, 서버가 난수를 굴린다.
--   * 전투 승리 자체는 서버가 볼 수 없다 (전투는 브라우저에서 돈다). 대신 보상을 시간 · 횟수 · 노드로 묶는다:
--       - 전투 시작(slg_encounter_start)을 서버가 기록하고, 최소 전투 시간(enc_min_ms)이 지나야 수령(slg_encounter_claim)된다
--       - 한 노드는 회차당 한 번, 보스는 구역마다 회차당 한 번, 시간당 · 회차당 수령 횟수 상한
--       - 리와인더는 보유 상한(rewinder_hold_max)과 회차당 획득 상한(rewinder_loop_grants)이 있다
-- ============================================================================

-- 유물 정의 (slg_records 'relics'). 운영자만 쓸 수 있다 (아래 정책).
create or replace function public.slg_relic_def(p_id text) returns jsonb
language sql stable set search_path = public as $$
  select data from slg_records where collection_name = 'relics' and record_id = p_id
$$;

-- 국가 성향별 유물 분포 (shareEngine.js RELIC_PROFILES 와 같다). 모르는 성향은 tribal.
create or replace function public.slg_relic_weight(p_profile text, p_kind text, p_rarity text) returns numeric
language sql immutable set search_path = public as $$
  with prof(p) as (select ('{
    "frontier": {"kind": {"gift": 100, "commander": 0},  "rarity": {"common": 90, "rare": 10, "epic": 0,  "legendary": 0}},
    "merchant": {"kind": {"gift": 80,  "commander": 20}, "rarity": {"common": 50, "rare": 40, "epic": 10, "legendary": 0}},
    "tribal":   {"kind": {"gift": 60,  "commander": 40}, "rarity": {"common": 55, "rare": 35, "epic": 9,  "legendary": 1}},
    "martial":  {"kind": {"gift": 30,  "commander": 70}, "rarity": {"common": 30, "rare": 45, "epic": 22, "legendary": 3}},
    "mystic":   {"kind": {"gift": 40,  "commander": 60}, "rarity": {"common": 5,  "rare": 25, "epic": 50, "legendary": 20}}
  }'::jsonb) -> (case when p_profile in ('frontier', 'merchant', 'tribal', 'martial', 'mystic') then p_profile else 'tribal' end))
  select coalesce((p -> 'kind' ->> p_kind)::numeric, 0) * coalesce((p -> 'rarity' ->> p_rarity)::numeric, 0) from prof
$$;

-- ---------------------------------------------------------------- 보상 풀 뽑기 (rewardEngine.js rollRewardPool 의 서버판)
-- 가중치 뽑기 · 하위 풀 · 중복 금지 · 보유한 지휘관 유물 제외는 같다. 난수는 서버 random() 이다 (시드를 알 수 없다).
create or replace function public.slg_pool_ok(e jsonb, chain text[], allow_dup boolean, used text[], owned text[]) returns boolean
language plpgsql stable set search_path = public as $$
declare sub jsonb; se jsonb; k text; w numeric;
begin
  if e is null or jsonb_typeof(e) <> 'object' then return false; end if;
  if (e ->> 'weight') ~ '^[0-9]+(\.[0-9]+)?$' then w := (e ->> 'weight')::numeric; else return false; end if;
  if not (w > 0) then return false; end if;
  if coalesce(e ->> 'pool', '') <> '' then
    if (e ->> 'pool') = any (chain) or coalesce(array_length(chain, 1), 0) >= 6 then return false; end if;
    select data into sub from slg_records where collection_name = 'rewardPools' and record_id = e ->> 'pool';
    if sub is null or jsonb_typeof(sub -> 'entries') <> 'array' then return false; end if;
    for se in select x from jsonb_array_elements(sub -> 'entries') x loop
      if slg_pool_ok(se, chain || (e ->> 'pool'), allow_dup, used, owned) then return true; end if;
    end loop;
    return false;
  end if;
  if e ->> 'type' = 'gold' then return allow_dup or not ('gold' = any (used)); end if;
  if e ->> 'type' = 'relic' and e ->> 'kind' = 'commander' and (e ->> 'id') = any (owned) then return false; end if;
  k := coalesce(e ->> 'type', '') || '|' || coalesce(e ->> 'kind', '') || '|' || coalesce(e ->> 'id', '');
  return allow_dup or not (k = any (used));
end $$;

-- cands: [{ "i": 번호, "e": entry }] 중 가중치대로 하나
create or replace function public.slg_pick_weighted(cands jsonb) returns jsonb
language plpgsql volatile set search_path = public as $$
declare total numeric := 0; c jsonb; r numeric; last jsonb;
begin
  for c in select x from jsonb_array_elements(cands) x loop total := total + (c -> 'e' ->> 'weight')::numeric; end loop;
  r := random() * total;
  for c in select x from jsonb_array_elements(cands) x loop
    last := c;
    r := r - (c -> 'e' ->> 'weight')::numeric;
    if r < 0 then return c; end if;
  end loop;
  return last;
end $$;

create or replace function public.slg_pool_resolve(e jsonb, chain text[], allow_dup boolean, used text[], owned text[]) returns jsonb
language plpgsql volatile set search_path = public as $$
declare sub jsonb; cands jsonb := '[]'; se record; chosen jsonb; mn int; mx int; res jsonb;
begin
  if coalesce(e ->> 'pool', '') <> '' then
    select data into sub from slg_records where collection_name = 'rewardPools' and record_id = e ->> 'pool';
    for se in select x.value as v, x.ordinality as i from jsonb_array_elements(sub -> 'entries') with ordinality x loop
      if slg_pool_ok(se.v, chain || (e ->> 'pool'), allow_dup, used, owned) then
        cands := cands || jsonb_build_array(jsonb_build_object('i', se.i - 1, 'e', se.v));
      end if;
    end loop;
    chosen := slg_pick_weighted(cands);
    return slg_pool_resolve(chosen -> 'e', chain || (e ->> 'pool'), allow_dup, used, owned);
  end if;
  if e ->> 'type' = 'gold' then
    mn := slg_int(e ->> 'min', 0); mx := greatest(mn, slg_int(e ->> 'max', mn));
    return jsonb_build_object('type', 'gold', 'amount', mn + floor(random() * (mx - mn + 1))::int);
  end if;
  if e ->> 'type' = 'relic' then return jsonb_build_object('type', 'relic', 'kind', e ->> 'kind', 'id', e ->> 'id'); end if;
  return jsonb_build_object('type', e ->> 'type', 'id', e ->> 'id');
end $$;

-- 풀을 굴려 보상 목록을 돌려준다. 없는 풀이면 빈 목록.
create or replace function public.slg_pool_roll(p_pool_id text, p_owned text[]) returns jsonb
language plpgsql volatile set search_path = public as $$
declare pool jsonb; rolls int; allow_dup boolean; used_idx int[] := '{}'; used_keys text[] := '{}'; out jsonb := '[]';
        cands jsonb; en record; chosen jsonb; rw jsonb; n int;
begin
  select data into pool from slg_records where collection_name = 'rewardPools' and record_id = p_pool_id;
  if pool is null or jsonb_typeof(pool -> 'entries') <> 'array' then return out; end if;
  rolls := least(10, greatest(1, slg_int(pool ->> 'rolls', 1)));
  allow_dup := coalesce(pool ->> 'allowDuplicates', 'false') = 'true';
  for n in 1..rolls loop
    cands := '[]';
    for en in select x.value as v, x.ordinality as i from jsonb_array_elements(pool -> 'entries') with ordinality x loop
      if (allow_dup or not ((en.i - 1)::int = any (used_idx))) and slg_pool_ok(en.v, array[p_pool_id], allow_dup, used_keys, p_owned) then
        cands := cands || jsonb_build_array(jsonb_build_object('i', en.i - 1, 'e', en.v));
      end if;
    end loop;
    exit when jsonb_array_length(cands) = 0;
    chosen := slg_pick_weighted(cands);
    rw := slg_pool_resolve(chosen -> 'e', array[p_pool_id], allow_dup, used_keys, p_owned);
    used_idx := used_idx || (chosen ->> 'i')::int;
    used_keys := used_keys || case when rw ->> 'type' = 'gold' then 'gold'
                                   else coalesce(rw ->> 'type', '') || '|' || coalesce(rw ->> 'kind', '') || '|' || coalesce(rw ->> 'id', '') end;
    out := out || jsonb_build_array(rw);
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------- 지급 · 기록
create or replace function public.slg_item_log_add(p_uid uuid, p_loop int, p_kind text, p_qty int, p_ref text, p_detail jsonb, p_now bigint) returns void
language sql volatile set search_path = public as $$
  insert into slg_item_log (user_id, "loop", kind, qty, ref, detail, at_ms) values (p_uid, p_loop, p_kind, p_qty, p_ref, p_detail, p_now)
$$;

-- 리와인더를 준다. 보유 상한과 회차당 획득 상한을 넘는 만큼은 버린다. 실제로 준 개수를 돌려준다.
create or replace function public.slg_grant_rewinders(p_uid uuid, p_n int, p_kind text, p_ref text, p_now bigint) returns int
language plpgsql volatile set search_path = public as $$
declare p slg_players%rowtype; room int; cap_left int; day_left int; g int;
begin
  if coalesce(p_n, 0) <= 0 then return 0; end if;
  select * into p from slg_players where user_id = p_uid for update;
  if not found then raise exception 'no_player'; end if;
  room := greatest(0, slg_cfg('rewinder_hold_max')::int - p.rewinders);
  cap_left := greatest(0, slg_cfg('rewinder_loop_grants')::int
              - coalesce((select sum(l.qty) from slg_item_log l where l.user_id = p_uid and l."loop" = p."loop" and l.kind = 'rewinder_grant'), 0)::int);
  day_left := greatest(0, slg_cfg('rewinder_day_grants')::int
              - coalesce((select sum(l.qty) from slg_item_log l where l.user_id = p_uid and l.kind = 'rewinder_grant' and l.at_ms > p_now - 86400000), 0)::int);
  g := least(p_n, room, cap_left, day_left);
  if g <= 0 then return 0; end if;
  update slg_players set rewinders = rewinders + g where user_id = p_uid;
  perform slg_item_log_add(p_uid, p."loop", 'rewinder_grant', g, p_ref, jsonb_build_object('why', p_kind), p_now);
  return g;
end $$;

-- 유물 하나를 준다. 정의가 없거나 상한을 넘었거나 이미 가진 지휘관 유물이면 null.
create or replace function public.slg_grant_relic(p_uid uuid, p_relic_id text, p_source jsonb, p_now bigint) returns bigint
language plpgsql volatile set search_path = public as $$
declare def jsonb; v_kind text; v_rar text; p slg_players%rowtype; rid bigint; snap jsonb; fx jsonb; rw int := 0; eq boolean := false; f jsonb;
begin
  def := slg_relic_def(p_relic_id);
  if def is null or jsonb_typeof(def) <> 'object' then return null; end if;
  v_kind := def ->> 'kind';
  if v_kind is null or v_kind not in ('commander', 'gift', 'rename') then return null; end if;
  v_rar := case when def ->> 'rarity' in ('common', 'rare', 'epic', 'legendary') then def ->> 'rarity' else 'common' end;
  select * into p from slg_players where user_id = p_uid for update;
  if not found then raise exception 'no_player'; end if;
  if (select count(*) from slg_relics r where r.user_id = p_uid and r."loop" = p."loop") >= slg_cfg('relic_loop_cap') then return null; end if;
  if v_kind = 'commander' and exists (select 1 from slg_relics r where r.user_id = p_uid and r.relic_id = p_relic_id and r.kind = 'commander' and r.used_ms is null) then
    return null;
  end if;
  -- 효과는 정의에서 최대 8개만, { scope, stat, value } 모양만 남긴다
  fx := '[]';
  if v_kind <> 'rename' and jsonb_typeof(def -> 'effects') = 'array' then
    for f in select x from jsonb_array_elements(def -> 'effects') x limit 8 loop
      if jsonb_typeof(f) = 'object' and (f ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$' then
        fx := fx || jsonb_build_array(jsonb_build_object('scope', f ->> 'scope', 'stat', f ->> 'stat', 'value', (f ->> 'value')::numeric));
        if f ->> 'stat' = 'rewinder' and v_kind = 'commander' then rw := rw + round((f ->> 'value')::numeric)::int; end if;
      end if;
    end loop;
  end if;
  snap := jsonb_build_object('id', p_relic_id, 'name', left(coalesce(def ->> 'name', p_relic_id), 60), 'kind', v_kind, 'rarity', v_rar,
                             'description', left(coalesce(def ->> 'description', ''), 300), 'effects', fx);
  if jsonb_typeof(def -> 'imageUrl') = 'string' then snap := snap || jsonb_build_object('imageUrl', left(def ->> 'imageUrl', 500)); end if;
  if v_kind = 'commander' then
    eq := (select count(*) from slg_relics r where r.user_id = p_uid and r.kind = 'commander' and r.equipped and r.used_ms is null) < slg_cfg('commander_slots');
  end if;
  insert into slg_relics (user_id, relic_id, kind, snapshot, source, equipped, "loop", created_ms)
    values (p_uid, p_relic_id, v_kind, snap, p_source, eq, p."loop", p_now) returning id into rid;
  perform slg_item_log_add(p_uid, p."loop", 'relic_grant', 1, p_relic_id, p_source, p_now);
  -- 지휘관 유물의 리와인더 효과: 얻는 즉시 한 번만 채워 준다 (보유 · 회차 상한 안에서)
  if rw > 0 then
    rw := slg_grant_rewinders(p_uid, least(rw, 5), 'relic', p_relic_id, p_now);
    update slg_relics set snapshot = snapshot || jsonb_build_object('rewinderGranted', rw) where id = rid;
  end if;
  return rid;
end $$;

create or replace function public.slg_relic_json(r slg_relics) returns jsonb
language sql immutable set search_path = public as $$
  select r.snapshot || jsonb_build_object('instanceId', 'r' || r.id, 'equipped', r.equipped, 'source', r.source, 'acquiredAt', r.created_ms)
$$;

create or replace function public.slg_items_json(p_uid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p slg_players%rowtype; pend jsonb;
begin
  select * into p from slg_players where user_id = p_uid;
  select jsonb_build_object('ref', e.ref, 'nodeId', e.node_id, 'sectorId', e.sector_id, 'type', e.type, 'options', e.result -> 'options')
    into pend from slg_encounters e where e.user_id = p_uid and e."loop" = p."loop" and e.status = 'awaiting' order by e.started_ms desc limit 1;
  return jsonb_build_object(
    'rewinders', p.rewinders, 'holdMax', slg_cfg('rewinder_hold_max'), 'migrated', p.items_migrated, 'pending', pend,
    'relics', coalesce((select jsonb_agg(slg_relic_json(r) order by r.id) from slg_relics r where r.user_id = p_uid and r.used_ms is null), '[]'::jsonb));
end $$;

-- 지휘관 유물(장착 중)의 수치 합. 상점 할인처럼 서버가 가격을 정할 때 쓴다.
create or replace function public.slg_equipped_stat(p_uid uuid, p_stat text) returns numeric
language sql stable set search_path = public as $$
  select coalesce(sum((f ->> 'value')::numeric), 0)
  from slg_relics r, jsonb_array_elements(r.snapshot -> 'effects') f
  where r.user_id = p_uid and r.kind = 'commander' and r.equipped and r.used_ms is null and f ->> 'stat' = p_stat
$$;

-- ---------------------------------------------------------------- 전투 · 이벤트
-- 전투를 시작했다고 알린다. 서버는 시각만 기록한다 (같은 전투를 다시 알려도 그대로). 같은 노드의 이전 진행 중 전투는 무효가 된다.
create or replace function public.slg_encounter_start(p_ref text, p_node_id text, p_sector text, p_type text, p_enemies int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; e slg_encounters%rowtype;
begin
  if p_ref is null or p_ref !~ '^[A-Za-z0-9_.-]{1,40}$' or p_node_id is null or p_node_id !~ '^[A-Za-z0-9_.-]{1,48}$'
     or p_sector is null or p_sector !~ '^[A-Za-z0-9_.-]{1,32}$' or p_type is null or p_type not in ('battle', 'elite', 'boss') then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  select * into e from slg_encounters where user_id = uid and "loop" = p."loop" and ref = p_ref;
  if found then return jsonb_build_object('ok', true, 'status', e.status, 'dup', true); end if;
  if exists (select 1 from slg_encounters x where x.user_id = uid and x."loop" = p."loop" and x.node_id = p_node_id and x.status in ('awaiting', 'claimed')) then
    return jsonb_build_object('ok', false, 'error', 'node_done');
  end if;
  if p_type = 'boss' and exists (select 1 from slg_encounters x where x.user_id = uid and x."loop" = p."loop" and x.sector_id = p_sector and x.type = 'boss' and x.status in ('awaiting', 'claimed')) then
    return jsonb_build_object('ok', false, 'error', 'boss_done');
  end if;
  if p_type = 'boss' and (select count(*) from slg_encounters x where x.user_id = uid and x."loop" = p."loop" and x.type = 'boss' and x.status in ('awaiting', 'claimed')) >= slg_cfg('boss_per_loop') then
    return jsonb_build_object('ok', false, 'error', 'boss_done');
  end if;
  update slg_encounters set status = 'void' where user_id = uid and status = 'active';   -- 동시에 진행 중인 전투는 하나뿐
  insert into slg_encounters (user_id, "loop", ref, node_id, sector_id, type, enemies, started_ms)
    values (uid, p."loop", p_ref, p_node_id, p_sector, p_type, least(greatest(coalesce(p_enemies, 1), 1), slg_cfg('enc_max_enemies')::int), now_ms);
  return jsonb_build_object('ok', true, 'status', 'active');
end $$;

-- 승리 보상을 받는다. 골드(서버가 정한 기준액) · 리와인더 · 유물을 서버가 굴린다.
--   보스는 후보 3개 중 하나를 고른다: 첫 호출은 후보를 돌려주고(needChoice), p_choice 를 넣어 다시 부르면 지급한다.
create or replace function public.slg_encounter_claim(p_ref text, p_choice int default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; e slg_encounters%rowtype; mult numeric; gold bigint; rwd int := 0; rolled jsonb;
  owned text[]; ids jsonb := '[]'; r jsonb; granted jsonb := '[]'; gid bigint; opts jsonb; pick_id text; suffix text; pool_id text; given int;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  select * into e from slg_encounters where user_id = uid and "loop" = p."loop" and ref = p_ref for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encounter'); end if;
  if e.type = 'event' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  if e.status = 'void' then return jsonb_build_object('ok', false, 'error', 'void'); end if;
  if e.status = 'claimed' then
    return jsonb_build_object('ok', true, 'dup', true, 'gold', e.gold_reward, 'rewinders', e.rewinder_reward, 'relics', coalesce(e.result -> 'granted', '[]'::jsonb), 'items', slg_items_json(uid));
  end if;

  if e.status = 'active' then
    if now_ms - e.started_ms < slg_cfg('enc_min_ms') then
      return jsonb_build_object('ok', false, 'error', 'too_fast', 'waitMs', (slg_cfg('enc_min_ms') - (now_ms - e.started_ms))::bigint);
    end if;
    if (select count(*) from slg_encounters x where x.user_id = uid and x.claimed_ms > now_ms - 3600000) >= slg_cfg('claims_per_hour')
       or (select count(*) from slg_encounters x where x.user_id = uid and x."loop" = p."loop" and x.claimed_ms is not null) >= slg_cfg('claims_per_loop') then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    mult := case e.type when 'boss' then 10 when 'elite' then 1.5 else 1 end;
    gold := round(e.enemies * 100 * mult)::bigint;
    if e.type = 'boss' or random() < 0.5 then rwd := 1; end if;
    rwd := slg_grant_rewinders(uid, rwd, 'battle', e.ref, now_ms);
    suffix := case e.type when 'boss' then 'boss-relic' when 'elite' then 'elite' else 'battle' end;
    pool_id := e.sector_id || '-' || suffix;
    select coalesce(array_agg(r2.relic_id), '{}') into owned from slg_relics r2 where r2.user_id = uid and r2.kind = 'commander' and r2.used_ms is null;
    rolled := slg_pool_roll(pool_id, owned);
    for r in select x from jsonb_array_elements(rolled) x loop
      if r ->> 'type' = 'relic' and slg_relic_def(r ->> 'id') is not null then ids := ids || to_jsonb(r ->> 'id'); end if;
    end loop;
    if e.type = 'boss' and jsonb_array_length(ids) > 0 then
      update slg_encounters set status = 'awaiting', gold_reward = gold, rewinder_reward = rwd, claimed_ms = now_ms,
        result = jsonb_build_object('options', ids) where user_id = e.user_id and "loop" = e."loop" and ref = e.ref;
      perform slg_item_log_add(uid, p."loop", 'claim', 1, e.ref, jsonb_build_object('type', e.type, 'gold', gold, 'rewinders', rwd), now_ms);
      return jsonb_build_object('ok', true, 'needChoice', true, 'options', ids, 'gold', gold, 'rewinders', rwd, 'items', slg_items_json(uid));
    end if;
    for r in select x from jsonb_array_elements(ids) x loop
      gid := slg_grant_relic(uid, r #>> '{}', jsonb_build_object('nodeId', e.node_id, 'sectorId', e.sector_id, 'type', e.type), now_ms);
      if gid is not null then granted := granted || to_jsonb('r' || gid); end if;
    end loop;
    update slg_encounters set status = 'claimed', gold_reward = gold, rewinder_reward = rwd, claimed_ms = now_ms,
      result = jsonb_build_object('granted', granted) where user_id = e.user_id and "loop" = e."loop" and ref = e.ref;
    perform slg_item_log_add(uid, p."loop", 'claim', 1, e.ref, jsonb_build_object('type', e.type, 'gold', gold, 'rewinders', rwd, 'relics', jsonb_array_length(granted)), now_ms);
    return jsonb_build_object('ok', true, 'gold', gold, 'rewinders', rwd, 'relics', granted, 'items', slg_items_json(uid));
  end if;

  -- awaiting: 보스 유물 선택
  opts := e.result -> 'options';
  if p_choice is null then
    return jsonb_build_object('ok', true, 'needChoice', true, 'options', opts, 'gold', e.gold_reward, 'rewinders', e.rewinder_reward, 'items', slg_items_json(uid));
  end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(opts) then return jsonb_build_object('ok', false, 'error', 'bad_choice'); end if;
  pick_id := opts ->> p_choice;
  gid := slg_grant_relic(uid, pick_id, jsonb_build_object('nodeId', e.node_id, 'sectorId', e.sector_id, 'type', e.type), now_ms);
  if gid is not null then granted := jsonb_build_array('r' || gid); end if;
  update slg_encounters set status = 'claimed', result = jsonb_build_object('granted', granted, 'chosen', pick_id)
    where user_id = e.user_id and "loop" = e."loop" and ref = e.ref;
  return jsonb_build_object('ok', true, 'gold', e.gold_reward, 'rewinders', e.rewinder_reward, 'relics', granted, 'items', slg_items_json(uid));
end $$;

-- 이벤트 노드: 결과를 서버가 굴린다 (노드마다 회차당 한 번). 리와인더는 서버가 바로 주고, 골드 · 회복은 알려 주기만 한다
-- (골드는 기존대로 earn_event 로 청구하며 건당 상한이 있다).
create or replace function public.slg_event_roll(p_node_id text, p_sector text default 'event') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; e slg_encounters%rowtype; roll numeric; res jsonb; rw int := 0; v_ref text;
begin
  if p_node_id is null or p_node_id !~ '^[A-Za-z0-9_.-]{1,48}$' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  v_ref := 'ev:' || p_node_id;
  select * into e from slg_encounters x where x.user_id = uid and x."loop" = p."loop" and x.ref = v_ref;
  if found then return jsonb_build_object('ok', true, 'dup', true, 'event', e.result, 'items', slg_items_json(uid)); end if;
  if (select count(*) from slg_encounters x where x.user_id = uid and x."loop" = p."loop" and x.claimed_ms is not null) >= slg_cfg('claims_per_loop') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from slg_encounters x where x.user_id = uid and x.claimed_ms > now_ms - 3600000) >= slg_cfg('claims_per_hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  roll := random();
  if roll < 0.4 then res := jsonb_build_object('id', 'supply_cache', 'gold', 100 + floor(random() * 151)::int);
  elsif roll < 0.75 then res := jsonb_build_object('id', 'field_camp', 'heal', true);
  else
    rw := slg_grant_rewinders(uid, 1, 'event', v_ref, now_ms);
    res := jsonb_build_object('id', 'time_fragment', 'rewinders', rw);
  end if;
  insert into slg_encounters (user_id, "loop", ref, node_id, sector_id, type, enemies, started_ms, status, claimed_ms, result)
    values (uid, p."loop", v_ref, p_node_id, left(coalesce(p_sector, 'event'), 32), 'event', 1, now_ms, 'claimed', now_ms, res);
  return jsonb_build_object('ok', true, 'event', res, 'items', slg_items_json(uid));
end $$;

-- ---------------------------------------------------------------- 리와인더
-- 쓴다: 서버 보유가 1 이상일 때만, 1 줄인다.
create or replace function public.slg_rewinder_use() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; left_n int;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  update slg_players set rewinders = rewinders - 1 where user_id = uid and rewinders > 0 returning rewinders into left_n;
  if left_n is null then return jsonb_build_object('ok', false, 'error', 'none', 'rewinders', p.rewinders); end if;
  perform slg_item_log_add(uid, p."loop", 'rewinder_use', 1, null, null, now_ms);
  return jsonb_build_object('ok', true, 'rewinders', left_n);
end $$;

-- 산다: 값은 서버가 정한다 (기준가 × 물가, 상점 노드는 유물 할인). 가득 차 있으면 돈을 받지 않는다.
create or replace function public.slg_rewinder_buy(p_src text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; econ_price numeric; cost bigint; pct numeric; ok boolean; n int;
begin
  if p_src is null or p_src not in ('village', 'shop') then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  perform slg_tick(uid, now_ms);
  select * into p from slg_players where user_id = uid;
  if p.rewinders >= slg_cfg('rewinder_hold_max') then return jsonb_build_object('ok', false, 'error', 'full', 'rewinders', p.rewinders); end if;
  if (select count(*) from slg_item_log l where l.user_id = uid and l.kind = 'rewinder_buy' and l.at_ms > now_ms - 86400000) >= slg_cfg('rewinder_day_buys') then
    return jsonb_build_object('ok', false, 'error', 'daily_limit', 'rewinders', p.rewinders);
  end if;
  select e.price into econ_price from slg_econ e where e.id = 1;
  cost := slg_scale(slg_cfg(case p_src when 'shop' then 'rewinder_price_shop' else 'rewinder_price_village' end), econ_price);
  if p_src = 'shop' then
    pct := least(75, greatest(0, slg_equipped_stat(uid, 'shopDiscount')));
    if pct > 0 then cost := greatest(1, round(cost * (1 - pct / 100))::bigint); end if;
  end if;
  ok := slg_debit(uid, cost, 'spend_item', 'rewinder:' || p_src, now_ms, null, true);   -- 'spend' 가 아님: earn_rewind 로 환불받을 수 없다
  if not ok then return jsonb_build_object('ok', false, 'error', 'insufficient', 'cost', cost); end if;
  update slg_players set rewinders = rewinders + 1 where user_id = uid returning rewinders into n;
  perform slg_item_log_add(uid, p."loop", 'rewinder_buy', 1, p_src, jsonb_build_object('cost', cost), now_ms);
  return jsonb_build_object('ok', true, 'rewinders', n, 'cost', cost, 'balance', (select gold from slg_players where user_id = uid));
end $$;

-- ---------------------------------------------------------------- 유물 장착 · 선물
create or replace function public.slg_relic_equip(p_instance text, p_equip boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); rid bigint; r slg_relics%rowtype; cnt int;
begin
  if p_instance is null or p_instance !~ '^r[0-9]{1,18}$' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  rid := substr(p_instance, 2)::bigint;
  perform slg_lock();
  perform slg_player_for(uid);
  select * into r from slg_relics where id = rid and user_id = uid and used_ms is null for update;
  if not found or r.kind <> 'commander' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(p_equip, false) then
    select count(*) into cnt from slg_relics where user_id = uid and kind = 'commander' and equipped and used_ms is null and id <> rid;
    if cnt >= slg_cfg('commander_slots') then return jsonb_build_object('ok', false, 'error', 'slots_full'); end if;
  end if;
  update slg_relics set equipped = coalesce(p_equip, false) where id = rid;
  return jsonb_build_object('ok', true, 'items', slg_items_json(uid));
end $$;

-- 선물 유물을 쓴다 (한 번 쓰면 사라진다). 능력치를 캐릭터에 더하는 것은 클라이언트가 한다 (캐릭터는 클라이언트 데이터).
create or replace function public.slg_relic_gift(p_instance text, p_unit text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; rid bigint; r slg_relics%rowtype; p slg_players%rowtype;
begin
  if p_instance is null or p_instance !~ '^r[0-9]{1,18}$' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  rid := substr(p_instance, 2)::bigint;
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  select * into r from slg_relics where id = rid and user_id = uid and used_ms is null for update;
  if not found or r.kind <> 'gift' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update slg_relics set used_ms = now_ms, used_for = 'gift' where id = rid;
  perform slg_item_log_add(uid, p."loop", 'relic_use', 1, r.relic_id, jsonb_build_object('for', 'gift', 'unit', left(coalesce(p_unit, ''), 64)), now_ms);
  return jsonb_build_object('ok', true, 'relic', slg_relic_json(r), 'items', slg_items_json(uid));
end $$;

-- ---------------------------------------------------------------- 예전 세이브 이전 (계정당 한 번)
-- 이 버전 이전에는 리와인더 · 유물이 세이브에만 있었다. 한 번만, 상한까지 인정한다 (그 뒤로는 서버 값만 쓴다).
create or replace function public.slg_items_migrate(p_rewinders int, p_relics jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := slg_uid(); now_ms bigint; p slg_players%rowtype; x jsonb; n int := 0; gid bigint; seen text[] := '{}'; rid text; rn int := 0;
begin
  perform slg_lock();
  now_ms := slg_now_ms();
  p := slg_player_for(uid);
  if p.items_migrated then return jsonb_build_object('ok', true, 'already', true, 'items', slg_items_json(uid)); end if;
  update slg_players set items_migrated = true, rewinders = least(slg_cfg('rewinder_hold_max')::int,
      greatest(rewinders, least(greatest(coalesce(p_rewinders, 0), 0), slg_cfg('migrate_rewinder_cap')::int))) where user_id = uid;
  if jsonb_typeof(p_relics) = 'array' then
    for x in select v from jsonb_array_elements(p_relics) v limit 40 loop
      exit when n >= slg_cfg('migrate_relic_cap');
      rid := x ->> 'id';
      continue when rid is null or rid = any (seen) or (slg_relic_def(rid) ->> 'kind') is null or (slg_relic_def(rid) ->> 'kind') = 'rename' or coalesce(slg_relic_def(rid) ->> 'rarity', 'common') in ('epic', 'legendary');
      seen := seen || rid;
      gid := slg_grant_relic(uid, rid, jsonb_build_object('type', 'migrated'), now_ms);
      if gid is not null then n := n + 1; end if;
    end loop;
  end if;
  perform slg_audit_add(uid, 'items_migrate', jsonb_build_object('rewinders', p_rewinders, 'relics', n), now_ms);
  return jsonb_build_object('ok', true, 'relics', n, 'items', slg_items_json(uid));
end $$;

-- ---------------------------------------------------------------- 세금 유물 (지분 1위가 아닌 보유자에게 정산 때 확률로)
create or replace function public.slg_tax_relics(p_uid uuid, p_loop int, p_regions text[], p_cnt bigint, p_now bigint) returns jsonb
language plpgsql volatile set search_path = public as $$
declare reg record; n int := 0; i bigint; chance numeric; mine int; rid text; excl text[]; rnd numeric; granted jsonb := '[]'; gid bigint;
begin
  for reg in select r.region_id, r.threat, r.relic_profile from slg_regions r where r.region_id = any (p_regions) order by r.region_id loop
    exit when n >= 5;
    select s.bp into mine from slg_shares s where s.region_id = reg.region_id and s.holder = p_uid::text and s."loop" is not distinct from p_loop;
    continue when not (coalesce(mine, 0) > 0);
    continue when not exists (select 1 from slg_shares s where s.region_id = reg.region_id and s.holder <> p_uid::text and s.bp > mine);   -- 1위(동률 포함)는 제외
    chance := least(1, 0.2 + 0.04 * reg.threat);
    i := 0;
    while i < least(p_cnt, 30) and n < 5 loop
      i := i + 1;
      continue when random() >= chance;
      select coalesce(array_agg(r2.relic_id), '{}') into excl from slg_relics r2 where r2.user_id = p_uid and r2.kind = 'commander' and r2.used_ms is null;
      rnd := random();
      select q.record_id into rid from (
        select w.record_id, sum(w.w) over (order by w.record_id) as cum, sum(w.w) over () as tot from (
          select d.record_id, slg_relic_weight(reg.relic_profile, d.data ->> 'kind', coalesce(d.data ->> 'rarity', 'common')) as w
          from slg_records d where d.collection_name = 'relics' and not (d.record_id = any (excl))
        ) w where w.w > 0
      ) q where q.cum > rnd * q.tot order by q.cum limit 1;
      exit when rid is null;
      gid := slg_grant_relic(p_uid, rid, jsonb_build_object('type', 'tax', 'regionId', reg.region_id), p_now);
      if gid is not null then n := n + 1; granted := granted || jsonb_build_array(jsonb_build_object('regionId', reg.region_id, 'relicId', rid)); end if;
    end loop;
  end loop;
  return granted;
end $$;

-- ============================================================================
-- 권한: 내부 함수는 아무도 못 부르고, RPC 만 로그인한 사용자가 부른다
-- ============================================================================
do $$
declare f record; rpc text[] := array['slg_bootstrap','slg_wallet_apply','slg_admin_adjust','slg_is_admin','slg_loop_return','slg_region_secure',
  'slg_share_buy','slg_fed_propose','slg_fed_vote','slg_loan_take','slg_loan_repay','slg_loan_collateral','slg_loan_seized','slg_audit_list','slg_auction_bid','slg_sync','slg_set_name','slg_name_available',
  'slg_encounter_start','slg_encounter_claim','slg_event_roll','slg_rewinder_use','slg_rewinder_buy','slg_relic_equip','slg_relic_gift','slg_items_migrate'];
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'slg\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f.sig); end if;
    if f.proname = any (rpc) and exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- 정책이 부르는 함수. anon 은 로그인이 없어 항상 false 를 받는다.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then grant execute on function public.slg_is_admin() to anon; end if;
end $$;

-- ============================================================================
-- slg_records 접근 정책 (게임 세이브 · 예전 공유 컬렉션)
--  * gameState(세이브)는 로그인한 본인 것(record_id = 내 user id)만 읽고 쓴다.
--  * nationShares · fedState · charAuctions · fedLedger 는 예전(클라이언트 CAS) 방식의 컬렉션이다.
--    이제 서버 테이블(slg_*)이 원본이므로 브라우저가 새로 쓰지 못하게 막는다 (읽기만 가능).
--  * relics · rewardPools · items(유물 · 보상 풀 · 아이템 정의)는 누구나 읽지만 운영자(slg_is_admin)만 쓴다 — 서버가 이 정의로 보상을 굴리므로.
--  * 그 밖의 컬렉션(캐릭터 · 스킬 · 맵 · 설정 등 에디터 데이터)은 지금처럼 공개 읽기/쓰기다.
--    (운영자용 에디터를 위한 것이다. 에디터 쓰기까지 막으려면 별도의 관리자 정책이 필요하다.)
-- ============================================================================
do $$
begin
  if to_regclass('public.slg_records') is null then
    raise notice 'slg_records 테이블이 없어 정책을 건너뜁니다 (supabase-schema.sql 을 먼저 실행하세요).';
    return;
  end if;
  alter table public.slg_records enable row level security;
  drop policy if exists "SLG public read" on public.slg_records;
  drop policy if exists "SLG public insert" on public.slg_records;
  drop policy if exists "SLG public update" on public.slg_records;
  drop policy if exists "SLG public delete" on public.slg_records;
  drop policy if exists "SLG read" on public.slg_records;
  drop policy if exists "SLG insert" on public.slg_records;
  drop policy if exists "SLG update" on public.slg_records;
  drop policy if exists "SLG delete" on public.slg_records;

  create policy "SLG read" on public.slg_records for select to anon, authenticated
    using (collection_name <> 'gameState' or record_id = auth.uid()::text);
  create policy "SLG insert" on public.slg_records for insert to anon, authenticated
    with check (collection_name not in ('nationShares', 'fedState', 'charAuctions', 'fedLedger')
                and (collection_name <> 'gameState' or record_id = auth.uid()::text) and (collection_name not in ('relics', 'rewardPools', 'items') or public.slg_is_admin()));
  create policy "SLG update" on public.slg_records for update to anon, authenticated
    using (collection_name not in ('nationShares', 'fedState', 'charAuctions', 'fedLedger')
           and (collection_name <> 'gameState' or record_id = auth.uid()::text) and (collection_name not in ('relics', 'rewardPools', 'items') or public.slg_is_admin()))
    with check (collection_name not in ('nationShares', 'fedState', 'charAuctions', 'fedLedger')
                and (collection_name <> 'gameState' or record_id = auth.uid()::text) and (collection_name not in ('relics', 'rewardPools', 'items') or public.slg_is_admin()));
  create policy "SLG delete" on public.slg_records for delete to anon, authenticated
    using (collection_name not in ('nationShares', 'fedState', 'charAuctions', 'fedLedger')
           and (collection_name <> 'gameState' or record_id = auth.uid()::text) and (collection_name not in ('relics', 'rewardPools', 'items') or public.slg_is_admin()));
end $$;
