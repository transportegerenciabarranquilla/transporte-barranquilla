create table if not exists public.daily_absenteeism (
  absence_id text primary key,
  contractor text not null,
  absence_date date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists daily_absenteeism_contractor_date_idx on public.daily_absenteeism (contractor, absence_date desc);
alter table public.daily_absenteeism enable row level security;
grant select, insert, update on public.daily_absenteeism to authenticated;
drop policy if exists "daily absenteeism lectura" on public.daily_absenteeism;
create policy "daily absenteeism lectura" on public.daily_absenteeism for select to authenticated using (true);
drop policy if exists "daily absenteeism escritura" on public.daily_absenteeism;
create policy "daily absenteeism escritura" on public.daily_absenteeism for insert to authenticated with check (true);
drop policy if exists "daily absenteeism actualizacion" on public.daily_absenteeism;
create policy "daily absenteeism actualizacion" on public.daily_absenteeism for update to authenticated using (true) with check (true);
