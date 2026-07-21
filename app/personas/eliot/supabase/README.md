# Esquema Supabase de Control TD

La migración crea cuatro tablas:

- `td_snapshots`: cortes cargados y advertencias del archivo.
- `td_routes`: rutas, placas y datos operativos.
- `td_crew_members`: RR, auxiliares y conductores con sus TD.
- `td_user_settings`: hash y sal del PIN por administrador.

Todas las tablas tienen RLS. Solo un usuario autenticado puede leer o modificar
sus propios registros. El rol público `anon` no tiene permisos.

Para aplicarla, abre el SQL Editor del proyecto Supabase, pega el contenido de
`migrations/20260715121500_create_td_schema.sql` y ejecuta la consulta una vez.
