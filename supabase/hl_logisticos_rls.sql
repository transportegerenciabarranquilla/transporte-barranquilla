-- Autoriza solamente a la cuenta de HL Logísticos sobre sus propias filas.
-- Ejecutar en el SQL Editor de Supabase. Es aditivo: no reemplaza las
-- políticas existentes de las demás contratistas.
begin;

alter table public.seguimiento_vehiculos enable row level security;
alter table public.asistencias_ruta enable row level security;
alter table public.modulaciones_ruta enable row level security;

grant select, insert, update on table public.seguimiento_vehiculos to authenticated;
grant select, insert, update, delete on table public.asistencias_ruta to authenticated;
grant select, insert, update, delete on table public.modulaciones_ruta to authenticated;

drop policy if exists hl_logisticos_seguimiento_select on public.seguimiento_vehiculos;
create policy hl_logisticos_seguimiento_select
on public.seguimiento_vehiculos
for select
to authenticated
using (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
);

drop policy if exists hl_logisticos_seguimiento_insert on public.seguimiento_vehiculos;
create policy hl_logisticos_seguimiento_insert
on public.seguimiento_vehiculos
for insert
to authenticated
with check (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
);

drop policy if exists hl_logisticos_seguimiento_update on public.seguimiento_vehiculos;
create policy hl_logisticos_seguimiento_update
on public.seguimiento_vehiculos
for update
to authenticated
using (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
)
with check (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
);

drop policy if exists hl_logisticos_asistencia_all on public.asistencias_ruta;
create policy hl_logisticos_asistencia_all
on public.asistencias_ruta
for all
to authenticated
using (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
)
with check (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
);

drop policy if exists hl_logisticos_modulaciones_all on public.modulaciones_ruta;
create policy hl_logisticos_modulaciones_all
on public.modulaciones_ruta
for all
to authenticated
using (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
)
with check (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and contractor in ('HL Logisticos', 'HL Logistica')
);

notify pgrst, 'reload schema';
commit;

-- Verificación de configuración (no muestra datos operativos):
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('seguimiento_vehiculos', 'asistencias_ruta', 'modulaciones_ruta')
  and policyname like 'hl_logisticos_%'
order by tablename, policyname;
