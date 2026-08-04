create table if not exists public.daily_route_checklists (
  checklist_id text primary key,
  contractor text not null,
  checklist_date date not null,
  checklist_type text not null check (checklist_type in ('departure', 'return')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists daily_route_checklists_contractor_date_idx
on public.daily_route_checklists (contractor, checklist_date desc);

alter table public.daily_route_checklists enable row level security;
grant select, insert, update on public.daily_route_checklists to authenticated;

drop policy if exists "daily checklists lectura" on public.daily_route_checklists;
create policy "daily checklists lectura" on public.daily_route_checklists for select to authenticated using (true);
drop policy if exists "daily checklists escritura" on public.daily_route_checklists;
create policy "daily checklists escritura" on public.daily_route_checklists for insert to authenticated with check (true);
drop policy if exists "daily checklists actualizacion" on public.daily_route_checklists;
create policy "daily checklists actualizacion" on public.daily_route_checklists for update to authenticated using (true) with check (true);
