-- Permite que Control diario consulte el Excel de GeoVictoria guardado por
-- Gerencia. Solo habilita los snapshots attendance:* y únicamente para las
-- cuentas operativas de Logísticos; las escrituras continúan reservadas a
-- People/Admin por las políticas existentes.

alter table public.people_profiles enable row level security;

drop policy if exists "attendance snapshots lectura logisticos" on public.people_profiles;
create policy "attendance snapshots lectura logisticos"
on public.people_profiles
for select
to authenticated
using (
  profile_id like 'attendance:%'
  and lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'logisticos@bavaria-seguimiento.com',
    'logisticos@transporte.com'
  )
);
