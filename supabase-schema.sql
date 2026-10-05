-- Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists public.slg_records (
  collection_name text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection_name, record_id)
);
alter table public.slg_records enable row level security;
-- 현재 SLG는 전역 운영자용 공유 데이터베이스 구조입니다.
-- 사용자별 비공개 계정으로 전환할 경우 아래 정책을 제거하고 auth.uid() 기반 정책으로 바꾸세요.
drop policy if exists "SLG public read" on public.slg_records;
drop policy if exists "SLG public insert" on public.slg_records;
drop policy if exists "SLG public update" on public.slg_records;
drop policy if exists "SLG public delete" on public.slg_records;
create policy "SLG public read" on public.slg_records for select to anon, authenticated using (true);
create policy "SLG public insert" on public.slg_records for insert to anon, authenticated with check (true);
create policy "SLG public update" on public.slg_records for update to anon, authenticated using (true) with check (true);
create policy "SLG public delete" on public.slg_records for delete to anon, authenticated using (true);
-- Realtime 활성화 (이미 추가되어 있으면 무시 가능)
alter publication supabase_realtime add table public.slg_records;
-- Storage: Dashboard > Storage에서 public bucket 'slg-assets'를 생성한 뒤 공개 읽기 정책을 추가하세요.

-- Storage 버킷 및 정책 (SQL Editor에서 실행 가능)
insert into storage.buckets (id, name, public)
values ('slg-assets', 'slg-assets', true)
on conflict (id) do update set public = true;
drop policy if exists "SLG assets public read" on storage.objects;
drop policy if exists "SLG assets public upload" on storage.objects;
drop policy if exists "SLG assets public update" on storage.objects;
drop policy if exists "SLG assets public delete" on storage.objects;
create policy "SLG assets public read" on storage.objects for select to anon, authenticated using (bucket_id = 'slg-assets');
create policy "SLG assets public upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'slg-assets');
create policy "SLG assets public update" on storage.objects for update to anon, authenticated using (bucket_id = 'slg-assets') with check (bucket_id = 'slg-assets');
create policy "SLG assets public delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'slg-assets');

-- 국가 지분 세금 정산용 서버 시각 (nationShares). 없어도 동작하지만(임시 행으로 대체) 있으면 왕복이 1번으로 준다.
create or replace function public.slg_server_time() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.slg_server_time() to anon, authenticated;

-- 서버 권위 경제(계정 · 지갑 · 연준 · 지분 · 대출 · 경매)는 supabase-economy.sql 을 이어서 실행하세요. (README "서버 권위 경제" 참고)
