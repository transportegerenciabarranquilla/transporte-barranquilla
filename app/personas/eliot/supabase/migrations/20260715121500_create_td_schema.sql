create table if not exists public.td_snapshots (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name text not null,
  file_hash text not null,
  operational_date date not null,
  uploaded_at timestamptz not null,
  closed_at timestamptz,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, file_hash)
);

create table if not exists public.td_routes (
  snapshot_id text not null,
  id text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dt text not null default '',
  trip text not null default '',
  plate text not null default '',
  responsible text not null default '',
  dispatch_date date,
  dt_date date,
  route_status text not null default '',
  clients integer not null default 0 check (clients >= 0),
  visited integer not null default 0 check (visited >= 0),
  boxes numeric not null default 0 check (boxes >= 0),
  hectoliters numeric not null default 0 check (hectoliters >= 0),
  departure_seconds integer check (departure_seconds is null or departure_seconds >= 0),
  late_departure_cause text not null default '',
  late_departure_comment text not null default '',
  route_arrival text not null default '',
  route_time text not null default '',
  planned_time text not null default '',
  territory text not null default '',
  carrier text not null default '',
  primary key (snapshot_id, id),
  unique (snapshot_id, id, owner_id),
  foreign key (snapshot_id, owner_id)
    references public.td_snapshots(id, owner_id)
    on delete cascade
);

create table if not exists public.td_crew_members (
  snapshot_id text not null,
  route_id text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('rr', 'aux', 'conductor')),
  name text not null default '',
  document text not null default '',
  arrival_seconds integer check (arrival_seconds is null or arrival_seconds >= 0),
  td_seconds integer check (td_seconds is null or td_seconds >= 0),
  status text not null check (status in ('bien', 'regular', 'mal', 'sin-marcacion')),
  valid_person boolean not null default true,
  primary key (snapshot_id, route_id, role),
  foreign key (snapshot_id, route_id, owner_id)
    references public.td_routes(snapshot_id, id, owner_id)
    on delete cascade
);

create table if not exists public.td_user_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create index if not exists td_snapshots_owner_date_idx
  on public.td_snapshots (owner_id, operational_date desc, uploaded_at desc);
create index if not exists td_routes_owner_plate_idx
  on public.td_routes (owner_id, plate);
create index if not exists td_routes_owner_carrier_idx
  on public.td_routes (owner_id, carrier);
create index if not exists td_crew_owner_document_idx
  on public.td_crew_members (owner_id, document, role);

alter table public.td_snapshots enable row level security;
alter table public.td_routes enable row level security;
alter table public.td_crew_members enable row level security;
alter table public.td_user_settings enable row level security;

revoke all on public.td_snapshots from anon;
revoke all on public.td_routes from anon;
revoke all on public.td_crew_members from anon;
revoke all on public.td_user_settings from anon;

grant select, insert, update, delete on public.td_snapshots to authenticated;
grant select, insert, update, delete on public.td_routes to authenticated;
grant select, insert, update, delete on public.td_crew_members to authenticated;
grant select, insert, update, delete on public.td_user_settings to authenticated;

drop policy if exists "td_snapshots_owner_all" on public.td_snapshots;
create policy "td_snapshots_owner_all"
  on public.td_snapshots
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "td_routes_owner_all" on public.td_routes;
create policy "td_routes_owner_all"
  on public.td_routes
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "td_crew_members_owner_all" on public.td_crew_members;
create policy "td_crew_members_owner_all"
  on public.td_crew_members
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "td_user_settings_owner_all" on public.td_user_settings;
create policy "td_user_settings_owner_all"
  on public.td_user_settings
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
