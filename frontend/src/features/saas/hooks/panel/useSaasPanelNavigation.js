import { useCallback, useMemo } from 'react';

const GLOBAL_SECTION_IDS = new Set(['saas_resumen', 'saas_global_labels', 'saas_empresas', 'saas_roles', 'saas_planes']);

export default function useSaasPanelNavigation({
    navItems = [],
    currentSection = '',
    activeSection = '',
    initialSection = 'saas_resumen',
    userRole = 'seller',
    isSuperAdmin = false,
    settingsTenantId = '',
    canManageTenants = false,
    canManageUsers = false,
    canViewCustomers = false,
    canViewOperations = false,
    canViewAi = false,
    canViewCommercialIntelligence = false,
    canViewLabels = false,
    canViewQuickReplies = false,
    canViewModules = false,
    canManageCatalog = false,
    canViewSuperAdminSections = false,
    canViewTenantSettings = false
} = {}) {
    const normalizedRole = String(userRole || 'seller').trim().toLowerCase() || 'seller';
    const hasTenantScope = Boolean(String(settingsTenantId || '').trim());
    const isSuperAdminOutsideTenant = Boolean((isSuperAdmin || normalizedRole === 'superadmin') && !hasTenantScope);
    const isSuperAdminInsideTenant = Boolean((isSuperAdmin || normalizedRole === 'superadmin') && hasTenantScope);

    const isSectionEnabled = useCallback((sectionId) => {
        const cleanId = String(sectionId || '').trim();
        if (cleanId === 'saas_resumen') return true;
        if (cleanId === 'saas_empresas') return canManageTenants;
        if (cleanId === 'saas_usuarios') return canManageUsers;
        if (cleanId === 'saas_clientes') return canViewCustomers;
        if (cleanId === 'saas_operacion') return canViewOperations;
        if (cleanId === 'saas_campaigns') return canViewOperations;
        if (cleanId === 'saas_templates') return canViewModules;
        if (cleanId === 'saas_ia') return canViewAi;
        if (cleanId === 'saas_commercial_intelligence') return canViewCommercialIntelligence;
        if (cleanId === 'saas_automations') return canViewTenantSettings || canViewModules;
        if (cleanId === 'saas_etiquetas' || cleanId === 'saas_global_labels') return canViewLabels;
        if (cleanId === 'saas_quick_replies') return canViewQuickReplies;
        if (cleanId === 'saas_modulos') return canViewModules;
        if (cleanId === 'saas_catalogos') return canManageCatalog;
        if (cleanId === 'saas_planes') return canViewSuperAdminSections;
        if (cleanId === 'saas_roles') return canViewSuperAdminSections;
        if (cleanId === 'saas_config') return canViewTenantSettings;
        if (cleanId === 'saas_schedules') return canViewTenantSettings || canViewModules;
        return false;
    }, [
        canManageTenants,
        canManageUsers,
        canViewCustomers,
        canViewOperations,
        canViewAi,
        canViewCommercialIntelligence,
        canViewLabels,
        canViewQuickReplies,
        canViewModules,
        canManageCatalog,
        canViewSuperAdminSections,
        canViewTenantSettings
    ]);

    const isSectionVisibleByAccess = useCallback((sectionId) => {
        const cleanId = String(sectionId || '').trim();
        if (!cleanId) return false;

        if (cleanId === 'saas_resumen') return true;

        if (isSuperAdminOutsideTenant) {
            return GLOBAL_SECTION_IDS.has(cleanId) && isSectionEnabled(cleanId);
        }

        if (isSuperAdminInsideTenant) return isSectionEnabled(cleanId);

        if (GLOBAL_SECTION_IDS.has(cleanId)) return false;

        return isSectionEnabled(cleanId);
    }, [isSectionEnabled, isSuperAdminInsideTenant, isSuperAdminOutsideTenant]);

    const adminNavItems = useMemo(() => {
        const visibleItems = navItems
            .filter((item) => isSectionVisibleByAccess(item?.id))
            .map((item) => ({
                ...item,
                group: GLOBAL_SECTION_IDS.has(String(item?.id || '').trim()) ? 'global' : 'tenant',
                enabled: isSectionEnabled(item.id)
            }));

        const summaryItem = visibleItems.find((item) => item.id === 'saas_resumen') || null;
        const globalItems = visibleItems.filter((item) => item.id !== 'saas_resumen' && item.group === 'global');
        const tenantItems = visibleItems.filter((item) => item.group === 'tenant');

        return [
            ...(summaryItem ? [{ ...summaryItem, group: 'summary' }] : []),
            ...globalItems,
            ...tenantItems
        ];
    }, [isSectionEnabled, isSectionVisibleByAccess, navItems]);

    const selectedSectionId = useMemo(() => {
        const preferred = String(currentSection || activeSection || initialSection || 'saas_resumen').trim();
        if (adminNavItems.some((item) => item.id === preferred && item.enabled)) return preferred;
        return adminNavItems.find((item) => item.enabled)?.id || 'saas_resumen';
    }, [activeSection, adminNavItems, currentSection, initialSection]);

    const sectionFlags = useMemo(() => ({
        isModulesSection: selectedSectionId === 'saas_modulos',
        isCatalogSection: selectedSectionId === 'saas_catalogos',
        isCommercialIntelligenceSection: selectedSectionId === 'saas_commercial_intelligence',
        isPlansSection: selectedSectionId === 'saas_planes',
        isRolesSection: selectedSectionId === 'saas_roles',
        isCustomersSection: selectedSectionId === 'saas_clientes',
        isOperationsSection: selectedSectionId === 'saas_operacion',
        isCampaignsSection: selectedSectionId === 'saas_campaigns',
        isMetaTemplatesSection: selectedSectionId === 'saas_templates',
        isAiSection: selectedSectionId === 'saas_ia',
        isAutomationSection: selectedSectionId === 'saas_automations',
        isSchedulesSection: selectedSectionId === 'saas_schedules',
        isLabelsSection: selectedSectionId === 'saas_etiquetas',
        isGlobalLabelsSection: selectedSectionId === 'saas_global_labels',
        isQuickRepliesSection: selectedSectionId === 'saas_quick_replies',
        isGeneralConfigSection: selectedSectionId === 'saas_config'
    }), [selectedSectionId]);

    return {
        isSectionEnabled,
        adminNavItems,
        selectedSectionId,
        ...sectionFlags
    };
}
