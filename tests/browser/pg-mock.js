// 브라우저 종단 검증용: 페이지 안에서 PGlite(실제 Postgres)에 supabase-economy.sql 을 올리고,
// SupabaseBridge.rpc 를 그 DB 로 연결한다. 실제 Supabase 는 건드리지 않는다.
//
// 사용 (정적 서버로 프로젝트 루트를 연 페이지에서):
//   const m = await import('/tests/browser/pg-mock.js');
//   await m.installPgMock({ users: ['a', 'b'] });   // 로그인 계정 = 'a'. m.setUser('b') 로 바꿀 수 있다.
//   await ServerEconomy.start();
//
// window.__pg = { db, at(ms), clear(), setUser(name), uids, q(sql, args) }

const AUTH_STUB = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz default now());
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  create table if not exists public.slg_records (collection_name text not null, record_id text not null, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), primary key (collection_name, record_id));
`;

export async function installPgMock({ users = ['tester'] } = {}) {
  const { PGlite } = await import('/node_modules/@electric-sql/pglite/dist/index.js');
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(await (await fetch('/supabase-economy.sql')).text());
  const uids = {};
  for (const u of users) uids[u] = (await db.query('insert into auth.users (email) values ($1) returning id', [`${u}@test`])).rows[0].id;

  const sigRows = (await db.query(`
    select p.proname, p.proargnames,
      (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality as x(t, o)) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'slg\\_%'`)).rows;
  const sigs = {};
  sigRows.forEach((r) => { sigs[r.proname] = { names: r.proargnames || [], types: r.types || [] }; });

  let current = users[0];
  const bridge = window.SupabaseBridge;
  bridge.isReady = true;
  bridge.currentUser = { uid: uids[current], email: `${current}@test`, isAnonymous: false, offline: false };

  bridge.rpc = async (name, args = {}) => {
    const sig = sigs[name];
    if (!sig) { const e = new Error(`Could not find the function public.${name} in the schema cache`); e.code = 'PGRST202'; throw e; }
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uids[current]]);
    const parts = [], vals = [];
    Object.entries(args).forEach(([k, v]) => {
      const i = sig.names.indexOf(k);
      if (i < 0 || v === undefined) return;
      const type = sig.types[i];
      let val = v;
      if (type === 'jsonb') val = JSON.stringify(v);
      else if (type === 'bigint[]') val = `{${(v || []).join(',')}}`;
      vals.push(val);
      parts.push(`${k} => $${vals.length}::${type}`);
    });
    try {
      const r = await db.query(`select public.${name}(${parts.join(', ')}) as r`, vals);
      return r.rows[0].r;
    } catch (e) {
      const err = new Error(e.message);
      err.code = e.code === '28000' ? 'PGRST301' : e.code;
      throw err;
    }
  };
  // 실제 Supabase 에 세이브가 올라가지 않게
  bridge.saveGameStateToCloud = async () => true;
  bridge.loadGameStateFromCloud = async () => null;
  window.saveGameStateToCloud = async () => true;
  document.getElementById('modal-auth')?.remove();

  window.__pg = {
    db, uids, sigs,
    at: (ms) => db.query(`select set_config('slg.now_ms', $1, false)`, [String(ms)]),
    clear: () => db.query(`select set_config('slg.now_ms', '', false)`),
    setUser(name) { current = name; bridge.currentUser = { uid: uids[name], email: `${name}@test`, isAnonymous: false, offline: false }; },
    q: async (sql, args) => (await db.query(sql, args)).rows
  };
  return window.__pg;
}
