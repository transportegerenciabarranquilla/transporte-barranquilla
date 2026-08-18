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

drop policy if exists "quejas lectura admin logisticos" on public.route_complaints;
create policy "quejas lectura admin logisticos" on public.route_complaints for select to authenticated using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com',
    'saul808c@gmail.com',
    'logisticos@bavaria-seguimiento.com',
    'logisticos@transporte.com'
  )
);

drop policy if exists "quejas carga admin logisticos" on public.route_complaints;
create policy "quejas carga admin logisticos" on public.route_complaints for insert to authenticated with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@bavaria-seguimiento.com', 'saul808c@gmail.com', 'logisticos@bavaria-seguimiento.com', 'logisticos@transporte.com')
);

drop policy if exists "quejas actualiza admin logisticos" on public.route_complaints;
create policy "quejas actualiza admin logisticos" on public.route_complaints for update to authenticated using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@bavaria-seguimiento.com', 'saul808c@gmail.com', 'logisticos@bavaria-seguimiento.com', 'logisticos@transporte.com')
) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-evidence', 'complaint-evidence', false, 5242880, array['application/pdf', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidencias quejas lectura" on storage.objects;
create policy "evidencias quejas lectura" on storage.objects for select to authenticated using (
  bucket_id = 'complaint-evidence' and lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com', 'saul808c@gmail.com', 'logisticos@bavaria-seguimiento.com', 'logisticos@transporte.com'
  )
);

drop policy if exists "evidencias quejas carga" on storage.objects;
create policy "evidencias quejas carga" on storage.objects for insert to authenticated with check (
  bucket_id = 'complaint-evidence' and lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@bavaria-seguimiento.com', 'saul808c@gmail.com', 'logisticos@bavaria-seguimiento.com', 'logisticos@transporte.com'
  )
);
