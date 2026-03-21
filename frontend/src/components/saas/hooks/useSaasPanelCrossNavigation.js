import { useCallback } from 'react';

export default function useSaasPanelCrossNavigation({
    openTenantView,
    openUserView,
    setCurrentSection,
    scrollToSection
} = {}) {
    const openTenantFromUserMembership = useCallback((tenantId) => {
        openTenantView(tenantId);
        setCurrentSection('saas_empresas');
        scrollToSection('saas_empresas');
    }, [openTenantView, scrollToSection, setCurrentSection]);

    const openUserFromTenant = useCallback((userId) => {
        openUserView(userId);
        setCurrentSection('saas_usuarios');
        scrollToSection('saas_usuarios');
    }, [openUserView, scrollToSection, setCurrentSection]);

    return {
        openTenantFromUserMembership,
        openUserFromTenant
    };
}
