begin;

alter table public.seguimiento_vehiculos add column if not exists contractor text;
alter table public.asistencias_ruta add column if not exists contractor text;
alter table public.checkins_cajas add column if not exists contractor text;
alter table public.modulaciones_ruta add column if not exists contractor text;

create or replace function public.normalize_contractor_label(value text)
returns text
language sql
immutable
as $$
  select case regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g')
    when 'logisticos' then 'Logisticos'
    when 'puntocorona' then 'Punto Corona'
    when 'surticervezas' then 'Surti Cervezas'
    else null
  end
$$;

update public.seguimiento_vehiculos
set contractor = public.normalize_contractor_label(coalesce(contractor, data->>'transportista', data->>'contratista'))
where contractor is null or public.normalize_contractor_label(contractor) is not null;

update public.asistencias_ruta
set contractor = public.normalize_contractor_label(coalesce(contractor, data->>'contratista'))
where contractor is null or public.normalize_contractor_label(contractor) is not null;

update public.checkins_cajas
set contractor = public.normalize_contractor_label(coalesce(contractor, data->>'contratista'))
where contractor is null or public.normalize_contractor_label(contractor) is not null;

update public.modulaciones_ruta
set contractor = public.normalize_contractor_label(coalesce(contractor, data->>'contratista'))
where contractor is null or public.normalize_contractor_label(contractor) is not null;

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

create or replace function public.set_contractor_from_data()
returns trigger
language plpgsql
as $$
begin
  new.contractor := public.normalize_contractor_label(
    coalesce(new.contractor, new.data->>'transportista', new.data->>'contratista')
  );
  return new;
end;
$$;

drop trigger if exists seguimiento_set_contractor on public.seguimiento_vehiculos;
create trigger seguimiento_set_contractor
before insert or update on public.seguimiento_vehiculos
for each row execute function public.set_contractor_from_data();

drop trigger if exists asistencias_set_contractor on public.asistencias_ruta;
create trigger asistencias_set_contractor
before insert or update on public.asistencias_ruta
for each row execute function public.set_contractor_from_data();

drop trigger if exists checkins_set_contractor on public.checkins_cajas;
create trigger checkins_set_contractor
before insert or update on public.checkins_cajas
for each row execute function public.set_contractor_from_data();

drop trigger if exists modulaciones_set_contractor on public.modulaciones_ruta;
create trigger modulaciones_set_contractor
before insert or update on public.modulaciones_ruta
for each row execute function public.set_contractor_from_data();

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

create or replace function public.current_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(auth.jwt()->>'email') = 'admin@bavaria-seguimiento.com'
$$;

create or replace function public.current_is_people()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(auth.jwt()->>'email') = 'people@transporte.com'
$$;

alter table public.seguimiento_vehiculos enable row level security;
alter table public.asistencias_ruta enable row level security;
alter table public.checkins_cajas enable row level security;
alter table public.modulaciones_ruta enable row level security;
alter table public.transporte_barranquilla enable row level security;
alter table public.clientes enable row level security;
alter table public.capacidad_carga enable row level security;

drop policy if exists "seguimiento lectura" on public.seguimiento_vehiculos;
drop policy if exists "seguimiento escritura" on public.seguimiento_vehiculos;
drop policy if exists "seguimiento lectura publica" on public.seguimiento_vehiculos;
drop policy if exists "asistencias lectura" on public.asistencias_ruta;
drop policy if exists "asistencias escritura" on public.asistencias_ruta;
drop policy if exists "asistencias lectura publica" on public.asistencias_ruta;
drop policy if exists "checkins acceso" on public.checkins_cajas;
drop policy if exists "modulaciones acceso" on public.modulaciones_ruta;
drop policy if exists "personal lectura" on public.transporte_barranquilla;
drop policy if exists "clientes lectura publica" on public.clientes;
drop policy if exists "capacidad carga lectura" on public.capacidad_carga;
drop policy if exists "asistencias captura publica" on public.asistencias_ruta;
drop policy if exists "asistencias actualizacion publica" on public.asistencias_ruta;
drop policy if exists "modulaciones captura publica" on public.modulaciones_ruta;
drop policy if exists "modulaciones actualizacion publica" on public.modulaciones_ruta;

create policy "seguimiento lectura" on public.seguimiento_vehiculos
for select to authenticated
using (
  public.current_is_admin()
  or public.current_is_people()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
);

create policy "seguimiento escritura" on public.seguimiento_vehiculos
for all to authenticated
using (
  public.current_is_admin()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
)
with check (
  public.current_is_admin()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
);

create policy "seguimiento lectura publica" on public.seguimiento_vehiculos
for select to anon
using (public.normalize_contractor_label(contractor) is not null);

create policy "asistencias lectura" on public.asistencias_ruta
for select to authenticated
using (
  public.current_is_admin()
  or public.current_is_people()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
);

create policy "asistencias escritura" on public.asistencias_ruta
for all to authenticated
using (
  public.current_is_admin()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
)
with check (
  public.current_is_admin()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
);

create policy "asistencias lectura publica" on public.asistencias_ruta
for select to anon
using (public.normalize_contractor_label(contractor) is not null);

create policy "checkins acceso" on public.checkins_cajas
for all to authenticated
using (
  public.current_is_admin()
  or public.current_is_people()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
)
with check (
  public.current_is_admin()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
);

create policy "modulaciones acceso" on public.modulaciones_ruta
for all to authenticated
using (
  public.current_is_admin()
  or public.current_is_people()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
)
with check (
  public.current_is_admin()
  or public.normalize_contractor_label(contractor) = public.current_contractor()
);

create policy "personal lectura" on public.transporte_barranquilla
for select to anon, authenticated
using (true);

create policy "clientes lectura publica" on public.clientes
for select to anon, authenticated
using (true);

create policy "capacidad carga lectura" on public.capacidad_carga
for select to anon, authenticated
using (true);

create policy "asistencias captura publica" on public.asistencias_ruta
for insert to anon
with check (true);

create policy "asistencias actualizacion publica" on public.asistencias_ruta
for update to anon
using (true)
with check (true);

create policy "modulaciones captura publica" on public.modulaciones_ruta
for insert to anon
with check (true);

create policy "modulaciones actualizacion publica" on public.modulaciones_ruta
for update to anon
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant execute on function public.normalize_contractor_label(text) to anon, authenticated;
grant execute on function public.set_contractor_from_data() to anon, authenticated;
grant execute on function public.current_contractor() to authenticated;
grant execute on function public.current_is_admin() to authenticated;
grant execute on function public.current_is_people() to authenticated;
grant select on public.transporte_barranquilla to anon, authenticated;
grant select on public.clientes, public.capacidad_carga to anon, authenticated;
grant select on public.seguimiento_vehiculos, public.asistencias_ruta to anon;
grant insert, update on public.asistencias_ruta, public.modulaciones_ruta to anon;
grant select, insert, update, delete on public.seguimiento_vehiculos, public.asistencias_ruta, public.checkins_cajas, public.modulaciones_ruta to authenticated;

notify pgrst, 'reload schema';

commit;
