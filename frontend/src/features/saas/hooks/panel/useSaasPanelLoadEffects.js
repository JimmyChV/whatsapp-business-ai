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
    canViewZones = false,
    canViewOperations = false,
    canViewUsers = false,
    canViewCommercialIntelligence = false,
    canManageRoles = false,
    tenantScopeId = '',
    runAction,
    ensureSectionData,
    setPanelActivity,
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
    loadColumnPrefsForSection,
    loadTenantZoneRules,
    loadCommercialIntelligenceProfiles,
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
        loadColumnPrefsForSection,
        loadTenantZoneRules,
        loadCommercialIntelligenceProfiles,
        loadTenantAssignmentRules,
        loadTenantOperationsKpis,
        ensureSectionData,
        setPanelActivity,
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
        loadColumnPrefsForSection,
        loadTenantZoneRules,
        loadCommercialIntelligenceProfiles,
        loadTenantAssignmentRules,
        loadTenantOperationsKpis,
        ensureSectionData,
        setPanelActivity,
        setError
    };

    const bootLoadKeyRef = useRef('');
    const bootInFlightKeyRef = useRef('');
    const bootAttemptedKeyRef = useRef('');
    const tenantLoadKeyRef = useRef('');
    const tenantInFlightKeyRef = useRef('');
    const tenantAttemptedKeyRef = useRef('');
    const tenantPreloadClearTimerRef = useRef(null);

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

    const clearPanelActivityLater = () => {
        if (tenantPreloadClearTimerRef.current) {
            clearTimeout(tenantPreloadClearTimerRef.current);
            tenantPreloadClearTimerRef.current = null;
        }
        const setPanelActivityFn = loadersRef.current.setPanelActivity;
        if (typeof setPanelActivityFn === 'function') {
            tenantPreloadClearTimerRef.current = setTimeout(() => {
                tenantPreloadClearTimerRef.current = null;
                setPanelActivityFn(null);
            }, 3000);
        }
    };

    const setPanelSyncActivity = (status, label) => {
        const setPanelActivityFn = loadersRef.current.setPanelActivity;
        if (typeof setPanelActivityFn !== 'function') return;
        if (tenantPreloadClearTimerRef.current) {
            clearTimeout(tenantPreloadClearTimerRef.current);
            tenantPreloadClearTimerRef.current = null;
        }
        if (!status || status === 'idle') {
            setPanelActivityFn(null);
            return;
        }
        setPanelActivityFn({
            status,
            label,
            updatedAt: Date.now()
        });
    };

    const runPreloadTask = async (task) => {
        if (!task || typeof task.loader !== 'function') return { skipped: true };
        if (!task.allowed) {
            debugSkipLoad(task.name);
            return { skipped: true };
        }
        try {
            const ensureSectionDataFn = loadersRef.current.ensureSectionData;
            if (task.sectionId && typeof ensureSectionDataFn === 'function') {
                await ensureSectionDataFn(task.sectionId, task.loader, {
                    canLoad: true,
                    deps: task.deps || [],
                    throwOnError: true
                });
            } else {
                await task.loader();
            }
            return { ok: true };
        } catch (error) {
            if (isAuthorizationError(error)) {
                debugSkipLoad(task.name);
                return { skipped: true };
            }
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                console.warn(`[Panel] background preload failed for ${task.name}`, error);
            }
            return { failed: true };
        }
    };

    useEffect(() => {
        if (!isOpen || !canManageSaas) {
            bootLoadKeyRef.current = '';
            bootInFlightKeyRef.current = '';
            bootAttemptedKeyRef.current = '';
            return;
        }

        const bootKey = `${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}:${canViewSuperAdminSections ? '1' : '0'}:${canViewAccessCatalog ? '1' : '0'}:${canManageRoles ? '1' : '0'}:${canViewLabels ? '1' : '0'}`;
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
            loadGlobalLabels: loadGlobalLabelsFn,
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
            if (canManageRoles && typeof loadAccessCatalogFn === 'function') {
                tasks.push(
                    runPreloadTask({
                        name: 'roles',
                        sectionId: 'roles',
                        allowed: true,
                        deps: ['access_catalog'],
                        loader: () => loadAccessCatalogFn()
                    }).then((result) => {
                        if (result?.failed) throw new Error('No se pudo cargar el catalogo de roles.');
                        return result;
                    })
                );
            } else {
                pushPermittedLoad(tasks, 'access-catalog', canViewAccessCatalog, loadAccessCatalogFn, undefined);
            }
            pushPermittedLoad(tasks, 'global-labels', canViewSuperAdminSections && canViewLabels, loadGlobalLabelsFn, undefined);
            if (canViewSuperAdminSections && typeof loadPlanMatrixFn === 'function') {
                tasks.push(loadPlanMatrixFn());
            }
            if (tasks.length === 0) return;
            const results = await Promise.allSettled(tasks);
            const firstError = results.find((entry) => entry.status === 'rejected');
            if (firstError?.status === 'rejected') {
                throw firstError.reason;
            }
        }, { skipRefreshAfter: true })
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
    }, [canManageRoles, canManageSaas, canViewAccessCatalog, canViewLabels, canViewSuperAdminSections, isOpen]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !tenantScopeId) {
            tenantLoadKeyRef.current = '';
            tenantInFlightKeyRef.current = '';
            tenantAttemptedKeyRef.current = '';
            setPanelSyncActivity('idle');
            return;
        }

        const preloadPermissionKey = [
            canViewCustomers,
            canViewModules,
            canViewOperations,
            canViewCatalog,
            canViewLabels,
            canViewZones,
            canViewQuickReplies,
            canViewMetaTemplates,
            canViewCampaigns,
            canViewAi,
            canViewAutomations,
            canViewSchedules,
            canViewUsers,
            canViewTenantSettings,
            canViewCommercialIntelligence
        ].map((value) => (value ? '1' : '0')).join('');
        const tenantKey = `${tenantScopeId}:${isOpen ? '1' : '0'}:${canManageSaas ? '1' : '0'}:${preloadPermissionKey}`;
        if (
            tenantLoadKeyRef.current === tenantKey
            || tenantInFlightKeyRef.current === tenantKey
            || tenantAttemptedKeyRef.current === tenantKey
        ) {
            return;
        }

        tenantAttemptedKeyRef.current = tenantKey;
        tenantInFlightKeyRef.current = tenantKey;

        let cancelled = false;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const {
            refreshOverview: refreshOverviewFn,
            loadTenantSettings: loadTenantSettingsFn,
            loadWaModules: loadWaModulesFn,
            loadTenantCatalogs: loadTenantCatalogsFn,
            loadTenantAiAssistants: loadTenantAiAssistantsFn,
            loadCustomers: loadCustomersFn,
            loadMetaTemplates: loadMetaTemplatesFn,
            loadCampaigns: loadCampaignsFn,
            loadAutomations: loadAutomationsFn,
            loadSchedules: loadSchedulesFn,
            loadQuickReplyData: loadQuickReplyDataFn,
            loadTenantLabels: loadTenantLabelsFn,
            loadColumnPrefsForSection: loadColumnPrefsForSectionFn,
            loadTenantZoneRules: loadTenantZoneRulesFn,
            loadCommercialIntelligenceProfiles: loadCommercialIntelligenceProfilesFn,
            loadTenantAssignmentRules: loadTenantAssignmentRulesFn,
            loadTenantOperationsKpis: loadTenantOperationsKpisFn
        } = loadersRef.current;

        const groups = [
            {
                delay: 0,
                tasks: [
                    {
                        name: 'customers',
                        sectionId: 'customers',
                        allowed: canViewCustomers,
                        deps: [tenantScopeId],
                        loader: async () => {
                            if (typeof loadColumnPrefsForSectionFn === 'function') {
                                await loadColumnPrefsForSectionFn('customers');
                            }
                            return loadCustomersFn?.(tenantScopeId);
                        }
                    },
                    {
                        name: 'modules',
                        sectionId: 'modules',
                        allowed: canViewModules,
                        deps: [tenantScopeId, 'modules'],
                        loader: () => {
                            const tasks = [];
                            if (canViewTenantSettings && typeof loadTenantSettingsFn === 'function') {
                                tasks.push(loadTenantSettingsFn(tenantScopeId));
                            }
                            if (typeof loadWaModulesFn === 'function') {
                                tasks.push(loadWaModulesFn(tenantScopeId));
                            }
                            return Promise.all(tasks);
                        }
                    },
                    {
                        name: 'operations',
                        sectionId: 'operations',
                        allowed: canViewOperations,
                        deps: [tenantScopeId],
                        loader: () => Promise.all([
                            loadTenantAssignmentRulesFn?.(tenantScopeId),
                            loadTenantOperationsKpisFn?.(tenantScopeId)
                        ])
                    }
                ]
            },
            {
                delay: 100,
                tasks: [
                    {
                        name: 'catalogs',
                        sectionId: 'catalogs',
                        allowed: canViewCatalog,
                        deps: [tenantScopeId],
                        loader: () => loadTenantCatalogsFn?.(tenantScopeId)
                    },
                    {
                        name: 'labels',
                        sectionId: 'labels',
                        allowed: canViewLabels,
                        deps: [tenantScopeId],
                        loader: () => loadTenantLabelsFn?.(tenantScopeId)
                    },
                    {
                        name: 'zones',
                        sectionId: 'zones',
                        allowed: canViewZones,
                        deps: [tenantScopeId],
                        loader: () => loadTenantZoneRulesFn?.()
                    },
                    {
                        name: 'quick-replies',
                        sectionId: 'quick_replies',
                        allowed: canViewQuickReplies,
                        deps: [tenantScopeId],
                        loader: () => loadQuickReplyDataFn?.(tenantScopeId)
                    },
                    {
                        name: 'meta-templates',
                        sectionId: 'meta_templates',
                        allowed: canViewMetaTemplates,
                        deps: [tenantScopeId],
                        loader: () => loadMetaTemplatesFn?.()
                    },
                    {
                        name: 'campaigns',
                        sectionId: 'campaigns',
                        allowed: canViewCampaigns,
                        deps: [tenantScopeId],
                        loader: () => loadCampaignsFn?.()
                    }
                ]
            },
            {
                delay: 300,
                tasks: [
                    {
                        name: 'ai-assistants',
                        sectionId: 'ai_assistants',
                        allowed: canViewAi,
                        deps: [tenantScopeId],
                        loader: () => loadTenantAiAssistantsFn?.(tenantScopeId)
                    },
                    {
                        name: 'automations',
                        sectionId: 'automations',
                        allowed: canViewAutomations,
                        deps: [tenantScopeId],
                        loader: () => loadAutomationsFn?.()
                    },
                    {
                        name: 'schedules',
                        sectionId: 'schedules',
                        allowed: canViewSchedules,
                        deps: [tenantScopeId],
                        loader: () => loadSchedulesFn?.()
                    },
                    {
                        name: 'users',
                        sectionId: 'users',
                        allowed: canViewUsers,
                        deps: [tenantScopeId],
                        loader: () => refreshOverviewFn?.()
                    },
                    {
                        name: 'settings',
                        sectionId: 'settings',
                        allowed: canViewTenantSettings,
                        deps: [tenantScopeId, 'settings'],
                        loader: () => loadTenantSettingsFn?.(tenantScopeId)
                    },
                    {
                        name: 'commercial-intelligence',
                        sectionId: '',
                        allowed: canViewCommercialIntelligence,
                        deps: [tenantScopeId],
                        loader: () => loadCommercialIntelligenceProfilesFn?.()
                    }
                ]
            }
        ];

        const runnableCount = groups
            .flatMap((group) => group.tasks)
            .filter((task) => task.allowed && typeof task.loader === 'function')
            .length;

        if (runnableCount === 0) {
            tenantLoadKeyRef.current = tenantKey;
            tenantInFlightKeyRef.current = '';
            setPanelSyncActivity('idle');
            return undefined;
        }

        setPanelSyncActivity('syncing', 'Actualizando panel...');

        (async () => {
            let hasFailures = false;
            for (const group of groups) {
                if (cancelled) return;
                if (group.delay > 0) await wait(group.delay);
                if (cancelled) return;
                const results = await Promise.all(group.tasks.map((task) => runPreloadTask(task)));
                if (results.some((result) => result?.failed)) hasFailures = true;
            }
            if (cancelled) return;
            tenantLoadKeyRef.current = tenantKey;
            tenantInFlightKeyRef.current = '';
            if (hasFailures) {
                setPanelSyncActivity('idle');
                return;
            }
            setPanelSyncActivity('synced', 'Todo actualizado');
            clearPanelActivityLater();
        })();

        return () => {
            cancelled = true;
            if (tenantInFlightKeyRef.current === tenantKey) {
                tenantInFlightKeyRef.current = '';
            }
        };
    }, [
        canManageSaas,
        canViewAi,
        canViewAutomations,
        canViewCampaigns,
        canViewCatalog,
        canViewCommercialIntelligence,
        canViewCustomers,
        canViewLabels,
        canViewMetaTemplates,
        canViewModules,
        canViewOperations,
        canViewQuickReplies,
        canViewSchedules,
        canViewTenantSettings,
        canViewUsers,
        canViewZones,
        isOpen,
        tenantScopeId
    ]);

    useEffect(() => () => {
        if (tenantPreloadClearTimerRef.current) {
            clearTimeout(tenantPreloadClearTimerRef.current);
            tenantPreloadClearTimerRef.current = null;
        }
    }, []);
}
