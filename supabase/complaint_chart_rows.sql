begin;

create table if not exists public.complaint_chart_rows (
  contractor text not null,
  ticket text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  source_name text not null,
  imported_by text not null,
  updated_at timestamptz not null default now(),
  primary key (contractor, ticket)
);

create index if not exists complaint_chart_rows_updated_at_idx
  on public.complaint_chart_rows (updated_at desc);

alter table public.complaint_chart_rows enable row level security;
revoke all on public.complaint_chart_rows from anon, authenticated;
grant all on public.complaint_chart_rows to service_role;

notify pgrst, 'reload schema';
commit;
