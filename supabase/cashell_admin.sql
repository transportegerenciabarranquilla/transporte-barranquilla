-- Permisos del modulo administrativo Acuerdo CASHELL.
-- Ejecutar en Supabase > SQL Editor.

alter table public."CASHELL" enable row level security;

grant select on table public."CASHELL" to authenticated;

drop policy if exists "CASHELL lectura administracion" on public."CASHELL";
create policy "CASHELL lectura administracion"
on public."CASHELL"
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com'
  )
);

revoke insert, update, delete, truncate, references, trigger
on table public."CASHELL"
from authenticated;
