function toPermissionText(value) {
    return String(value ?? '').trim();
}

export const PERMISSION_DESCRIPTIONS = Object.freeze({
    'tenant.customers.read': 'Acceso de lectura a la lista de clientes y sus datos.',
    'tenant.customers.manage': 'Crear, editar, importar y actualizar datos de clientes.',
    'tenant.labels.read': 'Ver etiquetas operativas usadas para clasificar chats.',
    'tenant.labels.manage': 'Crear, editar y eliminar etiquetas del tenant.',
    'tenant.zones.read': 'Ver zonas de delivery, cobertura y condiciones configuradas.',
    'tenant.zones.manage': 'Configurar zonas de delivery, costos de envio y metodos de pago.',
    'tenant.catalogs.read': 'Ver catalogos, productos y precios disponibles.',
    'tenant.catalogs.manage': 'Administrar catalogos y productos disponibles para venta.',
    'tenant.modules.read': 'Ver modulos de WhatsApp y su configuracion principal.',
    'tenant.modules.manage': 'Crear, editar y activar modulos, integraciones y asignaciones.',
    'tenant.quick_replies.read': 'Ver bibliotecas de respuestas rapidas disponibles.',
    'tenant.quick_replies.manage': 'Crear y editar respuestas rapidas, variables y adjuntos.',
    'tenant.ai.read': 'Ver IA, asistentes y configuraciones asociadas.',
    'tenant.ai.manage': 'Configurar asistentes, prompts y parametros de IA.',
    'tenant.commercial_intelligence.read': 'Ver perfiles comerciales, categorias y estrategia de venta.',
    'tenant.commercial_intelligence.manage': 'Crear y editar perfiles comerciales, sinonimos y estrategias de venta.',
    'tenant.chat_assignments.read': 'Ver asignaciones, responsables y reglas operativas del chat.',
    'tenant.chat_assignments.manage': 'Tomar, liberar y reasignar chats entre asesores.',
    'tenant.assignment_rules.read': 'Ver reglas de asignacion automatica.',
    'tenant.assignment_rules.manage': 'Editar reglas de asignacion automatica de chats.',
    'tenant.campaigns.read': 'Ver campanas, audiencias y estadisticas.',
    'tenant.campaigns.manage': 'Crear, editar, lanzar, pausar o cancelar campanas.',
    'tenant.meta_ads.read': 'Ver estructura, metricas e insights de Meta Ads.',
    'tenant.meta_ads.manage': 'Sincronizar y gestionar datos de Meta Ads.',
    'tenant.meta_templates.read': 'Ver plantillas Meta y su estado de aprobacion.',
    'tenant.meta_templates.manage': 'Crear, eliminar y sincronizar plantillas Meta.',
    'tenant.automations.read': 'Ver automatizaciones comerciales configuradas.',
    'tenant.automations.manage': 'Crear, editar, activar o eliminar automatizaciones.',
    'tenant.schedules.read': 'Ver horarios operativos por modulo o tenant.',
    'tenant.schedules.manage': 'Crear y editar horarios operativos.',
    'tenant.kpis.read': 'Ver KPIs y reportes operativos.',
    'tenant.settings.read': 'Ver configuracion general del tenant.',
    'tenant.settings.manage': 'Editar configuracion, limites y parametros generales del tenant.',
    'tenant.email_templates.read': 'Ver plantillas de correo transaccional.',
    'tenant.email_templates.manage': 'Editar plantillas de correo transaccional.',
    'tenant.brand.read': 'Ver identidad de marca usada en correos.',
    'tenant.brand.manage': 'Editar logo, color y datos de marca para correos.',
    'tenant.profile.manage': 'Editar informacion y seguridad del perfil propio.',
    'tenant.chat.assign_autonomous': 'Cambiar el modo autonomo de Patty por chat o modulo.',
    'tenant.integrations.read': 'Ver integraciones conectadas al tenant.',
    'tenant.integrations.manage': 'Editar credenciales, integraciones y conexiones externas.',
    'tenant.assets.upload': 'Subir imagenes y archivos usados por el tenant.',
    'tenant.runtime.read': 'Ver datos runtime necesarios para operar el panel.',
    'tenant.chat.operate': 'Responder y operar conversaciones desde el chat.',
    'tenant.conversation_events.read': 'Ver eventos historicos de conversacion.',
    'tenant.users.read': 'Ver usuarios del tenant y sus accesos.',
    'tenant.users.manage': 'Crear, editar y desactivar usuarios del tenant.',
    'tenant.users.owner.assign': 'Asignar usuarios con rol owner.',
    'tenant.overview.read': 'Ver resumen general del tenant.',
    'devices:view_own': 'Ver los dispositivos autorizados de tu cuenta.',
    'devices:revoke_own': 'Revocar sesiones de tus propios dispositivos.',
    'devices:view_all': 'Ver dispositivos autorizados de otros usuarios.',
    'devices:revoke_all': 'Revocar dispositivos autorizados de otros usuarios.'
});

