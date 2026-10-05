// PGlite(브라우저/노드에서 도는 실제 Postgres) 위에 Supabase 의 auth 스키마를 흉내 내고 supabase-economy.sql 을 그대로 올린다.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const AUTH_STUB = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz default now());
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  // 기존 supabase-schema.sql 의 슬롯 테이블 (정책은 supabase-economy.sql 이 바꾼다)
  await db.exec(`create table if not exists public.slg_records (collection_name text not null, record_id text not null, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), primary key (collection_name, record_id));
    alter table public.slg_records enable row level security; grant all on public.slg_records to anon, authenticated;
    create policy "SLG public read" on public.slg_records for select to anon, authenticated using (true);
    create policy "SLG public insert" on public.slg_records for insert to anon, authenticated with check (true);`);
  await db.exec(readFileSync(join(ROOT, 'supabase-economy.sql'), 'utf8'));
  return new Server(db);
}

export class Server {
  constructor(db) { this.db = db; this.users = {}; }
  async user(name) {
    if (!this.users[name]) {
      const r = await this.db.query('insert into auth.users (email) values ($1) returning id', [`${name}@test`]);
      this.users[name] = r.rows[0].id;
    }
    return this.users[name];
  }
  /** 서버 시각 고정 (ms) */
  async at(ms) { await this.db.query(`select set_config('slg.now_ms', $1, false)`, [String(ms)]); }
  /** 로그인한 사용자로 RPC 호출. 결과는 첫 행의 첫 컬럼(jsonb)이 이미 객체로 온다. */
  async rpc(name, args = [], as = 'a') {
    const id = await this.user(as);
    await this.db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id]);
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    const r = await this.db.query(`select public.${name}(${ph}) as r`, args);
    return r.rows[0].r;
  }
  async rpcAnon(name, args = []) {
    await this.db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    return (await this.db.query(`select public.${name}(${ph}) as r`, args)).rows[0].r;
  }
  q(sql, args) { return this.db.query(sql, args).then((r) => r.rows); }
}

/** 테스트 본문을 돌리고, 예외는 메시지와 SQL 위치만 짧게 보여 준다 (pglite 의 minified 스택이 화면을 덮지 않게). */
export async function run(main) {
  try { await main(); }
  catch (e) { console.log('FAIL 예외:', String(e.message).slice(0, 300), e.where ? '\n  at ' + String(e.where).split('\n')[0] : '', e.internalQuery ? '\n  query: ' + String(e.internalQuery).slice(0, 160) : ''); process.exit(1); }
}
