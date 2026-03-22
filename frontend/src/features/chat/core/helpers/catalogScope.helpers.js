export function resolveScopedCatalogSelection({
    scopeCatalogId = '',
    scopeCatalogIds = [],
    currentCatalogId = ''
} = {}) {
    const cleanScopeCatalogId = String(scopeCatalogId || '').trim().toUpperCase();
    const cleanCurrentCatalogId = String(currentCatalogId || '').trim().toUpperCase();
    const cleanScopeCatalogIds = Array.isArray(scopeCatalogIds)
        ? scopeCatalogIds.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
        : [];

    if (cleanScopeCatalogId) return cleanScopeCatalogId;
    if (cleanScopeCatalogIds.length === 1) return cleanScopeCatalogIds[0];
    if (cleanCurrentCatalogId && cleanScopeCatalogIds.includes(cleanCurrentCatalogId)) return cleanCurrentCatalogId;
    if (cleanScopeCatalogIds.length > 0) return cleanScopeCatalogIds[0];
    return '';
}
