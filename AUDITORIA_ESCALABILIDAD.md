# Auditoría de escalabilidad y acceso a datos

Fecha: 27 de septiembre de 2026. Alcance: inspección estática del checkout `transporte-barranquilla` (343 archivos versionados visibles en el barrido), rutas API, clientes, caché y SQL incluido. No hubo acceso a métricas de Vercel/Supabase, `EXPLAIN ANALYZE`, catálogo de índices ni políticas RLS **desplegadas**. Las cifras siguientes son solicitudes inducidas por el código, no mediciones de producción.

## Inventario de acceso a datos

- La aplicación principal usa PostgREST con `fetch` y `supabaseRest`; el barrido halló 169 referencias a `supabaseRest` en API/lib y 95 declaraciones de handlers HTTP. No es correcto buscar solo `supabase.from(...)` en este proyecto. El subproyecto `app/personas/eliot` sí crea un cliente `supabase-js`.
- `app/lib/authServer.ts` consulta `/auth/v1/user` y `app_security_state` al autenticar una ruta. Son dos viajes a Supabase por invocación normal, más refresh cuando expira el token. Las rutas API mantienen esta capa de control.
- `app/lib/remoteStore.ts` comparte lecturas por endpoint durante 120 s, evita peticiones simultáneas iguales, conserva referencias si el contenido no cambia, serializa escrituras y aplica cambios optimistas. La escritura de `visitados` ya usa PATCH por registro.
- `app/lib/serverCache.ts` deduplica en memoria por instancia. No es una caché compartida entre funciones de Vercel. Varias consultas tienen `cache: "no-store"`; ello no anula la caché propia.
- `app/api/seguimiento/route.ts` lee `seguimiento_vehiculos` (`record_id,contractor,data,updated_at`), `asistencias_ruta` (`contractor,data`) y `capacidad_carga` (`*`, esquema heterogéneo), en páginas de 1.000 filas. La API aplica asistencia y capacidad a los vehículos; no existe N+1 por vehículo en este flujo.
- `app/api/personas/route.ts` usa columnas específicas (`CC,NOMBRE,CARGO,CONTRATISTA,CELULAR` para consultas autenticadas; `NOMBRE,CARGO,CONTRATISTA` para consulta pública por cédula) y límites 20/30/100 según la búsqueda. `app/api/people/summary/route.ts` proyecta campos JSON específicos, pero escanea páginas de hasta 1.000 para construir estadísticas.
- `app/api/complaints/route.ts` carga quejas, seguimiento, asistencia y modulaciones para cada GET. `app/api/admin/seguimiento/route.ts` consulta cuatro conjuntos con topes de 1.200/2.500 por contratista. `app/control-diario/page.tsx` lanza ocho lecturas en paralelo al montar.
- Los `select=*` explícitos restantes están en `capacidad-carga`, `people/atrasos`, `people/relays`, `people/rti`, `people/zki/crew`, `people/zki/vehicles`, `admin/status-liq` y una comprobación de `people/nps/upload`. Requieren revisar el esquema/consumidor antes de sustituir columnas. No se encontró Supabase Realtime en la aplicación principal.

## Hallazgos priorizados

