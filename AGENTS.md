# Guía del repositorio para agentes de IA

## Stack y estructura
- Este proyecto es una app Next.js 16 con App Router en la carpeta `app/`.
- Las pantallas principales viven en `app/*/page.tsx` y los componentes reutilizables en `app/components/`.
- Las rutas de backend/API están en `app/api/*` y el acceso a datos se centraliza en `app/lib/supabaseServer.ts`.
- Si se va a tocar routing, React Server Components, cookies o caché, leer primero la guía local de Next.js en `node_modules/next/dist/docs/` y respetar las deprecaciones.

## Comandos clave
- `npm run dev` — arranca la app en desarrollo.
- `npm run build` — compila la app.
- `npm run lint` — revisa ESLint.
- `npm run test:rti` — ejecuta la prueba específica de RTI.

## Convenciones importantes
- La autenticación no es la típica de Next.js: se usa Supabase Auth + cookies personalizados definidos en `app/lib/authServer.ts`.
- El inicio de sesión y el refresh de sesión se validan con `contractorForEmail`, `isAdminEmail`, `isPeopleEmail` y la lógica de seguridad en `app/lib/contractors.ts` y `app/lib/securityState.ts`.
- Cuando se creen o modifiquen rutas API, mantener el flujo de autorización esperado: cookies -> `getAuthenticatedSession(...)` -> headers de Supabase (`supabaseUserHeaders`, `supabaseReadHeaders`, `supabaseAdminHeaders`). No “saltar” la capa de sesión.
- La cabecera de Supabase y la URL base se encuentran en `app/lib/supabaseServer.ts`; usa esas funciones para consultas, no hardcodear endpoints ni tokens.
- El proyecto tiene mapeo por contractor por correo, con reglas especiales para admin, people, seguridad y sitios Arenosa/Galapa. No asumir que el nombre del contratista es único ni que todas las cuentas son iguales.
- El proyecto usa `fetch(..., { cache: "no-store" })` para consultas dinámicas y datos frescos, especialmente en las rutas API.

## Patrones de cambios recomendados
- Para lógica de negocio por módulo, preferir `app/lib/*.ts` sobre lógica embebida en páginas.
- Para reglas de acceso por rol/contratista, actualizar primero la lógica central en `app/lib/contractors.ts` y luego consumirla en API o UI.
- Al trabajar con pantallas del portal, mantener el flujo de sesión y el estado del contratista compatible con la pantalla principal en `app/page.tsx` y con `PortalDashboard`.
- Mantener nombres y textos en español, porque la app casi siempre presenta mensajes y feedback en ese idioma.

## Puntos de entrada útiles
- `app/page.tsx` — login y comprobación de sesión.
- `app/components/PortalDashboard.tsx` — panel principal del portal.
- `app/lib/contractors.ts` — reglas de email/contratista/roles.
- `app/lib/authServer.ts` — autenticación y refresh.
- `app/lib/supabaseServer.ts` — helpers para Supabase REST y headers.

## Nota para agentes
Este repositorio tiene reglas específicas de negocio y seguridad; antes de cambiar permisos, mapeos, dashboards o rutas de datos, confirmar el flujo real de autenticación y los contratos del cliente.
