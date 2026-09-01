-- Protección permanente de los DT de Seguimiento.
-- Ejecutar una vez en Supabase > SQL Editor como propietario del proyecto.

alter table public.seguimiento_vehiculos enable row level security;

revoke delete on table public.seguimiento_vehiculos from anon;
revoke delete on table public.seguimiento_vehiculos from authenticated;
grant delete on table public.seguimiento_vehiculos to authenticated;

-- Se eliminan políticas DELETE anteriores porque las políticas permisivas de
-- PostgreSQL se combinan con OR y cualquiera de ellas podría reabrir el acceso.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'seguimiento_vehiculos'
      and cmd = 'DELETE'
  loop
    execute format('drop policy %I on public.seguimiento_vehiculos', policy_name);
  end loop;
end
$$;

create policy "seguimiento elimina solo propietario seguridad"
on public.seguimiento_vehiculos
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'saul808c@gmail.com'
);

-- La política RLS protege las solicitudes autenticadas. Este trigger agrega
-- una segunda barrera y también bloquea service_role, SQL accidental y otros
-- procesos que normalmente omiten RLS.
create or replace function public.protect_seguimiento_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'saul808c@gmail.com' then
    raise exception 'Los DT de seguimiento son permanentes; eliminación no autorizada.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

drop trigger if exists protect_seguimiento_delete on public.seguimiento_vehiculos;
create trigger protect_seguimiento_delete
before delete on public.seguimiento_vehiculos
for each row
execute function public.protect_seguimiento_delete();

