begin;

alter table public.seguimiento_vehiculos add column if not exists contractor text;
alter table public.asistencias_ruta add column if not exists contractor text;
alter table public.checkins_cajas add column if not exists contractor text;
alter table public.modulaciones_ruta add column if not exists contractor text;

update public.seguimiento_vehiculos
set contractor = coalesce(data->>'transportista', data->>'contratista')
where contractor is null;

update public.asistencias_ruta
set contractor = data->>'contratista'
where contractor is null;

update public.checkins_cajas as checkin
set contractor = seguimiento.contractor
from public.seguimiento_vehiculos as seguimiento
where checkin.contractor is null
  and regexp_replace(coalesce(checkin.data->>'dt', ''), '[^0-9]', '', 'g') =
      regexp_replace(coalesce(seguimiento.data->>'transporte', ''), '[^0-9]', '', 'g');

update public.modulaciones_ruta as modulacion
set contractor = seguimiento.contractor
from public.seguimiento_vehiculos as seguimiento
where modulacion.contractor is null
  and regexp_replace(coalesce(modulacion.data->>'dt', ''), '[^0-9]', '', 'g') =
      regexp_replace(coalesce(seguimiento.data->>'transporte', ''), '[^0-9]', '', 'g');

commit;

drop policy if exists "personal lectura" on public.transporte_barranquilla;
create policy "personal lectura" on public.transporte_barranquilla
for select to anon, authenticated using (true);

drop policy if exists "asistencias captura publica" on public.asistencias_ruta;
drop policy if exists "asistencias actualizacion publica" on public.asistencias_ruta;
create policy "asistencias captura publica" on public.asistencias_ruta
for insert to anon
with check (regexp_replace(lower(data->>'contratista'), '[^a-z0-9]', '', 'g') in ('logisticos', 'puntocorona', 'surticervezas'));
create policy "asistencias actualizacion publica" on public.asistencias_ruta
for update to anon
using (regexp_replace(lower(data->>'contratista'), '[^a-z0-9]', '', 'g') in ('logisticos', 'puntocorona', 'surticervezas'))
with check (regexp_replace(lower(data->>'contratista'), '[^a-z0-9]', '', 'g') in ('logisticos', 'puntocorona', 'surticervezas'));

grant select on public.transporte_barranquilla to anon;
grant insert, update on public.asistencias_ruta to anon;

create or replace function public.current_contractor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case lower(auth.jwt()->>'email')
    when 'logisticos@bavaria-seguimiento.com' then 'Logisticos'
    when 'puntocorona@bavaria-seguimiento.com' then 'Punto Corona'
    when 'surticervezas@bavaria-seguimiento.com' then 'Surti Cervezas'
    else null
  end
$$;

drop policy if exists "seguimiento lectura" on public.seguimiento_vehiculos;
drop policy if exists "seguimiento escritura" on public.seguimiento_vehiculos;
drop policy if exists "asistencias lectura" on public.asistencias_ruta;
drop policy if exists "asistencias escritura" on public.asistencias_ruta;
drop policy if exists "checkins acceso" on public.checkins_cajas;
drop policy if exists "modulaciones acceso" on public.modulaciones_ruta;

create policy "seguimiento lectura" on public.seguimiento_vehiculos
for select to authenticated using (data->>'transportista' = public.current_contractor());
create policy "seguimiento escritura" on public.seguimiento_vehiculos
for all to authenticated
using (data->>'transportista' = public.current_contractor())
with check (data->>'transportista' = public.current_contractor());
create policy "asistencias lectura" on public.asistencias_ruta
for select to authenticated using (data->>'contratista' = public.current_contractor());
create policy "asistencias escritura" on public.asistencias_ruta
for all to authenticated
using (data->>'contratista' = public.current_contractor())
with check (data->>'contratista' = public.current_contractor());
create policy "checkins acceso" on public.checkins_cajas
for all to authenticated
using (data->>'contratista' = public.current_contractor())
with check (data->>'contratista' = public.current_contractor());
create policy "modulaciones acceso" on public.modulaciones_ruta
for all to authenticated
using (data->>'contratista' = public.current_contractor())
with check (data->>'contratista' = public.current_contractor());

grant select, insert, update, delete on public.seguimiento_vehiculos, public.asistencias_ruta, public.checkins_cajas, public.modulaciones_ruta to authenticated;

notify pgrst, 'reload schema';