export const PERMISSION_GROUPS = Object.freeze([
    {
        id: 'customers',
        title: 'CLIENTES',
        permissions: ['tenant.customers.read', 'tenant.customers.manage']
    },
    {
        id: 'labels-zones',
        title: 'ETIQUETAS Y ZONAS',
        permissions: ['tenant.labels.read', 'tenant.labels.manage', 'tenant.zones.read', 'tenant.zones.manage']
    },
    {
        id: 'catalogs',
        title: 'CATALOGOS',
        permissions: ['tenant.catalogs.read', 'tenant.catalogs.manage']
    },
    {
        id: 'modules',
        title: 'MODULOS',
        permissions: ['tenant.modules.read', 'tenant.modules.manage']
    },
    {
        id: 'quick-replies',
        title: 'RESPUESTAS RAPIDAS',
        permissions: ['tenant.quick_replies.read', 'tenant.quick_replies.manage']
    },
    {
        id: 'ai',
        title: 'INTELIGENCIA ARTIFICIAL',
        permissions: ['tenant.ai.read', 'tenant.ai.manage']
    },
    {
        id: 'commercial',
        title: 'INTELIGENCIA COMERCIAL',
        permissions: ['tenant.commercial_intelligence.read', 'tenant.commercial_intelligence.manage']
    },
    {
        id: 'operations',
        title: 'OPERACIONES',
        permissions: [
            'tenant.chat.operate',
            'tenant.chat_assignments.read',
            'tenant.chat_assignments.manage',
            'tenant.assignment_rules.read',
            'tenant.assignment_rules.manage',
            'tenant.conversation_events.read',
            'tenant.runtime.read'
        ]
    },
    {
        id: 'campaigns',
        title: 'CAMPANAS Y META ADS',
        permissions: ['tenant.campaigns.read', 'tenant.campaigns.manage', 'tenant.meta_ads.read', 'tenant.meta_ads.manage', 'tenant.meta_templates.read', 'tenant.meta_templates.manage']
    },
    {
        id: 'automations',
        title: 'AUTOMATIZACIONES Y HORARIOS',
        permissions: ['tenant.automations.read', 'tenant.automations.manage', 'tenant.schedules.read', 'tenant.schedules.manage']
    },
    {
        id: 'reports',
        title: 'REPORTES',
        permissions: ['tenant.kpis.read']
    },
    {
        id: 'settings',
        title: 'CONFIGURACION',
        permissions: [
            'tenant.overview.read',
            'tenant.settings.read',
            'tenant.settings.manage',
            'tenant.email_templates.read',
            'tenant.email_templates.manage',
            'tenant.brand.read',
            'tenant.brand.manage',
            'tenant.profile.manage',
            'tenant.integrations.read',
            'tenant.integrations.manage',
            'tenant.assets.upload',
            'tenant.users.read',
            'tenant.users.manage',
            'tenant.users.owner.assign',
            'devices:view_own',
            'devices:revoke_own',
            'devices:view_all',
            'devices:revoke_all'
        ]
    },
    {
        id: 'patty',
        title: 'IA / PATTY',
        permissions: ['tenant.chat.assign_autonomous']
    }
]);

export const SENSITIVE_SELLER_PERMISSIONS = new Set([
    'tenant.modules.manage',
    'tenant.settings.manage',
    'tenant.integrations.manage',
    'tenant.users.manage'
]);

export function buildPermissionSet(items = []) {
    return new Set((Array.isArray(items) ? items : []).map((entry) => toPermissionText(entry)).filter(Boolean));
}

export function getRoleProfile(role = 'seller', roleProfiles = []) {
    const cleanRole = toPermissionText(role || 'seller').toLowerCase() || 'seller';
    return (Array.isArray(roleProfiles) ? roleProfiles : [])
        .find((entry) => toPermissionText(entry?.role).toLowerCase() === cleanRole) || null;
}

export function getPackPermissionSet(selectedPackIds = [], accessPackOptions = []) {
    const selected = buildPermissionSet(selectedPackIds);
    const permissions = [];
    (Array.isArray(accessPackOptions) ? accessPackOptions : []).forEach((pack) => {
        const packId = toPermissionText(pack?.id);
        if (!packId || !selected.has(packId)) return;
        permissions.push(...(Array.isArray(pack?.permissions) ? pack.permissions : []));
    });
    return buildPermissionSet(permissions);
}

export function buildPermissionMatrixGroups(permissionKeys = [], permissionLabelMap = new Map()) {
    const source = buildPermissionSet(permissionKeys);
    const groupedKeys = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions));
    const groups = PERMISSION_GROUPS
        .map((group) => ({
            ...group,
            permissions: group.permissions.filter((permissionKey) => source.has(permissionKey))
        }))
        .filter((group) => group.permissions.length > 0);

    const fallback = Array.from(source)
        .filter((permissionKey) => !groupedKeys.has(permissionKey))
        .sort((left, right) => String(permissionLabelMap?.get(left) || left).localeCompare(String(permissionLabelMap?.get(right) || right), 'es', { sensitivity: 'base' }));

    return fallback.length > 0
        ? [...groups, { id: 'other', title: 'OTROS PERMISOS', permissions: fallback }]
        : groups;
}
