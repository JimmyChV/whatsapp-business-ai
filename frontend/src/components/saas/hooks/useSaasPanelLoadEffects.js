import { useEffect, useRef } from 'react';

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
    const loadersRef = useRef({
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
    });

    const bootLoadKeyRef = useRef('');
    const tenantLoadKeyRef = useRef('');

    useEffect(() => {
        loadersRef.current = {
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
        };
    }, [
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
    ]);

    useEffect(() => {
        if (!isOpen || !canManageSaas) {
            bootLoadKeyRef.current = '';
            return;
        }

        const bootKey = `${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}:${canViewSuperAdminSections ? '1' : '0'}`;
        if (bootLoadKeyRef.current === bootKey) return;
        bootLoadKeyRef.current = bootKey;

        const {
            runAction: runActionFn,
            refreshOverview: refreshOverviewFn,
            loadAccessCatalog: loadAccessCatalogFn,
            loadPlanMatrix: loadPlanMatrixFn
        } = loadersRef.current;

        if (typeof runActionFn !== 'function') return;

        runActionFn('Carga inicial', async () => {
            const tasks = [];
            if (typeof refreshOverviewFn === 'function') tasks.push(refreshOverviewFn());
            if (typeof loadAccessCatalogFn === 'function') tasks.push(loadAccessCatalogFn());
            if (canViewSuperAdminSections && typeof loadPlanMatrixFn === 'function') {
                tasks.push(loadPlanMatrixFn());
            }
            if (tasks.length === 0) return;
            const results = await Promise.allSettled(tasks);
            const firstError = results.find((entry) => entry.status === 'rejected');
            if (firstError?.status === 'rejected') {
                throw firstError.reason;
            }
        });
    }, [canManageSaas, canViewSuperAdminSections, isOpen]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !tenantScopeId) {
            tenantLoadKeyRef.current = '';
            return;
        }

        const tenantKey = `${tenantScopeId}:${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}`;
        if (tenantLoadKeyRef.current === tenantKey) return;
        tenantLoadKeyRef.current = tenantKey;

        const {
            loadTenantSettings: loadTenantSettingsFn,
            loadWaModules: loadWaModulesFn,
            loadTenantCatalogs: loadTenantCatalogsFn,
            loadTenantAiAssistants: loadTenantAiAssistantsFn,
            loadTenantIntegrations: loadTenantIntegrationsFn,
            loadCustomers: loadCustomersFn,
            loadQuickReplyData: loadQuickReplyDataFn,
            loadTenantLabels: loadTenantLabelsFn,
            loadTenantAssignmentRules: loadTenantAssignmentRulesFn,
            loadTenantOperationsKpis: loadTenantOperationsKpisFn,
            setError: setErrorFn
        } = loadersRef.current;

        const tasks = [];
        if (typeof loadTenantSettingsFn === 'function') tasks.push(loadTenantSettingsFn(tenantScopeId));
        if (typeof loadWaModulesFn === 'function') tasks.push(loadWaModulesFn(tenantScopeId));
        if (typeof loadTenantCatalogsFn === 'function') tasks.push(loadTenantCatalogsFn(tenantScopeId));
        if (typeof loadTenantAiAssistantsFn === 'function') tasks.push(loadTenantAiAssistantsFn(tenantScopeId));
        if (typeof loadTenantIntegrationsFn === 'function') tasks.push(loadTenantIntegrationsFn(tenantScopeId));
        if (typeof loadCustomersFn === 'function') tasks.push(loadCustomersFn(tenantScopeId));
        if (typeof loadQuickReplyDataFn === 'function') tasks.push(loadQuickReplyDataFn(tenantScopeId));
        if (typeof loadTenantLabelsFn === 'function') tasks.push(loadTenantLabelsFn(tenantScopeId));
        if (typeof loadTenantAssignmentRulesFn === 'function') tasks.push(loadTenantAssignmentRulesFn(tenantScopeId));
        if (typeof loadTenantOperationsKpisFn === 'function') tasks.push(loadTenantOperationsKpisFn(tenantScopeId));

        Promise.all(tasks).catch((err) => {
            if (typeof setErrorFn === 'function') {
                setErrorFn(String(err?.message || err || 'No se pudo cargar configuracion del tenant.'));
            }
        });
    }, [canManageSaas, isOpen, tenantScopeId]);
}
