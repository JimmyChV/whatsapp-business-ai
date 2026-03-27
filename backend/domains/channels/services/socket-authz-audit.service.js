function normalizeSocketRole(role = '') {
    const raw = String(role || '').trim().toLowerCase();
    if (!raw) return 'seller';
    if (raw === 'super_admin' || raw === 'super-admin') return 'superadmin';
    return raw;
}

function createSocketAuthzAuditService({
    socket,
    tenantId = 'default',
    authContext = null,
    socketRbacEnabled = false,
    auditLogService
} = {}) {
    const roleWeight = { seller: 1, admin: 2, owner: 3, superadmin: 4 };
    const userRole = normalizeSocketRole(authContext?.role);
    const isActorSuperAdmin = Boolean(authContext?.isSuperAdmin) || userRole === 'superadmin';
    const effectiveRoleWeight = isActorSuperAdmin ? roleWeight.superadmin : (roleWeight[userRole] || 0);

    const actorContext = {
        userRole,
        isActorSuperAdmin,
        effectiveRoleWeight,
        userId: authContext?.userId || null,
        userEmail: authContext?.email || null
    };

    const requireRole = (allowedRoles = [], {
        errorEvent = 'permission_error',
        action = 'realizar esta accion'
    } = {}) => {
        if (!socketRbacEnabled) return true;
        const allowSet = new Set((Array.isArray(allowedRoles) ? allowedRoles : [])
            .map((role) => String(role || '').trim().toLowerCase())
            .filter(Boolean));
        if (allowSet.size === 0) return true;
        if (!authContext) {
            socket.emit(errorEvent, 'No autorizado para ' + action + '. Inicia sesion nuevamente.');
            return false;
        }
        if (actorContext.isActorSuperAdmin) return true;
        const minimumWeight = Math.min(...Array.from(allowSet)
            .map((role) => roleWeight[role] || 999)
            .filter((weight) => Number.isFinite(weight)));
        if (actorContext.effectiveRoleWeight >= minimumWeight) return true;
        socket.emit(errorEvent, 'No tienes permisos para ' + action + '.');
        return false;
    };

    const auditSocketAction = async (action = '', {
        resourceType = 'socket',
        resourceId = null,
        payload = {}
    } = {}) => {
        try {
            await auditLogService.writeAuditLog(tenantId, {
                userId: actorContext.userId,
                userEmail: actorContext.userEmail,
                role: actorContext.userRole,
                action: String(action || '').trim() || 'socket.action',
                resourceType,
                resourceId,
                source: 'socket',
                socketId: socket.id,
                payload
            });
        } catch (_) { }
    };

    return {
        actorContext,
        requireRole,
        auditSocketAction
    };
}

module.exports = {
    normalizeSocketRole,
    createSocketAuthzAuditService
};
