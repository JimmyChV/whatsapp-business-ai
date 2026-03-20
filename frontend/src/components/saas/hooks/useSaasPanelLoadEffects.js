import { useEffect } from 'react';

export default function useSaasPanelLoadEffects({
    isOpen = false,
    canManageSaas = false,
    canViewSuperAdminSections = false,
    tenantScopeId = '',
    runAction,
    refreshOverview,
    loadAccessCatalog,
    loadPlanMatrix,
    loadTenantSettings,
    loadWaModules,
    loadTenantCatalogs,
    loadTenantAiAssistants,
    loadTenantIntegrations,
    loadCustomers,
    loadQuickReplyData,
    loadTenantLabels,
    loadTenantAssignmentRules,
    loadTenantOperationsKpis,
    setError
} = {}) {
    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        runAction('Carga inicial', async () => {
            const tasks = [
                refreshOverview(),
                loadAccessCatalog()
            ];
            if (canViewSuperAdminSections) {
                tasks.push(loadPlanMatrix());
            }
            const results = await Promise.allSettled(tasks);
            const firstError = results.find((entry) => entry.status === 'rejected');
            if (firstError?.status === 'rejected') {
                throw firstError.reason;
            }
        });
    }, [
        canManageSaas,
        canViewSuperAdminSections,
        isOpen,
        loadAccessCatalog,
        loadPlanMatrix,
        refreshOverview,
        runAction
    ]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !tenantScopeId) return;
        Promise.all([
            loadTenantSettings(tenantScopeId),
            loadWaModules(tenantScopeId),
            loadTenantCatalogs(tenantScopeId),
            loadTenantAiAssistants(tenantScopeId),
            loadTenantIntegrations(tenantScopeId),
            loadCustomers(tenantScopeId),
            loadQuickReplyData(tenantScopeId),
            loadTenantLabels(tenantScopeId),
            loadTenantAssignmentRules(tenantScopeId),
            loadTenantOperationsKpis(tenantScopeId)
        ]).catch((err) => {
            setError(String(err?.message || err || 'No se pudo cargar configuracion del tenant.'));
        });
    }, [
        canManageSaas,
        isOpen,
        loadCustomers,
        loadQuickReplyData,
        loadTenantAiAssistants,
        loadTenantAssignmentRules,
        loadTenantCatalogs,
        loadTenantIntegrations,
        loadTenantLabels,
        loadTenantOperationsKpis,
        loadTenantSettings,
        loadWaModules,
        setError,
        tenantScopeId
    ]);
}
