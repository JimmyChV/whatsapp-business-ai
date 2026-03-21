export function resolveQuickReplyLibraryIdsForModule(moduleId = '', quickReplyLibraries = []) {
    const cleanModuleId = String(moduleId || '').trim().toLowerCase();
    if (!cleanModuleId) return [];

    return (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
        .filter((library) => library?.isShared !== true)
        .filter((library) => Array.isArray(library?.moduleIds) && library.moduleIds.includes(cleanModuleId))
        .map((library) => String(library?.libraryId || '').trim().toUpperCase())
        .filter(Boolean);
}
