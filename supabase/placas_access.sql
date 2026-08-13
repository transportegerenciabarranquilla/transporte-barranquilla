-- Acceso de lectura para el administrador de vehículos del módulo People / ZKI.
-- Ejecutar una sola vez en Supabase > SQL Editor.

alter table public.placas enable row level security;

grant select on table public.placas to authenticated;

drop policy if exists "placas lectura people admin" on public.placas;
create policy "placas lectura people admin"
on public.placas
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'people@transporte.com',
    'admin@bavaria-seguimiento.com'
  )
);
