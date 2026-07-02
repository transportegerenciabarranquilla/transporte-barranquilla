begin;

create or replace function public.normalize_contractor_label(value text)
returns text
language sql
immutable
as $$
  select case regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g')
    when 'logisticos' then 'Logisticos'
    when 'puntocorona' then 'Punto Corona'
    when 'surticervezas' then 'Surti Cervezas'
    when 'logisticosarenosa' then 'Logisticos Arenosa'
    when 'coronaarenosa' then 'Punto Corona Arenosa'
    when 'puntocoronaarenosa' then 'Punto Corona Arenosa'
    else null
  end
$$;

create or replace function public.current_contractor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case lower(auth.jwt()->>'email')
    when 'logisticos@bavaria-seguimiento.com' then 'Logisticos'
    when 'puntocorona@bavaria-seguimiento.com' then 'Punto Corona'
    when 'surticervezas@bavaria-seguimiento.com' then 'Surti Cervezas'
    when 'logisticos@transporte.com' then 'Logisticos Arenosa'
    when 'corona@transporte.com' then 'Punto Corona Arenosa'
    else null
  end
$$;

create table if not exists public.punto_corona_route_reports (
  report_id text primary key,
  contractor text not null,
  operational_date date not null,
  kind text not null check (kind in ('current', 'closure')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.punto_corona_route_reports enable row level security;

drop policy if exists "punto corona rutas acceso" on public.punto_corona_route_reports;
drop policy if exists "rango rutas acceso" on public.punto_corona_route_reports;
create policy "rango rutas acceso" on public.punto_corona_route_reports
for all to authenticated
using (public.normalize_contractor_label(contractor) = public.current_contractor())
with check (public.normalize_contractor_label(contractor) = public.current_contractor());

revoke all on public.punto_corona_route_reports from anon;
grant usage on schema public to authenticated;
grant execute on function public.normalize_contractor_label(text) to authenticated;
grant execute on function public.current_contractor() to authenticated;
grant select, insert, update, delete on public.punto_corona_route_reports to authenticated;

notify pgrst, 'reload schema';

commit;
