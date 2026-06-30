create table if not exists public.punto_corona_route_reports (
  report_id text primary key,
  contractor text not null default 'Punto Corona',
  operational_date date not null,
  kind text not null check (kind in ('current', 'closure')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.punto_corona_route_reports enable row level security;

drop policy if exists "punto corona rutas acceso" on public.punto_corona_route_reports;
create policy "punto corona rutas acceso" on public.punto_corona_route_reports
for all to authenticated
using (public.current_contractor() = 'Punto Corona' and public.normalize_contractor_label(contractor) = 'Punto Corona')
with check (public.current_contractor() = 'Punto Corona' and public.normalize_contractor_label(contractor) = 'Punto Corona');

revoke all on public.punto_corona_route_reports from anon;
grant select, insert, update, delete on public.punto_corona_route_reports to authenticated;

notify pgrst, 'reload schema';
