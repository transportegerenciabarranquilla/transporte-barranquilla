-- Persistencia del modulo Quejas. Ejecutar en Supabase > SQL Editor.
create table if not exists public.route_complaints (
  complaint_id text primary key,
  contractor text not null,
  created_date date not null,
  dt text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists route_complaints_contractor_date_idx on public.route_complaints (contractor, created_date desc);
alter table public.route_complaints enable row level security;
grant select, insert, update on table public.route_complaints to authenticated;

-- Resuelve la operacion real de una queja a partir del DT. Se ejecuta con los
-- permisos del propietario para que RLS pueda clasificar filas historicas
-- antes de decidir si Surti o Punto Corona pueden leerlas.
create or replace function public.resolve_complaint_contractor(
  complaint_dt text,
  complaint_date date,
  stored_contractor text
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select candidate.contractor
    from (
      select s.contractor, s.data ->> 'transporte' as dt,
        coalesce(
          case when coalesce(s.data ->> 'fechaDespacho', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(s.data ->> 'fechaDespacho', 1, 10)::date end,
          case when coalesce(s.data ->> 'fechaDt', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(s.data ->> 'fechaDt', 1, 10)::date end,
          case when coalesce(s.data ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(s.data ->> 'date', 1, 10)::date end,
          case when coalesce(s.data ->> 'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(s.data ->> 'createdAt', 1, 10)::date end
        ) as operational_date,
        s.updated_at,
        0 as source_priority
      from public.seguimiento_vehiculos s
      union all
      select a.contractor, a.data ->> 'dt',
        case when coalesce(a.data ->> 'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(a.data ->> 'createdAt', 1, 10)::date end,
        a.updated_at,
        1
      from public.asistencias_ruta a
      union all
      select m.contractor, m.data ->> 'dt',
        coalesce(
          case when coalesce(m.data ->> 'fechaDespacho', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(m.data ->> 'fechaDespacho', 1, 10)::date end,
          case when coalesce(m.data ->> 'fechaDt', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(m.data ->> 'fechaDt', 1, 10)::date end,
          case when coalesce(m.data ->> 'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}' then substring(m.data ->> 'createdAt', 1, 10)::date end
        ),
        m.updated_at,
        2
      from public.modulaciones_ruta m
    ) candidate
    where regexp_replace(coalesce(candidate.dt, ''), '\D', '', 'g') = regexp_replace(coalesce(complaint_dt, ''), '\D', '', 'g')
      and regexp_replace(coalesce(complaint_dt, ''), '\D', '', 'g') <> ''
    order by
      candidate.source_priority,
      case when candidate.operational_date is null or complaint_date is null then 1 else 0 end,
      abs(complaint_date - candidate.operational_date),
      case when candidate.contractor = stored_contractor then 0 else 1 end,
      candidate.updated_at desc
    limit 1
  ), stored_contractor);
$$;

revoke all on function public.resolve_complaint_contractor(text, date, text) from public;
grant execute on function public.resolve_complaint_contractor(text, date, text) to authenticated;

-- Permite que el modulo Quejas cruce DT de las tres operaciones sin exponer
-- el resto de Seguimiento ni depender de una service-role en el servidor.
create or replace function public.find_complaint_tracking(complaint_dts text[])
returns table(contractor text, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select candidate.contractor, candidate.data
  from (
    select s.contractor, s.data, 0 as source_priority, s.updated_at
    from public.seguimiento_vehiculos s
    union all
    select a.contractor, jsonb_build_object(
      'transporte', a.data ->> 'dt',
      'nombreResponsable', a.data ->> 'nombreResponsable',
      'cedulaResponsable', a.data ->> 'cedulaResponsable',
      'nombreAuxiliar1', a.data ->> 'nombreAuxiliar1',
      'cedulaAuxiliar1', a.data ->> 'cedulaAuxiliar1',
      'nombreAuxiliar2', a.data ->> 'nombreAuxiliar2',
      'cedulaAuxiliar2', a.data ->> 'cedulaAuxiliar2',
      'createdAt', a.data ->> 'createdAt'
    ), 1, a.updated_at
    from public.asistencias_ruta a
  ) candidate
  where lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'logisticos@bavaria-seguimiento.com',
    'puntocorona@bavaria-seguimiento.com',
    'surticervezas@bavaria-seguimiento.com'
  )
  and right(regexp_replace(coalesce(candidate.data ->> 'transporte', ''), '\D', '', 'g'), 10) = any (
    select right(regexp_replace(value, '\D', '', 'g'), 10) from unnest(complaint_dts) value
  )
  order by candidate.source_priority, candidate.updated_at desc;
$$;

revoke all on function public.find_complaint_tracking(text[]) from public;
grant execute on function public.find_complaint_tracking(text[]) to authenticated;

drop policy if exists "quejas lectura admin logisticos" on public.route_complaints;
create policy "quejas lectura admin logisticos" on public.route_complaints for select to authenticated using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@bavaria-seguimiento.com', 'saul808c@gmail.com')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'logisticos@bavaria-seguimiento.com' and contractor in ('Logisticos', 'Punto Corona', 'Surti Cervezas', 'Por identificar'))
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'puntocorona@bavaria-seguimiento.com' and public.resolve_complaint_contractor(dt, created_date, contractor) = 'Punto Corona')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'surticervezas@bavaria-seguimiento.com' and public.resolve_complaint_contractor(dt, created_date, contractor) = 'Surti Cervezas')
);

drop policy if exists "quejas carga admin logisticos" on public.route_complaints;
create policy "quejas carga admin logisticos" on public.route_complaints for insert to authenticated with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@bavaria-seguimiento.com', 'saul808c@gmail.com')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'logisticos@bavaria-seguimiento.com' and contractor in ('Logisticos', 'Punto Corona', 'Surti Cervezas', 'Por identificar'))
);

drop policy if exists "quejas actualiza admin logisticos" on public.route_complaints;
create policy "quejas actualiza admin logisticos" on public.route_complaints for update to authenticated using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@bavaria-seguimiento.com', 'saul808c@gmail.com')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'logisticos@bavaria-seguimiento.com' and contractor in ('Logisticos', 'Punto Corona', 'Surti Cervezas', 'Por identificar'))
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'puntocorona@bavaria-seguimiento.com' and contractor = 'Punto Corona')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'surticervezas@bavaria-seguimiento.com' and contractor = 'Surti Cervezas')
) with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@bavaria-seguimiento.com', 'saul808c@gmail.com')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'logisticos@bavaria-seguimiento.com' and contractor in ('Logisticos', 'Punto Corona', 'Surti Cervezas', 'Por identificar'))
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'puntocorona@bavaria-seguimiento.com' and contractor = 'Punto Corona')
  or (lower(coalesce(auth.jwt() ->> 'email', '')) = 'surticervezas@bavaria-seguimiento.com' and contractor = 'Surti Cervezas')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-evidence', 'complaint-evidence', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidencias quejas lectura" on storage.objects;
create policy "evidencias quejas lectura" on storage.objects for select to authenticated using (
  bucket_id = 'complaint-evidence' and lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com', 'saul808c@gmail.com', 'logisticos@bavaria-seguimiento.com',
    'puntocorona@bavaria-seguimiento.com', 'surticervezas@bavaria-seguimiento.com'
  )
);

drop policy if exists "evidencias quejas carga" on storage.objects;
create policy "evidencias quejas carga" on storage.objects for insert to authenticated with check (
  bucket_id = 'complaint-evidence' and lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'logisticos@bavaria-seguimiento.com', 'puntocorona@bavaria-seguimiento.com',
    'surticervezas@bavaria-seguimiento.com'
  )
);

-- Persiste la reclasificacion historica para que las siguientes consultas no
-- dependan de la etiqueta con la que Logisticos cargo inicialmente la fila.
update public.route_complaints q
set
  contractor = public.resolve_complaint_contractor(q.dt, q.created_date, q.contractor),
  data = jsonb_set(q.data, '{contractor}', to_jsonb(public.resolve_complaint_contractor(q.dt, q.created_date, q.contractor)), true)
where q.contractor is distinct from public.resolve_complaint_contractor(q.dt, q.created_date, q.contractor);
