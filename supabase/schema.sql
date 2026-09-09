-- Record 앱 저장소 스키마.
-- Supabase 프로젝트의 SQL Editor에 통째로 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 설계 메모
--  * 하루 기록은 날짜당 한 줄(jsonb)로 저장합니다. 앱이 '하루' 단위로 편집하므로
--    충돌 병합도 하루 단위로 하면 규칙이 단순하고 예측 가능합니다.
--  * 날짜에 매달리지 않고 따로 서 있는 것(사람, 콘텐츠 …)은 objects 한 테이블에
--    kind로 구분해 담습니다. 새로운 종류가 생겨도 이 파일을 다시 실행할 필요가
--    없게 하려는 것입니다. 종류마다 테이블을 두면 앱을 고칠 때마다 SQL을 다시
--    돌려야 하고, 그때까지 그 기록만 동기화가 막힙니다.
--  * updated_at은 클라이언트가 기록한 시각(epoch ms)을 그대로 씁니다. 기기 간
--    비교 기준을 하나로 통일해야 최신본 판정이 흔들리지 않습니다.
--  * server_updated_at은 증분 조회용 커서로만 씁니다.
--  * 지운 것도 줄을 남기고 deleted 표시만 합니다. 줄을 아예 지우면 다른 기기가
--    되살려 놓기 때문입니다.

create table if not exists public.days (
  user_id uuid not null references auth.users (id) on delete cascade,
  date text not null,
  data jsonb not null,
  updated_at bigint not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.objects (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'person' | 'content' | 앞으로 무엇이든. 여기에 문자열만 늘리면 됩니다.
  kind text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at bigint not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at bigint not null,
  server_updated_at timestamptz not null default now()
);

create index if not exists days_sync_idx on public.days (user_id, server_updated_at);
create index if not exists objects_sync_idx on public.objects (user_id, server_updated_at);

-- 어떤 경로로 쓰든 서버 시각이 항상 갱신되도록 트리거로 박아둔다.
create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists days_touch on public.days;
create trigger days_touch before insert or update on public.days
  for each row execute function public.touch_server_updated_at();

drop trigger if exists objects_touch on public.objects;
create trigger objects_touch before insert or update on public.objects
  for each row execute function public.touch_server_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before insert or update on public.settings
  for each row execute function public.touch_server_updated_at();

-- 내 기록은 나만 읽고 쓴다.
alter table public.days enable row level security;
alter table public.objects enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own days" on public.days;
create policy "own days" on public.days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own objects" on public.objects;
create policy "own objects" on public.objects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── 안전한 올리기 ───────────────────────────────────────────────────────────
-- 그냥 upsert를 하면, 오랫동안 안 켰던 기기가 로그인하는 순간 자기가 가진
-- 옛날 값으로 서버의 최신본을 덮어쓴다. 그래서 '더 새것일 때만 내용을 바꾸는'
-- 병합을 서버에서 한다.
--
-- 내용을 바꾸지 않는 경우에도 update 자체는 수행한다. 그래야 트리거가 돌아
-- server_updated_at이 올라가고, 옛 값을 보낸 기기가 다음 조회에서 최신본을
-- 받아가 결국 양쪽이 같아진다.

create or replace function public.merge_days(rows jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.days as d (user_id, date, data, updated_at)
  select auth.uid(), r ->> 'date', r -> 'data', (r ->> 'updated_at')::bigint
  from jsonb_array_elements(rows) as r
  on conflict (user_id, date) do update
    set data = case when excluded.updated_at > d.updated_at then excluded.data else d.data end,
        updated_at = greatest(excluded.updated_at, d.updated_at);
end;
$$;

create or replace function public.merge_objects(rows jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.objects as o (user_id, kind, id, data, deleted, updated_at)
  select
    auth.uid(),
    r ->> 'kind',
    r ->> 'id',
    r -> 'data',
    coalesce((r ->> 'deleted')::boolean, false),
    (r ->> 'updated_at')::bigint
  from jsonb_array_elements(rows) as r
  on conflict (user_id, kind, id) do update
    set data = case when excluded.updated_at > o.updated_at then excluded.data else o.data end,
        deleted = case when excluded.updated_at > o.updated_at then excluded.deleted else o.deleted end,
        updated_at = greatest(excluded.updated_at, o.updated_at);
end;
$$;

create or replace function public.merge_settings(payload jsonb, at bigint)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.settings as s (user_id, data, updated_at)
  values (auth.uid(), payload, at)
  on conflict (user_id) do update
    set data = case when excluded.updated_at > s.updated_at then excluded.data else s.data end,
        updated_at = greatest(excluded.updated_at, s.updated_at);
end;
$$;

-- ─── 옛 테이블 옮기기 ────────────────────────────────────────────────────────
-- 사람과 콘텐츠가 각자 테이블을 쓰던 시절의 줄을 objects로 옮긴다.
-- 그 테이블이 없는 계정(처음 설치)에서는 그냥 건너뛴다. 옛 테이블은 지우지
-- 않고 그대로 남겨둔다 — 옮기다 잘못돼도 돌아갈 곳이 있어야 한다.

do $$
begin
  if to_regclass('public.people') is not null then
    insert into public.objects (user_id, kind, id, data, deleted, updated_at)
    select user_id, 'person', id, data, deleted, updated_at from public.people
    on conflict (user_id, kind, id) do nothing;
  end if;

  if to_regclass('public.content') is not null then
    insert into public.objects (user_id, kind, id, data, deleted, updated_at)
    select user_id, 'content', id, data, deleted, updated_at from public.content
    on conflict (user_id, kind, id) do nothing;
  end if;

  -- 독서만 있던 더 이전 시절의 이름
  if to_regclass('public.books') is not null then
    insert into public.objects (user_id, kind, id, data, deleted, updated_at)
    select user_id, 'content', id, data, deleted, updated_at from public.books
    on conflict (user_id, kind, id) do nothing;
  end if;
end $$;
