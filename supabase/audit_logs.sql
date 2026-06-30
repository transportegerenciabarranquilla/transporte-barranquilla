create table if not exists public.audit_logs (
  audit_id text primary key,
  action text not null,
  module text not null,
  contractor text not null,
  user_email text,
  ip_address text,
  user_agent text,
  device text,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "auditoria lectura admin" on public.audit_logs;
drop policy if exists "auditoria escritura contratista" on public.audit_logs;

create policy "auditoria lectura admin" on public.audit_logs
for select to authenticated using (public.current_is_admin());

create policy "auditoria escritura contratista" on public.audit_logs
for insert to authenticated
with check (public.normalize_contractor_label(contractor) = public.current_contractor());

revoke all on public.audit_logs from anon;
grant select, insert on public.audit_logs to authenticated;

notify pgrst, 'reload schema';
