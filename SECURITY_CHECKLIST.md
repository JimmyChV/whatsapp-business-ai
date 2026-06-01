# Security Checklist

Checklist operativo antes de desplegar o cambiar configuracion sensible.

## Produccion obligatoria

- `NODE_ENV=production`.
- `SAAS_AUTH_ENABLED=true`.
- `SAAS_AUTH_SECRET` definido con valor largo y aleatorio.
- `ALLOWED_ORIGINS` definido explicitamente, por ejemplo `https://wa.lavitat.pe`.
- `CORS_ALLOW_EMPTY_IN_PROD` no debe usarse para produccion.
- Cookies seguras habilitadas por `NODE_ENV=production`.
- Headers de seguridad activos en nginx o backend.

## Webhook Meta

- Cada modulo Cloud API debe tener `appSecret` configurado.
- No dejar `enforceSignature=false` en produccion.
- Verificar que Meta envia `x-hub-signature-256`.
- Si el webhook responde 401 por `no_app_secret`, corregir la configuracion del modulo antes de reintentar.

## Google Maps API key

La key frontend de Google Maps se expone al navegador por diseno. Debe estar restringida en Google Cloud Console:

- HTTP referrers: `https://wa.lavitat.pe/*`.
- APIs permitidas: Maps JavaScript API, Places API, Directions API, Distance Matrix API.
- No reutilizar esta key para APIs backend ni servicios administrativos.
- Monitorear cuotas y alertas de facturacion.

## SMTP y OTP

- Configurar SMTP global o SMTP por tenant antes de activar OTP en produccion.
- No activar `ALLOW_AUTH_DEBUG=true` en produccion.
- Los codigos OTP nunca deben devolverse en respuestas HTTP.
- Los autorizadores de dispositivo deben estar actualizados por tenant.

## Dependencias

- Ejecutar `npm audit --json` en `backend` y `frontend` antes de cada release.
- No usar `npm audit fix --force` sin validar breaking changes.
- Si queda una vulnerabilidad alta/critica, documentar excepcion y mitigacion antes de desplegar.

## Pre-deploy rapido

- `cd backend && npm test`.
- `cd backend && npm audit --json`.
- `cd frontend && npm run build`.
- `cd frontend && npm audit --json`.
- Confirmar que no hay secretos en `git diff`.
- Confirmar que migraciones nuevas fueron aplicadas en staging antes de produccion.
