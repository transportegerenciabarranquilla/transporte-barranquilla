alter table public.preventa_clientes
  add column if not exists products jsonb not null default '[]'::jsonb;
