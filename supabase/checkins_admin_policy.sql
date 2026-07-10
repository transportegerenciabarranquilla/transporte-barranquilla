grant usage on schema public to authenticated;
grant select on public.checkins_cajas to authenticated;

drop policy if exists checkins_select_by_contractor_or_admin on public.checkins_cajas;

create policy checkins_select_by_contractor_or_admin
  on public.checkins_cajas
  for select
  to authenticated
  using (
    lower(coalesce(auth.jwt()->>'email', '')) = 'admin@bavaria-seguimiento.com'
    or contractor = case lower(coalesce(auth.jwt()->>'email', ''))
      when 'logisticos@bavaria-seguimiento.com' then 'Logisticos'
      when 'puntocorona@bavaria-seguimiento.com' then 'Punto Corona'
      when 'surticervezas@bavaria-seguimiento.com' then 'Surti Cervezas'
      when 'logisticos@transporte.com' then 'Logisticos Arenosa'
      when 'corona@transporte.com' then 'Punto Corona Arenosa'
      else ''
    end
  );
