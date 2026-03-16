# WhatsApp Business AI - SaaS Multi-Tenant Control Plane

Plataforma SaaS para operacion comercial omnicanal con enfoque en WhatsApp Cloud API, control multi-tenant, catalogos por modulo, copilot IA y trazabilidad operativa.

## Estado actual

- Multi-tenant activo con aislamiento por `tenant_id`.
- Panel SaaS con RBAC (superadmin / owner / admin / seller).
- Modulos WhatsApp por tenant con configuracion Cloud API por modulo.
- Catalogos multiples por tenant, asignables por modulo.
- Catalogo local editable desde panel y catalogo WooCommerce por catalogo.
- Copiloto IA multi-asistente por tenant, asignable por modulo.
- Historial de chat IA por scope de chat+modulo.
- Persistencia principal en Postgres (`SAAS_STORAGE_DRIVER=postgres`).

## Capacidades principales

### 1) Control Plane SaaS

- Gestion de empresas (tenants): altas, edicion y desactivacion.
- Gestion de usuarios y memberships por tenant.
- Politicas RBAC con:
  - perfiles de rol (required/optional/blocked)
  - paquetes de permisos opcionales
- Limites por plan (`starter/pro/enterprise`) con override global.

### 2) Modulos de canal

- Multiples modulos por tenant (ej. varias lineas de WhatsApp).
- Atributos por modulo:
  - identidad visual
  - usuarios asignados
  - catalogos asignados (1..N)
  - asistente IA asignado
  - configuracion Meta Cloud API (App/WABA/Phone/Token/Version/Signature)
- Conversaciones separadas por modulo (mismo telefono, scopes distintos).

### 3) Catalogos

- Tenant puede tener varios catalogos (`CAT-XXXXXX`).
- Tipos de catalogo:
  - `local`: productos gestionados en panel
  - `woocommerce`: lectura desde Woo API con credenciales por catalogo
  - `meta`: reservado para integracion Meta catalog
- Productos locales con campos comerciales y media URL.
- En chat, el selector de catalogo se alinea por modulo activo.

### 4) IA comercial

- Multiples asistentes por tenant (`AIA-XXXXXX`).
- Cada asistente soporta:
  - provider/model
  - prompt de sistema
  - temperature/top_p/max_tokens
  - API key propia (encriptada en storage)
- Asistente default por tenant + override por modulo.
- Contexto dinamico: tenant, modulo, chat, cliente, catalogo y carrito.
- Persistencia de historico IA por chat scoped (`tenant_ai_chat_history`).

### 5) Chat y operacion

- Sidebar operativa de conversaciones con etiquetado visual de modulo/canal.
- Envio de mensajes y productos desde catalogo.
- Integracion con WhatsApp Cloud API.
- Trazabilidad de respuesta (operador/modulo) y auditoria.

### 6) Operacion y resiliencia

- Backup/restore tenant-aware (file/postgres).
- Smoke/load scripts para validacion operativa.
- Pilot KPI y closeout fase operativa.

## Arquitectura (resumen)

### Backend (`/backend`)

- `server.js`: API REST principal + middleware auth/tenant scope.
- `socket_manager.js`: eventos en tiempo real, chat operativo y acciones IA/catalogo.
- Servicios clave:
  - `saas_control_plane_service.js`
  - `access_policy_service.js` + `access_policy_store_service.js`
  - `plan_limits_service.js` + `plan_limits_store_service.js`
  - `wa_module_service.js`
  - `tenant_catalog_service.js`
  - `tenant_integrations_service.js`
  - `catalog_manager.js`
  - `auth_service.js` + `auth_session_service.js`
  - `ai_usage_service.js`
  - `ai_chat_history_service.js`
  - `message_history_service.js`
  - `customer_service.js`

### Frontend (`/frontend`)

- `App.jsx`: shell principal (login, panel, operacion).
- `components/SaasAdminPanel.jsx`: control plane SaaS.
- `components/BusinessSidebar.jsx`: inbox, catalogo, carrito y copiloto IA.

## Modelo de datos (Postgres)

Migraciones en `backend/db/migrations` (`001` a `012`).

Tablas principales:

- Control tenant/user:
  - `tenants`, `users`, `memberships`
- RBAC y planes:
  - `saas_access_catalog`, `saas_plan_limits`
