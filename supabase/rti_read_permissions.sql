-- Permisos de lectura para el modulo RTI y el cruce del panel Admin.
-- Ejecutar en Supabase > SQL Editor con un usuario propietario del proyecto.

alter table public."RACOCIMI1" enable row level security;
alter table public."RACOCIMI2" enable row level security;
alter table public."SKU" enable row level security;

grant usage on schema public to authenticated;
grant select on table public."RACOCIMI1", public."RACOCIMI2", public."SKU" to authenticated;

drop policy if exists "RTI lectura administracion y people" on public."RACOCIMI1";
create policy "RTI lectura administracion y people"
on public."RACOCIMI1"
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'people@transporte.com'
  )
);

drop policy if exists "RTI lectura administracion y people" on public."RACOCIMI2";
create policy "RTI lectura administracion y people"
on public."RACOCIMI2"
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'people@transporte.com'
  )
);

drop policy if exists "RTI lectura administracion y people" on public."SKU";
create policy "RTI lectura administracion y people"
on public."SKU"
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'people@transporte.com'
  )
);
