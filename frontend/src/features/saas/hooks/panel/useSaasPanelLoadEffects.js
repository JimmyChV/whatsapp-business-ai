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
    loadGlobalLabels,
    loadTenantSettings,
    loadWaModules,
    loadTenantCatalogs,
    loadTenantAiAssistants,
    loadTenantIntegrations,
    loadCustomers,
    loadMetaTemplates,
    loadCampaigns,
    loadAutomations,
    loadSchedules,
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
        loadGlobalLabels,
        loadTenantSettings,
        loadWaModules,
        loadTenantCatalogs,
        loadTenantAiAssistants,
        loadTenantIntegrations,
        loadCustomers,
        loadMetaTemplates,
        loadCampaigns,
        loadAutomations,
        loadSchedules,
        loadQuickReplyData,
        loadTenantLabels,
        loadTenantAssignmentRules,
        loadTenantOperationsKpis,
        setError
    });

    loadersRef.current = {
        runAction,
        refreshOverview,
        loadAccessCatalog,
        loadPlanMatrix,
        loadGlobalLabels,
        loadTenantSettings,
        loadWaModules,
        loadTenantCatalogs,
        loadTenantAiAssistants,
        loadTenantIntegrations,
        loadCustomers,
        loadMetaTemplates,
        loadCampaigns,
        loadAutomations,
        loadSchedules,
        loadQuickReplyData,
        loadTenantLabels,
        loadTenantAssignmentRules,
        loadTenantOperationsKpis,
        setError
    };

    const bootLoadKeyRef = useRef('');
    const bootInFlightKeyRef = useRef('');
    const bootAttemptedKeyRef = useRef('');
    const tenantLoadKeyRef = useRef('');
    const tenantInFlightKeyRef = useRef('');
    const tenantAttemptedKeyRef = useRef('');

    useEffect(() => {
        if (!isOpen || !canManageSaas) {
            bootLoadKeyRef.current = '';
            bootInFlightKeyRef.current = '';
            bootAttemptedKeyRef.current = '';
            return;
        }

        const bootKey = `${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}:${canViewSuperAdminSections ? '1' : '0'}`;
        if (
            bootLoadKeyRef.current === bootKey
            || bootInFlightKeyRef.current === bootKey
            || bootAttemptedKeyRef.current === bootKey
        ) {
            return;
        }

        bootAttemptedKeyRef.current = bootKey;
        bootInFlightKeyRef.current = bootKey;

        const {
            runAction: runActionFn,
            refreshOverview: refreshOverviewFn,
            loadAccessCatalog: loadAccessCatalogFn,
            loadPlanMatrix: loadPlanMatrixFn,
            loadGlobalLabels: loadGlobalLabelsFn,
            setError: setErrorFn
        } = loadersRef.current;

        if (typeof runActionFn !== 'function') {
            bootLoadKeyRef.current = bootKey;
            bootInFlightKeyRef.current = '';
            return;
        }

        runActionFn('Carga inicial', async () => {
            const tasks = [];
            if (typeof refreshOverviewFn === 'function') tasks.push(refreshOverviewFn());
            if (typeof loadAccessCatalogFn === 'function') tasks.push(loadAccessCatalogFn());
            if (canViewSuperAdminSections && typeof loadPlanMatrixFn === 'function') {
                tasks.push(loadPlanMatrixFn());
            }
            if (canViewSuperAdminSections && typeof loadGlobalLabelsFn === 'function') {
                tasks.push(loadGlobalLabelsFn());
            }
            if (tasks.length === 0) return;
            const results = await Promise.allSettled(tasks);
            const firstError = results.find((entry) => entry.status === 'rejected');
            if (firstError?.status === 'rejected') {
                throw firstError.reason;
            }
        })
            .catch((err) => {
                if (typeof setErrorFn === 'function') {
                    setErrorFn(String(err?.message || err || 'No se pudo completar la carga inicial.'));
                }
            })
            .finally(() => {
                bootLoadKeyRef.current = bootKey;
                if (bootInFlightKeyRef.current === bootKey) {
                    bootInFlightKeyRef.current = '';
                }
            });
    }, [canManageSaas, canViewSuperAdminSections, isOpen]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !tenantScopeId) {
            tenantLoadKeyRef.current = '';
            tenantInFlightKeyRef.current = '';
            tenantAttemptedKeyRef.current = '';
            return;
        }

        const tenantKey = `${tenantScopeId}:${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}`;
        if (
            tenantLoadKeyRef.current === tenantKey
            || tenantInFlightKeyRef.current === tenantKey
            || tenantAttemptedKeyRef.current === tenantKey
        ) {
            return;
        }

        tenantAttemptedKeyRef.current = tenantKey;
        tenantInFlightKeyRef.current = tenantKey;

        const {
            loadTenantSettings: loadTenantSettingsFn,
            loadWaModules: loadWaModulesFn,
            loadTenantCatalogs: loadTenantCatalogsFn,
            loadTenantAiAssistants: loadTenantAiAssistantsFn,
            loadTenantIntegrations: loadTenantIntegrationsFn,
            loadCustomers: loadCustomersFn,
            loadMetaTemplates: loadMetaTemplatesFn,
            loadCampaigns: loadCampaignsFn,
            loadAutomations: loadAutomationsFn,
            loadSchedules: loadSchedulesFn,
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
        if (typeof loadMetaTemplatesFn === 'function') tasks.push(loadMetaTemplatesFn(tenantScopeId));
        if (typeof loadCampaignsFn === 'function') tasks.push(loadCampaignsFn(tenantScopeId));
        if (typeof loadAutomationsFn === 'function') tasks.push(loadAutomationsFn(tenantScopeId));
        if (typeof loadSchedulesFn === 'function') tasks.push(loadSchedulesFn(tenantScopeId));
        if (typeof loadQuickReplyDataFn === 'function') tasks.push(loadQuickReplyDataFn(tenantScopeId));
        if (typeof loadTenantLabelsFn === 'function') tasks.push(loadTenantLabelsFn(tenantScopeId));
        if (typeof loadTenantAssignmentRulesFn === 'function') tasks.push(loadTenantAssignmentRulesFn(tenantScopeId));
        if (typeof loadTenantOperationsKpisFn === 'function') tasks.push(loadTenantOperationsKpisFn(tenantScopeId));

        Promise.allSettled(tasks)
            .then((results) => {
                const firstError = results.find((entry) => entry.status === 'rejected');
                if (firstError?.status === 'rejected' && typeof setErrorFn === 'function') {
                    setErrorFn(String(firstError.reason?.message || firstError.reason || 'No se pudo cargar configuracion del tenant.'));
                }
            })
            .finally(() => {
                tenantLoadKeyRef.current = tenantKey;
                if (tenantInFlightKeyRef.current === tenantKey) {
                    tenantInFlightKeyRef.current = '';
                }
            });
    }, [canManageSaas, isOpen, tenantScopeId]);
}
