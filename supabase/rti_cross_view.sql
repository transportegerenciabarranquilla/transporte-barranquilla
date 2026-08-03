-- Cruce RTI: consolida RACOCIMI1 (salida) y RACOCIMI2 (retorno) por
-- Transporte + Ruta + Material, y traduce el material a su descripción
-- usando el maestro SKU.
--
-- IMPORTANTE sobre nombres de columna: este script usa los nombres tal como
-- los describiste (Transporte, Ruta, Material, Cantidad real,
-- Descripción del material). En la base real de este proyecto las tablas
-- RACOCIMI1/RACOCIMI2 usan "Transportista" (o "Nombre Transportista") en vez
-- de "Transporte", y el maestro puede llamarse SKU con una columna de
-- descripción distinta (ver supabase/rti_access.sql, que resuelve el nombre
-- de la tabla SKU dinámicamente). Ajusta los identificadores entre comillas
-- dobles para que coincidan exactamente con tu esquema (Postgres distingue
-- mayúsculas/minúsculas dentro de comillas).

-- =====================================================================
-- 1) Resumen de SALIDA (RACOCIMI1)
--    Se agrupa primero para evitar que un cruce varios-a-varios duplique
--    cantidades. trim/upper normalizan espacios y mayúsculas para que las
--    llaves de cruce coincidan aunque vengan con formato distinto.
-- =====================================================================
create or replace view public.rti_salida_resumen
with (security_invoker = true) as
select
  trim(upper("Transporte")) as transporte,
  trim(upper("Ruta"))       as ruta,
  trim(upper("Material"))   as material,
  sum("Cantidad real")      as cantidad_salida
from public."RACOCIMI1"
where "Transporte" is not null
  and "Ruta" is not null
  and "Material" is not null
group by 1, 2, 3;

-- =====================================================================
-- 2) Resumen de RETORNO (RACOCIMI2)
--    Mismo criterio de agrupación y normalización que la salida, para que
--    las llaves (transporte, ruta, material) sean comparables.
-- =====================================================================
create or replace view public.rti_retorno_resumen
with (security_invoker = true) as
select
  trim(upper("Transporte")) as transporte,
  trim(upper("Ruta"))       as ruta,
  trim(upper("Material"))   as material,
  sum("Cantidad real")      as cantidad_retorno
from public."RACOCIMI2"
where "Transporte" is not null
  and "Ruta" is not null
  and "Material" is not null
group by 1, 2, 3;

-- =====================================================================
-- 3) Maestro de materiales, UN registro por material.
--    distinct on garantiza que, aunque el catálogo tenga filas repetidas
--    para el mismo material, solo se use una descripción por SKU.
-- =====================================================================
create or replace view public.rti_sku_resumen
with (security_invoker = true) as
select distinct on (material)
  trim(upper("Material"))    as material,
  "Descripción del material" as descripcion
from public."SKU"
where "Material" is not null
order by material, "Descripción del material" nulls last;

-- =====================================================================
-- 4) CRUCE FINAL
--    - LEFT JOIN desde la salida: se conservan TODOS los registros de
--      salida aunque no tengan retorno (regla de negocio).
--    - coalesce(...,0): si no hay retorno para esa combinación, se muestra
--      como 0 en lugar de NULL.
--    - Diferencia = salida - retorno (puede ser negativa si retornó más de
--      lo que salió; se marca con retorno_excede_salida para revisión).
--    - RTI % = retorno / salida * 100, redondeado a 1 decimal.
--      Se evita división entre cero devolviendo NULL cuando la salida es 0.
-- =====================================================================
create or replace view public.rti_cross_view
with (security_invoker = true) as
select
  s.transporte,
  s.ruta,
  s.material,
  m.descripcion                                       as descripcion_material,
  s.cantidad_salida,
  coalesce(r.cantidad_retorno, 0)                      as cantidad_retorno,
  s.cantidad_salida - coalesce(r.cantidad_retorno, 0)  as diferencia,
  case
    when s.cantidad_salida > 0
      then round(coalesce(r.cantidad_retorno, 0)::numeric / s.cantidad_salida * 100, 1)
    else null
  end                                                   as rti_porcentaje,
  (coalesce(r.cantidad_retorno, 0) > s.cantidad_salida)  as retorno_excede_salida
from public.rti_salida_resumen s
left join public.rti_retorno_resumen r
  on r.transporte = s.transporte
 and r.ruta       = s.ruta
 and r.material   = s.material
left join public.rti_sku_resumen m
  on m.material = s.material
order by s.transporte, s.ruta, s.material;

-- =====================================================================
-- Permisos: igual que en rti_access.sql, se expone solo lectura a
-- usuarios autenticados. Las vistas heredan las políticas RLS de las
-- tablas base gracias a security_invoker = true.
-- =====================================================================
grant select on public.rti_salida_resumen to authenticated;
grant select on public.rti_retorno_resumen to authenticated;
grant select on public.rti_sku_resumen to authenticated;
grant select on public.rti_cross_view to authenticated;
