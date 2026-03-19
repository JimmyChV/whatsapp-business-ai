export const DEFAULT_LABEL_COLORS = ['#00A884', '#25D366', '#34B7F1', '#FFB02E', '#FF5C5C', '#9C6BFF', '#7D8D95'];

export const EMPTY_LABEL_FORM = {
    labelId: '',
    name: '',
    description: '',
    color: '#00A884',
    sortOrder: '100',
    isActive: true,
    moduleIds: []
};

export function normalizeTenantLabelColor(value = '', fallback = '#00A884') {
    const raw = String(value || '').trim().toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(raw)) return raw;
    if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
    const fallbackRaw = String(fallback || '#00A884').trim().toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(fallbackRaw)) return fallbackRaw;
    return '#00A884';
}

export function normalizeTenantLabelItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const labelId = String(source.labelId || source.id || '').trim().toUpperCase();
    if (!labelId) return null;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const moduleIds = Array.isArray(source.moduleIds)
        ? source.moduleIds
        : (Array.isArray(metadata.moduleIds) ? metadata.moduleIds : []);
    const normalizedModuleIds = Array.from(new Set(moduleIds
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)));

    return {
        labelId,
        name: String(source.name || labelId).trim() || labelId,
        description: String(source.description || '').trim(),
        color: normalizeTenantLabelColor(source.color || source.hex || '', DEFAULT_LABEL_COLORS[0]),
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 100,
        isActive: source.isActive !== false,
        moduleIds: normalizedModuleIds,
        metadata,
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function buildLabelFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return { ...EMPTY_LABEL_FORM };
    const normalized = normalizeTenantLabelItem(item);
    if (!normalized) return { ...EMPTY_LABEL_FORM };
    return {
        labelId: normalized.labelId,
        name: normalized.name || '',
        description: normalized.description || '',
        color: normalizeTenantLabelColor(normalized.color || '', DEFAULT_LABEL_COLORS[0]),
        sortOrder: String(normalized.sortOrder || 100),
        isActive: normalized.isActive !== false,
        moduleIds: Array.isArray(normalized.moduleIds) ? [...normalized.moduleIds] : []
    };
}

export function buildTenantLabelPayload(form = {}, { allowLabelId = true } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        color: normalizeTenantLabelColor(source.color || '', DEFAULT_LABEL_COLORS[0]),
        sortOrder: Math.max(1, Math.min(9999, Number(source.sortOrder || 100) || 100)),
        isActive: source.isActive !== false,
        metadata: {
            moduleIds: Array.isArray(source.moduleIds)
                ? Array.from(new Set(source.moduleIds
                    .map((entry) => String(entry || '').trim().toLowerCase())
                    .filter(Boolean)))
                : []
        }
    };

    if (allowLabelId) {
        const labelId = String(source.labelId || source.id || '').trim().toUpperCase();
        if (labelId) payload.labelId = labelId;
    }

    return payload;
}
