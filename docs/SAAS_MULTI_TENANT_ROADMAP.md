# SaaS Multiempresa Roadmap (8h/dia)

Estado inicial: sistema funcional single-company con dual transport (webjs/cloud).
Objetivo: convertirlo en plataforma multiempresa con login por usuario, aislamiento por tenant y base para escalar.

## Fase 0 - Plan y baseline (Dia 1)
- Inventario tecnico y riesgos de migracion.
- Definicion de modelo SaaS:
  - Tenant (empresa)
  - User (rol owner/admin/seller)
  - Session WhatsApp por tenant
- Reglas de seguridad por defecto en produccion.
- Entregables:
  - Roadmap aprobado
  - Criterios de aceptacion por fase

## Fase 1 - Fundacion SaaS (Dias 1-3)
- Habilitar contexto tenant en HTTP y Socket.
- Base de autenticacion SaaS (login + token firmado) compatible con estado actual.
- Endpoints base:
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `GET /api/tenant/me`
  - `GET /api/saas/runtime`
- Mantener backward compatibility para no romper flujo actual.
- Entregables:
  - Backend soporta tenant context
  - Socket expone contexto tenant al frontend

## Fase 2 - Persistencia multi-tenant real (Dias 4-8)
- Migrar de JSON/files a capa de repositorios tenant-aware.
- Introducir Postgres (schema v1):
  - tenants, users, memberships, wa_sessions, quick_replies, catalogs, audit_logs
- Migraciones versionadas y seed seguro.
- Entregables:
  - datos aislados por tenant
  - sin dependencia critica en archivos locales

## Fase 3 - IAM y seguridad avanzada (Dias 9-12)
- RBAC completo (owner/admin/seller).
- Refresh tokens, expiracion, revocacion.
- Endurecer permisos por evento socket.
- Auditoria de acciones de alto impacto.
- Entregables:
  - control de acceso por rol
  - trazabilidad por usuario

## Fase 4 - Multi-tenant funcional (Dias 13-17)
- UI de login y selector de empresa.
- Sesion por usuario + tenant en frontend.
- Catalogo, carrito, IA y respuestas rapidas por tenant.
- Entregables:
  - dos empresas operando en paralelo sin fuga de datos

## Fase 5 - Produccion y operacion (Dias 18-21)
- Observabilidad (errores, latencia, uso IA, colas).
- Backups y recovery.
- Runbook de despliegue y rollback.
- Hardening final + pruebas de carga.
- Entregables:
  - checklist go-live completo
  - piloto con clientes reales

## KPIs de salida
- Cero fuga de datos entre empresas.
- P95 apertura de chat < 1.2s.
- Error rate backend < 1%.
- Disponibilidad >= 99.5% en ventana operativa.

## Riesgos y mitigacion
- Acoplamiento en `socket_manager.js`: refactor por dominios en paralelo.
- Dependencia de capacidades de WA Web: mantener dual transport y priorizar Cloud para escalar.
- Complejidad de migracion de datos: estrategia incremental por feature flag.

## Estado de ejecucion
- [x] Roadmap definido
- [x] Inicio Fase 1
- [x] Cerrar Fase 1
- [x] Inicio Fase 2 (bloque 1: persistencia tenant-aware + schema Postgres v1)
- [x] Fase 2 bloque 2: modulo de tenant settings (catalog mode + modulos habilitados)

- [x] Fase 2 bloque 3: historial de mensajes por tenant (API + persistencia en eventos)
- [x] Fase 2 bloque 4: fallback de chats/historial desde persistencia cuando transporte WA no esta listo
- [x] Inicio Fase 3
- [x] Fase 3 bloque 1: refresh tokens + revocacion de access token + logout de sesion
- [x] Fase 3 bloque 2: RBAC en eventos socket sensibles + auditoria de acciones de alto impacto
- [x] Inicio Fase 4
- [x] Fase 4 bloque 1: login SaaS en frontend + sesion persistente + socket auth dinamico + headers auth en APIs de preview/mapa
- [x] Fase 4 bloque 2: aislamiento de estado UI por tenant (etiquetas locales, carrito lateral y reset de workspace al cambiar de empresa)
- [x] Fase 4 bloque 3: membresias multi-tenant por usuario + switch de empresa (API + selector en UI activa)
- [x] Cerrar Fase 4: operacion multiempresa validada (HTTP + Socket + estado UI por tenant)
- [x] Inicio Fase 5
- [x] Fase 5 bloque 1: observabilidad (request id, /api/ops/health|ready|metrics, telemetria HTTP/Socket)
- [x] Fase 5 bloque 2: scripts operativos (backup/restore por tenant + smoke load)
- [x] Fase 5 bloque 3: runbook de operacion y rollback (docs/PHASE5_OPERATIONS_RUNBOOK.md)
- [x] Fase 5 bloque 4a: monitor KPI piloto + alerta webhook (scripts + runbook)
- [x] Fase 5 bloque 4b: piloto controlado con trafico real y alertas externas (instrumentado con `ops:phase5-closeout`)

## Criterio de entrada a Fase 5
- [x] Contexto tenant aplicado en HTTP, Socket y persistencia.
- [x] Sesion SaaS con refresh/revocacion y cambio de tenant sin relogin completo.
- [x] Aislamiento de UI por tenant (estado local, carrito, etiquetas y runtime).
- [x] Suite tecnica verde para esta fase (`backend npm test` + `frontend npm run build`).
- [x] Fase 5 cerrada en implementacion: piloto operativo instrumentado + reporte de cierre (`docs/PHASE5_COMPLETION.md`).








## Fase 6 - Control Plane SaaS (actual)
- Backend:
  - Servicio de control plane (`saas_control_plane_service`) para CRUD de empresas/usuarios/membresias.
  - Limites por plan y modulos (`plan_limits_service`) con override por `SAAS_PLAN_LIMITS_JSON`.
  - Contador de uso IA mensual por tenant (`ai_usage_service`) persistido por tenant.
  - Endpoints admin SaaS para overview, CRUD de empresas/usuarios y configuracion por tenant.
- Frontend:
  - Panel SaaS para administrar empresas, usuarios y modulos por tenant.
  - Acceso al panel desde el menu lateral para usuarios con permisos.
- Enforcement:
  - IA sujeta a modulo `aiPro` y cuota mensual por plan.
  - Catalogo y respuestas rapidas sujetos a modulos habilitados por tenant.

### Estado Fase 6
- [x] Bloque 1: control plane backend (empresas/usuarios/membresias)
- [x] Bloque 2: limites por plan + cuota IA mensual
- [x] Bloque 3: API admin SaaS (overview + CRUD + settings)
- [x] Bloque 4: panel SaaS en frontend
- [x] Bloque 5: enforcement por modulos/plan en socket
