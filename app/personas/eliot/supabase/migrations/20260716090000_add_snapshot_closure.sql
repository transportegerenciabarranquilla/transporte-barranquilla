alter table public.td_snapshots
  add column if not exists closed_at timestamptz;

create index if not exists td_snapshots_owner_closed_idx
  on public.td_snapshots (owner_id, operational_date, closed_at)
  where closed_at is not null;
