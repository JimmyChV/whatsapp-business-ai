import { useEffect, useRef } from 'react';

export default function useSaasPanelLoadEffects({
    isOpen = false,
    canManageSaas = false,
    canViewSuperAdminSections = false,
    canViewAccessCatalog = false,
    canViewTenantSettings = false,
    canViewModules = false,
    canViewCatalog = false,
    canViewAi = false,
    canViewCustomers = false,
    canViewMetaTemplates = false,
    canViewCampaigns = false,
    canViewAutomations = false,
    canViewSchedules = false,
    canViewQuickReplies = false,
    canViewLabels = false,
    canViewOperations = false,
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

    const isAuthorizationError = (error) => {
        const message = String(error?.message || error || '').trim().toLowerCase();
        return message === 'no autorizado.'
            || message.includes('no autorizado')
            || message.includes('unauthorized')
            || message.includes('forbidden')
            || message.includes('http 401')
            || message.includes('http 403');
    };

    const debugSkipLoad = (name) => {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug(`[Panel] skipping load for section ${name}: insufficient permissions`);
        }
    };

    const pushPermittedLoad = (tasks, name, allowed, loader, tenantId) => {
        if (typeof loader !== 'function') return;
        if (!allowed) {
            debugSkipLoad(name);
            return;
        }
        tasks.push(
            Promise.resolve()
                .then(() => loader(tenantId))
                .catch((error) => {
                    if (isAuthorizationError(error)) {
                        debugSkipLoad(name);
                        return undefined;
                    }
                    throw error;
                })
        );
    };

    useEffect(() => {
        if (!isOpen || !canManageSaas) {
            bootLoadKeyRef.current = '';
            bootInFlightKeyRef.current = '';
            bootAttemptedKeyRef.current = '';
            return;
        }

        const bootKey = `${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}:${canViewSuperAdminSections ? '1' : '0'}:${canViewAccessCatalog ? '1' : '0'}`;
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
            pushPermittedLoad(tasks, 'access-catalog', canViewAccessCatalog, loadAccessCatalogFn, undefined);
            if (canViewSuperAdminSections && typeof loadPlanMatrixFn === 'function') {
                tasks.push(loadPlanMatrixFn());
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
    }, [canManageSaas, canViewAccessCatalog, canViewSuperAdminSections, isOpen]);

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
        tenantLoadKeyRef.current = tenantKey;
        tenantInFlightKeyRef.current = '';
    }, [
        canManageSaas,
        isOpen,
        tenantScopeId
    ]);
}