| Prioridad | Archivo y problema | Causa e impacto | Acción |
|---|---|---|---|
| CRÍTICO | `app/lib/supabaseServer.ts`, `app/api/seguimiento/route.ts`: muchas lecturas usan clave de servicio. | `supabaseReadHeaders` prioriza service role; RLS no protege esas consultas. Antes, seguimiento leía toda la tabla y filtraba en JS. Riesgo de transferencia y aislamiento si falta un filtro en la API. | Se llevó el filtro de propietario a PostgREST, incluidos registros históricos `contractor IS NULL`. Revisar todos los endpoints privilegiados y las policies desplegadas; la protección de la API sigue siendo obligatoria. |
| CRÍTICO | `app/api/personas/route.ts`: listado/búsqueda amplios sin sesión. | Un cliente anónimo podía pedir nombres, cédulas y celulares con `q`, `listar` o `cargo`; además usa clave privilegiada. | Ahora exige sesión, mínimo tres caracteres y contratista de la sesión para cuentas operativas. La consulta pública por cédula devuelve nombre y `isRR`; si se indica contratista coincidente, también cargo y contratista. No devuelve celular ni cédula. La consulta autenticada por cédula conserva `CELULAR` para Jornada laboral. |
| ALTO | `app/api/seguimiento/route.ts`, `app/registro-modulacion/page.tsx`: enlace público descargaba todas las rutas de un contratista. | El formulario necesitaba un DT, pero la petición no lo enviaba y el endpoint no lo exigía. | Ahora envía el DT y el endpoint público lo exige sin imponer una longitud que excluya históricos. Para conservar variantes con prefijos/separadores, PostgreSQL filtra por contratista y el servidor compara el DT normalizado. La respuesta pública se limita a los campos usados por el formulario y no consulta capacidad de carga; la lectura de rutas aún puede transferir todo un contratista desde Supabase a Vercel. |
| ALTO | `app/api/seguimiento/route.ts`: cruce de asistencia global en cada lectura. | `RELATED_CACHE_TTL_MS=0` y el índice se reconstruía desde todas las contratistas en cada GET. | Ahora la lectura de asistencia se restringe en PostgreSQL al contratista; admin/People conservan la consulta global. Evaluar una proyección/resumen por DT si crece mucho la tabla. |
| ALTO | `app/components/GlobalOperationsSearch.tsx`: carga tres colecciones completas al abrir el dashboard admin. | `useStorageSnapshot` provocaba la consulta inicial aun con búsqueda vacía. | Ahora lee solo la caché existente y consulta al escribir al menos dos caracteres. Siguiente paso: búsqueda indexada desde servidor para evitar descargar catálogos completos al buscar. |
| ALTO | `app/quejas/page.tsx`, `app/api/complaints/route.ts`: sondeo y GET costosos. | Admin hacía un GET cada 3 s; cada GET cruza cuatro conjuntos y el cliente recibía el listado completo. | Sondeo cada 30 s, solo visible, con refresco al recuperar foco. Después: filtros/paginación SQL y resumen incremental. |
| MEDIO | `app/components/PwaManager.tsx`: verificación de sesión cada 15 s en todas las pantallas. | Cada verificación llama Auth y consulta estado de seguridad. | Intervalo de 60 s solo con pestaña visible y refresco al enfocar. El control del lado servidor sigue aplicando por petición. |
| MEDIO | `app/personas/page.tsx`: "paginación" visual de una lista ya descargada. | `visibleCount` limita render, pero `people/summary` y `profiles` se descargan completos. | Paginar perfiles/personas por contratista en servidor y separar conteos de registros. Requiere contrato nuevo de API/UI; no incluido en los cambios seguros de esta fase. |
| MEDIO | `app/control-diario/page.tsx`, `app/gerencia/page.tsx`, `app/ruta-sip/page.tsx`: lecturas múltiples cada 10 s. | Las pantallas operativas consultan datasets enteros. | Control diario y Gerencia ya omiten sondeos con pestaña oculta; Ruta SIP ya tenía esa comprobación. Desduplicar y separar contadores de detalles tras medir su frescura requerida. |
| MEDIO | `app/lib/serverCache.ts`: caché local a instancia. | La invalidación de una función no llega a otras instancias de Vercel; TTL alto puede servir datos viejos. | Mantener TTL cortos para datos operativos y usar invalidación/versionado compartido solo si las métricas muestran necesidad. |
| BAJO | `app/components/PortalDashboard.tsx`: `window.location.assign` en descanso efectivo. | Carga documento completo; el comentario indica que se requiere por la política de cámara. | Conservar hasta verificar la política de cámara; los demás módulos usan `router.push`. No se encontraron `location.reload()` ni `router.refresh()` en el barrido principal. |

## Solicitudes: antes y después derivados del código

| Escenario | Antes | Después |
|---|---|---|
| Abrir portal admin `/` | `GlobalOperationsSearch` disparaba 3 GET de datasets (seguimiento, asistencia, modulación), además de verificación de sesión/seguridad de layout y página. | El buscador dispara 0 GET de datasets hasta escribir 2 caracteres. Las verificaciones de sesión/seguridad continúan. |
| Editar `visitados` | Ya era 1 PATCH del navegador a `/api/seguimiento`, con lectura y UPDATE del registro en el servidor; el cliente mantiene caché optimista. | Igual: no se introdujo refetch global. El siguiente sondeo periódico sigue existiendo. |
| Formulario público de modulación con DT | 1 GET de seguimiento que devolvía todas las rutas de la contratista al navegador, más GET de asistencia por DT. | 1 GET de seguimiento que devuelve al navegador solo las rutas con el DT normalizado, más el mismo GET de asistencia. La API aún lee las rutas del contratista desde Supabase para conservar variantes históricas. |
| Admin en quejas, pestaña visible durante 1 min | Hasta 20 GET de `/api/complaints` por intervalo fijo, sin contar carga inicial/foco. | Hasta 2 GET por intervalo fijo, sin contar carga inicial/foco. Cada GET aún puede ser costoso. |
| App abierta 1 min, pestaña visible | PWA: hasta 4 GET de sesión por intervalo, más inicial/foco. | Hasta 1 GET por intervalo, más inicial/foco. |

