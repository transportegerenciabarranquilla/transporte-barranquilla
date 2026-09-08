-- Perfiles faciales persistentes para el módulo Descanso Efectivo.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.effective_rest_face_profiles (
  document text primary key check (document ~ '^[0-9]{1,15}$'),
  person_name text not null default '',
  descriptors jsonb not null default '[]'::jsonb check (jsonb_typeof(descriptors) = 'array'),
  photo_data_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.effective_rest_face_profiles is
  'Datos biométricos cifrados en tránsito y administrados exclusivamente por el servidor de Descanso Efectivo.';

alter table public.effective_rest_face_profiles enable row level security;

revoke all on table public.effective_rest_face_profiles from anon, authenticated;
grant all on table public.effective_rest_face_profiles to service_role;

create index if not exists effective_rest_face_profiles_updated_at_idx
  on public.effective_rest_face_profiles (updated_at desc);

-- Ejemplo opcional de estructura. El registro real lo crea automáticamente el módulo:
-- insert into public.effective_rest_face_profiles (document, person_name, descriptors, photo_data_url)
-- values ('1001878271', 'PERSONA DE EJEMPLO', '[]'::jsonb, null)
-- on conflict (document) do update set person_name = excluded.person_name, updated_at = now();
