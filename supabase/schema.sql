create table if not exists public.seguimiento_vehiculos (
  record_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.asistencias_ruta (
  attendance_key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.checkins_cajas (
  checkin_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.modulaciones_ruta (
  modulation_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.punto_corona_route_reports (
  report_id text primary key,
  contractor text not null default 'Punto Corona',
  operational_date date not null,
  kind text not null check (kind in ('current', 'closure')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  audit_id text primary key,
  action text not null,
  module text not null,
  contractor text not null,
  user_email text,
  ip_address text,
  user_agent text,
  device text,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.seguimiento_vehiculos add column if not exists contractor text;
alter table public.asistencias_ruta add column if not exists contractor text;
alter table public.checkins_cajas add column if not exists contractor text;
alter table public.modulaciones_ruta add column if not exists contractor text;
update public.seguimiento_vehiculos
set contractor = coalesce(data->>'transportista', data->>'contratista')
where contractor is null;

update public.seguimiento_vehiculos
set contractor = case regexp_replace(lower(contractor), '[^a-z0-9]', '', 'g')
  when 'logisticos' then 'Logisticos'
  when 'puntocorona' then 'Punto Corona'
  when 'surticervezas' then 'Surti Cervezas'
  else contractor
end;

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

alter table public.seguimiento_vehiculos enable row level security;
alter table public.asistencias_ruta enable row level security;
alter table public.checkins_cajas enable row level security;
alter table public.modulaciones_ruta enable row level security;
alter table public.punto_corona_route_reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.transporte_barranquilla enable row level security;

drop policy if exists "seguimiento lectura" on public.seguimiento_vehiculos;
drop policy if exists "seguimiento escritura" on public.seguimiento_vehiculos;
drop policy if exists "seguimiento lectura publica" on public.seguimiento_vehiculos;
drop policy if exists "asistencias lectura" on public.asistencias_ruta;
drop policy if exists "asistencias escritura" on public.asistencias_ruta;
drop policy if exists "asistencias lectura publica" on public.asistencias_ruta;
drop policy if exists "asistencias captura publica" on public.asistencias_ruta;
drop policy if exists "asistencias actualizacion publica" on public.asistencias_ruta;
drop policy if exists "personal lectura" on public.transporte_barranquilla;
drop policy if exists "checkins acceso" on public.checkins_cajas;
drop policy if exists "modulaciones acceso" on public.modulaciones_ruta;
drop policy if exists "punto corona rutas acceso" on public.punto_corona_route_reports;
drop policy if exists "auditoria lectura admin" on public.audit_logs;
drop policy if exists "auditoria escritura contratista" on public.audit_logs;

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

grant execute on function public.current_is_admin() to authenticated;

create policy "seguimiento lectura" on public.seguimiento_vehiculos
for select to authenticated using (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor());
create policy "seguimiento escritura" on public.seguimiento_vehiculos
for all to authenticated
using (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor())
with check (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor());
create policy "seguimiento lectura publica" on public.seguimiento_vehiculos
for select to anon using (public.normalize_contractor_label(contractor) is not null);
create policy "asistencias lectura" on public.asistencias_ruta
for select to authenticated using (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor());
create policy "asistencias lectura publica" on public.asistencias_ruta
for select to anon using (public.normalize_contractor_label(contractor) is not null);
create policy "asistencias escritura" on public.asistencias_ruta
for all to authenticated
using (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor())
with check (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor());
create policy "asistencias captura publica" on public.asistencias_ruta
for insert to anon
with check (regexp_replace(lower(data->>'contratista'), '[^a-z0-9]', '', 'g') in ('logisticos', 'puntocorona', 'surticervezas'));
create policy "asistencias actualizacion publica" on public.asistencias_ruta
for update to anon
using (regexp_replace(lower(data->>'contratista'), '[^a-z0-9]', '', 'g') in ('logisticos', 'puntocorona', 'surticervezas'))
with check (regexp_replace(lower(data->>'contratista'), '[^a-z0-9]', '', 'g') in ('logisticos', 'puntocorona', 'surticervezas'));
create policy "personal lectura" on public.transporte_barranquilla
for select to anon, authenticated using (true);
create policy "checkins acceso" on public.checkins_cajas
for all to authenticated
using (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor())
with check (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor());
create policy "modulaciones acceso" on public.modulaciones_ruta
for all to authenticated
using (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor())
with check (public.current_is_admin() or public.normalize_contractor_label(contractor) = public.current_contractor());
create policy "punto corona rutas acceso" on public.punto_corona_route_reports
for all to authenticated
using (public.current_contractor() = 'Punto Corona' and public.normalize_contractor_label(contractor) = 'Punto Corona')
with check (public.current_contractor() = 'Punto Corona' and public.normalize_contractor_label(contractor) = 'Punto Corona');
create policy "auditoria lectura admin" on public.audit_logs
for select to authenticated using (public.current_is_admin());
create policy "auditoria escritura contratista" on public.audit_logs
for insert to authenticated
with check (public.normalize_contractor_label(contractor) = public.current_contractor());

grant usage on schema public to anon, authenticated;
grant execute on function public.normalize_contractor_label(text) to anon, authenticated;
grant select, insert, update, delete on public.seguimiento_vehiculos to authenticated;
revoke all on public.seguimiento_vehiculos, public.asistencias_ruta, public.checkins_cajas, public.modulaciones_ruta, public.punto_corona_route_reports, public.audit_logs from anon;
revoke all on public.transporte_barranquilla from anon;
grant select on public.seguimiento_vehiculos to anon;
grant select, insert, update, delete on public.asistencias_ruta, public.checkins_cajas, public.modulaciones_ruta, public.punto_corona_route_reports to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select on public.transporte_barranquilla to authenticated;
grant select on public.transporte_barranquilla to anon;
grant select on public.asistencias_ruta to anon;
grant insert, update on public.asistencias_ruta to anon;
grant select on public.capacidad_carga to anon, authenticated;

alter table public.capacidad_carga enable row level security;
drop policy if exists "capacidad carga lectura" on public.capacidad_carga;
create policy "capacidad carga lectura" on public.capacidad_carga
for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
