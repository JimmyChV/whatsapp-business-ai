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
- Catálogo, carrito, IA y respuestas rapidas por tenant.
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

