-- Permisos de lectura para la tabla de barrios del modulo Rutas criticas.
-- Ejecutar una vez en Supabase > SQL Editor con un usuario propietario.

alter table public.ruta_criticas enable row level security;

grant usage on schema public to authenticated;
grant select on table public.ruta_criticas to authenticated;
grant usage on schema public to anon;
grant select on table public.ruta_criticas to anon;

drop policy if exists "Rutas criticas lectura administracion y people"
on public.ruta_criticas;

create policy "Rutas criticas lectura administracion y people"
on public.ruta_criticas
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'people@transporte.com'
  )
);

drop policy if exists "Rutas criticas lectura publica"
on public.ruta_criticas;

create policy "Rutas criticas lectura publica"
on public.ruta_criticas
for select
to anon
using (true);
