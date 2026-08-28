-- Lectura requerida por "Planeacion de ayer" para cruzar:
-- conductor planeado -> asistencia/DT -> VH de salida.
-- Ejecutar una vez en Supabase > SQL Editor como propietario del proyecto.

alter table public.seguimiento_vehiculos enable row level security;
alter table public.asistencias_ruta enable row level security;

grant usage on schema public to authenticated;
grant select on table public.seguimiento_vehiculos, public.asistencias_ruta to authenticated;

drop policy if exists "ZKI adherencia lectura seguimiento" on public.seguimiento_vehiculos;
create policy "ZKI adherencia lectura seguimiento"
on public.seguimiento_vehiculos
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'people@transporte.com'
  )
);

drop policy if exists "ZKI adherencia lectura asistencias" on public.asistencias_ruta;
create policy "ZKI adherencia lectura asistencias"
on public.asistencias_ruta
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'people@transporte.com'
  )
);
