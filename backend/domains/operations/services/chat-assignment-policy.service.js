function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function resolveActorUserId(req = {}) {
    return toText(req?.authContext?.user?.userId || req?.authContext?.user?.id || '');
}

function resolveActorTenantRole({ req = {}, tenantId = '' } = {}) {
    const cleanTenantId = toText(tenantId);
    const user = req?.authContext?.user && typeof req.authContext.user === 'object'
        ? req.authContext.user
        : {};
    const memberships = Array.isArray(user.memberships) ? user.memberships : [];
    const activeMembership = memberships.find((entry) =>
        toText(entry?.tenantId) === cleanTenantId && entry?.active !== false
    );

    if (activeMembership?.role) return toLower(activeMembership.role);
    if (user?.role) return toLower(user.role);
    return 'seller';
}

function isSystemActor(req = {}) {
    const userId = resolveActorUserId(req);
    const role = toLower(req?.authContext?.user?.role || '');
    return req?.authContext?.user?.isSystem === true
        || role === 'system'
        || userId === 'system';
}

function buildForbidden(message = 'No autorizado.') {
    return {
        ok: false,
        statusCode: 403,
        error: message
    };
}

function assertInitialAssignmentAllowed({ req = {}, tenantId = '' } = {}) {
    if (isSystemActor(req)) return { ok: true };
    const role = resolveActorTenantRole({ req, tenantId });
    if (role === 'owner' || role === 'admin') return { ok: true };
    return buildForbidden('Solo admin u owner pueden hacer la asignacion inicial.');
}

function assertTakeChatAllowed({ req = {}, tenantId = '' } = {}) {
    if (isSystemActor(req)) return { ok: true };
    const role = resolveActorTenantRole({ req, tenantId });
    if (role === 'owner' || role === 'admin' || role === 'seller') return { ok: true };
    return buildForbidden('No tienes permiso para tomar este chat.');
}

function assertReleaseAllowed({ req = {}, tenantId = '' } = {}) {
    if (isSystemActor(req)) return { ok: true };
    const role = resolveActorTenantRole({ req, tenantId });
    if (role === 'owner' || role === 'admin') return { ok: true };
    return buildForbidden('Solo admin u owner pueden liberar chats.');
}

module.exports = {
    resolveActorTenantRole,
    assertInitialAssignmentAllowed,
    assertTakeChatAllowed,
    assertReleaseAllowed
};