- Modulos y runtime:
  - `wa_modules`, `wa_sessions`, `tenant_settings`, `tenant_integrations`
- Catalogos:
  - `tenant_catalogs`, `catalog_items`
- Conversaciones:
  - `tenant_chats`, `tenant_messages`, `tenant_ai_chat_history`
- Clientes:
  - `tenant_customers`, `tenant_customer_identities`, `tenant_channel_events`
- Seguridad/auth:
  - `auth_sessions`, `auth_token_revocations`
- Observabilidad:
  - `audit_logs`, `tenant_ai_usage`

## Instalacion local

## 1) Requisitos

- Node.js 20+
- Postgres 14+
- npm

## 2) Dependencias

```powershell
cd backend
npm install

cd ../frontend
npm install
```

## 3) Configuracion backend (`backend/.env`)

Minimo recomendado:

```env
PORT=3001
NODE_ENV=development

SAAS_STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/wa_saas_prod

SAAS_ENABLED=true
SAAS_AUTH_ENABLED=true
SAAS_AUTH_SECRET=define_un_secreto_largo

OPENAI_MODEL=gpt-4o-mini

ALLOWED_ORIGINS=http://localhost:5173
TRUST_PROXY=true

META_ENFORCE_SIGNATURE=true
META_GRAPH_VERSION=v22.0
```

Notas:

- Credenciales sensibles de Meta/Woo/OpenAI se gestionan desde panel (tenant/modulo/asistente/catalogo), no en texto plano operativo diario.
- Para login legacy de superadmin, existe fallback por `SAAS_SUPERADMINS_JSON`; recomendado mover a metadata de usuario en DB.

## 4) Migraciones

```powershell
cd backend
psql "$env:DATABASE_URL" -f db/migrations/001_saas_foundation.sql
psql "$env:DATABASE_URL" -f db/migrations/002_tenant_settings.sql
psql "$env:DATABASE_URL" -f db/migrations/003_message_history.sql
psql "$env:DATABASE_URL" -f db/migrations/004_auth_sessions.sql
psql "$env:DATABASE_URL" -f db/migrations/005_wa_modules.sql
psql "$env:DATABASE_URL" -f db/migrations/006_message_history_module_context.sql
psql "$env:DATABASE_URL" -f db/migrations/007_admin_profiles_and_module_media.sql
psql "$env:DATABASE_URL" -f db/migrations/008_customers.sql
psql "$env:DATABASE_URL" -f db/migrations/009_multichannel_unified_inbox.sql
psql "$env:DATABASE_URL" -f db/migrations/010_catalog_items_module_pk.sql
psql "$env:DATABASE_URL" -f db/migrations/011_ai_chat_history.sql
psql "$env:DATABASE_URL" -f db/migrations/012_control_plane_hardening.sql
```

## 5) Ejecucion

```powershell
cd backend
npm start
```

```powershell
cd frontend
npm run dev
```

## 6) Verificacion rapida

```powershell
curl.exe -i "http://127.0.0.1:3001/api/saas/runtime"
curl.exe -i "http://127.0.0.1:3001/socket.io/?EIO=4&transport=polling"
```

## Scripts operativos

Backend:

```powershell
npm run test
npm run ops:backup
npm run ops:restore
npm run ops:load-smoke
npm run ops:kpi-pilot
npm run ops:phase5-closeout
```

## Seguridad

- Tokens de acceso + refresh sessions en DB.
- Revocacion de tokens (`auth_token_revocations`).
- Password hashing robusto PBKDF2-SHA512 con compatibilidad legacy SHA-256.
- Secrets de integraciones encriptados en storage (`meta_config_crypto`).
- CORS, rate limiting HTTP/socket, validaciones de payload y scope tenant.

## Buenas practicas de despliegue

- Ejecutar migraciones en cada release antes de reiniciar backend.
- Mantener backups regulares por tenant.
- Validar `/api/ops/health` y `/api/ops/ready` post-deploy.
- No exponer `.env`, llaves ni carpetas de sesiones/uploads.

## Roadmap actual (en curso)

- Optimizacion UX operativa de chat (context switching por modulo).
- Mayor observabilidad de KPIs por tenant/modulo/asistente.
- Consolidacion final cloud-only para canales (sin dependencia operativa de webjs).

