const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');
const { parseScopedChatId } = require('../../channels/helpers/chat-scope.helpers');

const VALID_SOURCE_TYPES = new Set(['quote', 'catalog', 'manual']);
const VALID_ORDER_STATUSES = new Set(['aceptado', 'programado', 'atendido', 'vendido', 'perdido', 'cancelado']);
const COMMERCIAL_ADVANCED_STATUSES = new Set(['aceptado', 'programado', 'atendido', 'vendido', 'perdido', 'cancelado', 'expirado']);
const COMMERCIAL_STATUS_RANK = {
    nuevo: 0,
    en_conversacion: 1,
    cotizado: 2,
    aceptado: 3,
    programado: 4,
    atendido: 5,
    vendido: 6
};

function ensureAuthenticated(req, res, authService) {
    if (authService?.isAuthEnabled?.() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function resolveTenantIdFromContext(req) {
    const tenantId = String(req?.authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
    return tenantId && tenantId !== 'default' ? tenantId : null;
}

function resolveActorUserId(req) {
    return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim() || null;
}

function resolveActorRole(req = {}, tenantId = '', chatAssignmentPolicyService = null) {
    const role = typeof chatAssignmentPolicyService?.resolveActorTenantRole === 'function'
        ? chatAssignmentPolicyService.resolveActorTenantRole({ req, tenantId })
        : null;
    return String(role || req?.authContext?.user?.role || (req?.authContext?.user?.isSuperAdmin ? 'superadmin' : 'seller'))
        .trim()
        .toLowerCase() || 'seller';
}

function isManagerRole(role = '') {
    return ['owner', 'admin', 'superadmin'].includes(String(role || '').trim().toLowerCase());
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toNumber(value = 0) {
    const normalized = Number(String(value ?? 0).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(normalized) ? normalized : 0;
}

function toMoney(value = 0) {
    return Math.round(toNumber(value) * 100) / 100;
}

function resolveOrderTimestamp(value = '') {
    const raw = toText(value);
    if (!raw) return new Date().toISOString();

    const candidate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00-05:00`
        : raw;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('orderDate invalido.');
    }
    return parsed.toISOString();
}

function normalizeScope(normalizeScopeModuleId, value = '') {
    return typeof normalizeScopeModuleId === 'function'
        ? normalizeScopeModuleId(value || '')
        : toLower(value || '');
}

function resolveChatScope(chatId = '', scopeModuleId = '', normalizeScopeModuleId = null) {
    const parsed = parseScopedChatId(chatId || '');
    const baseChatId = toText(parsed.chatId || chatId || '');
    const cleanScopeModuleId = normalizeScope(normalizeScopeModuleId, scopeModuleId || parsed.moduleId || '');
    return { baseChatId, scopeModuleId: cleanScopeModuleId };
}

function normalizePhoneFromChatId(chatId = '') {
    const digits = toText(chatId).split('@')[0].replace(/\D/g, '');
    if (!digits || digits.length < 8) return '';
    return `+${digits}`;
}

function normalizeItems(items = []) {
    const source = Array.isArray(items) ? items : [];
    return source
        .map((item) => {
            const quantity = Math.max(0, toMoney(item?.quantity ?? 1));
            const unitPrice = Math.max(0, toMoney(item?.unitPrice ?? item?.unit_price ?? item?.price ?? 0));
            const subtotal = toMoney(quantity * unitPrice);
            const productName = toText(item?.productName || item?.product_name || item?.name || item?.description || '');
            if (!productName && subtotal <= 0) return null;
            return {
                product_id: toText(item?.productId || item?.product_id || '') || null,
                product_name: productName || 'Pedido manual',
                quantity,
                unit_price: unitPrice,
                subtotal
            };
        })
        .filter(Boolean);
}

function makeManualItem(payload = {}) {
    const description = toText(payload.description || payload.productName || payload.notes || 'Pedido manual');
    const amount = toMoney(payload.amount ?? payload.totalAmount ?? payload.subtotal ?? 0);
    if (amount <= 0) return [];
    return [{
        product_id: null,
        product_name: description || 'Pedido manual',
        quantity: 1,
        unit_price: amount,
        subtotal: amount
    }];
}

function normalizeOrderRow(row = {}) {
    const items = Array.isArray(row.items_json) ? row.items_json : [];
    return {
        orderId: row.order_id,
        tenantId: row.tenant_id,
        chatId: row.chat_id,
        customerId: row.customer_id || null,
        phone: row.phone || null,
        sourceType: row.source_type,
        sourceId: row.source_id || null,
        status: row.status,
        items,
        subtotal: toMoney(row.subtotal),
        deliveryAmount: toMoney(row.delivery_amount),
        discountAmount: toMoney(row.discount_amount),
        totalAmount: toMoney(row.total_amount),
        deliveryType: row.delivery_type || null,
        notes: row.notes || '',
        scheduledAt: row.scheduled_at || null,
        soldAt: row.sold_at || null,
        createdByUserId: row.created_by_user_id || null,
        assignedUserId: row.assigned_user_id || null,
        scopeModuleId: row.scope_module_id || '',
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
}

function assertPostgresOrders() {
    if (getStorageDriver() !== 'postgres') {
        throw new Error('El modulo de pedidos requiere SAAS_STORAGE_DRIVER=postgres.');
    }
}

async function resolveOrderContext(tenantId, chatId, scopeModuleId, conversationOpsService) {
    const phone = normalizePhoneFromChatId(chatId);
    const [chatResult, customerResult, assignment] = await Promise.all([
        queryPostgres(
            `SELECT phone
               FROM tenant_chats
              WHERE tenant_id = $1 AND chat_id = $2
              LIMIT 1`,
            [tenantId, chatId]
        ),
        phone
            ? queryPostgres(
                `SELECT customer_id
                   FROM tenant_customers
                  WHERE tenant_id = $1
                    AND (
                        regexp_replace(COALESCE(phone_e164, ''), '[^0-9]', '', 'g') = $2
                        OR regexp_replace(COALESCE(phone_alt, ''), '[^0-9]', '', 'g') = $2
                    )
                  ORDER BY updated_at DESC NULLS LAST
                  LIMIT 1`,
                [tenantId, phone.replace(/\D/g, '')]
            )
            : Promise.resolve({ rows: [] }),
        typeof conversationOpsService?.getChatAssignment === 'function'
            ? conversationOpsService.getChatAssignment(tenantId, { chatId, scopeModuleId })
            : Promise.resolve(null)
    ]);
    return {
        phone: toText(chatResult?.rows?.[0]?.phone || phone || '') || null,
        customerId: toText(customerResult?.rows?.[0]?.customer_id || '') || null,
        assignedUserId: toText(assignment?.assigneeUserId || assignment?.assignee_user_id || '') || null
    };
}

async function maybeMarkChatAccepted({
    tenantId,
    chatId,
    scopeModuleId,
    actorUserId,
    actorRole,
    orderId,
    chatCommercialStatusService,
    emitCommercialStatusUpdated
}) {
    if (typeof chatCommercialStatusService?.getChatCommercialStatus !== 'function'
        || typeof chatCommercialStatusService?.markManualStatus !== 'function') {
        return null;
    }
    const current = await chatCommercialStatusService.getChatCommercialStatus(tenantId, { chatId, scopeModuleId });
    const currentStatus = toLower(current?.status || '');
    if (COMMERCIAL_ADVANCED_STATUSES.has(currentStatus)) {
        return { status: current, previous: current, changed: false };
    }
    const result = await chatCommercialStatusService.markManualStatus(tenantId, {
        chatId,
        scopeModuleId,
        status: 'aceptado',
        source: 'order',
        reason: 'order_created',
        changedByUserId: actorUserId,
        actorRole,
        metadata: { orderId }
    });
    if (result?.changed && typeof emitCommercialStatusUpdated === 'function') {
        emitCommercialStatusUpdated({
            tenantId,
            chatId,
            scopeModuleId,
            result,
            source: 'orders'
        });
    }
    return result;
}

async function maybeAdvanceCommercialStatus({
    tenantId,
    chatId,
    scopeModuleId,
    targetStatus,
    actorUserId,
    actorRole,
    orderId,
    chatCommercialStatusService,
    emitCommercialStatusUpdated
}) {
    if (!['programado', 'atendido', 'vendido'].includes(targetStatus)) return null;
    if (typeof chatCommercialStatusService?.getChatCommercialStatus !== 'function'
        || typeof chatCommercialStatusService?.markManualStatus !== 'function') {
        return null;
    }

    const current = await chatCommercialStatusService.getChatCommercialStatus(tenantId, { chatId, scopeModuleId });
    const currentStatus = toLower(current?.status || '');
    if (['vendido', 'perdido', 'expirado'].includes(currentStatus)) {
        return { status: current, previous: current, changed: false };
    }

    const currentRank = COMMERCIAL_STATUS_RANK[currentStatus] ?? -1;
    const targetRank = COMMERCIAL_STATUS_RANK[targetStatus] ?? -1;
    if (targetRank <= currentRank) {
        return { status: current, previous: current, changed: false };
    }

    const result = await chatCommercialStatusService.markManualStatus(tenantId, {
        chatId,
        scopeModuleId,
        status: targetStatus,
        source: 'order',
        reason: 'order_status_updated',
        changedByUserId: actorUserId,
        actorRole,
        metadata: { orderId }
    });
    if (result?.changed && typeof emitCommercialStatusUpdated === 'function') {
        emitCommercialStatusUpdated({
            tenantId,
            chatId,
            scopeModuleId,
            result,
            source: 'orders'
        });
    }
    return result;
}

async function recordOrderEvent(conversationOpsService, tenantId, {
    chatId,
    scopeModuleId,
    actorUserId,
    actorRole,
    eventType,
    payload
}) {
    if (typeof conversationOpsService?.recordConversationEvent !== 'function') return;
    await conversationOpsService.recordConversationEvent(tenantId, {
        chatId,
        scopeModuleId: scopeModuleId || '',
        actorUserId,
        actorRole,
        eventType,
        eventSource: 'system',
        payload
    });
}

function registerOperationsOrdersHttpRoutes({
    app,
    authService,
    conversationOpsService,
    chatCommercialStatusService,
    chatAssignmentPolicyService,
    normalizeScopeModuleId,
    emitCommercialStatusUpdated
}) {
    if (!app) throw new Error('registerOperationsOrdersHttpRoutes requiere app.');

    app.post('/api/tenant/orders', async (req, res) => {
        try {
            assertPostgresOrders();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });

            const body = req.body || {};
            const sourceType = toLower(body.sourceType || body.source_type || '');
            if (!VALID_SOURCE_TYPES.has(sourceType)) {
                return res.status(400).json({ ok: false, error: 'sourceType invalido.' });
            }

            const { baseChatId, scopeModuleId } = resolveChatScope(
                body.chatId || body.chat_id || '',
                body.scopeModuleId || body.scope_module_id || '',
                normalizeScopeModuleId
            );
            if (!baseChatId) return res.status(400).json({ ok: false, error: 'chatId requerido.' });

            let items = normalizeItems(body.items || body.items_json || []);
            if (sourceType === 'manual' && items.length === 0) items = makeManualItem(body);
            if (items.length === 0) return res.status(400).json({ ok: false, error: 'Debe agregar al menos un item con monto.' });

            const deliveryAmount = toMoney(body.deliveryAmount ?? body.delivery_amount ?? 0);
            const discountAmount = toMoney(body.discountAmount ?? body.discount_amount ?? 0);
            if (deliveryAmount < 0 || discountAmount < 0) {
                return res.status(400).json({ ok: false, error: 'Delivery y descuento no pueden ser negativos.' });
            }

            const subtotal = toMoney(items.reduce((acc, item) => acc + toMoney(item.subtotal), 0));
            const totalAmount = toMoney(Math.max(0, subtotal + deliveryAmount - discountAmount));
            const actorUserId = resolveActorUserId(req);
            const actorRole = resolveActorRole(req, tenantId, chatAssignmentPolicyService);
            const context = await resolveOrderContext(tenantId, baseChatId, scopeModuleId, conversationOpsService);
            const createdAt = resolveOrderTimestamp(body.orderDate || body.order_date || '');

            const insertResult = await queryPostgres(
                `INSERT INTO tenant_orders (
                    tenant_id, chat_id, customer_id, phone, source_type, source_id, status,
                    items_json, subtotal, delivery_amount, discount_amount, total_amount,
                    delivery_type, notes, scheduled_at, created_by_user_id, assigned_user_id, scope_module_id,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, 'aceptado',
                    $7::jsonb, $8, $9, $10, $11,
                    $12, $13, $14::timestamptz, $15, $16, $17,
                    $18::timestamptz, $18::timestamptz
                )
                RETURNING *`,
                [
                    tenantId,
                    baseChatId,
                    context.customerId,
                    context.phone,
                    sourceType,
                    toText(body.sourceId || body.source_id || '') || null,
                    JSON.stringify(items),
                    subtotal,
                    deliveryAmount,
                    discountAmount,
                    totalAmount,
                    toText(body.deliveryType || body.delivery_type || '') || null,
                    toText(body.notes || ''),
                    body.scheduledAt || body.scheduled_at || null,
                    actorUserId,
                    context.assignedUserId,
                    scopeModuleId || '',
                    createdAt
                ]
            );
            const order = normalizeOrderRow(insertResult.rows[0]);

            const commercialStatusResult = await maybeMarkChatAccepted({
                tenantId,
                chatId: baseChatId,
                scopeModuleId,
                actorUserId,
                actorRole,
                orderId: order.orderId,
                chatCommercialStatusService,
                emitCommercialStatusUpdated
            });

            await recordOrderEvent(conversationOpsService, tenantId, {
                chatId: baseChatId,
                scopeModuleId,
                actorUserId,
                actorRole,
                eventType: 'chat.order.created',
                payload: {
                    orderId: order.orderId,
                    sourceType,
                    totalAmount
                }
            });

            return res.status(201).json({
                ok: true,
                tenantId,
                order,
                commercialStatus: commercialStatusResult?.status || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el pedido.') });
        }
    });

    app.get('/api/tenant/orders', async (req, res) => {
        try {
            assertPostgresOrders();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });

            const { baseChatId, scopeModuleId } = resolveChatScope(
                req.query?.chatId || '',
                req.query?.scopeModuleId || '',
                normalizeScopeModuleId
            );
            if (!baseChatId) return res.status(400).json({ ok: false, error: 'chatId requerido.' });

            const params = [tenantId, baseChatId];
            let scopeSql = '';
            if (scopeModuleId) {
                params.push(scopeModuleId);
                scopeSql = ` AND LOWER(COALESCE(scope_module_id, '')) = LOWER($${params.length})`;
            }
            const { rows } = await queryPostgres(
                `SELECT *
                   FROM tenant_orders
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    ${scopeSql}
                  ORDER BY created_at DESC`,
                params
            );

            return res.json({
                ok: true,
                tenantId,
                chatId: baseChatId,
                scopeModuleId,
                items: rows.map(normalizeOrderRow)
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar pedidos.') });
        }
    });

    app.patch('/api/tenant/orders/:orderId/status', async (req, res) => {
        try {
            assertPostgresOrders();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });

            const orderId = toText(req.params?.orderId || '');
            const status = toLower(req.body?.status || '');
            if (!orderId) return res.status(400).json({ ok: false, error: 'orderId requerido.' });
            if (!VALID_ORDER_STATUSES.has(status)) return res.status(400).json({ ok: false, error: 'status invalido.' });

            const actorUserId = resolveActorUserId(req);
            const actorRole = resolveActorRole(req, tenantId, chatAssignmentPolicyService);
            const currentResult = await queryPostgres(
                `SELECT *
                   FROM tenant_orders
                  WHERE tenant_id = $1 AND order_id = $2
                  LIMIT 1`,
                [tenantId, orderId]
            );
            const current = currentResult.rows[0];
            if (!current) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });

            const updateResult = await queryPostgres(
                `UPDATE tenant_orders
                    SET status = $3,
                        notes = CASE WHEN $4::text IS NULL THEN notes ELSE $4::text END,
                        sold_at = CASE WHEN $3 = 'vendido' THEN COALESCE(sold_at, NOW()) ELSE sold_at END,
                        updated_at = NOW()
                  WHERE tenant_id = $1 AND order_id = $2
                  RETURNING *`,
                [
                    tenantId,
                    orderId,
                    status,
                    req.body && Object.prototype.hasOwnProperty.call(req.body, 'notes') ? toText(req.body.notes || '') : null
                ]
            );
            const order = normalizeOrderRow(updateResult.rows[0]);

            const commercialStatusResult = await maybeAdvanceCommercialStatus({
                tenantId,
                chatId: order.chatId,
                scopeModuleId: order.scopeModuleId,
                targetStatus: order.status,
                actorUserId,
                actorRole,
                orderId,
                chatCommercialStatusService,
                emitCommercialStatusUpdated
            });

            await recordOrderEvent(conversationOpsService, tenantId, {
                chatId: order.chatId,
                scopeModuleId: order.scopeModuleId,
                actorUserId,
                actorRole,
                eventType: 'chat.order.status.updated',
                payload: {
                    orderId,
                    fromStatus: current.status,
                    toStatus: order.status,
                    notes: req.body && Object.prototype.hasOwnProperty.call(req.body, 'notes') ? order.notes : null
                }
            });

            return res.json({
                ok: true,
                tenantId,
                order,
                commercialStatus: commercialStatusResult?.status || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el pedido.') });
        }
    });

    app.delete('/api/tenant/orders/:orderId', async (req, res) => {
        try {
            assertPostgresOrders();
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });

            const orderId = toText(req.params?.orderId || '');
            if (!orderId) return res.status(400).json({ ok: false, error: 'orderId requerido.' });

            const actorUserId = resolveActorUserId(req);
            const actorRole = resolveActorRole(req, tenantId, chatAssignmentPolicyService);
            const { rows } = await queryPostgres(
                `SELECT *
                   FROM tenant_orders
                  WHERE tenant_id = $1 AND order_id = $2
                  LIMIT 1`,
                [tenantId, orderId]
            );
            const current = rows[0];
            if (!current) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
            if (current.status !== 'aceptado') {
                return res.status(400).json({ ok: false, error: 'Solo se puede borrar un pedido en estado aceptado.' });
            }
            if (!isManagerRole(actorRole) && toText(current.created_by_user_id) !== actorUserId) {
                return res.status(403).json({ ok: false, error: 'Solo el creador o un admin/owner puede borrar este pedido.' });
            }

            await queryPostgres(
                `DELETE FROM tenant_orders
                  WHERE tenant_id = $1 AND order_id = $2`,
                [tenantId, orderId]
            );

            return res.json({ ok: true, tenantId, orderId });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo borrar el pedido.') });
        }
    });
}

module.exports = {
    registerOperationsOrdersHttpRoutes
};
