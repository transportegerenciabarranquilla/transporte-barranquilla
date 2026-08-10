alter table public.preventa_clientes
  add column if not exists caller_name text not null default '',
  add column if not exists last_edited_by text not null default '',
  add column if not exists edit_history jsonb not null default '[]'::jsonb;
