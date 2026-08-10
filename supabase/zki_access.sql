-- Acceso de solo lectura para el módulo protegido People / ZKI.
-- La aplicación consulta con el JWT del usuario autenticado; sin esta policy,
-- PostgREST responde 200 con una lista vacía aunque la tabla tenga registros.

alter table public."ZKI" enable row level security;

grant select on table public."ZKI" to authenticated;

drop policy if exists "zki lectura autenticados" on public."ZKI";
create policy "zki lectura autenticados"
on public."ZKI"
for select
to authenticated
using (true);
