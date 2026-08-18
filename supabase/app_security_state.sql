-- Estado global y reversible del bloqueo de emergencia.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.app_security_state (
  state_id text primary key,
  active boolean not null default false,
  activated_at timestamptz,
  activated_by text not null default '',
  reason text not null default '',
  updated_at timestamptz not null default now(),
  constraint app_security_state_singleton check (state_id = 'global')
);

insert into public.app_security_state (state_id, active)
values ('global', false)
on conflict (state_id) do nothing;

alter table public.app_security_state enable row level security;
grant select on table public.app_security_state to anon, authenticated;
grant insert, update on table public.app_security_state to authenticated;

drop policy if exists "security state lectura" on public.app_security_state;
create policy "security state lectura" on public.app_security_state
for select to anon, authenticated using (true);

drop policy if exists "security state control saul" on public.app_security_state;
create policy "security state control saul" on public.app_security_state
for all to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'saul808c@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'saul808c@gmail.com');
