-- CREATIVE STUDIO v1 / Supabase
-- まず app_state で既存アプリをPC/iPhone同期。下段の正規化テーブルはv1移行用。

create extension if not exists pgcrypto;

create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
drop policy if exists "app_state_owner_all" on public.app_state;
create policy "app_state_owner_all" on public.app_state
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  main_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'active',
  priority text not null default 'medium',
  color text,
  start_date date,
  due_date date,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status text not null default 'creating',
  due_date date,
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date date,
  sort_order int not null default 0,
  is_stay boolean not null default false,
  why_now text,
  completed_at timestamptz,
  total_work_seconds int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quick_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  due_date date,
  repeat_rule text,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creative_task_id uuid not null references public.creative_tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now()
);

create table if not exists public.flow_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.flow_templates(id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  default_priority text not null default 'medium',
  created_at timestamptz not null default now()
);

-- RLS: 自分のデータだけ読書き可能
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.deliverables enable row level security;
alter table public.creative_tasks enable row level security;
alter table public.quick_tasks enable row level security;
alter table public.work_sessions enable row level security;
alter table public.flow_templates enable row level security;
alter table public.flow_template_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clients','projects','deliverables','creative_tasks','quick_tasks','work_sessions','flow_templates'] loop
    execute format('drop policy if exists owner_all on public.%I',t);
    execute format('create policy owner_all on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',t);
  end loop;
end $$;

-- flow_template_steps は template の所有者経由で制限
drop policy if exists "template_steps_owner_all" on public.flow_template_steps;
create policy "template_steps_owner_all" on public.flow_template_steps
for all
using (exists (select 1 from public.flow_templates f where f.id=template_id and f.user_id=auth.uid()))
with check (exists (select 1 from public.flow_templates f where f.id=template_id and f.user_id=auth.uid()));

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_deliverables_project on public.deliverables(project_id);
create index if not exists idx_tasks_user_due on public.creative_tasks(user_id,due_date);
create index if not exists idx_tasks_deliverable_order on public.creative_tasks(deliverable_id,sort_order);
create index if not exists idx_quick_user_due on public.quick_tasks(user_id,due_date);
create index if not exists idx_sessions_task on public.work_sessions(creative_task_id,started_at desc);
