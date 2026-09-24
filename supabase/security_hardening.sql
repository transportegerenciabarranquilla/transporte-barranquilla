-- Migración separada, NO ejecutada por la auditoría.
-- Ejecutar primero security_audit_readonly.sql; probar en staging.
-- No elimina datos ni modifica los formularios públicos de coordenadas.
begin;

drop policy if exists hl_logisticos_modulaciones_all on public.modulaciones_ruta;
create policy hl_logisticos_modulaciones_all on public.modulaciones_ruta
for all to authenticated
using (lower((select auth.jwt())->>'email') = 'hllogistica@gmail.com'
  and lower(trim(contractor)) in ('hl logisticos','hl logistica','hl logísticos'))
with check (lower((select auth.jwt())->>'email') = 'hllogistica@gmail.com'
  and lower(trim(contractor)) in ('hl logisticos','hl logistica','hl logísticos'));

-- Las policies permisivas se suman mediante OR: comprobar las restantes.
drop policy if exists "users manage own push subscription" on public.push_subscriptions;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

-- Complementa los filtros de la API frente a cambios de propietario y carreras.
-- No agrega permisos. La API conserva actualizaciones normales del mismo dueño.
create or replace function public.security_keep_contractor()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.contractor is distinct from new.contractor
    and regexp_replace(lower(normalize(coalesce(old.contractor,''), NFD)), '[^a-z0-9]', '', 'g')
      is distinct from regexp_replace(lower(normalize(coalesce(new.contractor,''), NFD)), '[^a-z0-9]', '', 'g') then
    -- Variantes históricas de HL representan el mismo propietario.
    if not (lower(trim(coalesce(old.contractor,''))) in ('hl logisticos','hl logistica','hl logísticos')
        and lower(trim(coalesce(new.contractor,''))) in ('hl logisticos','hl logistica','hl logísticos')) then
      raise exception 'No se permite cambiar el propietario del registro' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.security_keep_contractor() from public, anon, authenticated;

do $$
declare target text;
begin
  foreach target in array array['seguimiento_vehiculos','asistencias_ruta','modulaciones_ruta','punto_corona_route_reports','checkins_cajas'] loop
    execute format('drop trigger if exists security_keep_contractor on public.%I', target);
    execute format('create trigger security_keep_contractor before update on public.%I for each row execute function public.security_keep_contractor()', target);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;

-- Transferencias legítimas e históricos con contractor NULL requieren un proceso
-- administrativo explícito; revisar antes de activar el trigger en producción.
