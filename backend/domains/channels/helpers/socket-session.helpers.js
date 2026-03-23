function buildWebjsSessionNamespaceFromIds(tenantId = 'default', moduleId = 'default') {
    const cleanTenant = String(tenantId || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'default';
    const cleanModule = String(moduleId || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30) || 'default';
    return String(cleanTenant + '__' + cleanModule)
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'default';
}

module.exports = {
    buildWebjsSessionNamespaceFromIds
};

