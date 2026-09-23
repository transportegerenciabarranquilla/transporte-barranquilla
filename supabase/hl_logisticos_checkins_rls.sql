-- Permite a HL guardar y consultar sus checkins con la sesión de usuario.
-- Ejecutar en el SQL Editor si el servidor no dispone de credenciales de servicio.
begin;

alter table public.checkins_cajas enable row level security;
grant select, insert, update, delete on table public.checkins_cajas to authenticated;

drop policy if exists hl_logisticos_checkins_all on public.checkins_cajas;
create policy hl_logisticos_checkins_all
on public.checkins_cajas
for all
to authenticated
using (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and lower(trim(contractor)) in ('hl logisticos', 'hl logistica', 'hl logísticos')
)
with check (
  lower((select auth.jwt()) ->> 'email') = 'hllogistica@gmail.com'
  and lower(trim(contractor)) in ('hl logisticos', 'hl logistica', 'hl logísticos')
);

notify pgrst, 'reload schema';
commit;
