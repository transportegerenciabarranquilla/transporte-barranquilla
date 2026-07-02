begin;

create table if not exists public.people_profiles (
  profile_id text primary key,
  contractor text not null,
  cc text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.current_is_people()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(auth.jwt()->>'email') = 'people@transporte.com'
$$;

grant execute on function public.current_is_people() to authenticated;

alter table public.people_profiles enable row level security;

drop policy if exists "people profiles acceso" on public.people_profiles;
create policy "people profiles acceso" on public.people_profiles
for all to authenticated
using (lower(auth.jwt()->>'email') = 'admin@bavaria-seguimiento.com' or public.current_is_people())
with check (lower(auth.jwt()->>'email') = 'admin@bavaria-seguimiento.com' or public.current_is_people());

drop policy if exists "people seguimiento lectura" on public.seguimiento_vehiculos;
create policy "people seguimiento lectura" on public.seguimiento_vehiculos
for select to authenticated
using (public.current_is_people());

drop policy if exists "people asistencias lectura" on public.asistencias_ruta;
create policy "people asistencias lectura" on public.asistencias_ruta
for select to authenticated
using (public.current_is_people());

drop policy if exists "people checkins lectura" on public.checkins_cajas;
create policy "people checkins lectura" on public.checkins_cajas
for select to authenticated
using (public.current_is_people());

drop policy if exists "people modulaciones lectura" on public.modulaciones_ruta;
create policy "people modulaciones lectura" on public.modulaciones_ruta
for select to authenticated
using (public.current_is_people());

drop policy if exists "people personal lectura" on public.transporte_barranquilla;
create policy "people personal lectura" on public.transporte_barranquilla
for select to authenticated
using (public.current_is_people());

grant usage on schema public to authenticated;
grant select on public.seguimiento_vehiculos to authenticated;
grant select on public.asistencias_ruta to authenticated;
grant select on public.checkins_cajas to authenticated;
grant select on public.modulaciones_ruta to authenticated;
grant select on public.transporte_barranquilla to authenticated;
grant select, insert, update, delete on public.people_profiles to authenticated;

notify pgrst, 'reload schema';

commit;
