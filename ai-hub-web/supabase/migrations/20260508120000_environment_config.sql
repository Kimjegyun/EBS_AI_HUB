-- 공용 환경·연동 정보 (단일 행). 클라이언트는 id = 1 행만 읽고/갱신합니다.
-- 프로덕션에서는 RLS를 Supabase Auth + 관리자 역할로 좁히는 것을 권장합니다.

create table if not exists public.environment_config (
  id smallint primary key default 1 constraint environment_config_single_row check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.environment_config is 'AI HUB 공용 환경 설정(JSON). 계정/프로필은 별도 테이블에서 관리하세요.';

alter table public.environment_config enable row level security;

create policy "environment_config_select"
  on public.environment_config for select
  to anon, authenticated
  using (true);

create policy "environment_config_insert"
  on public.environment_config for insert
  to anon, authenticated
  with check (true);

create policy "environment_config_update"
  on public.environment_config for update
  to anon, authenticated
  using (true)
  with check (true);

-- 계정·역할 등은 Supabase Auth의 auth.users 와 연동된 public.profiles 등 별도 테이블로 관리하는 것을 권장합니다.