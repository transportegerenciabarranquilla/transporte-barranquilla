-- Ejecutar en Supabase si el servidor usa la sesión del usuario sin una clave administrativa.
-- Conserva el mismo alcance de la política existente de lectura: People y administradores.
begin;
grant update (answers) on public.people_route_evaluations to authenticated;
drop policy if exists people_route_evaluations_update on public.people_route_evaluations;
create policy people_route_evaluations_update on public.people_route_evaluations
  for update to authenticated
  using (lower((select auth.jwt()) ->> 'email') in (
    'people@transporte.com', 'admin@bavaria-seguimiento.com', 'saul808c@gmail.com'
  ))
  with check (lower((select auth.jwt()) ->> 'email') in (
    'people@transporte.com', 'admin@bavaria-seguimiento.com', 'saul808c@gmail.com'
  ));
notify pgrst, 'reload schema';
commit;
