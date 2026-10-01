-- Ejecutar en el SQL Editor de Supabase antes de guardar evaluaciones.
-- Acceso coherente con People y administradores generales del portal.
begin;

create table if not exists public.people_route_evaluations (
  id uuid primary key,
  cc text not null,
  nombre text not null,
  cargo text not null,
  contractor text not null,
  person_key text not null,
  survey_role text not null check (survey_role in ('conductor', 'responsable', 'auxiliar')),
  questionnaire_version integer not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists people_route_evaluations_person_date
  on public.people_route_evaluations (cc, contractor, created_at desc);

alter table public.people_route_evaluations enable row level security;
revoke all on public.people_route_evaluations from anon, authenticated;
grant select, insert on public.people_route_evaluations to authenticated;
grant all on public.people_route_evaluations to service_role;

drop policy if exists people_route_evaluations_read on public.people_route_evaluations;
create policy people_route_evaluations_read on public.people_route_evaluations
  for select to authenticated
  using (lower((select auth.jwt()) ->> 'email') in (
    'people@transporte.com', 'admin@bavaria-seguimiento.com', 'saul808c@gmail.com'
  ));

drop policy if exists people_route_evaluations_insert on public.people_route_evaluations;
create policy people_route_evaluations_insert on public.people_route_evaluations
  for insert to authenticated
  with check (created_by = (select auth.uid()) and lower((select auth.jwt()) ->> 'email') in (
    'people@transporte.com', 'admin@bavaria-seguimiento.com', 'saul808c@gmail.com'
  ));

notify pgrst, 'reload schema';
commit;
