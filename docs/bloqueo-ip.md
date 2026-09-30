# Bloqueo por IP

La cuenta `saul808c@gmail.com` administra los bloqueos desde el panel Seguridad global, en «Administrar bloqueos por IP». Puede registrar una IPv4 o IPv6, indicar un motivo y desbloquearla después. «Bloquear todos» conserva el control general existente.

Las IP se guardan en `app_security_state` con `state_id = ip:<dirección normalizada>`. El bloqueo general conserva la fila `global`. El acceso de Saúl se verifica con Supabase Auth y permite revertir ambos bloqueos, incluso desde una IP bloqueada. Una IP compartida afecta a todas las personas conectadas desde ella; un cambio de IP permite volver a acceder.

## Despliegue

En Vercel se usa la cabecera `x-forwarded-for` que la plataforma sobrescribe. En otro alojamiento, configurar `TRUSTED_CLIENT_IP_HEADER` con el nombre de una cabecera que el proxy de confianza sobrescriba usando la dirección del cliente. El servidor debe recibir tráfico exclusivamente de ese proxy. No confiar en una cabecera reenviada sin validar por el cliente.

Sin una fuente de IP configurada en producción, el panel impide crear bloqueos por IP y permite retirar los existentes. En desarrollo se usa `x-forwarded-for` o `127.0.0.1`.

El servidor necesita acceso de lectura y escritura a `app_security_state` mediante los helpers de Supabase existentes. Los controles solo se muestran a Saúl y las rutas de administración verifican su sesión antes de consultar o cambiar la lista.

## Validación

`node tests/security-ip.test.mjs` valida normalización, cabeceras de confianza, permisos, persistencia simulada, desbloqueo, recuperación y rechazo de una identidad falsificada. `node tests/security.test.mjs` verifica regresiones de seguridad.