Estas cuentas no predicen solicitudes reales: React Strict Mode de desarrollo, navegación, caché caliente, pestañas abiertas y otras pantallas alteran el total. Para certificar 50/100/300/500 usuarios hacen falta trazas de red, p95, tasa de errores y `EXPLAIN (ANALYZE, BUFFERS)` con tamaños de datos representativos.

### Superficie pública que permanece

Sin iniciar sesión, `/api/personas?cc=...` permite averiguar `NOMBRE` e `isRR`. Si además se indica un contratista que coincide con la fila, devuelve `NOMBRE`, `CARGO`, `CONTRATISTA` e `isRR`. No devuelve `CC` ni `CELULAR` en la respuesta pública. El contratista es un parámetro elegido por quien llama; por ello la búsqueda pública por cédula no garantiza aislamiento entre contratistas. Las búsquedas amplias y los listados sí exigen sesión.

Sin iniciar sesión, `/api/seguimiento` exige contratista reconocido y DT no vacío. Quien conozca ambos puede obtener las rutas coincidentes con placa, fechas, nombre y cédula del responsable. `/api/asistencias/buscar` también es un endpoint público usado por el formulario y requiere auditoría de datos devueltos. Estas excepciones son decisiones funcionales del flujo público; antes de producción debe valorarse una credencial temporal de formulario o una respuesta aún más acotada.

## Base de datos y RLS

El repositorio contiene `supabase/security_audit_readonly.sql` para consultar policies, grants, triggers y buckets sin modificar datos. Ejecutarlo en cada proyecto Supabase y comprobar con identidades reales de Punto Corona, Surti Cervezas, Logísticos, People y admin. El SQL local no demuestra que esas migraciones estén desplegadas. `supabase/security_hardening.sql` y `supabase/seguimiento_indexes.sql` **no se ejecutaron**.

El índice más justificado por la nueva lectura es `(contractor, record_id)` para la paginación de seguimiento; ya está propuesto en `supabase/seguimiento_indexes.sql`. Para el cruce de asistencia, evaluar `(contractor, updated_at DESC)` solo tras comprobar `pg_indexes` y el plan; las filas históricas con `contractor IS NULL` usan `data->>'contratista'` y pueden requerir normalización gradual. Los índices de expresión JSON y los de fecha también tienen costo de escritura; confirmar selectividad antes de instalarlos.

## Plan siguiente, por impacto y riesgo

1. Ejecutar auditoría SQL de solo lectura en staging/producción y probar acceso cruzado con tokens reales; corregir policies permisivas y revisar endpoints con service role.
2. Medir los bytes/filas/tiempo de `seguimiento`, `complaints`, `people/summary` y `admin/seguimiento`; usar p95 y planes SQL para elegir proyecciones e índices.
3. Crear búsqueda de operaciones y listados de People/quejas con filtros y paginación en PostgreSQL. Mantener el resultado limitado, con claves por contratista/filtro.
4. Revisar los sondeos de 10 s de pantallas operativas y convertirlos a lecturas visibles o a resúmenes pequeños según necesidad real.
5. Ejecutar prueba de carga escalonada 50/100/300/500 usuarios con mezcla de rutas realista antes de afirmar capacidad. Registrar Supabase egress, conexiones, CPU y Vercel invocations.

## Validación

- Tras la revisión crítica: 73 pruebas relevantes pasaron; `tsc --noEmit`, lint de archivos modificados y build de producción pasaron.
- `npm run lint` conserva 9 errores previos en tres pruebas de `app/lib` y `scripts/test-seguimiento-visitados.cjs`, más 3 warnings previos. No hubo errores de lint en archivos modificados.
- `tsc --noEmit` aislado falló antes del primer build por tipos generados de Next e imágenes; después del build pasó.
