import { useCallback, useMemo } from 'react';

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

    const isSectionVisibleByRole = useCallback((sectionId) => {
        const cleanId = String(sectionId || '').trim();
        if (!cleanId) return false;

        if (normalizedRole === 'seller') {
            return cleanId === 'saas_clientes';
        }

        if (['saas_empresas', 'saas_roles', 'saas_planes'].includes(cleanId)) {
            return isSuperAdminOutsideTenant;
        }

        return true;
    }, [isSuperAdminOutsideTenant, normalizedRole]);

    const isSectionEnabled = useCallback((sectionId) => {
        const cleanId = String(sectionId || '').trim();
        if (cleanId === 'saas_empresas') return canManageTenants;
        if (cleanId === 'saas_usuarios') return canManageUsers;
        if (cleanId === 'saas_clientes') return canViewCustomers;
        if (cleanId === 'saas_operacion') return canViewOperations;
        if (cleanId === 'saas_campaigns') return canViewOperations;
        if (cleanId === 'saas_templates') return canViewModules;
        if (cleanId === 'saas_ia') return canViewAi;
        if (cleanId === 'saas_etiquetas') return canViewLabels;
        if (cleanId === 'saas_quick_replies') return canViewQuickReplies;
        if (cleanId === 'saas_modulos') return canViewModules;
        if (cleanId === 'saas_catalogos') return canManageCatalog;
        if (cleanId === 'saas_planes') return canViewSuperAdminSections;
        if (cleanId === 'saas_roles') return canViewSuperAdminSections;
        if (cleanId === 'saas_config') return canViewTenantSettings;
        return true;
    }, [
        canManageTenants,
        canManageUsers,
        canViewCustomers,
        canViewOperations,
        canViewAi,
        canViewLabels,
        canViewQuickReplies,
        canViewModules,
        canManageCatalog,
        canViewSuperAdminSections,
        canViewTenantSettings
    ]);

    const adminNavItems = useMemo(() => {
        return navItems
            .filter((item) => isSectionVisibleByRole(item?.id))
            .map((item) => ({
                ...item,
                enabled: isSectionEnabled(item.id)
            }));
    }, [isSectionEnabled, isSectionVisibleByRole, navItems]);

    const selectedSectionId = useMemo(() => {
        const preferred = String(currentSection || activeSection || initialSection || 'saas_resumen').trim();
        if (adminNavItems.some((item) => item.id === preferred && item.enabled)) return preferred;
        return adminNavItems.find((item) => item.enabled)?.id || 'saas_resumen';
    }, [activeSection, adminNavItems, currentSection, initialSection]);

    const sectionFlags = useMemo(() => ({
        isModulesSection: selectedSectionId === 'saas_modulos',
        isCatalogSection: selectedSectionId === 'saas_catalogos',
        isPlansSection: selectedSectionId === 'saas_planes',
        isRolesSection: selectedSectionId === 'saas_roles',
        isCustomersSection: selectedSectionId === 'saas_clientes',
        isOperationsSection: selectedSectionId === 'saas_operacion',
        isCampaignsSection: selectedSectionId === 'saas_campaigns',
        isMetaTemplatesSection: selectedSectionId === 'saas_templates',
        isAiSection: selectedSectionId === 'saas_ia',
        isLabelsSection: selectedSectionId === 'saas_etiquetas',
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
