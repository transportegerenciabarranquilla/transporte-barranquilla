-- Permite que el módulo protegido de People consulte e importe información RTI
-- usando el token del usuario autenticado.

alter table public."RACOCIMI1" enable row level security;
alter table public."RACOCIMI2" enable row level security;

grant select, insert, delete on table public."RACOCIMI1" to authenticated;
grant select, insert, delete on table public."RACOCIMI2" to authenticated;

drop policy if exists "rti racocimi1 lectura autenticados" on public."RACOCIMI1";
create policy "rti racocimi1 lectura autenticados"
on public."RACOCIMI1"
for select
to authenticated
using (true);

drop policy if exists "rti racocimi2 lectura autenticados" on public."RACOCIMI2";
create policy "rti racocimi2 lectura autenticados"
on public."RACOCIMI2"
for select
to authenticated
using (true);

drop policy if exists "rti racocimi1 carga autenticados" on public."RACOCIMI1";
create policy "rti racocimi1 carga autenticados"
on public."RACOCIMI1"
for insert
to authenticated
with check (true);

drop policy if exists "rti racocimi1 reemplazo autenticados" on public."RACOCIMI1";
create policy "rti racocimi1 reemplazo autenticados"
on public."RACOCIMI1"
for delete
to authenticated
using (true);

drop policy if exists "rti racocimi2 carga autenticados" on public."RACOCIMI2";
create policy "rti racocimi2 carga autenticados"
on public."RACOCIMI2"
for insert
to authenticated
with check (true);

drop policy if exists "rti racocimi2 reemplazo autenticados" on public."RACOCIMI2";
create policy "rti racocimi2 reemplazo autenticados"
on public."RACOCIMI2"
for delete
to authenticated
using (true);

-- Catálogo usado para traducir Material a la descripción visible del envase.
do $$
declare
  sku_table_name text;
begin
  select table_name
  into sku_table_name
  from information_schema.tables
  where table_schema = 'public'
    and lower(table_name) = 'sku'
  limit 1;

  if sku_table_name is null then
    raise exception 'No se encontró una tabla SKU en el esquema public.';
  end if;

  execute format('alter table public.%I enable row level security', sku_table_name);
  execute format('grant select on table public.%I to authenticated', sku_table_name);
  execute format('drop policy if exists %I on public.%I', 'rti sku lectura autenticados', sku_table_name);
  execute format(
    'create policy %I on public.%I for select to authenticated using (true)',
    'rti sku lectura autenticados',
    sku_table_name
  );
end
$$;
