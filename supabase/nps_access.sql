-- Permisos RLS para el módulo protegido People / NPS.
-- La importación reemplaza las filas de las fechas incluidas en el Excel:
-- primero consulta, después elimina esas fechas y finalmente inserta el archivo.

alter table public."NPS" enable row level security;

grant select, insert, delete on table public."NPS" to authenticated;

drop policy if exists "nps lectura people admin" on public."NPS";
create policy "nps lectura people admin"
on public."NPS"
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'people@transporte.com',
    'admin@bavaria-seguimiento.com'
  )
);

drop policy if exists "nps insercion people admin" on public."NPS";
create policy "nps insercion people admin"
on public."NPS"
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'people@transporte.com',
    'admin@bavaria-seguimiento.com'
  )
);

drop policy if exists "nps eliminacion people admin" on public."NPS";
create policy "nps eliminacion people admin"
on public."NPS"
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'people@transporte.com',
    'admin@bavaria-seguimiento.com'
  )
);
