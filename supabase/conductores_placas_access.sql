-- Permisos de lectura para la fuente de conductores y placas de Planeacion ZKI.
-- Ejecutar en Supabase > SQL Editor con un usuario propietario del proyecto.

alter table public."Conductores-placas" enable row level security;

grant usage on schema public to authenticated;
grant select on table public."Conductores-placas" to authenticated;

drop policy if exists "Conductores-placas lectura administracion y people"
on public."Conductores-placas";

create policy "Conductores-placas lectura administracion y people"
on public."Conductores-placas"
for select
to authenticated
using (true);
