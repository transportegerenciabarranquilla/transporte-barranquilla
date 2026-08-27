-- Permisos del modulo administrativo Estatus Liq.
-- La tabla ya existe con identificadores entre comillas por el guion y el
-- espacio de la columna "Hora liquidacion".

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public."status-liq" to authenticated;

alter table public."status-liq" enable row level security;

drop policy if exists "status-liq lectura administracion" on public."status-liq";
create policy "status-liq lectura administracion"
on public."status-liq"
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com'
  )
);

drop policy if exists "status-liq carga administracion" on public."status-liq";
create policy "status-liq carga administracion"
on public."status-liq"
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com'
  )
);

drop policy if exists "status-liq actualiza administracion" on public."status-liq";
create policy "status-liq actualiza administracion"
on public."status-liq"
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com'
  )
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com'
  )
);

drop policy if exists "status-liq elimina administracion" on public."status-liq";
create policy "status-liq elimina administracion"
on public."status-liq"
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com'
  )
);
