# Auditoría técnica profunda — WhatsApp Business AI

## Objetivo
Elevar el proyecto a un nivel **pro/producción** para operación comercial diaria con vendedoras, mejorando confiabilidad, seguridad, velocidad de atención y capacidad de crecimiento.

## Diagnóstico ejecutivo

### Fortalezas actuales
- Buena propuesta de valor: unifica WhatsApp Web + catálogo + sugerencias IA en una sola interfaz para ventas.
- Ya existe fallback de catálogo (nativo -> Woo -> local), lo cual reduce caídas operativas.
- UI funcional con utilidades valiosas para agentes (etiquetas, búsqueda en chat, previsualización de enlaces y notas de voz).

### Riesgos principales
1. **Seguridad y exposición**
   - CORS abierto a `*` y socket sin autenticación robusta.
   - Endpoint de link-preview sin controles anti-SSRF/timeout/restricción de hosts.
2. **Escalabilidad y rendimiento**
   - Operaciones costosas por evento (reconstrucción de chats completos en cada mensaje).
   - Descarga de media sin límites fuertes de tamaño/mimetype ni política madura de caché.
3. **Mantenibilidad**
   - Lógica muy acoplada en `socket_manager.js` (demasiadas responsabilidades en un solo archivo).
   - Ausencia de tests automáticos para reglas críticas de negocio.
4. **Operación comercial**
   - Falta de observabilidad real (métricas de SLA por vendedora, respuesta media, conversión, abandono).
   - Falta de guardrails más fuertes para IA en cotización y promesas comerciales.

---

## Hallazgos y mejoras priorizadas

## P0 — Críticos (hacer primero)

### 1) Seguridad de transporte y acceso
**Problema**
- El backend permite CORS abierto y no exige autenticación del cliente web.

**Mejora propuesta**
- Restringir `origin` por variables de entorno (`ALLOWED_ORIGINS`).
- Exigir token JWT en handshake de Socket.IO (rol: admin/seller/supervisor).
- Agregar rate-limit por IP y por evento sensible (`send_message`, `send_media_message`, IA).

**Impacto**
- Evita uso no autorizado del panel y abuso de API/IA.

---

### 2) Blindaje del endpoint `/api/link-preview`
**Problema**
- Hace `fetch` directo de cualquier URL pública sin timeout ni denegación de IPs internas.

**Mejora propuesta**
- Implementar allowlist/denylist de hosts.
- Bloquear resoluciones a redes privadas (`127.0.0.1`, `10.0.0.0/8`, etc.).
- Timeout corto (3–5s), límite de tamaño de respuesta y user-agent controlado.
- Cache temporal de previews para reducir llamadas repetidas.

**Impacto**
- Reduce riesgo SSRF y mejora estabilidad de la UI.

---

### 3) Guardrails de IA para ventas
**Problema**
- Aunque hay reglas en prompt, no hay validación post-respuesta para evitar afirmaciones no soportadas.

**Mejora propuesta**
- Añadir capa de validación post-LLM:
  - detecta precios/productos no existentes en contexto,
  - bloquea envío automático si viola reglas,
  - marca respuesta como “requiere revisión humana”.
- Versionar prompts por caso de uso (`objeciones`, `upsell`, `seguimiento`, `cobranza`).

**Impacto**
- Evita errores comerciales y protege reputación.

---

## P1 — Alta prioridad

### 4) Reestructurar backend por dominios
**Problema**
- `socket_manager.js` concentra demasiada lógica (chat, IA, media, perfil, catálogo, etiquetas).

**Mejora propuesta**
- Separar en módulos:
  - `chat.service.js`
  - `message.service.js`
  - `catalog.service.js`
  - `ai.service.js` (orquestador + validadores)
  - `contact.service.js`
- Dejar `socket_manager.js` como adaptador de eventos.

**Impacto**
- Facilita mantenimiento, testing y nuevas features.

---

### 5) Performance en sincronización de chats
**Problema**
- En cada mensaje entrante se recalcula y emite lista de chats completa.

**Mejora propuesta**
- Emitir solo delta del chat afectado (`chat_updated`) y refresh parcial.
- Aplicar debounce/batching (ej. 250 ms) para rafagas.
- Cachear metadata estable (nombre, foto, etiquetas) con TTL.

**Impacto**
- Menor carga en servidor y UI más fluida en operación real.

---

### 6) Catálogo robusto y consistente
**Problema**
- Hay múltiples fuentes y normalizaciones, pero falta contrato de datos formal.

**Mejora propuesta**
- Definir schema único (`zod` o `joi`) para producto y cotización.
- Validar y normalizar en un solo pipeline.
- Registrar trazabilidad de fuente (`native/woo/local`) por cada recomendación/cotización.

**Impacto**
- Menos errores de precio y mejor auditoría comercial.

---

## P2 — Media prioridad (pro-operación)

### 7) Observabilidad y KPIs de ventas
**Agregar dashboard de métricas**
- FRT (First Response Time) por vendedora.
- Tiempo medio de resolución.
- Conversión por etiqueta/funnel.
- Tasa de uso IA y aceptación de sugerencias.
- Chats sin respuesta > X minutos.

**Impacto**
- Gestión con datos y mejora continua del equipo.

---

### 8) Calidad y testing
**Mejora propuesta**
- Backend: Jest + supertest + tests de utilidades críticas (parseo de pedidos, normalización de catálogo).
- Frontend: Vitest + React Testing Library para flujos principales (envío, IA, etiquetas).
- E2E smoke: login/QR mock, cargar chats, enviar mensaje, pedir sugerencia IA.

**Impacto**
- Menos regresiones en producción.

---

### 9) UX para vendedoras (nivel premium)
- Atajos rápidos para plantillas por objeción (precio, stock, delivery, medios de pago).
- Snippets con variables (`{{cliente}}`, `{{producto}}`, `{{precio}}`).
- Semáforo de prioridad de chat (caliente/tibio/frío) según señales de compra.
- Confirmaciones suaves para acciones de riesgo (enviar audio/archivo equivocado).

---

## Roadmap sugerido (30 días)

### Semana 1 (P0)
- CORS restringido + auth de socket.
- Hardening de link-preview (anti-SSRF + timeout + límites).
- Rate-limit base para eventos críticos.

### Semana 2 (P1)
- Refactor modular backend (servicios por dominio).
- Optimización de emisiones de chat (delta + debounce).

### Semana 3 (P1/P2)
- Contrato de datos de catálogo/cotización.
- Guardrails post-LLM + prompts versionados.

### Semana 4 (P2)
- Suite inicial de tests + dashboard de métricas operativas.
- Ajustes UX para productividad de vendedoras.

---

## Quick wins (puedes hacer hoy)
1. Añadir `.env.example` completo y checklist de despliegue seguro.
2. Configurar scripts en backend (`dev`, `start`, `test`, `lint`).
3. Limitar tamaño de adjuntos y tipos permitidos.
4. Agregar logs estructurados (JSON) con `requestId`/`chatId`.
5. Crear backups automáticos de `catalogo.json` y rotación de `media_cache`.

---

## Definición de “nivel pro” para este proyecto
- Seguridad mínima de producción (auth, CORS estricto, límites y hardening SSRF).
- Estabilidad operacional (errores aislados, recuperación, métricas y alertas).
- Calidad comercial (IA con control de precisión y trazabilidad de cotización).
- Experiencia de vendedora centrada en velocidad y consistencia.

Con estas mejoras, el sistema queda listo para operar de forma profesional y escalar sin perder control de calidad.
