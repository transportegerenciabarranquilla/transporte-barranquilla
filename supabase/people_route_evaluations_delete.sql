-- Ejecutar en Supabase cuando el servidor usa la sesión del usuario sin clave administrativa.
-- Mantiene el mismo alcance que la lectura y edición de evaluaciones.
begin;
grant delete on public.people_route_evaluations to authenticated;
drop policy if exists people_route_evaluations_delete on public.people_route_evaluations;
create policy people_route_evaluations_delete on public.people_route_evaluations
  for delete to authenticated
  using (lower((select auth.jwt()) ->> 'email') in (
    'people@transporte.com', 'admin@bavaria-seguimiento.com', 'saul808c@gmail.com'
  ));
notify pgrst, 'reload schema';
commit;
